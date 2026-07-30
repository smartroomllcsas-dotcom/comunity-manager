import type {
  PaymentGatewayCode,
  PaymentGatewayInterface,
} from "@/lib/payments/types";
import { EpaycoGateway } from "@/lib/payments/gateways/epayco";
import { WompiGateway } from "@/lib/payments/gateways/wompi";
import { PayUGateway } from "@/lib/payments/gateways/payu";

const gateways: Record<PaymentGatewayCode, PaymentGatewayInterface> = {
  epayco: new EpaycoGateway(),
  wompi: new WompiGateway(),
  payu: new PayUGateway(),
};

export function getPaymentGateway(code: PaymentGatewayCode) {
  return gateways[code];
}

export function getGatewayReadiness() {
  return Object.values(gateways).map((gateway) => ({
    code: gateway.code,
    configured: gateway.isConfigured(),
    activationReady: gateway.isActivationReady(),
    capabilities: gateway.capabilities,
  }));
}
