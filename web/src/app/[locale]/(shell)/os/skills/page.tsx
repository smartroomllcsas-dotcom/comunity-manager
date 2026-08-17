import { Sparkles, Zap, MessageCircle, Target, PenTool, BarChart3, Bell, Users, Calendar, Share2, Search, Shield } from 'lucide-react';

type Skill = {
  id: string;
  name: string;
  group: string;
  description: string;
  input: string;
  agents: string[];
  status: 'live' | 'beta' | 'planned';
  icon: any;
};

const CATALOG: Skill[] = [
  { id: 'auto-respond', name: 'auto.respond', group: 'Bandeja', description: 'Responde mensajes entrantes con tono de marca y contexto de conversación', input: 'message_id, tone', agents: ['Auto-responder'], status: 'live', icon: MessageCircle },
  { id: 'sentiment-tag', name: 'inbox.sentiment', group: 'Bandeja', description: 'Clasifica sentiment (positive/neutral/negative/urgent) para priorización', input: 'message_id', agents: ['Auto-responder', 'Escalator'], status: 'live', icon: Bell },
  { id: 'escalate-human', name: 'human.escalate', group: 'Bandeja', description: 'Escala conversación a humano vía Slack/notificación push con contexto', input: 'conversation_id, reason', agents: ['Escalator'], status: 'live', icon: Shield },

  { id: 'lead-qualify', name: 'lead.qualify', group: 'Comercial', description: 'Aplica scorecard BANT/CHAMP y asigna scoring 0-1 al lead', input: 'contact_id, scorecard', agents: ['Lead-qualifier'], status: 'live', icon: Target },
  { id: 'appointment-book', name: 'lead.book_slot', group: 'Comercial', description: 'Propone slots del calendario del team y agenda cita automáticamente', input: 'contact_id, calendar_id', agents: ['Lead-qualifier'], status: 'live', icon: Calendar },
  { id: 'lead-followup', name: 'lead.followup', group: 'Comercial', description: 'Secuencia de 3 mensajes con delays según urgencia + industria', input: 'contact_id, sequence_id', agents: ['Lead-qualifier'], status: 'beta', icon: Users },

  { id: 'post-draft', name: 'content.draft', group: 'Contenido', description: 'Genera 3 borradores de post desde un brief o pilar de contenido', input: 'brand_id, pillar, format', agents: ['Content-writer'], status: 'live', icon: PenTool },
  { id: 'caption-generate', name: 'content.caption', group: 'Contenido', description: 'Caption + CTA + 15 hashtags optimizados por plataforma', input: 'media_url, platform', agents: ['Content-writer'], status: 'live', icon: Sparkles },
  { id: 'hashtag-suggest', name: 'content.hashtags', group: 'Contenido', description: 'Sugiere hashtags trending por vertical + rango de alcance esperado', input: 'brand_id, topic', agents: ['Content-writer'], status: 'live', icon: Share2 },
  { id: 'social-schedule', name: 'content.schedule', group: 'Contenido', description: 'Distribuye posts en calendario respetando cadencia por pilar', input: 'post_ids, calendar_id', agents: ['Content-writer', 'Broadcast-sender'], status: 'beta', icon: Calendar },

  { id: 'report-weekly', name: 'analytics.weekly', group: 'Analytics', description: 'Reporte semanal automático con KPIs, wins y anomalías detectadas', input: 'brand_id, week_start', agents: ['Analytics-agent'], status: 'live', icon: BarChart3 },
  { id: 'competitor-scan', name: 'analytics.competitor', group: 'Analytics', description: 'Escanea posts recientes de competidores y sugiere respuesta editorial', input: 'competitors[], platform', agents: ['Analytics-agent'], status: 'beta', icon: Search },
  { id: 'engagement-audit', name: 'analytics.engagement', group: 'Analytics', description: 'Detecta caídas >20% en engagement y sugiere hipótesis causales', input: 'brand_id, window_days', agents: ['Analytics-agent'], status: 'live', icon: Zap },

  { id: 'broadcast-fanout', name: 'ops.broadcast', group: 'Ops', description: 'Envía mismo mensaje a N agentes en paralelo, agrega respuestas', input: 'message, agent_ids[]', agents: ['Conductor'], status: 'planned', icon: Share2 },
  { id: 'brain-dump', name: 'brain.dump', group: 'Ops', description: 'Captura voz/texto, embeddings, indexa en Brain con timestamps', input: 'source_type, content', agents: ['Brain-agent'], status: 'planned', icon: Sparkles },
];

const GROUP_COLORS: Record<string, string> = {
  Bandeja: 'oklch(70% 0.16 145)',
  Comercial: 'oklch(70% 0.14 250)',
  Contenido: 'oklch(72% 0.15 320)',
  Analytics: 'oklch(75% 0.15 60)',
  Ops: 'oklch(65% 0.10 250)',
};

const STATUS_STYLES: Record<Skill['status'], { bg: string; color: string; label: string }> = {
  live: { bg: 'oklch(65% 0.13 145 / 0.18)', color: 'oklch(80% 0.13 145)', label: 'LIVE' },
  beta: { bg: 'oklch(75% 0.15 60 / 0.18)', color: 'oklch(85% 0.15 60)', label: 'BETA' },
  planned: { bg: 'var(--surface-3, #1f2937)', color: 'var(--text-2)', label: 'PRÓXIMO' },
};

export default function OsSkillsPage() {
  const groups = Array.from(new Set(CATALOG.map(s => s.group)));
  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">Skills</h1>
          <div className="page-sub">
            Bloques ejecutables que los agentes pueden orquestar · {CATALOG.length} skills disponibles
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
        {groups.map(g => {
          const count = CATALOG.filter(s => s.group === g).length;
          return (
            <div key={g} className="rounded-lg border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: GROUP_COLORS[g] }}>{g}</div>
              <div className="text-xl font-semibold mt-0.5" style={{ color: 'var(--text-1)' }}>{count} skills</div>
            </div>
          );
        })}
      </div>

      {groups.map(g => (
        <section key={g} className="mt-6">
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: GROUP_COLORS[g] }} />
            {g}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {CATALOG.filter(s => s.group === g).map(s => {
              const st = STATUS_STYLES[s.status];
              return (
                <article key={s.id} className="rounded-xl border p-4 transition-colors hover:bg-white/5" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: `${GROUP_COLORS[g]} / 0.12`, color: GROUP_COLORS[g] }}>
                      <s.icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <code className="text-[13px] font-mono font-semibold truncate" style={{ color: 'var(--text-1)' }}>{s.name}</code>
                        <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                      </div>
                      <p className="mt-1 text-[12px] leading-snug" style={{ color: 'var(--text-2)' }}>{s.description}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {s.agents.map(a => (
                          <span key={a} className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: 'var(--surface-3, #1f2937)', color: 'var(--text-2)' }}>{a}</span>
                        ))}
                      </div>
                      <div className="mt-2 text-[10px] font-mono truncate" style={{ color: 'var(--text-2)' }}>input: {s.input}</div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </main>
  );
}
