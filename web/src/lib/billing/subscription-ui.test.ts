// Reglas de la pantalla /settings/billing.
// `deriveSubscriptionUi` es la fuente de verdad de qué botón y qué aviso ve el
// cliente; probarla cubre el comportamiento de UI sin montar React.
import { describe, it, expect } from "vitest";
import {
  SUBSCRIPTION_ACTION_LABELS,
  deriveSubscriptionUi,
} from "@/lib/billing/subscription-ui";

const NOW = Date.parse("2026-08-10T12:00:00.000Z");
const future = (days = 20) => new Date(NOW + days * 86_400_000).toISOString();
const past = (days = 5) => new Date(NOW - days * 86_400_000).toISOString();

const admin = { isAdmin: true, now: NOW };
const member = { isAdmin: false, now: NOW };

describe("Suscripción activa", () => {
  const active = { status: "active", cancel_at_period_end: false, current_period_end: future() };

  it("ofrece cancelar al final del periodo y no muestra aviso", () => {
    const ui = deriveSubscriptionUi(active, admin);
    expect(ui.state).toBe("active");
    expect(ui.statusLabel).toBe("Activa");
    expect(ui.actions).toEqual(["cancel"]);
    expect(ui.noticeText).toBeNull();
    expect(ui.requiresPayment).toBe(false);
    expect(ui.accessEndsAt).toBe(active.current_period_end);
  });

  it("no ofrece ninguna acción a un usuario sin rol admin", () => {
    expect(deriveSubscriptionUi(active, member).actions).toEqual([]);
  });

  it("etiqueta el botón como «Cancelar al final del periodo»", () => {
    expect(SUBSCRIPTION_ACTION_LABELS.cancel).toBe("Cancelar al final del periodo");
  });
});

describe("Cancelación programada", () => {
  const scheduled = {
    status: "active",
    cancel_at_period_end: true,
    current_period_end: future(12),
  };

  it("muestra aviso con la fecha de finalización y el botón de mantener", () => {
    const ui = deriveSubscriptionUi(scheduled, admin);
    expect(ui.state).toBe("scheduled_cancellation");
    expect(ui.actions).toEqual(["resume"]);
    expect(ui.noticeTone).toBe("warning");
    expect(ui.noticeText).toContain("se cancelará el");
    expect(ui.accessEndsAt).toBe(scheduled.current_period_end);
    // Conserva el acceso: no exige pago para seguir usando el plan.
    expect(ui.requiresPayment).toBe(false);
  });

  it("no ofrece volver a cancelar mientras la baja está programada", () => {
    expect(deriveSubscriptionUi(scheduled, admin).actions).not.toContain("cancel");
  });

  it("un trial con baja programada también ofrece mantener", () => {
    const ui = deriveSubscriptionUi(
      { status: "trial", cancel_at_period_end: true, trial_ends_at: future(3) },
      admin,
    );
    expect(ui.state).toBe("scheduled_cancellation");
    expect(ui.accessEndsAt).toBe(future(3));
  });
});

describe("Vencimiento y gracia", () => {
  it("past_due dentro de gracia muestra la fecha límite y el botón de renovar", () => {
    const ui = deriveSubscriptionUi(
      { status: "past_due", grace_ends_at: future(2), current_period_end: past() },
      admin,
    );
    expect(ui.state).toBe("grace");
    expect(ui.statusLabel).toBe("Pago pendiente");
    expect(ui.actions).toEqual(["renew"]);
    expect(ui.accessEndsAt).toBe(future(2));
    expect(ui.noticeText).toContain("Conservas el acceso hasta el");
    expect(ui.requiresPayment).toBe(true);
  });

  it("past_due con la gracia vencida pasa a estado vencido sin acceso", () => {
    const ui = deriveSubscriptionUi(
      { status: "past_due", grace_ends_at: past(1), current_period_end: past(4) },
      admin,
    );
    expect(ui.state).toBe("expired");
    expect(ui.accessEndsAt).toBeNull();
    expect(ui.noticeTone).toBe("danger");
    expect(ui.actions).toEqual(["renew"]);
  });

  it("active con período vencido queda pendiente de renovación (el cron aún no corrió)", () => {
    const ui = deriveSubscriptionUi(
      { status: "active", cancel_at_period_end: false, current_period_end: past(1) },
      admin,
    );
    expect(ui.state).toBe("expired");
    expect(ui.statusLabel).toBe("Pendiente de renovación");
    expect(ui.actions).toEqual(["renew"]);
  });

  it("trial vencido exige contratar un plan", () => {
    const ui = deriveSubscriptionUi({ status: "trial", trial_ends_at: past(1) }, admin);
    expect(ui.state).toBe("expired");
    expect(ui.requiresPayment).toBe(true);
  });
});

describe("Suspensión y cancelación consumada", () => {
  it("suspended ofrece reactivar mediante pago", () => {
    const ui = deriveSubscriptionUi({ status: "suspended" }, admin);
    expect(ui.state).toBe("suspended");
    expect(ui.actions).toEqual(["reactivate"]);
    expect(ui.requiresPayment).toBe(true);
    expect(ui.noticeTone).toBe("danger");
  });

  it("cancelled ofrece reactivar mediante pago", () => {
    const ui = deriveSubscriptionUi({ status: "cancelled" }, admin);
    expect(ui.state).toBe("cancelled");
    expect(ui.actions).toEqual(["reactivate"]);
    expect(ui.requiresPayment).toBe(true);
  });

  it("sin suscripción se pide contratar un plan", () => {
    const ui = deriveSubscriptionUi(null, admin);
    expect(ui.state).toBe("none");
    expect(ui.actions).toEqual(["reactivate"]);
  });

  it("ningún estado ofrece una acción que active sin pago", () => {
    const states = [
      { status: "suspended" },
      { status: "cancelled" },
      { status: "past_due", grace_ends_at: past(1) },
      { status: "past_due", grace_ends_at: future(1) },
      null,
    ];
    for (const subscription of states) {
      const ui = deriveSubscriptionUi(subscription, admin);
      // resume/cancel sólo existen sobre suscripciones vigentes; los estados
      // que requieren dinero únicamente pueden mandar al checkout.
      expect(ui.actions.every((action) => action === "renew" || action === "reactivate")).toBe(true);
      expect(ui.requiresPayment).toBe(true);
    }
  });

  it("un usuario sin rol admin nunca ve acciones de pago", () => {
    for (const subscription of [{ status: "suspended" }, { status: "cancelled" }, null]) {
      expect(deriveSubscriptionUi(subscription, member).actions).toEqual([]);
    }
  });
});
