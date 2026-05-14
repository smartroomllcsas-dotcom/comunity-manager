"use client";
import { useState, useEffect } from "react";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, CreditCard, Check, Crown, Loader2, Receipt, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { Organization, Plan, Subscription, Payment } from "@/types/database";
import { EpaycoCheckout } from "@/components/billing/EpaycoCheckout";

export const dynamic = "force-dynamic";

function ProgressBar({ current, max, label }: { current: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  const color =
    pct > 90 ? "bg-red-500" : pct > 70 ? "bg-yellow-500" : "bg-blue-500";
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-[#8b949e]">{label}</span>
        <span className="text-white font-medium">
          {current.toLocaleString()} / {max.toLocaleString()}
        </span>
      </div>
      <div className="h-2 bg-[#2d333b] rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function BillingSettingsPage() {
  const { data: currentAgent } = useCurrentAgent();
  const supabase = createClient();

  const [org, setOrg] = useState<Organization | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [usage, setUsage] = useState({
    agents: 0,
    contacts: 0,
    broadcasts: 0,
    flows: 0,
  });

  useEffect(() => {
    if (!currentAgent?.organization_id) return;
    async function load() {
      setLoading(true);
      const orgId = currentAgent!.organization_id;

      const [orgRes, plansRes, agentsRes, contactsRes, broadcastsRes, flowsRes, subRes, paymentsRes] =
        await Promise.all([
          supabase.from("organizations").select("*, plan:plans(*)").eq("id", orgId).single(),
          supabase.from("plans").select("*").order("price_monthly", { ascending: true }),
          supabase.from("agents").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
          supabase.from("contacts").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
          supabase
            .from("broadcasts")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", orgId)
            .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
          supabase.from("chatbot_flows").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
          supabase.from("subscriptions").select("*, plan:plans(name)").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
          supabase.from("payments").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(10),
        ]);

      if (orgRes.data) setOrg(orgRes.data as unknown as Organization);
      if (plansRes.data) setPlans(plansRes.data as Plan[]);
      if (subRes.data) setSubscription(subRes.data as unknown as Subscription);
      if (paymentsRes.data) setPayments(paymentsRes.data as Payment[]);
      setUsage({
        agents: agentsRes.count ?? 0,
        contacts: contactsRes.count ?? 0,
        broadcasts: broadcastsRes.count ?? 0,
        flows: flowsRes.count ?? 0,
      });
      setLoading(false);
    }
    load();
  }, [currentAgent?.organization_id]);

  const currentPlan = org?.plan || null;

  if (loading) {
    return (
      <div className="min-h-full bg-[#0d1117] flex items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-[#8b949e]">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span>Cargando...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#0d1117]">
      {/* Top Bar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#2d333b] bg-[#161b22]">
        <Link href="/settings" className="text-[#8b949e] hover:text-white transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">Facturacion y Uso</h1>
          <p className="text-xs text-[#8b949e] mt-0.5">Plan actual, uso de recursos y gestion de suscripcion</p>
        </div>
      </div>

      <div className="p-6 max-w-5xl space-y-6">
        {/* Current Plan Card */}
        <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                <Crown className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">{currentPlan?.name || "Sin plan"}</h2>
                <p className="text-sm text-[#8b949e]">
                  {currentPlan
                    ? currentPlan.price_monthly === 0
                      ? "Gratis"
                      : `$${currentPlan.price_monthly}/mes`
                    : "No tienes un plan activo"}
                </p>
              </div>
            </div>
            {org?.trial_ends_at && new Date(org.trial_ends_at) > new Date() && (
              <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                Trial hasta {new Date(org.trial_ends_at).toLocaleDateString("es-ES")}
              </span>
            )}
          </div>

          {currentPlan && (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex items-center gap-2 text-[#8b949e]">
                <Check className="h-3.5 w-3.5 text-green-400" />
                {currentPlan.max_agents} agentes
              </div>
              <div className="flex items-center gap-2 text-[#8b949e]">
                <Check className="h-3.5 w-3.5 text-green-400" />
                {currentPlan.max_contacts.toLocaleString()} contactos
              </div>
              <div className="flex items-center gap-2 text-[#8b949e]">
                <Check className="h-3.5 w-3.5 text-green-400" />
                {currentPlan.max_broadcasts_per_month} broadcasts/mes
              </div>
              <div className="flex items-center gap-2 text-[#8b949e]">
                <Check className="h-3.5 w-3.5 text-green-400" />
                {currentPlan.max_chatbot_flows} flujos de chatbot
              </div>
              {currentPlan.ai_enabled && (
                <div className="flex items-center gap-2 text-[#8b949e]">
                  <Check className="h-3.5 w-3.5 text-green-400" />
                  IA habilitada
                </div>
              )}
            </div>
          )}
        </div>

        {/* Usage Stats */}
        <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-5">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-[#8b949e]" />
            Uso actual
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ProgressBar
              current={usage.agents}
              max={currentPlan?.max_agents ?? 1}
              label="Agentes"
            />
            <ProgressBar
              current={usage.contacts}
              max={currentPlan?.max_contacts ?? 100}
              label="Contactos"
            />
            <ProgressBar
              current={usage.broadcasts}
              max={currentPlan?.max_broadcasts_per_month ?? 0}
              label="Broadcasts este mes"
            />
            <ProgressBar
              current={usage.flows}
              max={currentPlan?.max_chatbot_flows ?? 0}
              label="Flujos de chatbot"
            />
          </div>
        </div>

        {/* Subscription info */}
        {subscription && (
          <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-5">
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#8b949e]" />
              Suscripcion
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-[#8b949e]">Estado</span>
                <p className="text-white font-medium mt-1 capitalize">{subscription.status === "active" ? "Activa" : subscription.status === "trial" ? "Trial" : subscription.status === "past_due" ? "Vencida" : subscription.status}</p>
              </div>
              <div>
                <span className="text-[#8b949e]">Periodo actual</span>
                <p className="text-white font-medium mt-1">
                  {subscription.current_period_start
                    ? `${new Date(subscription.current_period_start).toLocaleDateString("es-CO")} - ${new Date(subscription.current_period_end!).toLocaleDateString("es-CO")}`
                    : "—"}
                </p>
              </div>
              <div>
                <span className="text-[#8b949e]">Ultimo pago</span>
                <p className="text-white font-medium mt-1">
                  {subscription.last_payment_at
                    ? `$${(subscription.last_payment_amount ?? 0).toLocaleString("es-CO")} - ${new Date(subscription.last_payment_at).toLocaleDateString("es-CO")}`
                    : "Sin pagos"}
                </p>
              </div>
              <div>
                <span className="text-[#8b949e]">Metodo de pago</span>
                <p className="text-white font-medium mt-1 capitalize">{subscription.payment_method || "—"}</p>
              </div>
            </div>
          </div>
        )}

        {/* Available Plans */}
        <div>
          <h2 className="text-sm font-semibold text-white mb-3">Cambiar plan</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.map((plan) => {
              const isCurrent = currentPlan?.id === plan.id;
              return (
                <div
                  key={plan.id}
                  className={`bg-[#1a1f2e] border rounded-lg p-5 flex flex-col ${
                    isCurrent
                      ? "border-blue-500/50 ring-1 ring-blue-500/20"
                      : "border-[#2d333b] hover:border-[#3d444d]"
                  } transition-all`}
                >
                  <h3 className="text-base font-bold text-white mb-1 capitalize">{plan.name}</h3>
                  <p className="text-2xl font-bold text-white mb-4">
                    {plan.price_monthly === 0 ? (
                      "Gratis"
                    ) : (
                      <>
                        ${plan.price_monthly.toLocaleString("es-CO")}
                        <span className="text-sm font-normal text-[#8b949e]">/mes</span>
                      </>
                    )}
                  </p>
                  <div className="space-y-2 text-xs text-[#8b949e] flex-1 mb-4">
                    <div className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-green-400 shrink-0" />
                      {plan.max_agents === -1 ? "Agentes ilimitados" : `${plan.max_agents} agentes`}
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-green-400 shrink-0" />
                      {plan.max_contacts === -1 ? "Contactos ilimitados" : `${plan.max_contacts.toLocaleString()} contactos`}
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-green-400 shrink-0" />
                      {plan.max_broadcasts_per_month === -1 ? "Broadcasts ilimitados" : `${plan.max_broadcasts_per_month} broadcasts/mes`}
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-green-400 shrink-0" />
                      {plan.max_chatbot_flows === -1 ? "Flujos ilimitados" : `${plan.max_chatbot_flows} flujos`}
                    </div>
                    {plan.ai_enabled && (
                      <div className="flex items-center gap-2">
                        <Check className="h-3.5 w-3.5 text-green-400 shrink-0" />
                        IA habilitada
                      </div>
                    )}
                  </div>
                  <EpaycoCheckout
                    planId={plan.id}
                    planName={plan.name}
                    amount={plan.price_monthly}
                    currentPlanId={currentPlan?.id}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Payment history */}
        {payments.length > 0 && (
          <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg">
            <div className="px-5 py-4 border-b border-[#2d333b]">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Receipt className="h-4 w-4 text-[#8b949e]" />
                Historial de Pagos
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2d333b] text-[#8b949e] text-xs">
                    <th className="text-left px-5 py-2.5 font-medium">Fecha</th>
                    <th className="text-left px-5 py-2.5 font-medium">Monto</th>
                    <th className="text-left px-5 py-2.5 font-medium">Estado</th>
                    <th className="text-left px-5 py-2.5 font-medium">Metodo</th>
                    <th className="text-left px-5 py-2.5 font-medium">Ref.</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b border-[#2d333b]/50">
                      <td className="px-5 py-2.5 text-[#8b949e]">{new Date(p.created_at).toLocaleDateString("es-CO")}</td>
                      <td className="px-5 py-2.5 text-white">${Number(p.amount).toLocaleString("es-CO")} {p.currency}</td>
                      <td className="px-5 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${
                          p.status === "approved" ? "bg-green-500/10 text-green-400 border-green-500/20"
                          : p.status === "pending" ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                          : "bg-red-500/10 text-red-400 border-red-500/20"
                        }`}>
                          {p.status === "approved" ? "Aprobado" : p.status === "pending" ? "Pendiente" : p.status === "rejected" ? "Rechazado" : "Fallido"}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-[#8b949e] capitalize">{p.payment_method || "—"}</td>
                      <td className="px-5 py-2.5 text-[#8b949e] font-mono text-xs">{p.epayco_ref || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
