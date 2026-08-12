import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueBillingNotification } from "@/lib/billing/notifications";

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const graceDays = Math.max(
    0,
    Number.parseInt(process.env.BILLING_GRACE_DAYS || "3", 10) || 0
  );
  const graceEnd = new Date(
    now.getTime() + graceDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: expiredActive, error: activeError } = await admin
    .from("subscriptions")
    .select("id, organization_id, status, cancel_at_period_end, current_period_end")
    .eq("status", "active")
    .lte("current_period_end", nowIso);
  if (activeError) {
    return Response.json({ error: activeError.message }, { status: 500 });
  }

  let movedToPastDue = 0;
  let cancelled = 0;
  let graceNotifications = 0;
  let suspensionNotifications = 0;
  for (const subscription of expiredActive || []) {
    const nextStatus = subscription.cancel_at_period_end
      ? "cancelled"
      : "past_due";
    const { error } = await admin
      .from("subscriptions")
      .update({
        status: nextStatus,
        grace_ends_at: nextStatus === "past_due" ? graceEnd : null,
        cancelled_at: nextStatus === "cancelled" ? nowIso : null,
        status_reason:
          nextStatus === "cancelled"
            ? "cancel_at_period_end"
            : "period_ended_without_renewal",
      })
      .eq("id", subscription.id)
      .eq("status", "active");
    if (error) continue;

    await admin.from("subscription_events").insert({
      subscription_id: subscription.id,
      organization_id: subscription.organization_id,
      previous_status: "active",
      new_status: nextStatus,
      reason:
        nextStatus === "cancelled"
          ? "cancel_at_period_end"
          : "period_ended_without_renewal",
      actor_type: "system",
      correlation_id: `lifecycle:${subscription.id}:${now.toISOString().slice(0, 13)}`,
    });
    if (nextStatus === "cancelled") {
      cancelled++;
    } else {
      movedToPastDue++;
      // D-6: aviso al administrador al entrar en el período de gracia, una sola
      // vez por transición. La clave incluye el período que acaba de vencer, así
      // que un ciclo posterior sí vuelve a avisar, pero una reejecución del cron
      // sobre el mismo período no.
      const notified = await enqueueBillingNotification({
        organizationId: subscription.organization_id,
        subscriptionId: subscription.id,
        idempotencyKey: `lifecycle-grace:${subscription.id}:${subscription.current_period_end}`,
        subject: "Tu suscripción entró en período de gracia",
        text:
          "No recibimos el pago del período facturado. Conservas el acceso hasta " +
          `${graceEnd}; después la cuenta queda suspendida. Actualiza tu pago en /settings/billing.`,
        metadata: { transition: "active_to_past_due", grace_ends_at: graceEnd },
      });
      if (notified.enqueued) graceNotifications++;
    }
  }

  const { data: graceExpired, error: graceError } = await admin
    .from("subscriptions")
    .select("id, organization_id, grace_ends_at")
    .eq("status", "past_due")
    .lte("grace_ends_at", nowIso);
  if (graceError) {
    return Response.json({ error: graceError.message }, { status: 500 });
  }

  let suspended = 0;
  for (const subscription of graceExpired || []) {
    const { error } = await admin
      .from("subscriptions")
      .update({
        status: "suspended",
        suspended_at: nowIso,
        status_reason: "grace_period_ended",
      })
      .eq("id", subscription.id)
      .eq("status", "past_due");
    if (error) continue;

    await admin.from("subscription_events").insert({
      subscription_id: subscription.id,
      organization_id: subscription.organization_id,
      previous_status: "past_due",
      new_status: "suspended",
      reason: "grace_period_ended",
      actor_type: "system",
      correlation_id: `lifecycle:${subscription.id}:${now.toISOString().slice(0, 13)}`,
    });
    suspended++;

    // D-6: aviso al pasar a suspendida, una sola vez por transición. La clave
    // usa la gracia que acaba de vencer, que es única por ciclo.
    const notified = await enqueueBillingNotification({
      organizationId: subscription.organization_id,
      subscriptionId: subscription.id,
      idempotencyKey: `lifecycle-suspended:${subscription.id}:${subscription.grace_ends_at}`,
      subject: "Tu suscripción quedó suspendida",
      text:
        "El período de gracia terminó sin recibir el pago, así que la cuenta quedó " +
        "suspendida. Reactívala completando un pago en /settings/billing.",
      metadata: { transition: "past_due_to_suspended", grace_ends_at: subscription.grace_ends_at },
    });
    if (notified.enqueued) suspensionNotifications++;
  }

  // -------------------------------------------------------------------------
  // D-5 / H-12 · Materializar los downgrades programados.
  //
  // El RPC de activación (migración 035) no cambia `plan_id` en un downgrade:
  // guarda el plan destino en `pending_plan_id` con `change_effective_at` en el
  // fin del período vigente, para que el cliente conserve su acceso actual
  // hasta esa fecha. Aquí se aplica cuando llega el momento.
  // -------------------------------------------------------------------------
  const { data: pendingChanges, error: pendingError } = await admin
    .from("subscriptions")
    .select("id, organization_id, status, plan_id, pending_plan_id, pending_plan_price_id, change_effective_at")
    .lte("change_effective_at", nowIso);
  if (pendingError) {
    return Response.json({ error: pendingError.message }, { status: 500 });
  }

  let planChangesApplied = 0;
  for (const subscription of pendingChanges || []) {
    // `lte` ya descarta los nulos, pero el plan destino es obligatorio para
    // poder aplicar nada.
    if (!subscription.pending_plan_id) continue;

    // Snapshot ANTES de escribir: el resto del bucle necesita los valores
    // previos (plan de origen, fecha efectiva) para la bitácora y para la
    // organización. Leerlos después de la actualización los devolvería ya
    // pisados.
    const fromPlanId = subscription.plan_id;
    const toPlanId = subscription.pending_plan_id;
    const toPlanPriceId = subscription.pending_plan_price_id;
    const effectiveAt = subscription.change_effective_at;
    const previousStatus = subscription.status;
    const organizationId = subscription.organization_id;

    const { data: updated, error } = await admin
      .from("subscriptions")
      .update({
        plan_id: toPlanId,
        plan_price_id: toPlanPriceId,
        pending_plan_id: null,
        pending_plan_price_id: null,
        change_effective_at: null,
        status_reason: "plan_change_applied",
      })
      .eq("id", subscription.id)
      // Guarda optimista: si otro proceso ya lo aplicó, `change_effective_at`
      // es null y esta actualización no afecta filas.
      .lte("change_effective_at", nowIso)
      .select("id");
    if (error) continue;
    if (Array.isArray(updated) && updated.length === 0) continue;

    // La organización sigue al plan sólo cuando el cambio se hace efectivo.
    await admin
      .from("organizations")
      .update({ plan_id: toPlanId })
      .eq("id", organizationId);

    await admin.from("subscription_events").insert({
      subscription_id: subscription.id,
      organization_id: organizationId,
      previous_status: previousStatus,
      new_status: previousStatus,
      reason: "plan_change_applied",
      actor_type: "system",
      correlation_id: `plan-change:${subscription.id}:${effectiveAt}`,
      metadata: {
        from_plan_id: fromPlanId,
        to_plan_id: toPlanId,
        effective_at: effectiveAt,
      },
    });
    planChangesApplied++;
  }

  return Response.json({
    ok: true,
    movedToPastDue,
    cancelled,
    suspended,
    graceNotifications,
    suspensionNotifications,
    planChangesApplied,
    processedAt: nowIso,
  });
}
