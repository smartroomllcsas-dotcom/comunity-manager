// Sprint 26 · Agente S · Landing marketing publica (home /).
//
// Server component: no ship JS extra para paginas estaticas.
// Compuesta por componentes de src/components/marketing/*.

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Hero } from "@/components/marketing/Hero";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { PricingCards, type PricingPlan } from "@/components/marketing/PricingCards";
import { ComparisonTable } from "@/components/marketing/ComparisonTable";
import { EmailSignupForm } from "@/components/marketing/EmailSignupForm";
import { getPublicPlans, type PublicPlan } from "@/lib/billing/public-plans";

export const metadata: Metadata = {
  title: "ComunityManager · Marketing con IA para agencias",
  description:
    "10 agentes IA + 68 skills + 9 canales. Gestión multicanal, aprobación con un click, analytics avanzado. Todo en un solo lugar.",
  alternates: { canonical: "/" },
};

const LOGOS = ["CG Moda", "SmartSends", "Bliss", "Katalog", "Nova", "Alba"];

export const dynamic = "force-dynamic";

function formatLimit(value: number | null, singular: string, plural = `${singular}s`) {
  if (value === null) return `${plural[0].toUpperCase()}${plural.slice(1)} ilimitados`;
  return `${value} ${value === 1 ? singular : plural}`;
}

function toPricingPlan(plan: PublicPlan, index: number, total: number): PricingPlan {
  return {
    code: plan.code,
    name: plan.name,
    price: plan.amountMinor / 100,
    currency: plan.currency,
    featured: total >= 3 && index === 1,
    tagline: plan.description || "Gestión multicanal para tu agencia y sus marcas.",
    features: [
      formatLimit(plan.maxAgencyUsers, "usuario de agencia", "usuarios de agencia"),
      formatLimit(plan.maxBrandAdvisors, "asesor de marca", "asesores de marca"),
      formatLimit(plan.maxBrands, "marca", "marcas"),
      formatLimit(plan.maxChannels, "canal conectado", "canales conectados"),
      formatLimit(plan.maxContacts, "contacto", "contactos"),
      plan.aiEnabled ? "Acceso a inteligencia artificial" : "Sin inteligencia artificial",
    ],
    cta: `Elegir ${plan.name}`,
  };
}

export default async function HomePage() {
  const activePlans = await getPublicPlans();
  const pricingPlans = activePlans.map((plan, index) =>
    toPricingPlan(plan, index, activePlans.length)
  );

  return (
    <main>
      <Hero
        title={
          <>
            El equipo de marketing con
            <span className="block text-[#0f766e]">IA para tu agencia.</span>
          </>
        }
        subtitle="Centraliza clientes, canales, contenido y aprobaciones. 10 agentes IA especializados hacen el 80% del trabajo pesado — tú te enfocas en la estrategia."
      />

      {/* Social proof */}
      <section className="border-y border-[#e6dfce]/60 bg-white/40 px-5 py-10 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <p className="text-center text-xs font-bold uppercase tracking-[0.16em] text-[#65706d]">
            Agencias que ya lo usan
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {LOGOS.map((logo) => (
              <span
                key={logo}
                className="text-lg font-black tracking-tight text-[#16211f]/40"
              >
                {logo}
              </span>
            ))}
          </div>
        </div>
      </section>

      <FeatureGrid />

      <ComparisonTable />

      {/* Pricing preview */}
      <section className="px-5 pb-8 pt-20 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0f766e]">
            Precios simples
          </p>
          <h2 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
            Un plan para cada tamaño de agencia
          </h2>
          <p className="mt-4 text-lg text-[#16211f]/70">
            Empieza gratis, escala cuando estés listo. Sin permanencia.
          </p>
        </div>
      </section>
      {pricingPlans.length > 0 ? (
        <PricingCards plans={pricingPlans} />
      ) : (
        <p className="px-5 pb-16 text-center text-sm text-[#65706d]">
          No hay planes disponibles en este momento.
        </p>
      )}

      {/* Final CTA */}
      <section className="mx-5 my-16 overflow-hidden rounded-[2.5rem] bg-[#063c39] px-8 py-16 text-white sm:mx-8 lg:mx-12">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-4xl font-black tracking-tight sm:text-5xl">
            ¿Listo para escalar tu agencia?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-[#d3ebe7]">
            Empieza en 5 minutos. Setup guiado. Cancela cuando quieras.
          </p>
          <div className="mt-8">
            <EmailSignupForm />
          </div>
          <p className="mt-6 text-xs text-[#9be2d8]">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
            >
              Ver todos los planes
              <ArrowRight className="h-3 w-3" />
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
