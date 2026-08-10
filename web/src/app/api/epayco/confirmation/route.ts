import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  amountToMinor,
  hashEpaycoPayload,
  isEpaycoTestRequest,
  sanitizeEpaycoPayload,
  validateEpaycoSignature,
} from "@/lib/epayco/client";
import { clientIp, rateLimitWithWhitelist } from "@/lib/rate-limit";
import {
  EPAYCO_CONFIRMATION_RATE_LIMIT,
  EPAYCO_CONFIRMATION_RATE_WINDOW_MS,
  epaycoConfirmationRateLimitKey,
} from "@/lib/billing/rate-limit";
import {
  settleEpaycoConfirmation,
  type EpaycoSettlementFailure,
} from "@/lib/billing/epayco-activation";

const SETTLEMENT_ERROR_MESSAGES: Record<EpaycoSettlementFailure, string> = {
  checkout_session_not_found: "Sesion de pago no encontrada",
  reference_mismatch: "Referencia de pago invalida",
  amount_or_currency_mismatch: "Monto o moneda no coinciden con el plan",
  environment_mismatch: "Ambiente de pago no coincide",
  existing_payment_mismatch: "La transaccion existente no coincide con el checkout",
  payment_insert_failed: "No se pudo registrar el pago",
  atomic_activation_failed: "No se pudo activar la suscripcion",
};

async function readParams(request: NextRequest) {
  const params: Record<string, string> = {};
  if (request.method === "GET") {
    request.nextUrl.searchParams.forEach((value, key) => {
      params[key] = value;
    });
    return params;
  }

  const body = await request.formData();
  body.forEach((value, key) => {
    params[key] = value.toString();
  });
  return params;
}

async function markWebhook(
  eventId: string,
  status: "processed" | "failed" | "ignored",
  lastError?: string
) {
  const admin = createAdminClient();
  await admin
    .from("billing_webhook_events")
    .update({
      status,
      last_error: lastError || null,
      processed_at: new Date().toISOString(),
    })
    .eq("id", eventId);
}

async function processConfirmation(request: NextRequest) {
  // The fallback keeps the pure route tests (which use a minimal request
  // double) equivalent to a real request with no forwarding headers.
  const ip = clientIp(request.headers || new Headers());
  const rl = await rateLimitWithWhitelist(
    ip,
    epaycoConfirmationRateLimitKey(ip),
    EPAYCO_CONFIRMATION_RATE_LIMIT,
    EPAYCO_CONFIRMATION_RATE_WINDOW_MS,
  );
  if (!rl.ok) {
    return Response.json(
      {
        error: "Demasiadas confirmaciones. Intenta más tarde.",
        retry_after_seconds: rl.retryAfterSeconds,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSeconds) },
      },
    );
  }

  const params = await readParams(request);
  const signatureValid = validateEpaycoSignature({
    x_cust_id_cliente: params.x_cust_id_cliente || "",
    x_ref_payco: params.x_ref_payco || "",
    x_transaction_id: params.x_transaction_id || "",
    x_amount: params.x_amount || "",
    x_currency_code: params.x_currency_code || "",
    x_signature: params.x_signature || "",
  });

  if (!signatureValid) {
    return Response.json({ error: "Firma invalida" }, { status: 400 });
  }

  const eventKey = params.x_transaction_id;
  const checkoutSessionId = params.x_extra1;
  const amountMinor = amountToMinor(params.x_amount || "");
  const currency = String(params.x_currency_code || "").toUpperCase();
  const eventEnvironment = isEpaycoTestRequest(params.x_test_request)
    ? "sandbox"
    : "production";

  if (
    !eventKey ||
    !params.x_ref_payco ||
    !checkoutSessionId ||
    amountMinor === null ||
    !currency
  ) {
    return Response.json(
      { error: "Confirmacion incompleta" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const payloadHash = hashEpaycoPayload(params);
  const sanitizedPayload = sanitizeEpaycoPayload(params);
  const { data: insertedWebhookEvent, error: webhookInsertError } = await admin
    .from("billing_webhook_events")
    .insert({
      provider: "epayco",
      environment: eventEnvironment,
      event_key: eventKey,
      payload_hash: payloadHash,
      signature_valid: true,
      status: "processing",
      payload: sanitizedPayload,
    })
    .select("id")
    .single();

  let eventId = insertedWebhookEvent?.id as string | undefined;
  if (webhookInsertError?.code === "23505") {
    const { data: existingEvent } = await admin
      .from("billing_webhook_events")
      .select("id, status, attempt_count")
      .eq("provider", "epayco")
      .eq("environment", eventEnvironment)
      .eq("event_key", eventKey)
      .maybeSingle();
    if (!existingEvent || existingEvent.status !== "failed") {
      return Response.json({ status: "ok", duplicate: true });
    }

    eventId = existingEvent.id;
    const { error: retryError } = await admin
      .from("billing_webhook_events")
      .update({
        status: "processing",
        attempt_count: Number(existingEvent.attempt_count || 1) + 1,
        last_error: null,
        payload_hash: payloadHash,
        payload: sanitizedPayload,
        processed_at: null,
      })
      .eq("id", eventId);
    if (retryError) {
      return Response.json(
        { error: "No se pudo reintentar el evento" },
        { status: 500 }
      );
    }
  }
  if ((webhookInsertError && webhookInsertError.code !== "23505") || !eventId) {
    console.error("[billing] webhook event insert failed", {
      code: webhookInsertError?.code,
    });
    return Response.json({ error: "Error registrando evento" }, { status: 500 });
  }

  // La liquidación vive en lib/billing/epayco-activation para que el worker de
  // recuperación (D-1) recorra exactamente el mismo camino que este webhook.
  const settlement = await settleEpaycoConfirmation(params);

  if (settlement.outcome === "failed") {
    await markWebhook(eventId, "failed", settlement.reason);
    return Response.json(
      { error: SETTLEMENT_ERROR_MESSAGES[settlement.reason] },
      { status: settlement.httpStatus }
    );
  }

  if (settlement.outcome === "ignored") {
    await markWebhook(eventId, "ignored", settlement.reason);
    return Response.json({ status: "ok", ignored: true });
  }

  await markWebhook(eventId, "processed");
  return Response.json({ status: "ok" });
}

export async function POST(request: NextRequest) {
  try {
    return await processConfirmation(request);
  } catch (error) {
    console.error("[billing] ePayco confirmation failed", error);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
