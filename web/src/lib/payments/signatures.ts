import {
  createHash,
  timingSafeEqual,
} from "node:crypto";

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function safeSignatureEqual(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual.toLowerCase(), "utf8");
  const expectedBuffer = Buffer.from(expected.toLowerCase(), "utf8");
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function createWompiIntegritySignature(input: {
  reference: string;
  amountMinor: number;
  currency: string;
  expiresAt?: string;
  integritySecret: string;
}) {
  return sha256(
    `${input.reference}${input.amountMinor}${input.currency}${
      input.expiresAt || ""
    }${input.integritySecret}`
  );
}

function readWompiProperty(data: unknown, property: string) {
  let value: unknown = data;
  for (const segment of property.split(".")) {
    if (!value || typeof value !== "object") return "";
    value = (value as Record<string, unknown>)[segment];
  }
  return value === null || value === undefined ? "" : String(value);
}

export function createWompiEventSignature(input: {
  data: unknown;
  properties: string[];
  timestamp: number | string;
  eventsSecret: string;
}) {
  const values = input.properties
    .map((property) => readWompiProperty(input.data, property))
    .join("");
  return sha256(`${values}${input.timestamp}${input.eventsSecret}`);
}

export function createPayUCheckoutSignature(input: {
  apiKey: string;
  merchantId: string;
  reference: string;
  amount: string;
  currency: string;
}) {
  return sha256(
    `${input.apiKey}~${input.merchantId}~${input.reference}~${input.amount}~${input.currency}`
  );
}

export function formatPayUConfirmationValue(value: string | number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "";
  const twoDecimals = parsed.toFixed(2);
  return twoDecimals.endsWith("0") ? twoDecimals.slice(0, -1) : twoDecimals;
}

export function createPayUConfirmationSignature(input: {
  apiKey: string;
  merchantId: string;
  referenceSale: string;
  value: string | number;
  currency: string;
  statePol: string | number;
}) {
  return sha256(
    `${input.apiKey}~${input.merchantId}~${input.referenceSale}~${
      formatPayUConfirmationValue(input.value)
    }~${input.currency}~${input.statePol}`
  );
}
