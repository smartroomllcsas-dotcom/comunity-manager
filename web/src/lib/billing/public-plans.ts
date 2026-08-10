import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PaymentGatewayCode } from "@/lib/payments/types";
import { billingError } from "@/lib/billing/log";

const COMMERCIAL_DESCRIPTIONS: Record<string, string> = {
  "demo-inicial-2026":
    "Para agencias que están centralizando sus primeras marcas y canales.",
  "demo-crecimiento-2026":
    "Para equipos en expansión que necesitan más capacidad, asesores e IA.",
  "demo-escala-2026":
    "Para operaciones avanzadas con múltiples marcas, canales y equipos.",
};

export interface PublicPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  amountMinor: number;
  currency: string;
  billingInterval: "month" | "year";
  maxAgencyUsers: number | null;
  maxBrandAdvisors: number | null;
  maxBrands: number | null;
  maxChannels: number | null;
  maxContacts: number | null;
  aiEnabled: boolean;
  gateways: PaymentGatewayCode[];
}

interface PlanRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  max_agents: number;
  max_contacts: number;
  ai_enabled: boolean;
  prices: Array<{
    amount_minor: number;
    currency: string;
    billing_interval: "month" | "year";
    provider: PaymentGatewayCode;
    active_from: string;
    active_to: string | null;
  }>;
  entitlements: Array<{
    feature_code: string;
    enabled: boolean;
    limit_value: number | null;
  }>;
}

function entitlementLimit(plan: PlanRow, code: string, fallback?: number) {
  const entitlement = plan.entitlements.find(
    (item) => item.feature_code === code && item.enabled
  );
  const value = entitlement?.limit_value ?? fallback ?? null;
  return value === -1 ? null : value;
}

export async function getPublicPlans(): Promise<PublicPlan[]> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const [{ data: plans, error }, { data: gatewayRows }] = await Promise.all([
    admin
      .from("plans")
      .select(
        "id, code, name, description, max_agents, max_contacts, ai_enabled, prices:plan_prices(amount_minor, currency, billing_interval, provider, active_from, active_to), entitlements:plan_entitlements(feature_code, enabled, limit_value)"
      )
      .eq("status", "active")
      .eq("is_public", true),
    admin
      .from("payment_gateway_settings")
      .select("gateway")
      .eq("is_enabled", true)
      .eq("checkout_enabled", true)
      .order("priority"),
  ]);

  if (error) {
    // El catálogo público no pertenece a ninguna organización: no hay un id
    // de entidad que usar, así que la correlación nombra la operación en vez
    // de fabricar un identificador falso.
    billingError("public_plans_query_failed", {
      correlationId: "public-plans:catalog",
      code: error.code,
    });
    return [];
  }

  const enabledGateways = new Set(
    (gatewayRows || []).map((row) => row.gateway as PaymentGatewayCode)
  );

  return ((plans || []) as unknown as PlanRow[])
    .map((plan) => {
      const activePrices = plan.prices.filter(
        (price) =>
          enabledGateways.has(price.provider) &&
          price.active_from <= now &&
          !price.active_to
      );
      const price = activePrices.find(
        (item) => item.currency === "COP" && item.billing_interval === "month"
      );
      if (!price) return null;

      return {
        id: plan.id,
        code: plan.code,
        name: plan.name.replace(/^Demo\s+/i, ""),
        description: COMMERCIAL_DESCRIPTIONS[plan.code] || plan.description,
        amountMinor: Number(price.amount_minor),
        currency: price.currency,
        billingInterval: price.billing_interval,
        maxAgencyUsers: entitlementLimit(plan, "agency.users", plan.max_agents),
        maxBrandAdvisors: entitlementLimit(plan, "brand.advisors_total"),
        maxBrands: entitlementLimit(plan, "brands.total"),
        maxChannels: entitlementLimit(plan, "channels.active"),
        maxContacts: plan.max_contacts === -1 ? null : plan.max_contacts,
        aiEnabled: plan.ai_enabled,
        gateways: [...new Set(activePrices.map((item) => item.provider))],
      } satisfies PublicPlan;
    })
    .filter((plan): plan is PublicPlan => plan !== null)
    .sort((a, b) => a.amountMinor - b.amountMinor);
}

export async function getPublicPlanByCode(code: string) {
  const plans = await getPublicPlans();
  return plans.find((plan) => plan.code === code) || null;
}
