import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Book, MessageCircle, Zap } from "lucide-react";

export const metadata: Metadata = {
  title: "Docs · ComunityManager",
  description:
    "Documentación de ComunityManager: getting started, API, integraciones y FAQ.",
  alternates: { canonical: "/docs" },
  openGraph: {
    title: "Docs · ComunityManager",
    description: "Todo lo que necesitas para empezar y sacar el máximo del producto.",
    images: ["/og-image.svg"],
  },
};

const QUICK_START = [
  {
    step: "1",
    title: "Crea tu cuenta",
    body: "Registra tu agencia en 2 minutos. Solo necesitas un email.",
  },
  {
    step: "2",
    title: "Añade tu primer cliente",
    body: "Usa el onboarding wizard para configurar marca, logo, brand voice y canales.",
  },
  {
    step: "3",
    title: "Conecta canales sociales",
    body: "OAuth con Facebook, Instagram, TikTok, LinkedIn y más. 1 click por canal.",
  },
  {
    step: "4",
    title: "Programa tu primer post",
    body: "Usa el editor visual, genera contenido con IA y programa la publicación.",
  },
];

const FAQ = [
  {
    q: "¿Qué canales sociales soporta?",
    a: "Facebook, Instagram, TikTok, LinkedIn, Threads, YouTube, Pinterest, Google Business Profile y WhatsApp Cloud API.",
  },
  {
    q: "¿Cómo funciona el approval workflow?",
    a: "Envías al cliente un magic-link seguro por WhatsApp o email. Él aprueba/rechaza desde su celular sin crear cuenta. El post pasa a scheduled automáticamente.",
  },
  {
    q: "¿Puedo importar mis clientes actuales?",
    a: "Sí. Desde el onboarding puedes generar magic-links para que cada cliente conecte sus propias cuentas sociales, o hacerlo tú mismo si tienes los accesos.",
  },
  {
    q: "¿Hay API para integrar con mi stack?",
    a: "Sí. API REST completa con auth via API keys. Docs completas próximamente.",
  },
];

export default function DocsPage() {
  return (
    <main>
      <section className="px-5 pb-6 pt-20 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0f766e]">
            Documentación
          </p>
          <h1 className="mt-3 text-5xl font-black tracking-[-0.03em] sm:text-6xl">
            Todo lo que necesitas para arrancar
          </h1>
          <p className="mt-4 text-lg text-[#16211f]/70">
            Guías, API reference y FAQ para sacarle el máximo a ComunityManager.
          </p>
        </div>
      </section>

      {/* Quick links */}
      <section className="px-5 py-10 sm:px-8 lg:px-12">
        <div className="mx-auto grid max-w-5xl gap-5 sm:grid-cols-3">
          {[
            { icon: Zap, title: "Getting Started", href: "#getting-started" },
            { icon: Book, title: "API Reference", href: "#api" },
            { icon: MessageCircle, title: "Soporte", href: "#faq" },
          ].map((c) => (
            <Link
              key={c.title}
              href={c.href}
              className="group rounded-2xl border border-[#e6dfce] bg-white/70 p-6 transition hover:-translate-y-1 hover:border-[#0f766e]/40 hover:shadow-lg"
            >
              <c.icon className="h-6 w-6 text-[#0f766e]" />
              <h3 className="mt-3 flex items-center gap-2 text-lg font-bold text-[#16211f]">
                {c.title}
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </h3>
            </Link>
          ))}
        </div>
      </section>

      {/* Getting Started */}
      <section id="getting-started" className="px-5 py-16 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-3xl font-black tracking-tight">Getting Started</h2>
          <p className="mt-2 text-[#16211f]/70">
            En 4 pasos tienes tu primera agencia funcionando.
          </p>
          <ol className="mt-8 space-y-5">
            {QUICK_START.map((s) => (
              <li
                key={s.step}
                className="flex gap-5 rounded-2xl border border-[#e6dfce] bg-white/70 p-6"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#063c39] text-lg font-black text-[#f7c65f]">
                  {s.step}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#16211f]">{s.title}</h3>
                  <p className="mt-1 text-sm text-[#16211f]/70">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* API */}
      <section id="api" className="border-t border-[#e6dfce]/60 bg-white/40 px-5 py-16 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-3xl font-black tracking-tight">API Reference</h2>
          <p className="mt-2 text-[#16211f]/70">
            REST API para integrar ComunityManager con tu stack. Docs completas
            en producción próximamente.
          </p>
          <div className="mt-6 rounded-2xl bg-[#16211f] p-6 font-mono text-sm text-[#9be2d8]">
            <p className="text-[#7d8590]"># Ejemplo — listar clientes</p>
            <p className="mt-2">
              curl https://comunitymanager.io/api/clients \
            </p>
            <p className="ml-4">
              -H &quot;Authorization: Bearer $API_KEY&quot;
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="px-5 py-16 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl font-black tracking-tight">FAQ</h2>
          <div className="mt-8 space-y-4">
            {FAQ.map((f) => (
              <details
                key={f.q}
                className="group rounded-2xl border border-[#e6dfce] bg-white/70 p-5 open:bg-white"
              >
                <summary className="cursor-pointer list-none text-lg font-bold text-[#16211f]">
                  {f.q}
                </summary>
                <p className="mt-3 text-sm leading-6 text-[#16211f]/70">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="mx-5 my-16 rounded-[2.5rem] bg-[#063c39] p-12 text-center text-white sm:mx-8 lg:mx-12">
        <h2 className="text-3xl font-black">¿No encontraste lo que buscabas?</h2>
        <p className="mx-auto mt-3 max-w-xl text-[#d3ebe7]">
          Escríbenos a{" "}
          <a
            href="mailto:hola@comunitymanager.io"
            className="font-bold text-[#f7c65f] underline underline-offset-4"
          >
            hola@comunitymanager.io
          </a>{" "}
          y te respondemos el mismo día.
        </p>
      </section>
    </main>
  );
}
