export const PAYMENT_GATEWAYS = ["epayco", "wompi", "payu"] as const;

export type PaymentGatewayCode = (typeof PAYMENT_GATEWAYS)[number];
export type PaymentEnvironment = "sandbox" | "production";
export type RenewalMode = "manual" | "automatic";

export interface GatewayCapabilities {
  hostedCheckout: boolean;
  paymentSources: boolean;
  automaticRenewal: boolean;
  refunds: boolean;
  partialRefunds: boolean;
  transactionQuery: boolean;
}

export interface HostedCheckoutInput {
  checkoutSessionId: string;
  reference: string;
  description: string;
  amountMinor: number;
  currency: string;
  customerEmail: string;
  customerName?: string;
  customerPhone?: string | null;
  expiresAt: string;
}

export type HostedCheckoutResult =
  | {
      kind: "epayco";
      gateway: "epayco";
      publicKey: string;
      test: boolean;
      checkoutConfig: Record<string, string>;
    }
  | {
      kind: "redirect";
      gateway: "wompi";
      url: string;
    }
  | {
      kind: "form";
      gateway: "payu";
      action: string;
      fields: Record<string, string>;
    };

export interface PaymentGatewayInterface {
  readonly code: PaymentGatewayCode;
  readonly capabilities: GatewayCapabilities;
  isConfigured(): boolean;
  isActivationReady(): boolean;
  createHostedCheckout(
    input: HostedCheckoutInput
  ): Promise<HostedCheckoutResult>;
}

export class PaymentGatewayConfigurationError extends Error {
  readonly code = "PAYMENT_GATEWAY_NOT_CONFIGURED";

  constructor(gateway: PaymentGatewayCode, missing: string[]) {
    super(
      `${gateway} no esta configurado. Variables faltantes: ${missing.join(", ")}`
    );
    this.name = "PaymentGatewayConfigurationError";
  }
}
