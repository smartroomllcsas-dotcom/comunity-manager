import {
  PAYMENT_GATEWAYS,
  type PaymentEnvironment,
  type PaymentGatewayCode,
  type RenewalMode,
} from "@/lib/payments/types";

function parseGateway(value: string | undefined): PaymentGatewayCode {
  return PAYMENT_GATEWAYS.includes(value as PaymentGatewayCode)
    ? (value as PaymentGatewayCode)
    : "epayco";
}

function parseEnvironment(value: string | undefined): PaymentEnvironment {
  return value === "production" ? "production" : "sandbox";
}

function parseRenewalMode(value: string | undefined): RenewalMode {
  return value === "automatic" ? "automatic" : "manual";
}

export function getPaymentRuntimeConfig() {
  return {
    defaultGateway: parseGateway(process.env.PAYMENT_GATEWAY_DEFAULT),
    environment: parseEnvironment(process.env.PAYMENT_ENVIRONMENT),
    renewalMode: parseRenewalMode(process.env.PAYMENT_RENEWAL_MODE),
  };
}

export function getGatewayEnvironment(gateway: PaymentGatewayCode) {
  if (gateway === "epayco" && process.env.EPAYCO_TEST !== undefined) {
    return process.env.EPAYCO_TEST === "true" ? "sandbox" : "production";
  }
  const specific = process.env[
    `${gateway.toUpperCase()}_ENVIRONMENT`
  ];
  return parseEnvironment(specific || process.env.PAYMENT_ENVIRONMENT);
}
