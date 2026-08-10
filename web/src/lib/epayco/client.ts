import { createHash, timingSafeEqual } from "node:crypto";

const EPAYCO_PUBLIC_KEY = process.env.NEXT_PUBLIC_EPAYCO_PUBLIC_KEY!;
const EPAYCO_PRIVATE_KEY = process.env.EPAYCO_PRIVATE_KEY!;
const EPAYCO_CUSTOMER_ID = process.env.EPAYCO_CUSTOMER_ID!;
const EPAYCO_P_KEY = process.env.EPAYCO_P_KEY!;
const EPAYCO_API_BASE_URL = "https://apify.epayco.co";

function normalizeBillingPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  // ePayco's legacy checkout expects the local Colombian mobile number,
  // without country prefix, plus sign, spaces, or punctuation.
  if (digits.startsWith("57") && digits.length === 12) return digits.slice(2);
  return digits;
}

/** Timeout por llamada a la API de ePayco. Se lee en cada invocación para que
 *  las pruebas puedan bajarlo sin recargar el módulo. */
export function epaycoHttpTimeoutMs() {
  const parsed = Number.parseInt(process.env.EPAYCO_HTTP_TIMEOUT_MS || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15_000;
}

export type EpaycoGatewayErrorCode =
  | "EPAYCO_TIMEOUT"
  | "EPAYCO_UNAVAILABLE"
  | "EPAYCO_HTTP_ERROR"
  | "EPAYCO_INVALID_RESPONSE";

/**
 * Fallo atribuible a la pasarela, no al cliente.
 *
 * Existe para que la ruta pueda responder un error controlado (504/502) en vez
 * de un 500 genérico, y para distinguir "ePayco no contestó" de "ePayco
 * contestó algo que no entendemos".
 */
export class EpaycoGatewayError extends Error {
  readonly code: EpaycoGatewayErrorCode;
  readonly step: string;
  readonly status?: number;

  constructor(code: EpaycoGatewayErrorCode, step: string, message: string, status?: number) {
    super(message);
    this.name = "EpaycoGatewayError";
    this.code = code;
    this.step = step;
    this.status = status;
  }
}

/**
 * `fetch` con timeout obligatorio contra la API de ePayco.
 *
 * Sin él, una degradación del proveedor cuelga la función serverless hasta
 * agotar su presupuesto y el usuario no recibe ni checkout ni error (H-01).
 */
async function epaycoFetch(url: string, init: RequestInit, step: string) {
  const timeoutMs = epaycoHttpTimeoutMs();
  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new EpaycoGatewayError(
        "EPAYCO_TIMEOUT",
        step,
        `ePayco no respondió en ${timeoutMs} ms durante '${step}'`,
      );
    }
    throw new EpaycoGatewayError(
      "EPAYCO_UNAVAILABLE",
      step,
      `No se pudo contactar a ePayco durante '${step}'`,
    );
  }
}

async function readEpaycoJson(response: Response, step: string) {
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  if (!response.ok) {
    throw new EpaycoGatewayError(
      "EPAYCO_HTTP_ERROR",
      step,
      `ePayco API ${response.status}`,
      response.status,
    );
  }
  return body as Record<string, unknown>;
}

export async function createEpaycoV2Session(params: {
  description: string;
  amountMinor: number;
  currency: string;
  email: string;
  customerName?: string;
  customerPhone?: string | null;
  checkoutSessionId: string;
  internalReference: string;
}) {
  const basic = Buffer.from(`${EPAYCO_PUBLIC_KEY}:${EPAYCO_PRIVATE_KEY}`).toString(
    "base64",
  );
  const loginResponse = await epaycoFetch(
    `${EPAYCO_API_BASE_URL}/login`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${basic}`,
      },
    },
    "login",
  );
  const login = await readEpaycoJson(loginResponse, "login");
  const token = typeof login.token === "string" ? login.token : null;
  if (!token) {
    throw new EpaycoGatewayError("EPAYCO_INVALID_RESPONSE", "login", "ePayco login sin token");
  }

  const normalizedPhone = params.customerPhone
    ? normalizeBillingPhone(params.customerPhone)
    : "";
  const sessionResponse = await epaycoFetch(
    `${EPAYCO_API_BASE_URL}/payment/session/create`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        checkout_version: "2",
        name: "SMART GROUPS",
        description: params.description,
        currency: params.currency.toUpperCase(),
        amount: Number((params.amountMinor / 100).toFixed(2)),
        lang: "ES",
        country: "CO",
        taxBase: 0,
        tax: 0,
        invoice: params.internalReference,
        response: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?payment=success`,
        confirmation: `${process.env.NEXT_PUBLIC_APP_URL}/api/epayco/confirmation`,
        method: "POST",
        dues: 1,
        uniqueTransactionPerBill: true,
        extras: {
          extra1: params.checkoutSessionId,
          extra2: params.internalReference,
        },
        billing: {
          email: params.email,
          name: params.customerName || "",
          ...(normalizedPhone
            ? { callingCode: "+57", mobilePhone: normalizedPhone }
            : {}),
        },
      }),
    },
    "session_create",
  );
  const session = await readEpaycoJson(sessionResponse, "session_create");
  const sessionData =
    session.data && typeof session.data === "object"
      ? (session.data as Record<string, unknown>)
      : null;
  const sessionId =
    sessionData && typeof sessionData.sessionId === "string"
      ? sessionData.sessionId
      : null;
  if (!sessionId) {
    throw new EpaycoGatewayError(
      "EPAYCO_INVALID_RESPONSE",
      "session_create",
      "ePayco session sin sessionId",
    );
  }
  return sessionId;
}

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
  if (params.customerPhone) {
    const normalizedPhone = normalizeBillingPhone(params.customerPhone);
    if (normalizedPhone) config.mobilephone_billing = normalizedPhone;
  }

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
