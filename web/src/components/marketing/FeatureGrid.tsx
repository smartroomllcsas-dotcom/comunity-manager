import {
  Bot,
  Calendar,
  CheckCircle2,
  Eye,
  FileText,
  ImageIcon,
  LineChart,
  Radio,
  ShieldCheck,
} from "lucide-react";

const FEATURES = [
  {
    icon: Bot,
    title: "10 Agentes IA especializados",
    body: "Content, community, listening, analytics, ads, editor visual, reports, notify, media, approvals. Cada uno con contexto de tu marca.",
  },
  {
    icon: FileText,
    title: "68+ skills conectadas",
    body: "Copywriting, hooks, formatos por plataforma, brand voice, prompt engineering — cargadas al vuelo según la tarea.",
  },
  {
    icon: Radio,
    title: "9 canales sociales",
    body: "Facebook, Instagram, TikTok, LinkedIn, Threads, YouTube, Pinterest, Google Business Profile y WhatsApp.",
  },
  {
    icon: Calendar,
    title: "Scheduling multi-canal",
    body: "Programa una vez y publica en todos los canales con adaptación automática de formato y copy.",
  },
  {
    icon: LineChart,
    title: "Analytics avanzado",
    body: "Métricas nativas + GA4 + engagement rate + insights de audiencia. Reports PDF listos para el cliente.",
  },
  {
    icon: Eye,
    title: "Social listening",
    body: "Monitorea menciones, hashtags y competencia. Detecta oportunidades antes que nadie.",
  },
  {
    icon: ImageIcon,
    title: "Editor visual + IA",
    body: "PostEditor con preview real por plataforma, generación de imágenes/videos con Fal.ai integrada.",
  },
  {
    icon: CheckCircle2,
    title: "Approval workflow",
    body: "Magic-link seguro sin cuenta para que el cliente apruebe con un click desde su celular.",
  },
  {
    icon: ShieldCheck,
    title: "Multi-tenant + RLS",
    body: "Aislamiento por organización con Row-Level Security de Postgres. Cada agencia ve solo lo suyo.",
  },
];

interface FeatureGridProps {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
}

export function FeatureGrid({
  eyebrow = "Todo lo que necesitas",
  title = "Un stack completo, no un feature suelto",
  subtitle = "Diseñado para agencias que gestionan varios clientes a la vez sin perder calidad ni tiempo.",
}: FeatureGridProps) {
  return (
    <section className="px-5 py-20 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0f766e]">
            {eyebrow}
          </p>
          <h2 className="mt-3 text-4xl font-black tracking-tight text-[#16211f] sm:text-5xl">
            {title}
          </h2>
          <p className="mt-4 text-lg text-[#16211f]/70">{subtitle}</p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <article
              key={f.title}
              className="group rounded-2xl border border-[#e6dfce] bg-white/70 p-6 transition hover:-translate-y-1 hover:border-[#0f766e]/40 hover:shadow-lg"
            >
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#d8eee9] text-[#0f766e]">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-[#16211f]">{f.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#16211f]/70">{f.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
