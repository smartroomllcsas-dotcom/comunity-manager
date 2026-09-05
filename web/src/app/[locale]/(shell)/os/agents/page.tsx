import { Bot, MessageCircle, Target, PenTool, Shield, Sparkles, BarChart3, Bell } from 'lucide-react';
import { getOSRepositoryForRequest, requireOrgIdFromRequest } from '@/lib/os/server';
import { AgentRoster } from '@/components/os/AgentRoster';
import { AgentDetailPanel } from '@/components/os/AgentDetailPanel';

type AgentTemplate = {
  id: string;
  name: string;
  role: string;
  description: string;
  icon: any;
  color: string;
  model: string;
  skills: string[];
  status: 'live' | 'idle' | 'template';
  trust?: number;
};

const AGENT_TEMPLATES: AgentTemplate[] = [
  { id: 'auto-responder', name: 'Auto-responder', role: 'Bandeja', description: 'Responde mensajes entrantes en WA/Messenger/IG con tono de marca y contexto de conversación', icon: MessageCircle, color: 'oklch(70% 0.16 145)', model: 'claude-sonnet-4-6', skills: ['auto.respond', 'inbox.sentiment'], status: 'live', trust: 0.92 },
  { id: 'lead-qualifier', name: 'Lead-qualifier', role: 'Comercial', description: 'Aplica scorecard BANT/CHAMP, marca leads calientes y agenda citas en calendario', icon: Target, color: 'oklch(70% 0.14 250)', model: 'claude-haiku-4-5', skills: ['lead.qualify', 'lead.book_slot', 'lead.followup'], status: 'live', trust: 0.88 },
  { id: 'content-writer', name: 'Content-writer', role: 'Contenido', description: 'Genera borradores de post, captions con hashtags, y sugiere calendario editorial por pilar', icon: PenTool, color: 'oklch(72% 0.15 320)', model: 'claude-opus-4-7', skills: ['content.draft', 'content.caption', 'content.hashtags'], status: 'live', trust: 0.76 },
  { id: 'escalator', name: 'Escalator-agent', role: 'Bandeja', description: 'Detecta conversaciones que requieren humano (queja fuerte, dudas complejas) y escala vía Slack', icon: Shield, color: 'oklch(65% 0.15 25)', model: 'claude-haiku-4-5', skills: ['human.escalate', 'inbox.sentiment'], status: 'idle', trust: 0.70 },
  { id: 'analytics-agent', name: 'Analytics-agent', role: 'Analytics', description: 'Reporte semanal automático, scan de competidores y detección de anomalías en engagement', icon: BarChart3, color: 'oklch(75% 0.15 60)', model: 'claude-sonnet-4-6', skills: ['analytics.weekly', 'analytics.competitor', 'analytics.engagement'], status: 'template' },
  { id: 'broadcast-sender', name: 'Broadcast-sender', role: 'Bandeja', description: 'Distribuye campañas de difusión respetando cadencia por segmento y horario óptimo', icon: Bell, color: 'oklch(75% 0.12 320)', model: 'claude-haiku-4-5', skills: ['content.schedule', 'ops.broadcast'], status: 'template' },
  { id: 'brain-agent', name: 'Brain-agent', role: 'Ops', description: 'Captura notas de voz, indexa conversaciones, mantiene knowledge graph de contactos', icon: Sparkles, color: 'oklch(70% 0.14 250)', model: 'claude-sonnet-4-6', skills: ['brain.dump'], status: 'template' },
  { id: 'conductor', name: 'Conductor', role: 'Ops', description: 'Meta-agente: coordina otros agentes, asigna tareas, decide escalaciones a humano', icon: Bot, color: 'oklch(80% 0.15 60)', model: 'claude-opus-4-7', skills: ['ops.broadcast'], status: 'template' },
];

const STATUS_STYLES: Record<AgentTemplate['status'], { bg: string; color: string; label: string }> = {
  live: { bg: 'oklch(65% 0.13 145 / 0.18)', color: 'oklch(80% 0.13 145)', label: 'LIVE' },
  idle: { bg: 'oklch(70% 0.05 250 / 0.18)', color: 'oklch(80% 0.05 250)', label: 'IDLE' },
  template: { bg: 'var(--surface-3, #1f2937)', color: 'var(--text-2)', label: 'TEMPLATE' },
};

export default async function OsAgentsPage() {
  let realAgents: any[] = [];
  try {
    const [repo, orgId] = await Promise.all([getOSRepositoryForRequest(), requireOrgIdFromRequest()]);
    realAgents = await repo.agents.all(orgId);
  } catch {
    // ignore — show templates
  }

  const firstReal = realAgents[0] ?? null;
  const showRealDetail = firstReal !== null;

  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">Agentes</h1>
          <div className="page-sub">
            {realAgents.length > 0
              ? `${realAgents.length} agentes activos · ${AGENT_TEMPLATES.length} templates disponibles`
              : `${AGENT_TEMPLATES.length} agentes preconfigurados listos para activar en tu marca`}
          </div>
        </div>
      </div>

      {/* Live agents panel (if any) */}
      {showRealDetail && (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 'var(--sp-4)', alignItems: 'start', marginTop: 16 }}>
          <div className="sticky top-0">
            <AgentRoster agents={realAgents} />
          </div>
          <AgentDetailPanel agent={firstReal} initialRuns={[]} />
        </div>
      )}

      {/* Templates catalog */}
      <section className="mt-6">
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-1)' }}>
          Roster de agentes preconfigurados
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {AGENT_TEMPLATES.map(a => {
            const st = STATUS_STYLES[a.status];
            return (
              <article key={a.id} className="rounded-xl border p-4 transition-colors hover:bg-white/5" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: `${a.color} / 0.12`, color: a.color }}>
                    <a.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-1)' }}>{a.name}</div>
                      <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none shrink-0" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                    </div>
                    <div className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: a.color }}>{a.role}</div>
                    <p className="mt-2 text-[12px] leading-snug" style={{ color: 'var(--text-2)' }}>{a.description}</p>
                    {a.trust !== undefined && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1 flex-1 rounded-full" style={{ background: 'var(--surface-3, #1f2937)' }}>
                          <div className="h-full rounded-full" style={{ width: `${a.trust * 100}%`, background: a.color }} />
                        </div>
                        <span className="text-[10px] font-mono" style={{ color: 'var(--text-2)' }}>{a.trust.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {a.skills.map(s => (
                        <code key={s} className="rounded px-1.5 py-0.5 text-[10px] font-mono" style={{ background: 'var(--surface-3, #1f2937)', color: 'var(--text-2)' }}>{s}</code>
                      ))}
                    </div>
                    <div className="mt-2 text-[10px]" style={{ color: 'var(--text-2)' }}>
                      model: <code className="font-mono">{a.model}</code>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
