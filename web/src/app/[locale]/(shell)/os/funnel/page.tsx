import { getTranslations } from 'next-intl/server';
import { FunnelRadialLazy, FunnelSpaceLazy } from '@/components/os/FunnelGraphsLazy';
import type { FunnelRadialModel, FunnelRadialSegment } from '@/components/os/FunnelRadial';
import type { FunnelSummary } from '@/components/os/FunnelSpace';
import type { FunnelSpaceNode } from '@/components/os/FunnelNodeCard';

// ── placeholder data ─────────────────────────────────────────────────────────
// TODO Sprint 2: replace with real cm_leads join via OSRepository
// Shape: nodes pulled from os_leads, mapped to FunnelSpaceNode + FunnelRadialNode

const PLACEHOLDER_NODES: FunnelSpaceNode[] = [
  {
    id: 'lead-1', name: 'Ana García', person: 'Ana García', role: 'Founder', company: 'StartupCo',
    email: null, phone: null, linkedin: null, url: null,
    status: 'first_touch', likelihood: 72, relationship: 'warm', state: 'active',
    decay: 0, daysSinceLastTouch: 3, amountUsd: null, product: null,
    touches: [{ id: 't1', channel: 'organic', label: 'Instagram post · growth hacks', at: '2026-07-10' }],
    currentHub: 0, hubs: [0], radius: 5, currentRing: 0, rings: [0], segment: 0,
  },
  {
    id: 'lead-2', name: 'Carlos Méndez', person: 'Carlos Méndez', role: 'CMO', company: 'BrandLab',
    email: 'carlos@brandlab.co', phone: null, linkedin: null, url: null,
    status: 'engaged', likelihood: 85, relationship: 'hot', state: 'active',
    decay: 0, daysSinceLastTouch: 1, amountUsd: 4800, product: null,
    touches: [
      { id: 't2', channel: 'ads', label: 'Meta Ad · community management', at: '2026-07-01' },
      { id: 't3', channel: 'dm', label: 'DM — asked for pricing', at: '2026-07-13' },
    ],
    currentHub: 1, hubs: [0, 1], radius: 6, currentRing: 1, rings: [0, 1], segment: 1,
  },
  {
    id: 'lead-3', name: 'Sofía Herrera', person: 'Sofía Herrera', role: null, company: null,
    email: 'sofia@gmail.com', phone: null, linkedin: null, url: null,
    status: 'nurtured', likelihood: 60, relationship: 'warm', state: 'active',
    decay: 0, daysSinceLastTouch: 7, amountUsd: 2400, product: null,
    touches: [
      { id: 't4', channel: 'organic', label: 'YouTube · webinar', at: '2026-06-20' },
      { id: 't5', channel: 'email', label: 'Newsletter open · pricing edition', at: '2026-07-05' },
    ],
    currentHub: 2, hubs: [0, 1, 2], radius: 5, currentRing: 2, rings: [0, 1, 2], segment: 2,
  },
  {
    id: 'lead-4', name: 'Miguel Torres', person: 'Miguel Torres', role: 'CEO', company: 'AgencyPro',
    email: 'miguel@agencypro.mx', phone: '+52 555 1234', linkedin: null, url: null,
    status: 'opted_in', likelihood: 92, relationship: 'hot', state: 'active',
    decay: 0, daysSinceLastTouch: 0, amountUsd: 9600, product: null,
    touches: [
      { id: 't6', channel: 'ads', label: 'LinkedIn Ad · ROI calculator', at: '2026-06-15' },
      { id: 't7', channel: 'email', label: 'Email sequence · day 5', at: '2026-07-08' },
      { id: 't8', channel: 'call', label: 'Discovery call — 30 min', at: '2026-08-12' },
    ],
    currentHub: 3, hubs: [0, 1, 2, 3], radius: 7, currentRing: 3, rings: [0, 1, 2, 3], segment: 4,
  },
  {
    id: 'lead-5', name: 'Laura Pérez', person: 'Laura Pérez', role: 'Marketing Dir', company: 'RetailMX',
    email: 'laura@retailmx.com', phone: null, linkedin: null, url: null,
    status: 'converted', likelihood: 100, relationship: 'hot', state: 'converted',
    decay: 0, daysSinceLastTouch: 5, amountUsd: 14400, product: 'Community OS · Anual',
    touches: [
      { id: 't9', channel: 'organic', label: 'Word of mouth · referral', at: '2026-06-01' },
      { id: 't10', channel: 'checkout', label: 'Checkout · plan anual', at: '2026-07-20' },
    ],
    currentHub: 4, hubs: [0, 1, 2, 3, 4], radius: 8, currentRing: 4, rings: [0, 1, 2, 3, 4], segment: 5,
  },
  {
    id: 'lead-6', name: 'Roberto Solis', person: 'Roberto Solis', role: null, company: null,
    email: null, phone: null, linkedin: null, url: null,
    status: 'first_touch', likelihood: 35, relationship: 'cold', state: 'active',
    decay: 0.3, daysSinceLastTouch: 25, amountUsd: null, product: null,
    touches: [{ id: 't11', channel: 'organic', label: 'Instagram story view', at: '2026-07-20' }],
    currentHub: 0, hubs: [0], radius: 4, currentRing: 0, rings: [0], segment: 3,
  },
];

const PLACEHOLDER_SEGMENTS: FunnelRadialSegment[] = [
  { id: 'instagram', label: 'Instagram', count: 3, converted: 1 },
  { id: 'youtube', label: 'YouTube', count: 1, converted: 0 },
  { id: 'newsletter', label: 'Newsletter', count: 1, converted: 0 },
  { id: 'x', label: 'X', count: 0, converted: 0 },
  { id: 'linkedin', label: 'LinkedIn', count: 1, converted: 0 },
  { id: 'forms', label: 'Forms', count: 0, converted: 0 },
  { id: 'wom', label: 'Word of mouth', count: 1, converted: 1 },
];

const PLACEHOLDER_RADIAL_MODEL: FunnelRadialModel = {
  nodes: PLACEHOLDER_NODES,
  segments: PLACEHOLDER_SEGMENTS,
};

const PLACEHOLDER_SUMMARY: FunnelSummary = {
  stages: [
    { id: 'first_touch', total: 42, conversionFromPrev: null },
    { id: 'engaged', total: 18, conversionFromPrev: 43 },
    { id: 'nurtured', total: 10, conversionFromPrev: 56 },
    { id: 'opted_in', total: 6, conversionFromPrev: 60 },
    { id: 'converted', total: 3, conversionFromPrev: 50 },
  ],
  totalLeads: 42,
  totalConverted: 3,
};

// stage id → i18n key mapping
const STAGE_I18N: Record<string, 'new' | 'qualified' | 'hot' | 'closed'> = {
  first_touch: 'new',
  engaged: 'qualified',
  opted_in: 'hot',
  converted: 'closed',
};

// ── page ─────────────────────────────────────────────────────────────────────

export default async function OsFunnelPage() {
  const t = await getTranslations('os.funnel');

  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('title')}</h1>
          <p className="page-sub">{t('subtitle')}</p>
        </div>
      </div>

      {/* Stage summary pills */}
      <div className="mb-6 flex flex-wrap gap-3">
        {PLACEHOLDER_SUMMARY.stages.map((stage) => {
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
        <FunnelRadialLazy model={PLACEHOLDER_RADIAL_MODEL} />
      </section>

      {/* Linear space view — hub-to-hub */}
      <section className="rounded-xl border border-os-border bg-os-surface p-4">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-os-dim">vista de espacio · etapas lineales</div>
        <FunnelSpaceLazy nodes={PLACEHOLDER_NODES} summary={PLACEHOLDER_SUMMARY} />
      </section>
    </main>
  );
}
