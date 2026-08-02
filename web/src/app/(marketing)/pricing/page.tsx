import type { Metadata } from "next";
import { PricingCards, DEFAULT_PLANS } from "@/components/marketing/PricingCards";

export const metadata: Metadata = {
  title: "Precios · ComunityManager",
  description:
    "Planes desde $99 USD/mes. Starter, Growth y Agency. Sin permanencia, cancela cuando quieras.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Precios · ComunityManager",
    description: "Planes desde $99 USD/mes. Sin permanencia.",
    images: ["/og-image.svg"],
  },
};

const FAQ = [
  {
    q: "¿Puedo cambiar de plan más adelante?",
    a: "Sí. Puedes hacer upgrade o downgrade en cualquier momento desde tu dashboard. La diferencia se prorratea automáticamente.",
  },
  {
    q: "¿Qué pasa si supero el límite de posts?",
    a: "Te avisamos antes de llegar al 80%. Puedes comprar packs adicionales o pasar al siguiente plan.",
  },
  {
    q: "¿Necesito tarjeta de crédito para probar?",
    a: "No. Los primeros 14 días son gratis sin tarjeta. Después eliges el plan que quieras.",
  },
  {
    q: "¿Tienen descuento anual?",
    a: "Sí, 2 meses gratis pagando el año completo. Escríbenos a hola@comunitymanager.io.",
  },
];

export default function PricingPage() {
  return (
    <main>
      <section className="px-5 pb-6 pt-20 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0f766e]">
            Precios
          </p>
          <h1 className="mt-3 text-5xl font-black tracking-[-0.03em] sm:text-6xl">
            Precios simples, sin sorpresas
          </h1>
          <p className="mt-4 text-lg text-[#16211f]/70">
            Elige el plan que mejor se ajuste al tamaño de tu agencia. Cambia
            cuando quieras.
          </p>
        </div>
      </section>

      <PricingCards plans={DEFAULT_PLANS} />

      {/* FAQ */}
      <section className="px-5 py-20 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl font-black tracking-tight">
            Preguntas frecuentes
          </h2>
          <div className="mt-8 space-y-4">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="group rounded-2xl border border-[#e6dfce] bg-white/70 p-5 open:bg-white"
              >
                <summary className="cursor-pointer list-none text-lg font-bold text-[#16211f]">
                  {item.q}
                </summary>
                <p className="mt-3 text-sm leading-6 text-[#16211f]/70">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
