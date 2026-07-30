import type {
  HostedCheckoutInput,
  PaymentGatewayInterface,
} from "@/lib/payments/types";
import { PaymentGatewayConfigurationError } from "@/lib/payments/types";
import { createWompiIntegritySignature } from "@/lib/payments/signatures";

export class WompiGateway implements PaymentGatewayInterface {
  readonly code = "wompi" as const;
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
      ["WOMPI_PUBLIC_KEY", process.env.WOMPI_PUBLIC_KEY],
      ["WOMPI_INTEGRITY_SECRET", process.env.WOMPI_INTEGRITY_SECRET],
      ["WOMPI_EVENTS_SECRET", process.env.WOMPI_EVENTS_SECRET],
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
    if (input.currency !== "COP") {
      throw new Error("Wompi solo admite precios en COP.");
    }

    const signature = createWompiIntegritySignature({
      reference: input.reference,
      amountMinor: input.amountMinor,
      currency: input.currency,
      expiresAt: input.expiresAt,
      integritySecret: process.env.WOMPI_INTEGRITY_SECRET!,
    });
    const params = new URLSearchParams({
      "public-key": process.env.WOMPI_PUBLIC_KEY!,
      currency: input.currency,
      "amount-in-cents": String(input.amountMinor),
      reference: input.reference,
      "signature:integrity": signature,
      "redirect-url": `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?payment=processing`,
      "expiration-time": input.expiresAt,
      "customer-data:email": input.customerEmail,
    });

    return {
      kind: "redirect" as const,
      gateway: this.code,
      url: `https://checkout.wompi.co/p/?${params.toString()}`,
    };
  }
}
