"use client";

import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PaymentGatewayCode } from "@/lib/payments/types";

declare global {
  interface Window {
    ePayco?: {
      checkout: {
        configure(config: {
          sessionId: string;
          type: "onpage" | "standard";
          test: boolean;
        }): {
          open(): void;
        };
      };
    };
  }
}

const gatewayNames: Record<PaymentGatewayCode, string> = {
  epayco: "ePayco",
  wompi: "Wompi",
  payu: "PayU",
};

async function ensureEpaycoScript() {
  if (window.ePayco) return;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://checkout.epayco.co/checkout-v2.js"]'
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Error cargando ePayco")),
        { once: true }
      );
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.epayco.co/checkout-v2.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Error cargando ePayco"));
    document.head.appendChild(script);
  });
}

function submitHostedForm(action: string, fields: Record<string, string>) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = action;
  form.style.display = "none";
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

export function PaymentCheckout({
  planId,
  amount,
  currency,
  gateway,
  currentPlanId,
}: {
  planId: string;
  amount: number;
  currency: string;
  gateway: PaymentGatewayCode;
  currentPlanId?: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const isCurrent = currentPlanId === planId;
  const isEpayco = gateway === "epayco";

  async function handleCheckout() {
    if (amount <= 0) return;
    setLoading(true);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ planId, currency, gateway }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "No se pudo crear el checkout");
      }

      const checkout = payload.checkout;
      if (checkout.kind === "redirect") {
        window.location.assign(checkout.url);
        return;
      }
      if (checkout.kind === "form") {
        submitHostedForm(checkout.action, checkout.fields);
        return;
      }
      if (checkout.kind === "epayco") {
        await ensureEpaycoScript();
        const handler = window.ePayco?.checkout.configure({
          sessionId: checkout.sessionId,
          type: "onpage",
          test: checkout.test,
        });
        handler?.open();
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : "Error iniciando el pago");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      onClick={handleCheckout}
      disabled={loading}
      variant="outline"
      size="sm"
      aria-label={`${isCurrent ? "Renovar" : "Pagar"} con ${gatewayNames[gateway]}`}
      className={
        isEpayco
          ? "h-11 w-full rounded-xl border-[#ffd08a] bg-gradient-to-r from-[#f59e0b] via-[#f97316] to-[#ea580c] px-4 font-semibold tracking-[0.01em] text-white shadow-[0_10px_28px_-12px_rgba(249,115,22,0.95)] hover:border-[#ffe2ad] hover:from-[#fbbf24] hover:via-[#fb923c] hover:to-[#f97316] hover:text-white focus-visible:border-[#ffe2ad] focus-visible:ring-[#fdba74]/70"
          : "h-9 w-full border-[#2d333b] text-white hover:bg-[#0d1117]"
      }
    >
      {loading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <CreditCard className={isEpayco ? "mr-2 h-4 w-4" : "mr-1.5 h-3.5 w-3.5"} />
      )}
      {isCurrent
        ? `Renovar con ${gatewayNames[gateway]}`
        : `Pagar con ${gatewayNames[gateway]}`}
    </Button>
  );
}
