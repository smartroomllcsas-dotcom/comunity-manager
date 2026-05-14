// ePayco SDK integration
// Uses epayco-sdk-node for server-side operations

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

// Checkout config for ePayco standard checkout
export function createCheckoutConfig(params: {
  name: string;
  description: string;
  amount: number;
  currency?: string;
  country?: string;
  email: string;
  orgId: string;
  planId: string;
}) {
  return {
    name: params.name,
    description: params.description,
    invoice: `sub_${params.orgId}_${Date.now()}`,
    currency: params.currency || "cop",
    amount: params.amount.toString(),
    tax_base: "0",
    tax: "0",
    country: params.country || "co",
    lang: "es",
    external: "false",
    extra1: params.orgId,
    extra2: params.planId,
    confirmation: `${process.env.NEXT_PUBLIC_APP_URL}/api/epayco/confirmation`,
    response: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?payment=success`,
    name_billing: params.email,
    email_billing: params.email,
    type_doc_billing: "CC",
  };
}

// Validate ePayco signature for confirmation webhook
export function validateEpaycoSignature(params: {
  x_cust_id_cliente: string;
  x_ref_payco: string;
  x_transaction_id: string;
  x_amount: string;
  x_currency_code: string;
  x_signature: string;
}): boolean {
  // ePayco signature = md5(x_cust_id_cliente^x_ref_payco^x_transaction_id^x_amount^x_currency_code^p_key)
  // For production validation, use crypto.createHash('md5')
  const { x_cust_id_cliente, x_ref_payco, x_transaction_id, x_amount, x_currency_code, x_signature } = params;
  const raw = `${x_cust_id_cliente}^${x_ref_payco}^${x_transaction_id}^${x_amount}^${x_currency_code}^${EPAYCO_P_KEY}`;

  // Use Web Crypto for MD5 in edge runtime or node crypto
  try {
    const crypto = require("crypto");
    const hash = crypto.createHash("md5").update(raw).digest("hex");
    return hash === x_signature;
  } catch {
    // Fallback: skip validation in environments without node crypto
    console.warn("Could not validate ePayco signature - crypto not available");
    return true;
  }
}

// Map ePayco response codes to our payment status
export function mapEpaycoStatus(x_cod_response: string): "approved" | "rejected" | "pending" | "failed" {
  switch (x_cod_response) {
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
