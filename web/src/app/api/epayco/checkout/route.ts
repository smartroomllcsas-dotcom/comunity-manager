import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCheckoutConfig } from "@/lib/epayco/client";

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
        { error: "Solo un administrador de la agencia puede contratar un plan" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const planId = String(body?.planId || "");
    const currency = String(body?.currency || "COP").toUpperCase();
    if (!planId) {
      return Response.json({ error: "Plan requerido" }, { status: 400 });
    }

    const { data: plan, error: planError } = await admin
      .from("plans")
      .select("id, name, status")
      .eq("id", planId)
      .single();
    if (planError || !plan || plan.status !== "active") {
      return Response.json({ error: "Plan no disponible" }, { status: 404 });
    }

    const { data: price, error: priceError } = await admin
      .from("plan_prices")
      .select(
        "id, amount_minor, currency, billing_interval, interval_count, provider"
      )
      .eq("plan_id", planId)
      .eq("currency", currency)
      .eq("provider", "epayco")
      .eq("is_active", true)
      .lte("active_from", new Date().toISOString())
      .is("active_to", null)
      .maybeSingle();

    if (priceError || !price) {
      return Response.json(
        {
          error:
            "Este plan todavia no tiene un precio de ePayco activo en la moneda seleccionada",
          code: "PLAN_PRICE_NOT_CONFIGURED",
        },
        { status: 409 }
      );
    }

    const { data: organization } = await admin
      .from("organizations")
      .select("name, plan_id")
      .eq("id", agent.organization_id)
      .single();
    if (!organization) {
      return Response.json(
        { error: "Organizacion no encontrada" },
        { status: 404 }
      );
    }

    const checkoutSessionId = randomUUID();
    const internalReference = `cm_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const testMode = process.env.EPAYCO_TEST === "true";

    const { error: sessionError } = await admin
      .from("checkout_sessions")
      .insert({
        id: checkoutSessionId,
        internal_reference: internalReference,
        organization_id: agent.organization_id,
        plan_id: plan.id,
        plan_price_id: price.id,
        initiated_by: user.id,
        provider: "epayco",
        status: "pending",
        amount_minor: price.amount_minor,
        currency: price.currency,
        test_mode: testMode,
        environment: testMode ? "sandbox" : "production",
        idempotency_key: randomUUID(),
        purpose: organization.plan_id === plan.id ? "renewal" : "initial",
        expires_at: expiresAt.toISOString(),
      });

    if (sessionError) {
      console.error("[billing] checkout session creation failed", {
        code: sessionError.code,
      });
      return Response.json(
        { error: "No se pudo crear la sesion de pago" },
        { status: 500 }
      );
    }

    const checkoutConfig = createCheckoutConfig({
      name: `Plan ${plan.name}`,
      description: `Suscripcion al plan ${plan.name} - ${organization.name}`,
      amountMinor: Number(price.amount_minor),
      currency: price.currency,
      email: agent.email,
      checkoutSessionId,
      internalReference,
    });

    return Response.json({
      checkoutConfig,
      publicKey: process.env.NEXT_PUBLIC_EPAYCO_PUBLIC_KEY,
      test: testMode,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("[billing] checkout failed", error);
    return Response.json({ error: "Error creando checkout" }, { status: 500 });
  }
}
