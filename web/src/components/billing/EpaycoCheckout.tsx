"use client";
import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

declare global {
  interface Window {
    ePayco?: {
      checkout: {
        configure(config: { key: string; test: boolean }): {
          open(params: Record<string, string>): void;
        };
      };
    };
  }
}

interface EpaycoCheckoutProps {
  planId: string;
  planName: string;
  amount: number;
  currentPlanId?: string | null;
  className?: string;
}

export function EpaycoCheckout({
  planId,
  planName,
  amount,
  currentPlanId,
  className,
}: EpaycoCheckoutProps) {
  const [loading, setLoading] = useState(false);
  const isCurrent = currentPlanId === planId;

  async function handleCheckout() {
    if (isCurrent || amount === 0) return;
    setLoading(true);

    try {
      // Load ePayco script if not loaded
      if (!window.ePayco) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://checkout.epayco.co/checkout.js";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Error cargando ePayco"));
          document.head.appendChild(script);
        });
      }

      // Get checkout config from server
      const res = await fetch("/api/epayco/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });

      if (!res.ok) throw new Error("Error al crear checkout");

      const { checkoutConfig, publicKey, test } = await res.json();

      // Open ePayco checkout
      if (window.ePayco) {
        const handler = window.ePayco.checkout.configure({
          key: publicKey,
          test: test,
        });
        handler.open(checkoutConfig);
      }
    } catch (error) {
      console.error("Checkout error:", error);
      alert("Error al iniciar el pago. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  if (isCurrent) {
    return (
      <span className={`w-full text-center py-2 text-xs font-medium rounded-md bg-blue-600/20 text-blue-400 border border-blue-500/30 inline-block ${className || ""}`}>
        Plan actual
      </span>
    );
  }

  if (amount === 0) {
    return (
      <span className={`w-full text-center py-2 text-xs font-medium rounded-md bg-[#1e2433] text-[#8b949e] inline-block ${className || ""}`}>
        Gratis
      </span>
    );
  }

  return (
    <Button
      onClick={handleCheckout}
      disabled={loading}
      variant="outline"
      size="sm"
      className={`w-full border-[#2d333b] text-white hover:bg-[#0d1117] hover:border-blue-500/50 h-9 ${className || ""}`}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
      ) : (
        <CreditCard className="h-3.5 w-3.5 mr-1.5" />
      )}
      Suscribirse
    </Button>
  );
}
