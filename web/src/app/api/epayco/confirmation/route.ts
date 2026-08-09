import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  amountToMinor,
  hashEpaycoPayload,
  isEpaycoTestRequest,
  mapEpaycoStatus,
  sanitizeEpaycoPayload,
  validateEpaycoSignature,
} from "@/lib/epayco/client";
import { clientIp, rateLimitWithWhitelist } from "@/lib/rate-limit";
import {
  EPAYCO_CONFIRMATION_RATE_LIMIT,
  EPAYCO_CONFIRMATION_RATE_WINDOW_MS,
  epaycoConfirmationRateLimitKey,
} from "@/lib/billing/rate-limit";

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

  const { data: checkout, error: checkoutError } = await admin
    .from("checkout_sessions")
    .select(
      "id, internal_reference, organization_id, plan_id, plan_price_id, status, amount_minor, currency, test_mode, environment, purpose, expires_at"
    )
    .eq("id", checkoutSessionId)
    .maybeSingle();

  if (checkoutError || !checkout) {
    await markWebhook(eventId, "failed", "checkout_session_not_found");
    return Response.json(
      { error: "Sesion de pago no encontrada" },
      { status: 400 }
    );
  }

  if (
    checkout.internal_reference !== params.x_extra2 ||
    checkout.internal_reference !== params.x_id_invoice
  ) {
    await markWebhook(eventId, "failed", "reference_mismatch");
    return Response.json(
      { error: "Referencia de pago invalida" },
      { status: 400 }
    );
  }

  if (
    Number(checkout.amount_minor) !== amountMinor ||
    checkout.currency !== currency
  ) {
    await markWebhook(eventId, "failed", "amount_or_currency_mismatch");
    return Response.json(
      { error: "Monto o moneda no coinciden con el plan" },
      { status: 400 }
    );
  }

  if (checkout.test_mode !== isEpaycoTestRequest(params.x_test_request)) {
    await markWebhook(eventId, "failed", "environment_mismatch");
    return Response.json(
      { error: "Ambiente de pago no coincide" },
      { status: 400 }
    );
  }

  if (
    checkout.status !== "pending" ||
    new Date(checkout.expires_at).getTime() < Date.now()
  ) {
    await markWebhook(eventId, "ignored", "checkout_not_pending");
    return Response.json({ status: "ok", ignored: true });
  }

  const paymentStatus = mapEpaycoStatus(params.x_cod_response || "3");
  const amount = amountMinor / 100;
  const { data: existingPayment } = await admin
    .from("payments")
    .select("id, organization_id, checkout_session_id, amount, currency")
    .eq("provider", "epayco")
    .eq("environment", eventEnvironment)
    .eq("provider_transaction_id", eventKey)
    .maybeSingle();

  if (
    existingPayment &&
    (existingPayment.organization_id !== checkout.organization_id ||
      existingPayment.checkout_session_id !== checkout.id ||
      Number(existingPayment.amount) !== amount ||
      existingPayment.currency !== currency)
  ) {
    await markWebhook(eventId, "failed", "existing_payment_mismatch");
    return Response.json(
      { error: "La transaccion existente no coincide con el checkout" },
      { status: 409 }
    );
  }

  let payment = existingPayment;
  let paymentError = null;
  if (!payment) {
    const paymentInsert = await admin
      .from("payments")
      .insert({
        organization_id: checkout.organization_id,
        checkout_session_id: checkout.id,
        provider: "epayco",
        provider_transaction_id: eventKey,
        epayco_ref: params.x_ref_payco,
        amount,
        amount_minor: amountMinor,
        currency,
        status: paymentStatus,
        provider_status: params.x_response || params.x_cod_response || null,
        payment_method: params.x_franchise || params.x_bank_name || null,
        description: `Pago plan ${checkout.plan_id}`,
        epayco_response: sanitizedPayload,
        test_mode: checkout.test_mode,
        environment: checkout.environment,
        merchant_reference: checkout.internal_reference,
        purpose: checkout.purpose,
        approved_at:
          paymentStatus === "approved" ? new Date().toISOString() : null,
      })
      .select("id, organization_id, checkout_session_id, amount, currency")
      .single();
    payment = paymentInsert.data;
    paymentError = paymentInsert.error;
  }

  if (paymentError || !payment) {
    await markWebhook(eventId, "failed", "payment_insert_failed");
    return Response.json(
      { error: "No se pudo registrar el pago" },
      { status: 500 }
    );
  }

  if (paymentStatus !== "approved") {
    await admin
      .from("checkout_sessions")
      .update({
        status: paymentStatus,
        completed_at:
          paymentStatus === "pending" ? null : new Date().toISOString(),
      })
      .eq("id", checkout.id);
    await markWebhook(eventId, "processed");
    return Response.json({ status: "ok" });
  }

  const { error: activationError } = await admin.rpc(
    "finalize_epayco_approved_payment",
    {
      p_checkout_session_id: checkout.id,
      p_payment_id: payment.id,
      p_event_key: eventKey,
      p_payment_method: params.x_franchise || params.x_bank_name || null,
      p_customer_id: params.x_cust_id_cliente || null,
    }
  );
  if (activationError) {
    console.error("[billing] atomic ePayco activation failed", {
      code: activationError.code,
      eventId,
    });
    await markWebhook(eventId, "failed", "atomic_activation_failed");
    return Response.json(
      { error: "No se pudo activar la suscripcion" },
      { status: 500 }
    );
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
