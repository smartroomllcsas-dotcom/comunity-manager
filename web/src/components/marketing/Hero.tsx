import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

interface HeroProps {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle: string;
  ctaPrimary?: { label: string; href: string };
  ctaSecondary?: { label: string; href: string };
}

export function Hero({
  eyebrow = "Operación social, en un solo lugar",
  title,
  subtitle,
  ctaPrimary = { label: "Empezar gratis", href: "/register" },
  ctaSecondary = { label: "Ver precios", href: "/pricing" },
}: HeroProps) {
  return (
    <section className="relative overflow-hidden px-5 pb-16 pt-14 sm:px-8 lg:px-12 lg:pt-24">
      <div className="pointer-events-none absolute -right-24 top-20 h-80 w-80 rounded-full bg-[#f7c65f]/45 blur-3xl" />
      <div className="pointer-events-none absolute -left-32 top-80 h-96 w-96 rounded-full bg-[#78c8bc]/30 blur-3xl" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#0f766e]/20 bg-[#d8eee9] px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#0f766e]">
            <Sparkles className="h-3.5 w-3.5" />
            {eyebrow}
          </p>
          <h1 className="max-w-4xl text-5xl font-black leading-[0.95] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
            {title}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-7 text-[#16211f]/75">
            {subtitle}
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href={ctaPrimary.href}
              className="inline-flex items-center gap-2 rounded-full bg-[#16211f] px-6 py-3 text-sm font-bold text-white transition-transform hover:-translate-y-0.5 hover:bg-[#0f766e]"
            >
              {ctaPrimary.label}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href={ctaSecondary.href}
              className="inline-flex items-center gap-2 rounded-full border border-[#16211f]/20 bg-white/70 px-6 py-3 text-sm font-bold text-[#16211f] transition hover:border-[#16211f]/40"
            >
              {ctaSecondary.label}
            </Link>
          </div>
          <p className="mt-5 text-xs text-[#65706d]">
            Sin tarjeta de crédito · 14 días de prueba · Cancela cuando quieras
          </p>
        </div>
        <div className="relative">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[2rem] border border-[#16211f]/10 bg-white shadow-2xl shadow-teal-950/10">
            <img
              src="/og-image.svg"
              alt="Dashboard ComunityManager"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="absolute -bottom-6 -left-6 hidden rounded-2xl bg-[#063c39] px-5 py-4 text-white shadow-xl lg:block">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9be2d8]">
              10 Agentes IA
            </p>
            <p className="mt-1 text-sm">Contenido, analytics, listening y más</p>
          </div>
        </div>
      </div>
    </section>
  );
}
