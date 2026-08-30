import Link from 'next/link';
import { Users2, Sparkles } from 'lucide-react';

const TEMPLATES = [
  {
    slug: 'glamping',
    name: 'Glamping / Hospitality',
    description: 'Reservas por WhatsApp, upsell de experiencias, seguimiento post-estadía, reviews automáticas.',
    active: true,
  },
  {
    slug: 'ecommerce-fashion',
    name: 'E-commerce · Moda',
    description: 'Catálogo por Meta, carrito abandonado, seguimiento de talla, retargeting con IG DMs.',
    active: false,
  },
  {
    slug: 'agency',
    name: 'Agencia de marketing',
    description: 'Multi-marca, reportes semanales, aprobación de contenido, briefs desde Slack.',
    active: false,
  },
  {
    slug: 'coach',
    name: 'Coaching / Formador',
    description: 'Cohorts, DMs de nurture, invitaciones a webinars, colecta de reviews con nombre.',
    active: false,
  },
];

export default function OsPersonasPage() {
  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">Personas</h1>
          <div className="page-sub">
            Templates de OS pre-configurados por vertical — aplica uno y hereda agentes, skills y objetivos
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 mt-4">
        {TEMPLATES.map((tpl) => (
          <article
            key={tpl.slug}
            className="rounded-xl border p-5 transition-colors"
            style={{
              borderColor: tpl.active ? 'var(--os-accent)' : 'var(--border)',
              background: tpl.active
                ? 'linear-gradient(180deg, color-mix(in oklch, var(--os-accent) 8%, transparent), var(--surface-2))'
                : 'var(--surface-2)',
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold" style={{ color: 'var(--text-1)' }}>
                  {tpl.name}
                </h3>
                <p className="mt-1 text-sm" style={{ color: 'var(--text-2)' }}>
                  {tpl.description}
                </p>
              </div>
              {tpl.active && (
                <span
                  className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                  style={{ background: 'var(--os-accent)', color: 'white' }}
                >
                  ACTIVA
                </span>
              )}
            </div>
            <div className="mt-4 flex gap-2">
              {tpl.active ? (
                <Link
                  href="/es/os"
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-white/5"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
                >
                  Ir a Consola
                </Link>
              ) : (
                <button
                  disabled
                  className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium opacity-50"
                  style={{ background: 'var(--surface-3, #1f2937)', color: 'var(--text-2)' }}
                >
                  <Sparkles className="h-3 w-3" />
                  Próximamente
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      <div
        className="mt-8 flex items-center gap-3 rounded-xl border p-4"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
      >
        <Users2 className="h-5 w-5 shrink-0" style={{ color: 'var(--os-accent)' }} />
        <div className="text-sm" style={{ color: 'var(--text-2)' }}>
          <span className="font-semibold" style={{ color: 'var(--text-1)' }}>¿Necesitas un persona custom?</span>{' '}
          Escríbenos y armamos el template para tu vertical.
        </div>
      </div>
    </main>
  );
}
