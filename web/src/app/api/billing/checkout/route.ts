import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  PAYMENT_GATEWAYS,
  PaymentGatewayConfigurationError,
  type PaymentGatewayCode,
} from "@/lib/payments/types";
import { getPaymentGateway } from "@/lib/payments/gateways";
import { getGatewayEnvironment } from "@/lib/payments/config";
import { rateLimit } from "@/lib/rate-limit";
import {
  BILLING_CHECKOUT_RATE_LIMIT,
  BILLING_CHECKOUT_RATE_WINDOW_MS,
  checkoutRateLimitKey,
} from "@/lib/billing/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "No autenticado" }, { status: 401 });
    }

    const rl = await rateLimit(
      checkoutRateLimitKey(user.id),
      BILLING_CHECKOUT_RATE_LIMIT,
      BILLING_CHECKOUT_RATE_WINDOW_MS,
    );
    if (!rl.ok) {
      return Response.json(
        {
          error: "Demasiados intentos de checkout. Intenta más tarde.",
          retry_after_seconds: rl.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { "Retry-After": String(rl.retryAfterSeconds) },
        },
      );
    }

    const { data: agent } = await supabase
      .from("agents")
      .select("organization_id, email, role")
      .eq("id", user.id)
      .single();
    if (!agent) {
      return Response.json({ error: "Agente no encontrado" }, { status: 404 });
    }
    if (agent.role !== "admin") {
      return Response.json(
        { error: "Solo un administrador puede contratar un plan" },
        { status: 403 }
      );
    }

    const body = (await request.json()) as {
      planId?: string;
      currency?: string;
      gateway?: string;
    };
    const planId = String(body.planId || "");
    const currency = String(body.currency || "COP").toUpperCase();
    const gatewayCode = String(body.gateway || "") as PaymentGatewayCode;
    const idempotencyKey = request.headers.get("idempotency-key");

    if (!planId || !PAYMENT_GATEWAYS.includes(gatewayCode)) {
      return Response.json(
        { error: "Plan y pasarela validos son requeridos" },
        { status: 400 }
      );
    }
    if (!idempotencyKey || idempotencyKey.length > 200) {
      return Response.json(
        { error: "Idempotency-Key es requerido" },
        { status: 400 }
      );
    }

    const { data: gatewaySetting } = await admin
      .from("payment_gateway_settings")
      .select("gateway, is_enabled, checkout_enabled, environment, renewal_mode")
      .eq("gateway", gatewayCode)
      .maybeSingle();
    if (
      !gatewaySetting?.is_enabled ||
      !gatewaySetting.checkout_enabled
    ) {
      return Response.json(
        {
          error: "La pasarela no esta habilitada para checkout",
          code: "PAYMENT_GATEWAY_DISABLED",
        },
        { status: 409 }
      );
    }

    const runtimeEnvironment = getGatewayEnvironment(gatewayCode);
    if (gatewaySetting.environment !== runtimeEnvironment) {
      return Response.json(
        {
          error:
            "El ambiente configurado en base de datos no coincide con las variables de entorno",
          code: "PAYMENT_ENVIRONMENT_MISMATCH",
        },
        { status: 409 }
      );
    }
    const gateway = getPaymentGateway(gatewayCode);
    if (!gateway.isConfigured()) {
      return Response.json(
        {
          error: "La pasarela no tiene todas las variables requeridas",
          code: "PAYMENT_GATEWAY_NOT_CONFIGURED",
        },
        { status: 409 }
      );
    }
    if (!gateway.isActivationReady()) {
      return Response.json(
        {
          error:
            "La activacion de esta pasarela aun no esta certificada; checkout bloqueado para evitar cobros incompletos",
          code: "PAYMENT_GATEWAY_ACTIVATION_NOT_READY",
        },
        { status: 409 }
      );
    }

    const [{ data: plan }, { data: price }, { data: organization }] =
      await Promise.all([
        admin
          .from("plans")
          .select("id, name, status, is_public")
          .eq("id", planId)
          .maybeSingle(),
        admin
          .from("plan_prices")
          .select("id, amount_minor, currency, provider")
          .eq("plan_id", planId)
          .eq("currency", currency)
          .eq("provider", gatewayCode)
          .eq("is_active", true)
          .lte("active_from", new Date().toISOString())
          .is("active_to", null)
          .maybeSingle(),
        admin
          .from("organizations")
          .select("name, plan_id")
          .eq("id", agent.organization_id)
          .maybeSingle(),
      ]);

    if (!plan || plan.status !== "active" || !plan.is_public || !price) {
      return Response.json(
        {
          error: "El plan no tiene un precio activo para esta pasarela",
          code: "PLAN_PRICE_NOT_CONFIGURED",
        },
        { status: 409 }
      );
    }
    if (!organization) {
      return Response.json(
        { error: "Organizacion no encontrada" },
        { status: 404 }
      );
    }

    const { data: existingCheckout } = await admin
      .from("checkout_sessions")
      .select(
        "id, internal_reference, expires_at, amount_minor, currency, plan_id, provider, environment"
      )
      .eq("organization_id", agent.organization_id)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    const checkoutSessionId = existingCheckout?.id || randomUUID();
    const reference =
      existingCheckout?.internal_reference ||
      `cm_${gatewayCode}_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const expiresAt =
      existingCheckout?.expires_at ||
      new Date(Date.now() + 30 * 60 * 1000).toISOString();

    if (
      existingCheckout &&
      (Number(existingCheckout.amount_minor) !== Number(price.amount_minor) ||
        existingCheckout.currency !== price.currency ||
        existingCheckout.plan_id !== plan.id ||
        existingCheckout.provider !== gatewayCode ||
        existingCheckout.environment !== runtimeEnvironment)
    ) {
      return Response.json(
        {
          error: "La clave de idempotencia ya fue usada con otro precio",
          code: "IDEMPOTENCY_CONFLICT",
        },
        { status: 409 }
      );
    }

    if (!existingCheckout) {
      const { error: checkoutError } = await admin
        .from("checkout_sessions")
        .insert({
          id: checkoutSessionId,
          internal_reference: reference,
          organization_id: agent.organization_id,
          plan_id: plan.id,
          plan_price_id: price.id,
          initiated_by: user.id,
          provider: gatewayCode,
          status: "pending",
          amount_minor: price.amount_minor,
          currency: price.currency,
          test_mode: runtimeEnvironment === "sandbox",
          environment: runtimeEnvironment,
          idempotency_key: idempotencyKey,
          purpose:
            organization.plan_id === plan.id ? "renewal" : "initial",
          expires_at: expiresAt,
        });
      if (checkoutError) {
        console.error("[billing] generic checkout insert failed", {
          code: checkoutError.code,
          gateway: gatewayCode,
        });
        return Response.json(
          { error: "No se pudo crear el checkout" },
          { status: 500 }
        );
      }
    }

    const purpose =
      organization.plan_id === plan.id ? "renewal" : "initial";
    const checkout = await gateway.createHostedCheckout({
      checkoutSessionId,
      reference,
      description: `Plan ${plan.name} - ${organization.name}`,
      amountMinor: Number(price.amount_minor),
      currency: price.currency,
      customerEmail: agent.email,
      expiresAt,
    });

    return Response.json({
      checkout,
      checkoutSessionId,
      expiresAt,
      renewalMode: "manual",
      purpose,
    });
  } catch (error) {
    if (error instanceof PaymentGatewayConfigurationError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: 409 }
      );
    }
    console.error("[billing] generic checkout failed", error);
    return Response.json({ error: "Error creando checkout" }, { status: 500 });
  }
}
