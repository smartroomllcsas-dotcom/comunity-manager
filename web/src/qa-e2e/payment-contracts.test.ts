// Contract tests de pasarelas — sin llamar a ningún proveedor real.
//
// Cubre: firmas (ePayco/Wompi/PayU), payloads de checkout, idempotencia y
// conciliación de la confirmación de ePayco, y la coherencia entre lo que cada
// pasarela publica como URL de confirmación y las rutas que existen de verdad.
//
// Todas las claves son sintéticas y se fijan dentro del proceso de test.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import type { FakeSupabase } from "./helpers/fake-supabase";
import { createFakeSupabase } from "./helpers/fake-supabase";

const CUSTOMER_ID = "qa-cust-id";
const P_KEY = "qa-p-key";

vi.hoisted(() => {
  process.env.EPAYCO_CUSTOMER_ID = "qa-cust-id";
  process.env.EPAYCO_P_KEY = "qa-p-key";
  process.env.NEXT_PUBLIC_APP_URL = "https://qa.example.test";
  process.env.WOMPI_PUBLIC_KEY = "pub_test_qa";
  process.env.WOMPI_INTEGRITY_SECRET = "integrity_test_qa";
  process.env.WOMPI_EVENTS_SECRET = "events_test_qa";
  process.env.WOMPI_ENVIRONMENT = "sandbox";
  process.env.PAYU_API_KEY = "payu_api_key_qa";
  process.env.PAYU_MERCHANT_ID = "508029";
  process.env.PAYU_ACCOUNT_ID = "512321";
  process.env.PAYU_ENVIRONMENT = "sandbox";
});

const H = vi.hoisted(() => ({ current: null as FakeSupabase | null }));
vi.mock("next/server", () => ({ NextRequest: class {} }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => H.current!.admin() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => H.current!.server }));

import {
  createPayUCheckoutSignature,
  createPayUConfirmationSignature,
  createWompiEventSignature,
  createWompiIntegritySignature,
  formatPayUConfirmationValue,
  safeSignatureEqual,
} from "@/lib/payments/signatures";
import { getPaymentGateway } from "@/lib/payments/gateways";
import { PAYMENT_GATEWAYS } from "@/lib/payments/types";
import { POST as confirmation } from "@/app/api/epayco/confirmation/route";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const future = () => new Date(Date.now() + 3_600_000).toISOString();

// ---------------------------------------------------------------------------
// 1. Firmas
// ---------------------------------------------------------------------------

describe("Contract · firmas de Wompi", () => {
  const base = {
    reference: "cm_wompi_1754800000_abcd1234",
    amountMinor: 5_900_000,
    currency: "COP",
    expiresAt: "2026-08-10T12:00:00.000Z",
    integritySecret: "integrity_test_qa",
  };

  it("la firma de integridad concatena referencia+monto+moneda+expiración+secreto", () => {
    expect(createWompiIntegritySignature(base)).toBe(
      sha256(
        `${base.reference}${base.amountMinor}${base.currency}${base.expiresAt}${base.integritySecret}`,
      ),
    );
  });

  it("omitir la expiración no rompe la firma (campo opcional del contrato)", () => {
    const withoutExpiry = {
      reference: base.reference,
      amountMinor: base.amountMinor,
      currency: base.currency,
      integritySecret: base.integritySecret,
    };
    expect(createWompiIntegritySignature(withoutExpiry)).toBe(
      sha256(`${base.reference}${base.amountMinor}${base.currency}${base.integritySecret}`),
    );
  });

  it.each([
    ["referencia", { reference: "otra-ref" }],
    ["monto", { amountMinor: 5_900_001 }],
    ["moneda", { currency: "USD" }],
    ["secreto", { integritySecret: "otro" }],
  ])("cambiar %s produce una firma distinta", (_field, patch) => {
    expect(createWompiIntegritySignature({ ...base, ...patch })).not.toBe(
      createWompiIntegritySignature(base),
    );
  });

  it("la firma de eventos lee propiedades anidadas por ruta con puntos", () => {
    const event = {
      transaction: { id: "12345-1690000000-12345", status: "APPROVED", amount_in_cents: 5_900_000 },
    };
    const signature = createWompiEventSignature({
      data: event,
      properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"],
      timestamp: 1_690_000_000,
      eventsSecret: "events_test_qa",
    });
    expect(signature).toBe(
      sha256("12345-1690000000-12345APPROVED59000001690000000events_test_qa"),
    );
  });

  it("una propiedad ausente se firma como cadena vacía, no como 'undefined'", () => {
    const signature = createWompiEventSignature({
      data: { transaction: { id: "abc" } },
      properties: ["transaction.id", "transaction.status"],
      timestamp: 1,
      eventsSecret: "s",
    });
    expect(signature).toBe(sha256("abc1s"));
  });

  it("alterar el estado del evento invalida la firma", () => {
    const properties = ["transaction.id", "transaction.status"];
    const approved = createWompiEventSignature({
      data: { transaction: { id: "t1", status: "APPROVED" } },
      properties, timestamp: 10, eventsSecret: "s",
    });
    const declined = createWompiEventSignature({
      data: { transaction: { id: "t1", status: "DECLINED" } },
      properties, timestamp: 10, eventsSecret: "s",
    });
    expect(approved).not.toBe(declined);
  });
});

describe("Contract · firmas de PayU", () => {
  it("la firma de checkout usa el separador ~ en el orden documentado", () => {
    expect(
      createPayUCheckoutSignature({
        apiKey: "payu_api_key_qa",
        merchantId: "508029",
        reference: "REF-1",
        amount: "59000.00",
        currency: "COP",
      }),
    ).toBe(sha256("payu_api_key_qa~508029~REF-1~59000.00~COP"));
  });

  it.each([
    ["59000.00", "59000.0"],
    ["59000.05", "59000.05"],
    ["59000", "59000.0"],
    [59000.5, "59000.5"],
    ["0.10", "0.1"],
  ])("formatPayUConfirmationValue(%s) => %s", (input, expected) => {
    expect(formatPayUConfirmationValue(input)).toBe(expected);
  });

  it("un valor no numérico produce cadena vacía en lugar de NaN", () => {
    expect(formatPayUConfirmationValue("no-es-un-monto")).toBe("");
  });

  it("la firma de confirmación incorpora state_pol y el monto ya normalizado", () => {
    expect(
      createPayUConfirmationSignature({
        apiKey: "payu_api_key_qa",
        merchantId: "508029",
        referenceSale: "REF-1",
        value: "59000.00",
        currency: "COP",
        statePol: 4,
      }),
    ).toBe(sha256("payu_api_key_qa~508029~REF-1~59000.0~COP~4"));
  });

  it("distintos state_pol producen firmas distintas (aprobado vs rechazado)", () => {
    const build = (statePol: number) =>
      createPayUConfirmationSignature({
        apiKey: "k", merchantId: "m", referenceSale: "r", value: "1.00", currency: "COP", statePol,
      });
    expect(new Set([build(4), build(6), build(5), build(104)]).size).toBe(4);
  });
});

describe("Contract · comparación de firmas en tiempo constante", () => {
  it("acepta la misma firma sin distinguir mayúsculas", () => {
    expect(safeSignatureEqual("ABCDEF", "abcdef")).toBe(true);
  });
  it("rechaza longitudes distintas sin lanzar", () => {
    expect(safeSignatureEqual("abc", "abcdef")).toBe(false);
  });
  it("rechaza una firma alterada en un solo carácter", () => {
    expect(safeSignatureEqual("a".repeat(63) + "b", "a".repeat(64))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Payloads de checkout
// ---------------------------------------------------------------------------

const checkoutInput = {
  checkoutSessionId: "cs-1",
  reference: "cm_ref_1",
  description: "Plan QA",
  amountMinor: 5_900_000,
  currency: "COP",
  customerEmail: "qa@example.test",
  expiresAt: "2026-08-10T12:00:00.000Z",
};

describe("Contract · payload de checkout de Wompi", () => {
  it("emite un redirect firmado con el monto en centavos", async () => {
    const checkout = await getPaymentGateway("wompi").createHostedCheckout(checkoutInput);
    expect(checkout.kind).toBe("redirect");
    const url = new URL((checkout as { url: string }).url);
    expect(url.origin + url.pathname).toBe("https://checkout.wompi.co/p/");
    expect(url.searchParams.get("amount-in-cents")).toBe("5900000");
    expect(url.searchParams.get("reference")).toBe("cm_ref_1");
    expect(url.searchParams.get("signature:integrity")).toBe(
      createWompiIntegritySignature({
        reference: "cm_ref_1",
        amountMinor: 5_900_000,
        currency: "COP",
        expiresAt: checkoutInput.expiresAt,
        integritySecret: "integrity_test_qa",
      }),
    );
  });

  it("rechaza monedas distintas de COP", async () => {
    await expect(
      getPaymentGateway("wompi").createHostedCheckout({ ...checkoutInput, currency: "USD" }),
    ).rejects.toThrow(/COP/);
  });
});

describe("Contract · payload de checkout de PayU", () => {
  it("emite un formulario en sandbox con el monto en unidades y test=1", async () => {
    const checkout = await getPaymentGateway("payu").createHostedCheckout(checkoutInput);
    expect(checkout.kind).toBe("form");
    const form = checkout as { action: string; fields: Record<string, string> };
    expect(form.action).toContain("sandbox.checkout.payulatam.com");
    expect(form.fields.amount).toBe("59000.00");
    expect(form.fields.test).toBe("1");
    expect(form.fields.signature).toBe(
      createPayUCheckoutSignature({
        apiKey: "payu_api_key_qa",
        merchantId: "508029",
        reference: "cm_ref_1",
        amount: "59000.00",
        currency: "COP",
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Coherencia entre pasarela habilitada y ruta de confirmación existente
// ---------------------------------------------------------------------------

const APP_DIR = path.resolve(__dirname, "..", "app");

function routeExistsFor(urlPath: string) {
  const relative = urlPath.replace(/^\/+/, "");
  return (
    existsSync(path.join(APP_DIR, relative, "route.ts")) ||
    existsSync(path.join(APP_DIR, relative, "route.tsx"))
  );
}

describe("Contract · una pasarela activable debe tener su webhook implementado", () => {
  it("la ruta de confirmación de ePayco existe", () => {
    expect(routeExistsFor("api/epayco/confirmation")).toBe(true);
  });

  it("PayU publica una confirmationUrl que hoy NO tiene ruta", async () => {
    const checkout = await getPaymentGateway("payu").createHostedCheckout(checkoutInput);
    const { confirmationUrl } = (checkout as { fields: Record<string, string> }).fields;
    const declaredPath = new URL(confirmationUrl).pathname;
    expect(declaredPath).toBe("/api/webhooks/payments/payu");
    // Estado documentado: la URL apunta a un 404. La prueba falla en cuanto
    // alguien implemente la ruta sin actualizar esta expectativa, y falla el
    // guardián de abajo si además habilita la pasarela.
    expect(routeExistsFor(declaredPath)).toBe(false);
  });

  it.each(PAYMENT_GATEWAYS)(
    "%s: si isActivationReady() es true, su webhook debe existir",
    async (code) => {
      const gateway = getPaymentGateway(code);
      if (!gateway.isActivationReady()) {
        // Guardián del riesgo: no se puede cobrar con esta pasarela.
        expect(gateway.isActivationReady()).toBe(false);
        return;
      }
      if (code === "epayco") {
        expect(routeExistsFor("api/epayco/confirmation")).toBe(true);
        return;
      }
      const checkout = await gateway.createHostedCheckout(checkoutInput);
      const confirmationUrl =
        checkout.kind === "form"
          ? (checkout as { fields: Record<string, string> }).fields.confirmationUrl
          : null;
      expect(confirmationUrl, `${code} activable sin URL de confirmación`).toBeTruthy();
      expect(routeExistsFor(new URL(confirmationUrl!).pathname)).toBe(true);
    },
  );

  it("Wompi y PayU siguen bloqueados para checkout", () => {
    expect(getPaymentGateway("wompi").isActivationReady()).toBe(false);
    expect(getPaymentGateway("payu").isActivationReady()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. Idempotencia y conciliación de la confirmación de ePayco
// ---------------------------------------------------------------------------

function sign(p: { x_ref_payco: string; x_transaction_id: string; x_amount: string; x_currency_code: string }) {
  return sha256(
    [CUSTOMER_ID, P_KEY, p.x_ref_payco, p.x_transaction_id, p.x_amount, p.x_currency_code].join("^"),
  );
}

function buildParams(overrides: Record<string, string> = {}) {
  const base = {
    x_cust_id_cliente: CUSTOMER_ID,
    x_ref_payco: "REF-PAYCO-1",
    x_transaction_id: "TXN-1",
    x_amount: "59000.00",
    x_currency_code: "COP",
    x_cod_response: "1",
    x_response: "1",
    x_extra1: "cs-1",
    x_extra2: "INV-1",
    x_id_invoice: "INV-1",
    x_test_request: "true",
    x_franchise: "VISA",
    ...overrides,
  };
  return { ...base, x_signature: sign(base) };
}

function makeRequest(params: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(params)) fd.set(k, v);
  return { method: "POST", formData: async () => fd } as unknown as Parameters<typeof confirmation>[0];
}

function seedCheckout(overrides: Record<string, unknown> = {}) {
  H.current = createFakeSupabase({
    // Reproduce idx_billing_webhook_events_dedupe (migración 010): es la señal
    // 23505 en la que se apoya la deduplicación de la ruta.
    uniqueIndexes: {
      billing_webhook_events: [["provider", "environment", "event_key"]],
    },
    // Stand-in del RPC transaccional: sólo replica el efecto observable del
    // que depende la ruta (el checkout deja de estar `pending`). El cuerpo real
    // se verifica contra PostgreSQL en tests/postgres-integration.test.mjs.
    rpcHandlers: {
      finalize_epayco_approved_payment: (args, store) => {
        const { p_checkout_session_id } = args as { p_checkout_session_id: string };
        const session = (store.checkout_sessions || []).find(
          (row) => row.id === p_checkout_session_id,
        );
        if (session) {
          session.status = "approved";
          session.completed_at = new Date().toISOString();
        }
        return "sub-reactivada";
      },
    },
    tables: {
      checkout_sessions: [
        {
          id: "cs-1", internal_reference: "INV-1", organization_id: "org-1",
          plan_id: "plan-1", plan_price_id: "pp-1", status: "pending",
          amount_minor: 5_900_000, currency: "COP", test_mode: true,
          environment: "sandbox", purpose: "subscription", expires_at: future(),
          ...overrides,
        },
      ],
      billing_webhook_events: [],
      payments: [],
      rate_limit_hits: [],
    },
  });
}

const payments = () => H.current!.store.payments as Array<Record<string, unknown>>;
const webhookEvents = () => H.current!.store.billing_webhook_events as Array<Record<string, unknown>>;
const finalizeCalls = () =>
  H.current!.rpcCalls.filter((c) => c.name === "finalize_epayco_approved_payment");

describe("Contract · idempotencia de la confirmación de ePayco", () => {
  beforeEach(() => seedCheckout());

  it("reenviar la misma transacción no crea un segundo pago ni reactiva dos veces", async () => {
    const params = buildParams();
    const first = await confirmation(makeRequest(params));
    expect(await first.json()).toEqual({ status: "ok" });

    const second = await confirmation(makeRequest(params));
    expect(await second.json()).toEqual({ status: "ok", duplicate: true });
    const third = await confirmation(makeRequest(params));
    expect(await third.json()).toEqual({ status: "ok", duplicate: true });

    expect(payments()).toHaveLength(1);
    expect(webhookEvents()).toHaveLength(1);
    expect(finalizeCalls()).toHaveLength(1);
  });

  it("dos transacciones distintas del mismo checkout no se confunden entre sí", async () => {
    await confirmation(makeRequest(buildParams({ x_transaction_id: "TXN-A" })));
    // El checkout ya no está `pending` para la segunda: se ignora en lugar de
    // cobrar dos veces el mismo período.
    const second = await confirmation(makeRequest(buildParams({ x_transaction_id: "TXN-B" })));
    expect(await second.json()).toEqual({ status: "ok", ignored: true });
    expect(finalizeCalls()).toHaveLength(1);
  });
});

describe("Contract · conciliación de importe, moneda y ambiente", () => {
  beforeEach(() => seedCheckout());

  it("rechaza una firma inválida antes de tocar la base", async () => {
    const params = { ...buildParams(), x_signature: "0".repeat(64) };
    const res = await confirmation(makeRequest(params));
    expect(res.status).toBe(400);
    expect(webhookEvents()).toHaveLength(0);
    expect(payments()).toHaveLength(0);
  });

  it("rechaza un monto que no coincide con el checkout", async () => {
    const res = await confirmation(makeRequest(buildParams({ x_amount: "10000.00" })));
    expect(res.status).toBe(400);
    expect(webhookEvents()[0].status).toBe("failed");
    expect(webhookEvents()[0].last_error).toBe("amount_or_currency_mismatch");
    expect(payments()).toHaveLength(0);
    expect(finalizeCalls()).toHaveLength(0);
  });

  it("rechaza una moneda distinta a la del checkout", async () => {
    const res = await confirmation(makeRequest(buildParams({ x_currency_code: "USD" })));
    expect(res.status).toBe(400);
    expect(webhookEvents()[0].last_error).toBe("amount_or_currency_mismatch");
  });

  it("rechaza una confirmación de producción sobre un checkout sandbox", async () => {
    const res = await confirmation(makeRequest(buildParams({ x_test_request: "false" })));
    expect(res.status).toBe(400);
    expect(webhookEvents()[0].last_error).toBe("environment_mismatch");
    expect(finalizeCalls()).toHaveLength(0);
  });

  it("rechaza una referencia interna que no corresponde al checkout", async () => {
    const res = await confirmation(makeRequest(buildParams({ x_extra2: "INV-OTRO", x_id_invoice: "INV-OTRO" })));
    expect(res.status).toBe(400);
    expect(webhookEvents()[0].last_error).toBe("reference_mismatch");
  });

  it("ignora un checkout expirado en lugar de activarlo", async () => {
    seedCheckout({ expires_at: new Date(Date.now() - 1000).toISOString() });
    const res = await confirmation(makeRequest(buildParams()));
    expect(await res.json()).toEqual({ status: "ok", ignored: true });
    expect(webhookEvents()[0].status).toBe("ignored");
    expect(finalizeCalls()).toHaveLength(0);
  });
});

describe("Contract · reactivación por pago aprobado", () => {
  it("un pago aprobado delega la activación al RPC transaccional, no a la ruta", async () => {
    seedCheckout({ purpose: "renewal" });
    await confirmation(makeRequest(buildParams({ x_transaction_id: "TXN-REACTIVA" })));

    // La ruta nunca escribe `subscriptions`: el cambio de estado, el período y
    // el evento son responsabilidad del RPC (verificable sólo contra Postgres,
    // ver tests/postgres-integration.test.mjs).
    expect(H.current!.store.subscriptions).toBeUndefined();
    expect(finalizeCalls()).toHaveLength(1);
    expect(finalizeCalls()[0].args).toMatchObject({
      p_checkout_session_id: "cs-1",
      p_event_key: "TXN-REACTIVA",
    });
    expect(payments()[0].status).toBe("approved");
    expect(payments()[0].purpose).toBe("renewal");
  });

  it("un pago rechazado no invoca el RPC de activación", async () => {
    seedCheckout();
    await confirmation(makeRequest({ ...buildParams({ x_cod_response: "2", x_response: "2" }) }));
    expect(finalizeCalls()).toHaveLength(0);
  });
});
