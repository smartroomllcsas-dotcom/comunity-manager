import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const INACTIVE_ONBOARDING_STATES = new Set([
  "pending_payment",
  "checkout_started",
  "payment_rejected",
  "payment_failed",
  "payment_expired",
  "cancelled",
]);

function isFuture(value: string | null | undefined) {
  return Boolean(value && new Date(value).getTime() > Date.now());
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autenticado" }, { status: 401 });

  const admin = createAdminClient();
  const { data: agent, error: agentError } = await admin
    .from("agents")
    .select("organization_id, is_super_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (agentError || !agent) {
    return Response.json({ error: "Agente no encontrado" }, { status: 404 });
  }

  if (agent.is_super_admin) {
    return Response.json({
      isSuperAdmin: true,
      status: "unlimited",
      planName: "Super Admin",
      message: "Acceso ilimitado de plataforma. No requiere suscripción.",
    });
  }

  const [
    { data: organization, error: organizationError },
    { data: subscription, error: subscriptionError },
    { data: latestPayment, error: latestPaymentError },
  ] =
    await Promise.all([
      admin
        .from("organizations")
        .select(
          "id, is_active, plan_id, trial_ends_at, onboarding_status, plan:plans!organizations_plan_id_fkey(name, price_monthly)"
        )
        .eq("id", agent.organization_id)
        .maybeSingle(),
      admin
        .from("subscriptions")
        .select(
          "status, trial_ends_at, grace_ends_at, current_period_end, plan:plans!subscriptions_plan_id_fkey(name, price_monthly)"
        )
        .eq("organization_id", agent.organization_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("payments")
        .select("status, created_at")
        .eq("organization_id", agent.organization_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (organizationError || subscriptionError || latestPaymentError) {
    console.error("[billing/status] Failed to read billing state", {
      organizationError: organizationError?.message,
      subscriptionError: subscriptionError?.message,
      latestPaymentError: latestPaymentError?.message,
      organizationId: agent.organization_id,
    });
    return Response.json(
      {
        error: "No se pudo consultar el estado de facturación.",
        retryable: true,
      },
      { status: 503 }
    );
  }

  if (!organization) {
    return Response.json({
      isSuperAdmin: false,
      status: "inactive",
      planName: null,
      message: "No encontramos una organización activa para esta cuenta.",
      redirect: "/settings/billing",
    });
  }

  const subscriptionPlan = Array.isArray(subscription?.plan)
    ? subscription.plan[0]
    : subscription?.plan;
  const organizationPlan = Array.isArray(organization.plan)
    ? organization.plan[0]
    : organization.plan;
  const onboardingStatus = organization.onboarding_status || "not_started";
  const subscriptionActive =
    organization.is_active &&
    !INACTIVE_ONBOARDING_STATES.has(onboardingStatus) &&
    (subscription?.status === "active" ||
      (subscription?.status === "trial" && isFuture(subscription.trial_ends_at)) ||
      (subscription?.status === "past_due" && isFuture(subscription.grace_ends_at)));

  if (subscriptionActive) {
    const status = subscription?.status === "past_due" ? "past_due" : subscription?.status || "active";
    return Response.json({
      isSuperAdmin: false,
      status,
      planName: subscriptionPlan?.name || organizationPlan?.name || null,
      planPrice: subscriptionPlan?.price_monthly ?? organizationPlan?.price_monthly ?? null,
      currentPeriodEnd: subscription?.current_period_end || null,
      message:
        status === "past_due"
          ? "Tu pago está pendiente. Actualiza tu facturación antes de que termine el periodo de gracia."
          : null,
      redirect: "/settings/billing",
    });
  }

  const paymentStatus = latestPayment?.status;
  const rejected =
    paymentStatus === "rejected" ||
    onboardingStatus === "payment_rejected";
  const message = rejected
    ? "El último pago fue rechazado. Selecciona un plan y completa nuevamente el pago."
    : "Tu cuenta no tiene un plan activo. Suscríbete a un plan para comenzar.";

  return Response.json({
    isSuperAdmin: false,
    status: rejected ? "payment_rejected" : "no_plan",
    planName: null,
    planPrice: null,
    lastPaymentStatus: paymentStatus || null,
    message,
    redirect: "/settings/billing",
  });
}
