import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Camera,
  Check,
  MessageCircle,
  ShieldCheck,
  Users,
} from "lucide-react";
import { getPublicPlans, type PublicPlan } from "@/lib/billing/public-plans";

export const dynamic = "force-dynamic";

function formatLimit(value: number | null) {
  return value === null ? "Ilimitados" : value.toLocaleString("es-CO");
}

function PlanCard({ plan, featured }: { plan: PublicPlan; featured: boolean }) {
  const features = [
    `${formatLimit(plan.maxAgencyUsers)} usuarios de agencia`,
    `${formatLimit(plan.maxBrandAdvisors)} asesores de marca`,
    `${formatLimit(plan.maxBrands)} marcas administradas`,
    `${formatLimit(plan.maxChannels)} canales conectados`,
    `${formatLimit(plan.maxContacts)} contactos`,
    plan.aiEnabled ? "Asistencia con inteligencia artificial" : null,
  ].filter((feature): feature is string => Boolean(feature));

  return (
    <article
      className={`relative flex flex-col rounded-[2rem] border p-7 ${
        featured
          ? "border-[#0f766e] bg-[#063c39] text-white shadow-2xl shadow-teal-950/20 lg:-translate-y-4"
          : "border-[#d8d2c4] bg-white/75 text-[#16211f]"
      }`}
    >
      {featured && (
        <span className="absolute -top-3 left-7 rounded-full bg-[#f7c65f] px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-[#3b2b08]">
          Más elegido
        </span>
      )}
      <p className={`text-sm font-bold uppercase tracking-[0.18em] ${featured ? "text-[#9be2d8]" : "text-[#0f766e]"}`}>
        {plan.name}
      </p>
      <div className="mt-5 flex items-end gap-2">
        <span className="text-4xl font-black tracking-tight">
          ${(plan.amountMinor / 100).toLocaleString("es-CO")}
        </span>
        <span className={`pb-1 text-sm ${featured ? "text-[#b6d8d3]" : "text-[#65706d]"}`}>
          {plan.currency}/mes
        </span>
      </div>
      <p className={`mt-3 min-h-12 text-sm leading-6 ${featured ? "text-[#d3ebe7]" : "text-[#65706d]"}`}>
        {plan.description || "Gestión multicanal para equipos que quieren responder, organizar y crecer."}
      </p>
      <ul className="mt-7 flex-1 space-y-3">
        {features.map((feature) => (
          <li key={feature} className="flex gap-3 text-sm">
            <Check className={`mt-0.5 h-4 w-4 shrink-0 ${featured ? "text-[#f7c65f]" : "text-[#0f766e]"}`} />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <Link
        href={`/register?plan=${encodeURIComponent(plan.code)}`}
        className={`mt-8 inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold transition-transform hover:-translate-y-0.5 ${
          featured
            ? "bg-[#f7c65f] text-[#3b2b08] hover:bg-[#ffda85]"
            : "bg-[#16211f] text-white hover:bg-[#0f766e]"
        }`}
      >
        Elegir {plan.name}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </article>
  );
}

export default async function HomePage() {
  const plans = await getPublicPlans();

  return (
    <main className="min-h-screen overflow-hidden bg-[#f4f0e6] text-[#16211f]">
      <section className="relative px-5 pb-24 pt-6 sm:px-8 lg:px-12">
        <div className="pointer-events-none absolute -right-24 top-20 h-80 w-80 rounded-full bg-[#f7c65f]/45 blur-3xl" />
        <div className="pointer-events-none absolute -left-32 top-80 h-96 w-96 rounded-full bg-[#78c8bc]/30 blur-3xl" />
        <nav className="relative mx-auto flex max-w-7xl items-center justify-between">
          <Link href="/" className="flex items-center gap-3 font-black tracking-tight">
            <img src="/community-manager-logo.png" alt="" className="h-11 w-11 rounded-2xl object-cover" />
            <span className="text-lg sm:text-xl">ComunityManager</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="#planes" className="hidden text-sm font-semibold sm:block">Planes</Link>
            <Link href="/login" className="rounded-full border border-[#16211f]/20 bg-white/60 px-4 py-2 text-sm font-bold hover:bg-white">
              Iniciar sesión
            </Link>
          </div>
        </nav>

        <div className="relative mx-auto grid max-w-7xl items-center gap-14 pb-10 pt-20 lg:grid-cols-[1.15fr_0.85fr] lg:pt-28">
          <div>
            <p className="mb-5 inline-flex rounded-full border border-[#0f766e]/20 bg-[#d8eee9] px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#0f766e]">
              Operación social, en un solo lugar
            </p>
            <h1 className="max-w-4xl text-5xl font-black leading-[0.95] tracking-[-0.055em] sm:text-6xl lg:text-8xl">
              Todas tus comunidades.
              <span className="block text-[#0f766e]">Un solo equipo.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[#586360]">
              Centraliza WhatsApp, Facebook Messenger e Instagram, organiza marcas y asesores, y responde sin perder el contexto de cada cliente.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="#planes" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#16211f] px-6 py-3.5 font-bold text-white hover:bg-[#0f766e]">
                Ver planes <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/login" className="inline-flex items-center justify-center rounded-full border border-[#16211f]/20 bg-white/60 px-6 py-3.5 font-bold hover:bg-white">
                Ya tengo una cuenta
              </Link>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-lg">
            <div className="rotate-2 rounded-[2.5rem] bg-[#16211f] p-7 text-white shadow-2xl shadow-[#16211f]/20">
              <div className="flex items-center justify-between border-b border-white/10 pb-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-[#8bd6cb]">Inbox unificado</p>
                  <p className="mt-1 text-xl font-bold">Tu operación, en vivo</p>
                </div>
                <ShieldCheck className="h-7 w-7 text-[#f7c65f]" />
              </div>
              <div className="mt-6 space-y-3">
                {[
                  { Icon: MessageCircle, name: "WhatsApp", detail: "12 conversaciones" },
                  { Icon: Camera, name: "Instagram", detail: "8 conversaciones" },
                  { Icon: Users, name: "Facebook Messenger", detail: "5 conversaciones" },
                ].map(({ Icon, name, detail }) => (
                  <div key={name} className="flex items-center gap-4 rounded-2xl bg-white/7 p-4">
                    <div className="rounded-xl bg-[#f7c65f] p-2.5 text-[#3b2b08]"><Icon className="h-5 w-5" /></div>
                    <div className="flex-1"><p className="font-bold">{name}</p><p className="text-sm text-white/55">{detail}</p></div>
                    <span className="h-2.5 w-2.5 rounded-full bg-[#68d5a7]" />
                  </div>
                ))}
              </div>
              <div className="mt-5 flex items-center gap-3 rounded-2xl border border-[#8bd6cb]/20 bg-[#0f766e]/30 p-4">
                <Bot className="h-6 w-6 text-[#8bd6cb]" />
                <p className="text-sm text-white/75">IA disponible para apoyar contenido y atención.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="planes" className="border-t border-[#d8d2c4] bg-[#eee8dc] px-5 py-24 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#0f766e]">Planes mensuales</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.04em] sm:text-5xl">Empieza con el tamaño correcto</h2>
            <p className="mt-4 text-[#65706d]">Puedes cambiar de plan más adelante. El plan solo se activa cuando la pasarela confirma el pago.</p>
          </div>
          {plans.length > 0 ? (
            <div className="mt-16 grid gap-6 lg:grid-cols-3">
              {plans.map((plan, index) => <PlanCard key={plan.id} plan={plan} featured={index === 1} />)}
            </div>
          ) : (
            <div className="mx-auto mt-14 max-w-xl rounded-3xl border border-[#d8d2c4] bg-white/70 p-8 text-center">
              <h3 className="text-xl font-bold">Catálogo temporalmente no disponible</h3>
              <p className="mt-2 text-sm text-[#65706d]">Los planes se publicarán cuando tengan un precio y una pasarela habilitada.</p>
            </div>
          )}
        </div>
      </section>

      <footer className="bg-[#16211f] px-5 py-10 text-white sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-5 text-sm text-white/60 sm:flex-row">
          <p>© 2026 ComunityManager. Gestión multicanal para agencias.</p>
          <div className="flex gap-5"><Link href="/terms">Términos</Link><Link href="/privacy-policy">Privacidad</Link></div>
        </div>
      </footer>
    </main>
  );
}
