import Link from "next/link";
import { ArrowLeft, Check, LockKeyhole, ShieldCheck } from "lucide-react";
import { PaymentCheckout } from "@/components/billing/PaymentCheckout";
import { getPublicPlanByCode } from "@/lib/billing/public-plans";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan: planCode } = await searchParams;
  const plan = planCode ? await getPublicPlanByCode(planCode) : null;

  if (!plan) {
    return (
      <main className="min-h-screen bg-[#f4f0e6] px-5 py-16 text-[#16211f]">
        <div className="mx-auto max-w-xl rounded-3xl border border-[#d8d2c4] bg-white p-8 text-center">
          <h1 className="text-2xl font-black">Plan no disponible</h1>
          <p className="mt-3 text-[#65706d]">Selecciona nuevamente uno de los planes publicados.</p>
          <Link href="/#planes" className="mt-6 inline-flex rounded-full bg-[#16211f] px-5 py-3 font-bold text-white">Ver planes</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f0e6] px-5 py-10 text-[#16211f] sm:py-16">
      <div className="mx-auto max-w-4xl">
        <div className="mb-7 flex items-center justify-between">
          <Link href="/#planes" className="inline-flex items-center gap-2 text-sm font-semibold text-[#0f766e]"><ArrowLeft className="h-4 w-4" /> Cambiar plan</Link>
          <span className="text-xs text-[#65706d]">Paso 2 de 2</span>
        </div>
        <div className="grid overflow-hidden rounded-[2rem] border border-[#d8d2c4] bg-white shadow-2xl shadow-[#16211f]/10 md:grid-cols-[1fr_0.85fr]">
          <section className="p-7 sm:p-10">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0f766e]">Resumen de compra</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight">Plan {plan.name}</h1>
            <p className="mt-3 leading-7 text-[#65706d]">{plan.description || "Gestión multicanal para tu agencia y sus marcas."}</p>
            <ul className="mt-8 space-y-3 text-sm">
              {[
                `${plan.maxAgencyUsers ?? "Ilimitados"} usuarios de agencia`,
                `${plan.maxBrandAdvisors ?? "Ilimitados"} asesores de marca`,
                `${plan.maxBrands ?? "Ilimitadas"} marcas`,
                `${plan.maxChannels ?? "Ilimitados"} canales`,
              ].map((feature) => (
                <li key={feature} className="flex items-center gap-3"><span className="rounded-full bg-[#d8eee9] p-1 text-[#0f766e]"><Check className="h-3.5 w-3.5" /></span>{feature}</li>
              ))}
            </ul>
          </section>
          <aside className="bg-[#063c39] p-7 text-white sm:p-10">
            <p className="text-sm text-[#9be2d8]">Total mensual</p>
            <p className="mt-2 text-4xl font-black">${(plan.amountMinor / 100).toLocaleString("es-CO")}</p>
            <p className="mt-1 text-sm text-white/55">{plan.currency} · Renovación manual</p>
            <div className="mt-8 space-y-3">
              {plan.gateways.map((gateway) => (
                <PaymentCheckout
                  key={gateway}
                  planId={plan.id}
                  amount={plan.amountMinor / 100}
                  currency={plan.currency}
                  gateway={gateway}
                />
              ))}
            </div>
            <div className="mt-7 space-y-3 border-t border-white/10 pt-6 text-xs leading-5 text-white/55">
              <p className="flex gap-2"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[#f7c65f]" />El monto y el plan se validan nuevamente en el servidor.</p>
              <p className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#f7c65f]" />Un pago pendiente o rechazado no activa servicios.</p>
            </div>
            <Link href="/settings/billing" className="mt-7 block text-center text-xs text-[#9be2d8] underline">Administrar facturación después</Link>
          </aside>
        </div>
      </div>
    </main>
  );
}
