// Sprint 26 · Agente S · Landing marketing publica (home /).
//
// Server component: no ship JS extra para paginas estaticas.
// Compuesta por componentes de src/components/marketing/*.

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Hero } from "@/components/marketing/Hero";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { PricingCards, DEFAULT_PLANS } from "@/components/marketing/PricingCards";
import { ComparisonTable } from "@/components/marketing/ComparisonTable";
import { EmailSignupForm } from "@/components/marketing/EmailSignupForm";

export const metadata: Metadata = {
  title: "ComunityManager · Marketing con IA para agencias",
  description:
    "10 agentes IA + 68 skills + 9 canales. Gestión multicanal, aprobación con un click, analytics avanzado. Todo en un solo lugar.",
  alternates: { canonical: "/" },
};

const LOGOS = ["CG Moda", "SmartSends", "Bliss", "Katalog", "Nova", "Alba"];

export default function HomePage() {
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
      <PricingCards plans={DEFAULT_PLANS} />

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
