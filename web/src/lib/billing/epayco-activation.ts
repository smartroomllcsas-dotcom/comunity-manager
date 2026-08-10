/**
 * Camino de activación de una confirmación de ePayco ya autenticada.
 *
 * Se extrajo de `POST /api/epayco/confirmation` para que la ruta y el worker de
 * recuperación (`webhook-recovery.ts`) compartan exactamente la misma lógica en
 * vez de duplicarla: cualquier divergencia entre ambos sería un camino de
 * cobro sin pruebas.
 *
 * Precondición: la firma YA fue validada por el llamador. Esta función no la
 * verifica y nunca debe invocarse sobre un payload sin `signature_valid`.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import {
  amountToMinor,
  isEpaycoTestRequest,
  mapEpaycoStatus,
  sanitizeEpaycoPayload,
} from "@/lib/epayco/client";

/** Motivos de fallo que la confirmación puede registrar en `last_error`. */
export type EpaycoSettlementFailure =
  | "checkout_session_not_found"
  | "reference_mismatch"
  | "amount_or_currency_mismatch"
  | "environment_mismatch"
  | "existing_payment_mismatch"
  | "payment_insert_failed"
  | "atomic_activation_failed";

export type EpaycoSettlementResult =
  | { outcome: "activated" }
  /** Pago registrado en un estado que no activa (pendiente, rechazado, fallido). */
  | { outcome: "recorded"; paymentStatus: string }
  /** El checkout ya no admite la confirmación; no es un error del proveedor. */
  | { outcome: "ignored"; reason: "checkout_not_pending" }
  | { outcome: "failed"; reason: EpaycoSettlementFailure; httpStatus: number };

/**
 * Aplica una confirmación de ePayco: valida contra el checkout, registra el
 * pago y, si está aprobado, delega la activación al RPC transaccional.
 *
 * Es idempotente por construcción: reutiliza el pago existente si la
 * transacción ya se registró, y el RPC devuelve la misma suscripción si el
 * checkout ya estaba aprobado.
 */
export async function settleEpaycoConfirmation(params: Record<string, string>): Promise<EpaycoSettlementResult> {
  const admin = createAdminClient();

  const eventKey = params.x_transaction_id;
  const checkoutSessionId = params.x_extra1;
  const amountMinor = amountToMinor(params.x_amount || "");
  const currency = String(params.x_currency_code || "").toUpperCase();
  const environment = isEpaycoTestRequest(params.x_test_request) ? "sandbox" : "production";
  const sanitizedPayload = sanitizeEpaycoPayload(params);

  const { data: checkout, error: checkoutError } = await admin
    .from("checkout_sessions")
    .select(
      "id, internal_reference, organization_id, plan_id, plan_price_id, status, amount_minor, currency, test_mode, environment, purpose, expires_at"
    )
    .eq("id", checkoutSessionId)
    .maybeSingle();

  if (checkoutError || !checkout) {
    return { outcome: "failed", reason: "checkout_session_not_found", httpStatus: 400 };
  }

  if (
    checkout.internal_reference !== params.x_extra2 ||
    checkout.internal_reference !== params.x_id_invoice
  ) {
    return { outcome: "failed", reason: "reference_mismatch", httpStatus: 400 };
  }

  if (Number(checkout.amount_minor) !== amountMinor || checkout.currency !== currency) {
    return { outcome: "failed", reason: "amount_or_currency_mismatch", httpStatus: 400 };
  }

  if (checkout.test_mode !== isEpaycoTestRequest(params.x_test_request)) {
    return { outcome: "failed", reason: "environment_mismatch", httpStatus: 400 };
  }

  if (checkout.status !== "pending" || new Date(checkout.expires_at).getTime() < Date.now()) {
    return { outcome: "ignored", reason: "checkout_not_pending" };
  }

  const paymentStatus = mapEpaycoStatus(params.x_cod_response || "3");
  const amount = (amountMinor as number) / 100;

  const { data: existingPayment } = await admin
    .from("payments")
    .select("id, organization_id, checkout_session_id, amount, currency")
    .eq("provider", "epayco")
    .eq("environment", environment)
    .eq("provider_transaction_id", eventKey)
    .maybeSingle();

  if (
    existingPayment &&
    (existingPayment.organization_id !== checkout.organization_id ||
      existingPayment.checkout_session_id !== checkout.id ||
      Number(existingPayment.amount) !== amount ||
      existingPayment.currency !== currency)
  ) {
    return { outcome: "failed", reason: "existing_payment_mismatch", httpStatus: 409 };
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
        approved_at: paymentStatus === "approved" ? new Date().toISOString() : null,
      })
      .select("id, organization_id, checkout_session_id, amount, currency")
      .single();
    payment = paymentInsert.data;
    paymentError = paymentInsert.error;
  }

  if (paymentError || !payment) {
    return { outcome: "failed", reason: "payment_insert_failed", httpStatus: 500 };
  }

  if (paymentStatus !== "approved") {
    await admin
      .from("checkout_sessions")
      .update({
        status: paymentStatus,
        completed_at: paymentStatus === "pending" ? null : new Date().toISOString(),
      })
      .eq("id", checkout.id);
    return { outcome: "recorded", paymentStatus };
  }

  const { error: activationError } = await admin.rpc("finalize_epayco_approved_payment", {
    p_checkout_session_id: checkout.id,
    p_payment_id: payment.id,
    p_event_key: eventKey,
    p_payment_method: params.x_franchise || params.x_bank_name || null,
    p_customer_id: params.x_cust_id_cliente || null,
  });

  if (activationError) {
    console.error("[billing] atomic ePayco activation failed", {
      code: activationError.code,
    });
    return { outcome: "failed", reason: "atomic_activation_failed", httpStatus: 500 };
  }

  return { outcome: "activated" };
}
