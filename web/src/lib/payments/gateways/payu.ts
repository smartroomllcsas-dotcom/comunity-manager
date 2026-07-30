import type {
  HostedCheckoutInput,
  PaymentGatewayInterface,
} from "@/lib/payments/types";
import { PaymentGatewayConfigurationError } from "@/lib/payments/types";
import { getGatewayEnvironment } from "@/lib/payments/config";
import { createPayUCheckoutSignature } from "@/lib/payments/signatures";

export class PayUGateway implements PaymentGatewayInterface {
  readonly code = "payu" as const;
  readonly capabilities = {
    hostedCheckout: true,
    paymentSources: true,
    automaticRenewal: true,
    refunds: true,
    partialRefunds: true,
    transactionQuery: true,
  };

  private missingVariables(): string[] {
    return [
      ["PAYU_API_KEY", process.env.PAYU_API_KEY],
      ["PAYU_MERCHANT_ID", process.env.PAYU_MERCHANT_ID],
      ["PAYU_ACCOUNT_ID", process.env.PAYU_ACCOUNT_ID],
      ["NEXT_PUBLIC_APP_URL", process.env.NEXT_PUBLIC_APP_URL],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => String(name));
  }

  isConfigured() {
    return this.missingVariables().length === 0;
  }

  isActivationReady() {
    return false;
  }

  async createHostedCheckout(input: HostedCheckoutInput) {
    const missing = this.missingVariables();
    if (missing.length) {
      throw new PaymentGatewayConfigurationError(this.code, missing);
    }

    const amount = (input.amountMinor / 100).toFixed(2);
    const environment = getGatewayEnvironment(this.code);
    const signature = createPayUCheckoutSignature({
      apiKey: process.env.PAYU_API_KEY!,
      merchantId: process.env.PAYU_MERCHANT_ID!,
      reference: input.reference,
      amount,
      currency: input.currency,
    });

    return {
      kind: "form" as const,
      gateway: this.code,
      action:
        environment === "production"
          ? "https://checkout.payulatam.com/ppp-web-gateway-payu/"
          : "https://sandbox.checkout.payulatam.com/ppp-web-gateway-payu/",
      fields: {
        merchantId: process.env.PAYU_MERCHANT_ID!,
        accountId: process.env.PAYU_ACCOUNT_ID!,
        description: input.description,
        referenceCode: input.reference,
        amount,
        tax: "0",
        taxReturnBase: "0",
        currency: input.currency,
        signature,
        test: environment === "sandbox" ? "1" : "0",
        buyerEmail: input.customerEmail,
        responseUrl: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?payment=processing`,
        confirmationUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/payments/payu`,
      },
    };
  }
}
