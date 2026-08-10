import { createHash, timingSafeEqual } from "node:crypto";

const EPAYCO_PUBLIC_KEY = process.env.NEXT_PUBLIC_EPAYCO_PUBLIC_KEY!;
const EPAYCO_PRIVATE_KEY = process.env.EPAYCO_PRIVATE_KEY!;
const EPAYCO_CUSTOMER_ID = process.env.EPAYCO_CUSTOMER_ID!;
const EPAYCO_P_KEY = process.env.EPAYCO_P_KEY!;

export function getEpaycoConfig() {
  return {
    publicKey: EPAYCO_PUBLIC_KEY,
    privateKey: EPAYCO_PRIVATE_KEY,
    customerId: EPAYCO_CUSTOMER_ID,
    pKey: EPAYCO_P_KEY,
    test: process.env.EPAYCO_TEST === "true",
  };
}

export function getEpaycoPublicKey() {
  return EPAYCO_PUBLIC_KEY;
}

export function createCheckoutConfig(params: {
  name: string;
  description: string;
  amountMinor: number;
  currency: string;
  country?: string;
  email: string;
  customerName?: string;
  customerPhone?: string | null;
  checkoutSessionId: string;
  internalReference: string;
}) {
  const config: Record<string, string> = {
    name: params.name,
    description: params.description,
    invoice: params.internalReference,
    currency: params.currency.toLowerCase(),
    amount: (params.amountMinor / 100).toFixed(2),
    tax_base: "0",
    tax: "0",
    country: params.country || "co",
    lang: "es",
    external: "false",
    extra1: params.checkoutSessionId,
    extra2: params.internalReference,
    confirmation: `${process.env.NEXT_PUBLIC_APP_URL}/api/epayco/confirmation`,
    response: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?payment=success`,
    name_billing: params.customerName || params.name,
    email_billing: params.email,
  };

  // No enviamos un tipo de documento sin su número: ePayco puede rechazar
  // el checkout cuando recibe un bloque de facturación incompleto.
  if (params.customerPhone) config.mobilephone_billing = params.customerPhone;

  return config;
}

export function validateEpaycoSignature(params: {
  x_cust_id_cliente: string;
  x_ref_payco: string;
  x_transaction_id: string;
  x_amount: string;
  x_currency_code: string;
  x_signature: string;
}): boolean {
  if (
    !EPAYCO_CUSTOMER_ID ||
    !EPAYCO_P_KEY ||
    !params.x_signature ||
    params.x_cust_id_cliente !== EPAYCO_CUSTOMER_ID
  ) {
    return false;
  }

  // Current ePayco confirmation signature:
  // SHA256(customer_id^p_key^reference^transaction^amount^currency)
  const raw = [
    EPAYCO_CUSTOMER_ID,
    EPAYCO_P_KEY,
    params.x_ref_payco,
    params.x_transaction_id,
    params.x_amount,
    params.x_currency_code,
  ].join("^");
  const expected = createHash("sha256").update(raw).digest("hex");
  const received = params.x_signature.trim().toLowerCase();
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(received, "utf8");

  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

export function hashEpaycoPayload(params: Record<string, string>) {
  const canonical = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha256").update(canonical).digest("hex");
}

export function sanitizeEpaycoPayload(params: Record<string, string>) {
  const allowed = new Set([
    "x_cust_id_cliente",
    "x_ref_payco",
    "x_id_invoice",
    "x_description",
    "x_amount",
    "x_currency_code",
    "x_transaction_id",
    "x_cod_response",
    "x_response",
    "x_response_reason_text",
    "x_transaction_date",
    "x_franchise",
    "x_bank_name",
    "x_approval_code",
    "x_test_request",
    "x_extra1",
    "x_extra2",
  ]);

  return Object.fromEntries(
    Object.entries(params).filter(([key]) => allowed.has(key))
  );
}

export function amountToMinor(amount: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(amount.trim())) return null;
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

export function isEpaycoTestRequest(value: string | undefined) {
  return String(value || "").toLowerCase() === "true";
}

export function mapEpaycoStatus(
  responseCode: string
): "approved" | "rejected" | "pending" | "failed" {
  switch (responseCode) {
    case "1":
      return "approved";
    case "2":
      return "rejected";
    case "3":
      return "pending";
    case "4":
      return "failed";
    default:
      return "pending";
  }
}
