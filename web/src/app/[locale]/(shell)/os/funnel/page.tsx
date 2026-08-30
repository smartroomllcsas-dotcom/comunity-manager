import { getTranslations } from 'next-intl/server';
import { Users } from 'lucide-react';
import { FunnelRadialLazy, FunnelSpaceLazy } from '@/components/os/FunnelGraphsLazy';
import type { FunnelRadialModel, FunnelRadialSegment } from '@/components/os/FunnelRadial';
import type { FunnelSummary } from '@/components/os/FunnelSpace';
import type { FunnelSpaceNode, FunnelTouch } from '@/components/os/FunnelNodeCard';
import { EmptyState } from '@/components/os/EmptyState';
import { requireOrgIdFromRequest } from '@/lib/os/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// ── real data: smarttalk.contacts (leads de Meta Lead Ads + CRM) ─────────────

const STAGES = ['first_touch', 'engaged', 'nurtured', 'opted_in', 'converted'] as const;
type StageId = (typeof STAGES)[number];

// Debe coincidir con ACQUISITIONS inlined en FunnelRadial/FunnelNodeCard
const ACQUISITION_SEGMENTS = ['Instagram', 'YouTube', 'Newsletter', 'X', 'LinkedIn', 'Forms', 'Word of mouth'];

const STAGE_LIKELIHOOD: Record<StageId, number> = {
  first_touch: 30,
  engaged: 55,
  nurtured: 70,
  opted_in: 85,
  converted: 100,
};

const STAGE_RELATIONSHIP: Record<StageId, 'cold' | 'warm' | 'hot'> = {
  first_touch: 'cold',
  engaged: 'warm',
  nurtured: 'warm',
  opted_in: 'hot',
  converted: 'hot',
};

const STAGE_I18N: Record<string, 'new' | 'qualified' | 'hot' | 'closed'> = {
  first_touch: 'new',
  engaged: 'qualified',
  opted_in: 'hot',
  converted: 'closed',
};

interface ContactRow {
  id: string;
  name: string | null;
  custom_fields: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function stageOf(cf: Record<string, unknown>): StageId {
  const lifecycle = str(cf.lifecycle);
  return (STAGES as readonly string[]).includes(lifecycle ?? '') ? (lifecycle as StageId) : 'first_touch';
}

function segmentOf(cf: Record<string, unknown>): number {
  const source = str(cf.source) ?? '';
  const platform = (str(cf.lead_platform) ?? '').toLowerCase();
  if (source === 'facebook_lead_form') {
    return platform.includes('ig') || platform.includes('instagram') ? 0 : 5; // Instagram | Forms
  }
  if (source.includes('instagram')) return 0;
  if (source.includes('whatsapp') || source.includes('referral')) return 6; // Word of mouth
  return 5; // Forms (default para captura directa)
}

function touchesOf(row: ContactRow, cf: Record<string, unknown>, stage: StageId): FunnelTouch[] {
  const at = (row.created_at ?? new Date().toISOString()).slice(0, 10);
  const campaign = str(cf.lead_campaign);
  const ad = str(cf.lead_ad);
  const source = str(cf.source);
  const touches: FunnelTouch[] = [
    {
      id: `${row.id}-origin`,
      channel: source === 'facebook_lead_form' ? 'ads' : 'organic',
      label:
        source === 'facebook_lead_form'
          ? `Lead Ad${campaign ? ` · ${campaign}` : ''}${ad ? ` · ${ad}` : ''}`
          : `Captura · ${source ?? 'CRM'}`,
      at,
    },
  ];
  if (stage === 'converted' && row.updated_at) {
    touches.push({
      id: `${row.id}-conv`,
      channel: 'checkout',
      label: 'Convertido',
      at: row.updated_at.slice(0, 10),
    });
  }
  return touches;
}

function toNode(row: ContactRow): FunnelSpaceNode {
  const cf = row.custom_fields ?? {};
  const stage = stageOf(cf);
  const stageIdx = STAGES.indexOf(stage);
  const lastTouchTs = Date.parse(row.updated_at ?? row.created_at ?? '') || Date.now();
  const daysSince = Math.max(0, Math.floor((Date.now() - lastTouchTs) / 86_400_000));
  const decay = stage === 'converted' ? 0 : Math.min(1, Math.max(0, (daysSince - 21) / 90));
  const hubs = Array.from({ length: stageIdx + 1 }, (_, i) => i);
  return {
    id: row.id,
    name: row.name ?? 'Sin nombre',
    person: row.name ?? null,
    role: null,
    company: null,
    email: str(cf.email),
    phone: str(cf.phone) ?? str(cf.phone_number),
    linkedin: null,
    url: null,
    status: stage,
    likelihood: STAGE_LIKELIHOOD[stage],
    relationship: STAGE_RELATIONSHIP[stage],
    state: stage === 'converted' ? 'converted' : daysSince > 7 && stage !== 'first_touch' ? 'stalled' : 'active',
    decay,
    daysSinceLastTouch: daysSince,
    amountUsd: null,
    product: null,
    touches: touchesOf(row, cf, stage),
    currentHub: stageIdx,
    hubs,
    radius: 5 + stageIdx,
    currentRing: stageIdx,
    rings: hubs,
    segment: segmentOf(cf),
  };
}

function buildSegments(nodes: FunnelSpaceNode[]): FunnelRadialSegment[] {
  return ACQUISITION_SEGMENTS.map((label, idx) => {
    const inSeg = nodes.filter((n) => n.segment === idx);
    return {
      id: label.toLowerCase().replace(/\s+/g, '-'),
      label,
      count: inSeg.length,
      converted: inSeg.filter((n) => n.state === 'converted').length,
    };
  });
}

function buildSummary(nodes: FunnelSpaceNode[]): FunnelSummary {
  const totals = STAGES.map((s) => nodes.filter((n) => n.status === s).length);
  return {
    stages: STAGES.map((id, i) => ({
      id,
      total: totals[i],
      conversionFromPrev: i > 0 && totals[i - 1] > 0 ? Math.round((totals[i] / totals[i - 1]) * 100) : null,
    })),
    totalLeads: nodes.length,
    totalConverted: nodes.filter((n) => n.state === 'converted').length,
  };
}

async function fetchLeadNodes(): Promise<FunnelSpaceNode[]> {
  try {
    const orgId = await requireOrgIdFromRequest();
    const publicAdmin = createAdminClient('public');
    const { data: client } = await publicAdmin
      .from('cm_clients')
      .select('id, smarttalk_organization_id')
      .eq('id', orgId)
      .maybeSingle();
    const stOrgId = (client as { smarttalk_organization_id: string | null } | null)?.smarttalk_organization_id;
    if (!stOrgId) return [];

    const smarttalk = createAdminClient('smarttalk');
    const { data: contacts } = await smarttalk
      .from('contacts')
      .select('id, name, custom_fields, created_at, updated_at')
      .eq('organization_id', stOrgId)
      .eq('brand_id', orgId)
      .order('created_at', { ascending: false })
      .limit(60);

    return ((contacts ?? []) as ContactRow[]).map(toNode);
  } catch {
    return [];
  }
}

// ── page ─────────────────────────────────────────────────────────────────────

export default async function OsFunnelPage() {
  const t = await getTranslations('os.funnel');
  const nodes = await fetchLeadNodes();
  const summary = buildSummary(nodes);
  const radialModel: FunnelRadialModel = { nodes, segments: buildSegments(nodes) };
  const hasLeads = nodes.length > 0;

  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('title')}</h1>
          <p className="page-sub">{t('subtitle')}</p>
        </div>
      </div>

      {!hasLeads ? (
        <EmptyState
          icon={Users}
          title="Sin leads todavía"
          description="Cuando lleguen leads reales de Meta Lead Ads o del CRM para esta marca, aparecerán aquí con su recorrido por el funnel."
          action={{ label: 'Configurar Lead Ads', href: '/settings/channels' }}
          secondary={{ label: 'Ver marcas', href: '/clients' }}
        />
      ) : (
        <>
          {/* Stage summary pills */}
          <div className="mb-6 flex flex-wrap gap-3">
            {summary.stages.map((stage) => {
              const i18nKey = STAGE_I18N[stage.id];
              const label = i18nKey ? t(`stages.${i18nKey}`) : stage.id;
              return (
                <div key={stage.id} className="flex flex-col rounded-lg border border-os-border bg-os-surface px-4 py-2">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-os-dim">{label}</span>
                  <span className="mt-1 text-[22px] font-bold tabular-nums text-os-text">{stage.total}</span>
                  {stage.conversionFromPrev != null && (
                    <span className="font-mono text-[9px] text-os-dim">{stage.conversionFromPrev}% conv.</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Neural radial view — spiral inward */}
          <section className="mb-8 rounded-xl border border-os-border bg-os-surface p-4">
            <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-os-dim">vista radial · origen → conversión</div>
            <FunnelRadialLazy model={radialModel} />
          </section>

          {/* Linear space view — hub-to-hub */}
          <section className="rounded-xl border border-os-border bg-os-surface p-4">
            <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-os-dim">vista de espacio · etapas lineales</div>
            <FunnelSpaceLazy nodes={nodes} summary={summary} />
          </section>
        </>
      )}
    </main>
  );
}
