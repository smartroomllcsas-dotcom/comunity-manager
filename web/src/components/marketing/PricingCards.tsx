import { ArrowRight, Check } from "lucide-react";

export interface PricingPlan {
  code: string;
  name: string;
  price: number;
  currency?: string;
  featured?: boolean;
  tagline: string;
  features: string[];
  cta?: string;
}

export const DEFAULT_PLANS: PricingPlan[] = [
  {
    code: "starter",
    name: "Starter",
    price: 99,
    currency: "USD",
    tagline: "Para freelancers y agencias arrancando",
    features: [
      "1 cliente activo",
      "3 canales sociales",
      "500 posts / mes",
      "Analytics básico",
      "Approval workflow",
      "Soporte por email",
    ],
    cta: "Empezar Starter",
  },
  {
    code: "growth",
    name: "Growth",
    price: 299,
    currency: "USD",
    featured: true,
    tagline: "El favorito de las agencias en crecimiento",
    features: [
      "5 clientes activos",
      "Todos los canales (9)",
      "2,500 posts / mes",
      "Analytics avanzado + GA4",
      "Approval + Listening",
      "Generación de contenido IA",
      "Soporte prioritario",
    ],
    cta: "Empezar Growth",
  },
  {
    code: "agency",
    name: "Agency",
    price: 799,
    currency: "USD",
    tagline: "Para agencias grandes con equipos completos",
    features: [
      "20 clientes activos",
      "Todos los canales · sin límite",
      "Posts ilimitados",
      "White-label reports PDF",
      "Custom skills",
      "Onboarding dedicado",
      "SLA + Slack directo",
    ],
    cta: "Contactar ventas",
  },
];

interface PricingCardsProps {
  plans?: PricingPlan[];
  currency?: string;
}

function PlanCard({ plan }: { plan: PricingPlan }) {
  const featured = plan.featured ?? false;
  const currency = plan.currency ?? "USD";
  const formattedPrice = plan.price.toLocaleString("es-CO");
  return (
    <article
      className={`relative flex flex-col rounded-[2rem] border p-7 ${
        featured
          ? "border-[#0f766e] bg-[#063c39] text-white shadow-2xl shadow-teal-950/20 lg:-translate-y-4"
          : "border-[#d8d2c4] bg-white/80 text-[#16211f]"
      }`}
    >
      {featured && (
        <span className="absolute -top-3 left-7 rounded-full bg-[#f7c65f] px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-[#3b2b08]">
          Más elegido
        </span>
      )}
      <p
        className={`text-sm font-bold uppercase tracking-[0.18em] ${
          featured ? "text-[#9be2d8]" : "text-[#0f766e]"
        }`}
      >
        {plan.name}
      </p>
      <div className="mt-5 flex items-end gap-2">
        <span className="text-5xl font-black tracking-tight">${formattedPrice}</span>
        <span
          className={`pb-2 text-sm ${featured ? "text-[#b6d8d3]" : "text-[#65706d]"}`}
        >
          {currency} / mes
        </span>
      </div>
      <p
        className={`mt-3 min-h-12 text-sm leading-6 ${
          featured ? "text-[#d3ebe7]" : "text-[#65706d]"
        }`}
      >
        {plan.tagline}
      </p>
      <ul className="mt-6 flex-1 space-y-3">
        {plan.features.map((f) => (
          <li key={f} className="flex gap-3 text-sm">
            <Check
              className={`mt-0.5 h-4 w-4 shrink-0 ${
                featured ? "text-[#f7c65f]" : "text-[#0f766e]"
              }`}
            />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <a
        href={`/register?plan=${encodeURIComponent(plan.code)}`}
        className={`mt-8 inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold transition-transform hover:-translate-y-0.5 ${
          featured
            ? "bg-[#f7c65f] text-[#3b2b08] hover:bg-[#ffda85]"
            : "bg-[#16211f] text-white hover:bg-[#0f766e]"
        }`}
      >
        {plan.cta ?? `Elegir ${plan.name}`}
        <ArrowRight className="h-4 w-4" />
      </a>
    </article>
  );
}

export function PricingCards({ plans = DEFAULT_PLANS }: PricingCardsProps) {
  const currencies = [...new Set(plans.map((plan) => plan.currency ?? "USD"))];
  const currencyLabel = currencies.length === 1 ? currencies[0] : "COP y USD";

  return (
    <section id="planes" className="scroll-mt-6 px-5 py-16 sm:px-8 lg:px-12">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-3">
        {plans.map((plan) => (
          <PlanCard key={plan.code} plan={plan} />
        ))}
      </div>
      <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-[#65706d]">
        Precios en {currencyLabel}. Puedes cambiar de plan en cualquier momento.
        Facturación mensual sin permanencia.
      </p>
    </section>
  );
}
