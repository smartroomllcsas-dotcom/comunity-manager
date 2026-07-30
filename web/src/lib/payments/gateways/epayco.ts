import {
  createCheckoutConfig,
  getEpaycoPublicKey,
} from "@/lib/epayco/client";
import type {
  HostedCheckoutInput,
  PaymentGatewayInterface,
} from "@/lib/payments/types";
import { PaymentGatewayConfigurationError } from "@/lib/payments/types";

export class EpaycoGateway implements PaymentGatewayInterface {
  readonly code = "epayco" as const;
  readonly capabilities = {
    hostedCheckout: true,
    paymentSources: true,
    automaticRenewal: true,
    refunds: true,
    partialRefunds: false,
    transactionQuery: true,
  };

  private missingVariables(): string[] {
    return [
      ["NEXT_PUBLIC_EPAYCO_PUBLIC_KEY", process.env.NEXT_PUBLIC_EPAYCO_PUBLIC_KEY],
      ["EPAYCO_CUSTOMER_ID", process.env.EPAYCO_CUSTOMER_ID],
      ["EPAYCO_P_KEY", process.env.EPAYCO_P_KEY],
      ["NEXT_PUBLIC_APP_URL", process.env.NEXT_PUBLIC_APP_URL],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => String(name));
  }

  isConfigured() {
    return this.missingVariables().length === 0;
  }

  isActivationReady() {
    return true;
  }

  async createHostedCheckout(input: HostedCheckoutInput) {
    const missing = this.missingVariables();
    if (missing.length) {
      throw new PaymentGatewayConfigurationError(this.code, missing);
    }

    return {
      kind: "epayco" as const,
      gateway: this.code,
      publicKey: getEpaycoPublicKey(),
      test: process.env.EPAYCO_TEST === "true",
      checkoutConfig: createCheckoutConfig({
        name: input.description,
        description: input.description,
        amountMinor: input.amountMinor,
        currency: input.currency,
        email: input.customerEmail,
        checkoutSessionId: input.checkoutSessionId,
        internalReference: input.reference,
      }),
    };
  }
}
