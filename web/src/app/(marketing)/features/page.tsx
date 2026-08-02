import type { Metadata } from "next";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { ComparisonTable } from "@/components/marketing/ComparisonTable";

export const metadata: Metadata = {
  title: "Features · ComunityManager",
  description:
    "10 agentes IA, 68+ skills, 9 canales, scheduling, analytics, listening, editor visual, approval workflow y reports PDF.",
  alternates: { canonical: "/features" },
  openGraph: {
    title: "Features · ComunityManager",
    description: "Todo el stack que tu agencia necesita para escalar.",
    images: ["/og-image.svg"],
  },
};

const SECTIONS = [
  {
    tag: "Contenido",
    title: "Genera, programa y publica en 9 canales",
    body: "Editor visual con preview real por plataforma. IA para copy, hashtags, hooks y formatos. Programación multi-canal con adaptación automática.",
  },
  {
    tag: "Aprobación",
    title: "El cliente aprueba con un click",
    body: "Magic-link seguro sin cuenta. El cliente ve el preview real por plataforma y aprueba desde su celular. Log completo de decisiones.",
  },
  {
    tag: "Analytics",
    title: "Métricas que importan, no vanity",
    body: "Engagement rate real por post/plataforma. Integración GA4 para atribución web. Reports PDF listos para enviar al cliente cada semana.",
  },
  {
    tag: "Listening",
    title: "Escucha a tu audiencia y competencia",
    body: "Monitoreo de menciones, hashtags y competidores. Detecta oportunidades y crisis antes que nadie.",
  },
  {
    tag: "Multi-tenant",
    title: "Seguridad enterprise por defecto",
    body: "Row-Level Security de Postgres. Aislamiento por organización. Roles: owner, admin, editor, viewer. Auditoría completa.",
  },
];

export default function FeaturesPage() {
  return (
    <main>
      <section className="px-5 pb-4 pt-20 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0f766e]">
            Features
          </p>
          <h1 className="mt-3 text-5xl font-black tracking-[-0.03em] sm:text-6xl">
            Todo lo que tu agencia necesita
          </h1>
          <p className="mt-4 text-lg text-[#16211f]/70">
            Diseñado desde cero para agencias multi-cliente. No es una copia de
            Hootsuite con IA pegada — es un stack nuevo.
          </p>
        </div>
      </section>

      <FeatureGrid
        eyebrow="Grid completo"
        title="9 pilares del producto"
        subtitle="Cada uno pensado para resolver un dolor real de agencia."
      />

      {/* Detailed sections */}
      <section className="px-5 py-16 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-4xl space-y-14">
          {SECTIONS.map((s) => (
            <article
              key={s.tag}
              className="border-l-4 border-[#0f766e] pl-6"
            >
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0f766e]">
                {s.tag}
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-[#16211f]">
                {s.title}
              </h2>
              <p className="mt-3 text-lg leading-7 text-[#16211f]/75">
                {s.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      <ComparisonTable />
    </main>
  );
}
