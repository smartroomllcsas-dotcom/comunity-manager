import Link from 'next/link';
import { BookOpen, Target, Sparkles, GitBranch, Workflow } from 'lucide-react';

const REFERENCES = [
  {
    icon: Target,
    label: 'Objetivos (Goals)',
    description: 'SLA de respuesta < 5min · Budget diario · CTR de campaña · Trust promedio de agentes',
    examples: ['SLA response < 5min', 'Daily WA budget < US$10', 'Weekly reach ≥ 5k'],
    href: '/es/os/goals',
  },
  {
    icon: Sparkles,
    label: 'Skills',
    description: 'Bloques ejecutables que un agente puede correr: enviar mensaje, calificar lead, escalar, generar copy',
    examples: ['whatsapp.send', 'lead.qualify', 'copy.generate', 'human.escalate'],
    href: '/es/os/skills',
  },
  {
    icon: GitBranch,
    label: 'Funnel',
    description: 'Etapas del client journey: descubrimiento → interés → decisión → retención → advocacy',
    examples: ['Lead nuevo', 'MQL', 'SQL', 'Cliente activo', 'Champion'],
    href: '/es/os/funnel',
  },
  {
    icon: Workflow,
    label: 'Workflows',
    description: 'Cadenas multi-step de skills. Ej: mensaje entra → agente respuesta → si duda escala → notifica humano en Slack',
    examples: ['nuevo-lead → califica → agenda', 'ticket → responde → cerrar', 'campaign → track → report'],
    href: '/es/os/workflows',
  },
];

export default function OsReferencePage() {
  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">Referencia</h1>
          <div className="page-sub">
            Modelo de dominio del OS — cómo se combinan objetivos, skills, funnel y workflows
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 mt-4">
        {REFERENCES.map((ref) => (
          <article
            key={ref.label}
            className="rounded-xl border p-5"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
          >
            <div className="flex items-start gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg shrink-0"
                style={{ background: 'var(--os-accent-tint)', color: 'var(--os-accent)' }}
              >
                <ref.icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold" style={{ color: 'var(--text-1)' }}>
                  {ref.label}
                </h3>
                <p className="mt-1 text-sm" style={{ color: 'var(--text-2)' }}>
                  {ref.description}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {ref.examples.map((ex) => (
                    <code
                      key={ex}
                      className="rounded px-2 py-0.5 text-[11px] font-mono"
                      style={{ background: 'var(--surface-3, #1f2937)', color: 'var(--text-1)' }}
                    >
                      {ex}
                    </code>
                  ))}
                </div>
                <Link
                  href={ref.href}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium"
                  style={{ color: 'var(--os-accent)' }}
                >
                  Ir a {ref.label} →
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div
        className="mt-8 flex items-start gap-3 rounded-xl border p-4"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
      >
        <BookOpen className="h-5 w-5 shrink-0 mt-0.5" style={{ color: 'var(--os-accent)' }} />
        <div className="text-sm" style={{ color: 'var(--text-2)' }}>
          <span className="font-semibold" style={{ color: 'var(--text-1)' }}>
            Filosofía del OS:
          </span>{' '}
          los agentes ejecutan <code className="text-xs font-mono">skills</code> para llevar contactos por el{' '}
          <code className="text-xs font-mono">funnel</code>, medidos contra{' '}
          <code className="text-xs font-mono">goals</code> y orquestados por{' '}
          <code className="text-xs font-mono">workflows</code>.
        </div>
      </div>
    </main>
  );
}
