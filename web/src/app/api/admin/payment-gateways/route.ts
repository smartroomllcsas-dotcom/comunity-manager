import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySuperAdmin } from "@/lib/admin/verify-super-admin";
import {
  getGatewayReadiness,
  getPaymentGateway,
} from "@/lib/payments/gateways";
import {
  PAYMENT_GATEWAYS,
  type PaymentGatewayCode,
} from "@/lib/payments/types";
import { getGatewayEnvironment } from "@/lib/payments/config";

export async function GET() {
  if (!(await verifySuperAdmin())) {
    return Response.json({ error: "No autorizado" }, { status: 403 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("payment_gateway_settings")
    .select("*")
    .order("priority");
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const readiness = getGatewayReadiness();
  return Response.json({
    gateways: (data || []).map((row) => ({
      ...row,
      runtime: readiness.find((item) => item.code === row.gateway),
      runtime_environment: getGatewayEnvironment(
        row.gateway as PaymentGatewayCode
      ),
    })),
  });
}

export async function PATCH(request: NextRequest) {
  const superAdmin = await verifySuperAdmin();
  if (!superAdmin) {
    return Response.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const gateway = String(body.gateway || "") as PaymentGatewayCode;
  if (!PAYMENT_GATEWAYS.includes(gateway)) {
    return Response.json({ error: "Pasarela invalida" }, { status: 400 });
  }

  const allowed: Record<string, unknown> = {};
  if (body.is_enabled !== undefined) {
    allowed.is_enabled = Boolean(body.is_enabled);
  }
  if (body.checkout_enabled !== undefined) {
    allowed.checkout_enabled = Boolean(body.checkout_enabled);
  }
  if (body.environment === "sandbox" || body.environment === "production") {
    allowed.environment = body.environment;
  }
  if (body.renewal_mode === "manual") {
    allowed.renewal_mode = "manual";
  }
  if (
    body.renewal_mode === "automatic" &&
    process.env.PAYMENT_AUTO_RENEWAL_APPROVED === "true"
  ) {
    allowed.renewal_mode = "automatic";
  }
  if (body.priority !== undefined) {
    allowed.priority = Math.max(0, Number(body.priority) || 0);
  }
  if (Boolean(allowed.checkout_enabled) && allowed.is_enabled === false) {
    return Response.json(
      { error: "No se puede habilitar checkout en una pasarela deshabilitada" },
      { status: 400 }
    );
  }
  if (
    (allowed.is_enabled === true || allowed.checkout_enabled === true) &&
    !getPaymentGateway(gateway).isConfigured()
  ) {
    return Response.json(
      {
        error:
          "No se puede habilitar la pasarela: faltan variables de entorno requeridas",
        code: "PAYMENT_GATEWAY_NOT_CONFIGURED",
      },
      { status: 409 }
    );
  }
  if (
    allowed.checkout_enabled === true &&
    !getPaymentGateway(gateway).isActivationReady()
  ) {
    return Response.json(
      {
        error:
          "El checkout permanece bloqueado hasta implementar y certificar el webhook de activacion",
        code: "PAYMENT_GATEWAY_ACTIVATION_NOT_READY",
      },
      { status: 409 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("payment_gateway_settings")
    .update({
      ...allowed,
      updated_by: superAdmin.id,
    })
    .eq("gateway", gateway)
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ gateway: data });
}
