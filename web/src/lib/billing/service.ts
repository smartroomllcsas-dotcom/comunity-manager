import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { BILLING_FEATURES } from "@/lib/billing/features";
import { BRAND_STATUS_PAUSED } from "@/lib/smarttalk/brand-status";
import { billingError, billingWarn } from "@/lib/billing/log";
import { GLOBAL_ADMIN_EMAIL, isGlobalAdminEmail } from "@/lib/platform-admin";
import type {
  BillingEnforcementMode,
  BillingFeatureCode,
} from "@/lib/billing/features";

interface BillingCheckInput {
  organizationId: string;
  featureCode: BillingFeatureCode;
  brandId?: string;
  excludeInvitationId?: string;
  requestedUnits?: number;
  source?: string;
  /** Internal worker override for state transitions that must never run in observe/soft mode. */
  forceHard?: boolean;
}

interface EntitlementRow {
  enabled: boolean;
  limit_value: number | null;
  reset_interval: "none" | "billing_period" | "day" | "month";
  overage_policy: "block" | "allow" | "notify";
}

interface OrganizationBillingRow {
  id: string;
  is_active: boolean;
  plan_id: string | null;
  billing_enforcement_mode: BillingEnforcementMode | null;
  trial_ends_at: string | null;
  onboarding_status: OrganizationOnboardingStatus | null;
  plan: { price_monthly: number } | null;
}

type OrganizationOnboardingStatus =
  | "not_started"
  | "pending_payment"
  | "checkout_started"
  | "active"
  | "payment_rejected"
  | "payment_failed"
  | "payment_expired"
  | "cancelled";

interface SubscriptionBillingRow {
  id: string;
  status: "trial" | "active" | "past_due" | "cancelled" | "suspended";
  current_period_start: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  grace_ends_at: string | null;
}

export interface BillingDecision {
  allowed: boolean;
  wouldBlock: boolean;
  mode: BillingEnforcementMode;
  reason:
    | "billing_off"
    | "schema_not_ready"
    | "organization_inactive"
    | "subscription_inactive"
    | "feature_not_configured"
    | "feature_disabled"
    | "within_limit"
    | "limit_reached"
    | "unlimited";
  featureCode: BillingFeatureCode;
  requestedUnits: number;
  currentUsage: number | null;
  limitValue: number | null;
  periodStart: string;
  periodEnd: string;
}

function parseMode(value: string | null | undefined): BillingEnforcementMode {
  return value === "observe" || value === "soft" || value === "hard"
    ? value
    : "off";
}

function resolveMode(
  organizationMode: BillingEnforcementMode | null,
  forceHard = false,
): BillingEnforcementMode {
  const globalMode = forceHard
    ? "hard"
    : parseMode(process.env.BILLING_ENFORCEMENT_MODE);
  if (globalMode === "off") return "off";

  const orgMode = parseMode(organizationMode);
  // The deployment variable is the platform safety floor. Legacy
  // organizations default to `observe`, so using the old minimum calculation
  // would silently disable `hard` enforcement for every existing account.
  if (orgMode === "off") return globalMode;

  const levels: BillingEnforcementMode[] = ["off", "observe", "soft", "hard"];
  return levels[Math.max(levels.indexOf(globalMode), levels.indexOf(orgMode))];
}

function defaultPeriod() {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function subscriptionPeriod(subscription: SubscriptionBillingRow | null) {
  const fallback = defaultPeriod();
  return {
    start: subscription?.current_period_start || fallback.start,
    end: subscription?.current_period_end || fallback.end,
  };
}

async function currentUserIsSuperAdmin() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const admin = createAdminClient();
    const { data: agent } = await admin
      .from("agents")
      .select("is_super_admin")
      .eq("id", user.id)
      .maybeSingle();
    return agent?.is_super_admin === true;
  } catch {
    return false;
  }
}

async function organizationBelongsToPlatformOwner(organizationId: string) {
  try {
    const admin = createAdminClient();
    const { data: agent, error } = await admin
      .from("agents")
      .select("email, is_super_admin")
      .eq("organization_id", organizationId)
      .eq("is_super_admin", true)
      .eq("email", GLOBAL_ADMIN_EMAIL)
      .limit(1)
      .maybeSingle();

    return (
      !error &&
      agent?.is_super_admin === true &&
      typeof agent.email === "string" &&
      isGlobalAdminEmail(agent.email)
    );
  } catch {
    // Billing must never fail open for customer organizations when the lookup
    // itself is unavailable.
    return false;
  }
}

function isSubscriptionUsable(
  subscription: SubscriptionBillingRow | null,
  organization: OrganizationBillingRow
) {
  if (!organization.is_active) return false;
  if (
    organization.onboarding_status &&
    organization.onboarding_status !== "not_started" &&
    organization.onboarding_status !== "active"
  ) {
    return false;
  }
  if (!subscription) {
    // Los planes gratuitos no pasan por una pasarela y, por tanto, varias
    // organizaciones legítimas no tienen fila en `subscriptions`. El estado
    // de onboarding activo sí confirma que terminaron el alta; sus límites se
    // siguen aplicando mediante `plan_entitlements` como a cualquier plan.
    // Los planes pagos continúan exigiendo trial o suscripción activa.
    return (
      organization.onboarding_status === "active" &&
      Number(organization.plan?.price_monthly ?? -1) === 0
    );
  }
  if (subscription.status === "active") return true;
  if (
    subscription.status === "trial" &&
    subscription.trial_ends_at &&
    new Date(subscription.trial_ends_at).getTime() > Date.now()
  ) {
    return true;
  }
  if (
    subscription.status === "past_due" &&
    subscription.grace_ends_at &&
    new Date(subscription.grace_ends_at).getTime() > Date.now()
  ) {
    return true;
  }
  return false;
}

async function logDecision(
  decision: BillingDecision,
  organizationId: string,
  source?: string
) {
  if (decision.mode === "off") return;
  const admin = createAdminClient();
  const { error } = await admin.from("billing_decision_events").insert({
    organization_id: organizationId,
    feature_code: decision.featureCode,
    enforcement_mode: decision.mode,
    allowed: decision.allowed,
    would_block: decision.wouldBlock,
    requested_units: decision.requestedUnits,
    current_usage: decision.currentUsage,
    limit_value: decision.limitValue,
    reason: decision.reason,
    source: source || null,
  });
  if (error) {
    billingWarn("decision_not_recorded", {
      correlationId: `decision:${organizationId}:${decision.featureCode}`,
      organizationId,
      code: error.code,
      featureCode: decision.featureCode,
      source: source || null,
    });
  }
}

function makeDecision(
  input: BillingCheckInput,
  mode: BillingEnforcementMode,
  period: { start: string; end: string },
  details: Pick<
    BillingDecision,
    "reason" | "wouldBlock" | "currentUsage" | "limitValue"
  >
): BillingDecision {
  return {
    allowed: mode !== "hard" || !details.wouldBlock,
    wouldBlock: details.wouldBlock,
    mode,
    reason: details.reason,
    featureCode: input.featureCode,
    requestedUnits: input.requestedUnits ?? 1,
    currentUsage: details.currentUsage,
    limitValue: details.limitValue,
    periodStart: period.start,
    periodEnd: period.end,
  };
}

async function getCurrentUsage(
  organizationId: string,
  featureCode: BillingFeatureCode,
  period: { start: string; end: string },
  brandId?: string,
  excludeInvitationId?: string
) {
  const admin = createAdminClient();

  if (featureCode === BILLING_FEATURES.TEAM_MEMBERS) {
    let invitationsQuery = admin
      .from("invitations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "pending");
    if (excludeInvitationId) invitationsQuery = invitationsQuery.neq("id", excludeInvitationId);
    const [agents, invitations] = await Promise.all([
      admin
        .from("agents")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId),
      invitationsQuery,
    ]);
    return (agents.count || 0) + (invitations.count || 0);
  }

  if (featureCode === BILLING_FEATURES.AGENCY_USERS) {
    let invitationsQuery = admin
      .from("invitations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("member_type", "agency_user")
      .eq("status", "pending");
    if (excludeInvitationId) invitationsQuery = invitationsQuery.neq("id", excludeInvitationId);
    const [agents, invitations] = await Promise.all([
      admin
        .from("agents")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("member_type", "agency_user"),
      invitationsQuery,
    ]);
    return (agents.count || 0) + (invitations.count || 0);
  }

  if (featureCode === BILLING_FEATURES.BRAND_ADVISORS_TOTAL) {
    let invitationsQuery = admin
      .from("invitations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("member_type", "brand_advisor")
      .eq("status", "pending");
    if (excludeInvitationId) invitationsQuery = invitationsQuery.neq("id", excludeInvitationId);
    const [agents, invitations] = await Promise.all([
      admin
        .from("agents")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("member_type", "brand_advisor"),
      invitationsQuery,
    ]);
    return (agents.count || 0) + (invitations.count || 0);
  }

  if (featureCode === BILLING_FEATURES.BRAND_ADVISORS_PER_BRAND) {
    if (!brandId) return 0;
    let invitationAssignmentsQuery = admin
      .from("invitation_brand_assignments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("brand_id", brandId);
    if (excludeInvitationId) {
      invitationAssignmentsQuery = invitationAssignmentsQuery.neq("invitation_id", excludeInvitationId);
    }
    const [assignments, invitationAssignments] = await Promise.all([
      admin
        .from("brand_advisor_assignments")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("brand_id", brandId),
      invitationAssignmentsQuery,
    ]);
    return (assignments.count || 0) + (invitationAssignments.count || 0);
  }

  if (featureCode === BILLING_FEATURES.BRANDS_TOTAL) {
    // Las marcas pausadas no ocupan cupo: desactivar una marca debe permitir
    // crear otra. Este filtro tiene que ser **idéntico** al de la rama
    // 'brands.total' de smarttalk.reserve_billing_capacity (migración 036); si
    // divergen, la comprobación previa y la reserva atómica darían veredictos
    // distintos y el cliente vería un error contradictorio.
    const publicAdmin = createAdminClient("public");
    const { count } = await publicAdmin
      .from("cm_clients")
      .select("id", { count: "exact", head: true })
      .eq("smarttalk_organization_id", organizationId)
      // `neq` por sí solo descartaría también las filas con status NULL, porque
      // en SQL `NULL <> 'paused'` no es TRUE. El SQL usa `IS DISTINCT FROM`,
      // que sí las cuenta; esta cláusula reproduce esa semántica exacta.
      .or(`status.is.null,status.neq.${BRAND_STATUS_PAUSED}`);
    return count || 0;
  }

  if (featureCode === BILLING_FEATURES.CHANNELS_ACTIVE) {
    const { count } = await admin
      .from("channels")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .neq("status", "disconnected");
    return count || 0;
  }

  if (featureCode === BILLING_FEATURES.CONTACTS_TOTAL) {
    const { count } = await admin
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId);
    return count || 0;
  }

  if (featureCode === BILLING_FEATURES.AUTOMATION_FLOWS) {
    const { count } = await admin
      .from("chatbot_flows")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId);
    return count || 0;
  }

  if (featureCode === BILLING_FEATURES.BROADCASTS_MONTH) {
    const { count } = await admin
      .from("broadcasts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .neq("status", "draft")
      .gte("created_at", period.start)
      .lt("created_at", period.end);
    return count || 0;
  }

  const { data } = await admin
    .from("usage_counters")
    .select("quantity")
    .eq("organization_id", organizationId)
    .eq("feature_code", featureCode)
    .eq("period_start", period.start)
    .maybeSingle();
  return Number(data?.quantity || 0);
}

export async function checkBillingFeature(
  input: BillingCheckInput
): Promise<BillingDecision> {
  // A zero-unit check is used by the overage release worker when the contact
  // already exists and only needs its restricted visibility promoted. Normal
  // resource creation callers continue to use the default minimum of one.
  const requestedUnits = Math.max(0, Math.floor(input.requestedUnits ?? 1));
  const normalizedInput = { ...input, requestedUnits };
  const fallbackPeriod = defaultPeriod();
  const globalMode = input.forceHard
    ? "hard"
    : parseMode(process.env.BILLING_ENFORCEMENT_MODE);

  // The platform owner is outside customer plan limits. Interactive requests
  // can identify the signed-in superadmin directly; webhooks and workers have
  // no user session, so they must identify the owner's organization instead.
  // Customer organizations without a superadmin agent keep normal limits.
  if (
    (await currentUserIsSuperAdmin()) ||
    (await organizationBelongsToPlatformOwner(input.organizationId))
  ) {
    return makeDecision(normalizedInput, "off", fallbackPeriod, {
      reason: "unlimited",
      wouldBlock: false,
      currentUsage: null,
      limitValue: null,
    });
  }

  if (globalMode === "off") {
    return makeDecision(normalizedInput, "off", fallbackPeriod, {
      reason: "billing_off",
      wouldBlock: false,
      currentUsage: null,
      limitValue: null,
    });
  }

  const admin = createAdminClient();
  const { data: organization, error: organizationError } = await admin
    .from("organizations")
    .select(
      "id, is_active, plan_id, billing_enforcement_mode, trial_ends_at, onboarding_status, plan:plans!organizations_plan_id_fkey(price_monthly)"
    )
    .eq("id", input.organizationId)
    .maybeSingle();

  if (organizationError || !organization) {
    const decision = makeDecision(
      normalizedInput,
      globalMode === "hard" ? "observe" : globalMode,
      fallbackPeriod,
      {
        reason: "schema_not_ready",
        wouldBlock: false,
        currentUsage: null,
        limitValue: null,
      }
    );
    await logDecision(decision, input.organizationId, input.source);
    return decision;
  }

  const organizationRow = organization as unknown as Omit<
    OrganizationBillingRow,
    "plan"
  > & {
    plan:
      | { price_monthly: number }
      | Array<{ price_monthly: number }>
      | null;
  };
  const org: OrganizationBillingRow = {
    ...organizationRow,
    plan: Array.isArray(organizationRow.plan)
      ? organizationRow.plan[0] || null
      : organizationRow.plan,
  };
  const mode = resolveMode(org.billing_enforcement_mode, input.forceHard === true);
  const { data: subscriptionData } = await admin
    .from("subscriptions")
    .select(
      "id, status, current_period_start, current_period_end, trial_ends_at, grace_ends_at"
    )
    .eq("organization_id", input.organizationId)
    // Include terminal rows so a cancelled paid subscription cannot look like
    // an organization that legitimately never needed a subscription (free
    // plan). `isSubscriptionUsable` performs the final status decision.
    .in("status", ["trial", "active", "past_due", "cancelled", "suspended"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const subscription =
    (subscriptionData as SubscriptionBillingRow | null) || null;
  const period = subscriptionPeriod(subscription);

  if (!org.is_active) {
    const decision = makeDecision(normalizedInput, mode, period, {
      reason: "organization_inactive",
      wouldBlock: true,
      currentUsage: null,
      limitValue: null,
    });
    await logDecision(decision, input.organizationId, input.source);
    return decision;
  }

  if (!isSubscriptionUsable(subscription, org)) {
    const decision = makeDecision(normalizedInput, mode, period, {
      reason: "subscription_inactive",
      wouldBlock: true,
      currentUsage: null,
      limitValue: null,
    });
    await logDecision(decision, input.organizationId, input.source);
    return decision;
  }

  if (!org.plan_id) {
    const decision = makeDecision(normalizedInput, mode, period, {
      reason: "feature_not_configured",
      wouldBlock: false,
      currentUsage: null,
      limitValue: null,
    });
    await logDecision(decision, input.organizationId, input.source);
    return decision;
  }

  const { data: entitlementData, error: entitlementError } = await admin
    .from("plan_entitlements")
    .select("enabled, limit_value, reset_interval, overage_policy")
    .eq("plan_id", org.plan_id)
    .eq("feature_code", input.featureCode)
    .maybeSingle();

  if (entitlementError) {
    const decision = makeDecision(normalizedInput, mode, period, {
      reason: "schema_not_ready",
      wouldBlock: false,
      currentUsage: null,
      limitValue: null,
    });
    await logDecision(decision, input.organizationId, input.source);
    return decision;
  }

  const entitlement = entitlementData as EntitlementRow | null;
  if (!entitlement) {
    const decision = makeDecision(normalizedInput, mode, period, {
      reason: "feature_not_configured",
      wouldBlock: false,
      currentUsage: null,
      limitValue: null,
    });
    await logDecision(decision, input.organizationId, input.source);
    return decision;
  }

  if (!entitlement.enabled) {
    const decision = makeDecision(normalizedInput, mode, period, {
      reason: "feature_disabled",
      wouldBlock: true,
      currentUsage: 0,
      limitValue: 0,
    });
    await logDecision(decision, input.organizationId, input.source);
    return decision;
  }

  if (entitlement.limit_value === null) {
    const decision = makeDecision(normalizedInput, mode, period, {
      reason: "unlimited",
      wouldBlock: false,
      currentUsage: null,
      limitValue: null,
    });
    await logDecision(decision, input.organizationId, input.source);
    return decision;
  }

  const currentUsage = await getCurrentUsage(
    input.organizationId,
    input.featureCode,
    period,
    input.brandId,
    input.excludeInvitationId
  );
  const wouldExceed =
    currentUsage + requestedUnits > Number(entitlement.limit_value);
  const wouldBlock =
    wouldExceed && entitlement.overage_policy === "block";

  const decision = makeDecision(normalizedInput, mode, period, {
    reason: wouldExceed ? "limit_reached" : "within_limit",
    wouldBlock,
    currentUsage,
    limitValue: Number(entitlement.limit_value),
  });
  await logDecision(decision, input.organizationId, input.source);
  return decision;
}

export async function recordBillingUsage(input: {
  organizationId: string;
  featureCode: BillingFeatureCode;
  quantity?: number;
  idempotencyKey: string;
  sourceType?: string;
  sourceId?: string;
  metadata?: Record<string, unknown>;
  periodStart: string;
  periodEnd: string;
}) {
  if (parseMode(process.env.BILLING_ENFORCEMENT_MODE) === "off") {
    return { recorded: false, reason: "billing_off" as const };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("record_billing_usage", {
    p_organization_id: input.organizationId,
    p_feature_code: input.featureCode,
    p_quantity: Math.max(1, Math.floor(input.quantity ?? 1)),
    p_period_start: input.periodStart,
    p_period_end: input.periodEnd,
    p_idempotency_key: input.idempotencyKey,
    p_source_type: input.sourceType || null,
    p_source_id: input.sourceId || null,
    p_metadata: input.metadata || {},
  });

  if (error) {
    billingWarn("usage_not_recorded", {
      correlationId: `usage:${input.idempotencyKey}`,
      organizationId: input.organizationId,
      code: error.code,
      featureCode: input.featureCode,
    });
    return { recorded: false, reason: "write_failed" as const };
  }

  return { recorded: Boolean(data), reason: "ok" as const };
}

export type BillingCapacityResult =
  | { status: "disabled" }
  | { status: "reserved"; reservationId: string }
  | { status: "unlimited" }
  | {
      status: "denied";
      reason: "limit_reached" | "feature_disabled";
      currentUsage: number;
      limitValue: number;
    }
  | { status: "error" };

/**
 * Atomically reserves capacity for count-based resources.
 *
 * The feature flag keeps existing deployments safe until migration 031 is
 * applied. Once enabled, callers must consume or release the reservation after
 * the resource write completes.
 */
export async function reserveBillingCapacity(input: {
  organizationId: string;
  featureCode: BillingFeatureCode;
  requestedUnits?: number;
}): Promise<BillingCapacityResult> {
  if (process.env.BILLING_ATOMIC_QUOTA_MODE !== "on") {
    return { status: "disabled" };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("reserve_billing_capacity", {
    p_organization_id: input.organizationId,
    p_feature_code: input.featureCode,
    p_quantity: Math.max(1, Math.floor(input.requestedUnits ?? 1)),
  });
  if (error || !data) {
    billingError("quota_reservation_failed", {
      correlationId: `quota:${input.organizationId}:${input.featureCode}`,
      organizationId: input.organizationId,
      code: error?.code,
      featureCode: input.featureCode,
    });
    return { status: "error" };
  }

  const row = (Array.isArray(data) ? data[0] : data) as {
    allowed?: boolean;
    reservation_id?: string | null;
    reason?: string;
    current_usage?: number | null;
    limit_value?: number | null;
  };
  if (row.reason === "unlimited") return { status: "unlimited" };
  if (!row.allowed && (row.reason === "limit_reached" || row.reason === "feature_disabled")) {
    return {
      status: "denied",
      reason: row.reason,
      currentUsage: Number(row.current_usage || 0),
      limitValue: Number(row.limit_value || 0),
    };
  }
  if (!row.allowed || !row.reservation_id) return { status: "error" };
  return { status: "reserved", reservationId: row.reservation_id };
}

export async function consumeBillingCapacity(
  reservationId: string,
  resourceId?: string,
) {
  if (process.env.BILLING_ATOMIC_QUOTA_MODE !== "on") return true;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("consume_billing_capacity", {
    p_reservation_id: reservationId,
    p_resource_id: resourceId || null,
  });
  if (error) {
    billingError("quota_consumption_failed", {
      correlationId: `reservation:${reservationId}`,
      code: error.code,
    });
    return false;
  }
  return Boolean(data);
}

export async function releaseBillingCapacity(reservationId: string) {
  if (process.env.BILLING_ATOMIC_QUOTA_MODE !== "on") return true;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("release_billing_capacity", {
    p_reservation_id: reservationId,
  });
  if (error) {
    billingError("quota_release_failed", {
      correlationId: `reservation:${reservationId}`,
      code: error.code,
    });
    return false;
  }
  return Boolean(data);
}

export function billingCapacityErrorResponse() {
  return Response.json(
    {
      error: "No fue posible reservar el límite contratado. Intenta nuevamente.",
      code: "BILLING_QUOTA_UNAVAILABLE",
    },
    { status: 503 },
  );
}

export function billingCapacityDeniedResponse(
  decision: BillingDecision,
  result: Extract<BillingCapacityResult, { status: "denied" }>,
) {
  return billingDeniedResponse({
    ...decision,
    allowed: false,
    wouldBlock: true,
    reason: result.reason,
    currentUsage: result.currentUsage,
    limitValue: result.limitValue,
  });
}

export function billingDeniedResponse(decision: BillingDecision) {
  const subscriptionRequired =
    decision.reason === "subscription_inactive" ||
    decision.reason === "organization_inactive";
  return Response.json(
    {
      error: subscriptionRequired
        ? "Tu cuenta no tiene un plan activo. Suscríbete a un plan para continuar."
        : "Tu plan no permite realizar esta acción porque alcanzaste el límite contratado.",
      code: subscriptionRequired
        ? "BILLING_SUBSCRIPTION_REQUIRED"
        : "BILLING_LIMIT_REACHED",
      feature: decision.featureCode,
      reason: decision.reason,
      currentUsage: decision.currentUsage,
      limit: decision.limitValue,
      redirect: "/settings/billing",
    },
    { status: 402 }
  );
}
