"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CreditCard } from "lucide-react";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";

type BillingStatus =
  | "unlimited"
  | "active"
  | "trial"
  | "past_due"
  | "payment_rejected"
  | "no_plan"
  | "inactive";

interface BillingStatusPayload {
  status: BillingStatus;
  planName?: string | null;
  message?: string | null;
  redirect?: string;
}

export function SubscriptionStatusBanner() {
  const { data: agent, isLoading: agentLoading } = useCurrentAgent();
  const [billing, setBilling] = useState<BillingStatusPayload | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!agent || agent.is_super_admin) {
      setBilling(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetch("/api/billing/status", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as BillingStatusPayload;
      })
      .then((payload) => {
        if (!cancelled) setBilling(payload);
      })
      .catch(() => {
        if (!cancelled) setBilling(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [agent?.id, agent?.is_super_admin]);

  if (agentLoading || loading || !billing || billing.status === "unlimited" || billing.status === "active" || billing.status === "trial") {
    return null;
  }

  const paymentIssue = billing.status === "payment_rejected" || billing.status === "past_due";

  return (
    <div
      role="alert"
      className={`border-b px-4 py-3 ${
        paymentIssue
          ? "border-amber-400/30 bg-amber-950/60"
          : "border-red-400/30 bg-red-950/60"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        {paymentIssue ? (
          <CreditCard className="h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" />
        ) : (
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-300" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">
            {billing.status === "past_due"
              ? "Pago pendiente"
              : billing.status === "payment_rejected"
                ? "Pago rechazado"
                : "Cuenta no activa"}
          </p>
          <p className="text-xs text-white/70">
            {billing.message || "Suscríbete a un plan para acceder a las funciones comerciales."}
          </p>
        </div>
        <Link
          href={billing.redirect || "/settings/billing"}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-white px-3 py-2 text-xs font-semibold text-slate-900 transition hover:bg-white/90"
        >
          Ver planes
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
