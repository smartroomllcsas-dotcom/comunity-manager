import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Nosotros · ComunityManager",
  description:
    "Somos una agencia que construyó su propia herramienta después de no encontrar nada que funcionara. Ahora la abrimos a otras agencias.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "Nosotros · ComunityManager",
    description: "La herramienta que quisimos tener cuando gestionábamos clientes.",
    images: ["/og-image.svg"],
  },
};

export default function AboutPage() {
  return (
    <main>
      <section className="px-5 py-24 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0f766e]">
            Nosotros
          </p>
          <h1 className="mt-3 text-5xl font-black tracking-[-0.03em] sm:text-6xl">
            Construido por una agencia, para agencias.
          </h1>
          <div className="mt-8 space-y-5 text-lg leading-8 text-[#16211f]/80">
            <p>
              Empezamos gestionando redes de nuestros propios clientes. Después
              de probar Hootsuite, Buffer, Sprout, Later y una docena más — nada
              nos servía para hacer lo que necesitábamos: <b>escalar sin
              contratar más gente</b>.
            </p>
            <p>
              Así que construimos nuestra propia herramienta. Con agentes IA
              especializados por tarea, workflow de aprobación real (no email
              chains), analytics que no son vanity metrics, y multi-cliente por
              defecto.
            </p>
            <p>
              Funcionó tan bien internamente que decidimos abrirla a otras
              agencias. Hoy la usan agencias en México, Colombia, Argentina y
              España.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            <Stat label="Agencias activas" value="120+" />
            <Stat label="Posts publicados / mes" value="50K+" />
            <Stat label="Uptime SLA" value="99.9%" />
          </div>

          <div className="mt-12">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-full bg-[#16211f] px-6 py-3 text-sm font-bold text-white transition-transform hover:-translate-y-0.5 hover:bg-[#0f766e]"
            >
              Prueba gratis 14 días
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#e6dfce] bg-white/70 p-6">
      <div className="text-3xl font-black tracking-tight text-[#0f766e]">
        {value}
      </div>
      <p className="mt-1 text-sm text-[#16211f]/70">{label}</p>
    </div>
  );
}
