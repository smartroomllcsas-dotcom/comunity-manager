import { createAdminClient } from "@/lib/supabase/admin";

const LEGACY_FEATURES = {
  max_agents: "agency.users",
  max_contacts: "contacts.total",
  max_broadcasts_per_month: "broadcasts.month",
  max_chatbot_flows: "automations.flows",
} as const;

interface PlanEntitlementWrite {
  plan_id: string;
  feature_code: string;
  enabled: boolean;
  limit_value: number | null;
  reset_interval: "none" | "billing_period";
  overage_policy: "block";
}

export async function syncPlanEntitlements(
  planId: string,
  body: Record<string, unknown>
) {
  const admin = createAdminClient();
  const rows: PlanEntitlementWrite[] = Object.entries(LEGACY_FEATURES).map(
    ([field, featureCode]) => ({
      plan_id: planId,
      feature_code: featureCode,
      enabled: true,
      limit_value:
        Number(body[field]) === -1 ? null : Math.max(0, Number(body[field])),
      reset_interval:
        featureCode === "broadcasts.month" ? "billing_period" : "none",
      overage_policy: "block",
    })
  );
  rows.push({
    plan_id: planId,
    feature_code: "ai.access",
    enabled: Boolean(body.ai_enabled),
    limit_value: null,
    reset_interval: "none",
    overage_policy: "block",
  });

  for (const [field, featureCode, resetInterval] of [
    ["max_brands", "brands.total", "none"],
    ["max_brand_advisors", "brand.advisors_total", "none"],
    ["max_advisors_per_brand", "brand.advisors_per_brand", "none"],
    ["max_channels", "channels.active", "none"],
    [
      "max_messages_per_month",
      "messages.outbound_month",
      "billing_period",
    ],
  ] as const) {
    if (body[field] === undefined) continue;
    rows.push({
      plan_id: planId,
      feature_code: featureCode,
      enabled: true,
      limit_value:
        Number(body[field]) === -1
          ? null
          : Math.max(0, Number(body[field])),
      reset_interval: resetInterval,
      overage_policy: "block",
    });
  }

  const { error } = await admin
    .from("plan_entitlements")
    .upsert(rows, { onConflict: "plan_id,feature_code" });
  if (error) throw error;
}

export async function syncPlanPrice(
  planId: string,
  body: Record<string, unknown>
) {
  const amount = Number(body.price_monthly);
  if (!Number.isFinite(amount) || amount <= 0) return;

  const admin = createAdminClient();
  const currency = String(body.currency || "COP").toUpperCase();
  const provider = ["epayco", "wompi", "payu"].includes(String(body.provider))
    ? String(body.provider)
    : "epayco";
  const amountMinor = Math.round(amount * 100);
  await admin
    .from("plan_prices")
    .update({ is_active: false, active_to: new Date().toISOString() })
    .eq("plan_id", planId)
    .eq("currency", currency)
    .eq("billing_interval", "month")
    .eq("provider", provider)
    .eq("is_active", true);

  const { error } = await admin.from("plan_prices").insert({
    plan_id: planId,
    currency,
    amount_minor: amountMinor,
    billing_interval: "month",
    interval_count: 1,
    provider,
    is_active: true,
  });
  if (error) throw error;
}
