import { Megaphone, TrendingUp, TrendingDown } from 'lucide-react';
import { EmptyState } from '@/components/os/EmptyState';
import { requireOrgIdFromRequest } from '@/lib/os/server';
import {
  metaAdsConfigured,
  metaAdsAccountSummary,
  metaAdsCampaignInsights,
  type MetaAdsCampaignDetail,
} from '@/lib/os/connectors/meta-ads/adapter';

export const dynamic = 'force-dynamic';

// ── helpers ──────────────────────────────────────────────────────────────────

function money(cents: number): string {
  return '$' + (cents / 100).toLocaleString('es-CO', { maximumFractionDigits: 2 });
}

function num(n: number): string {
  return n.toLocaleString('es-CO');
}

type Health = 'ok' | 'warn' | 'muted';

function campaignHealth(c: MetaAdsCampaignDetail): Health {
  if (c.status !== 'ACTIVE' || c.impressions < 500) return 'muted';
  if (c.ctr < 1 && c.spend_cents > 1000) return 'warn';
  return 'ok';
}

const HEALTH_STYLE: Record<Health, { color: string; bg: string; label: string }> = {
  ok: { color: 'var(--os-ok)', bg: 'var(--os-ok-tint)', label: 'Sano' },
  warn: { color: 'var(--os-warn)', bg: 'var(--os-warn-tint)', label: 'Revisar' },
  muted: { color: 'var(--os-ink-3)', bg: 'transparent', label: '—' },
};

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: 'var(--os-line)', background: 'var(--os-paper-2)' }}
    >
      <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--os-ink-3)' }}>
        {label}
      </div>
      <div
        className="mt-1 text-xl font-semibold"
        style={{ color: 'var(--os-ink)', fontFamily: 'var(--os-font-display)' }}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 text-[11px]" style={{ color: 'var(--os-ink-2)' }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

export default async function OsAdsPage() {
  await requireOrgIdFromRequest();

  if (!metaAdsConfigured()) {
    return (
      <div className="p-6">
        <EmptyState
          icon={Megaphone}
          title="Meta Ads sin conectar"
          description="Para ver el rendimiento de tus campañas de Facebook e Instagram, un administrador debe configurar el token de acceso de Meta Ads en el servidor. No se requiere ningún permiso adicional en tu cuenta."
          secondary={{ label: 'Ver integraciones', href: '/es/os/integrations' }}
        />
      </div>
    );
  }

  const [summary, campaigns] = await Promise.all([
    metaAdsAccountSummary(),
    metaAdsCampaignInsights(),
  ]);

  if (!summary && campaigns.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon={Megaphone}
          title="Sin datos de Meta Ads"
          description="El token está configurado pero no pudimos leer campañas de la cuenta publicitaria. Verifica que el token tenga acceso a la cuenta de Ads Manager correcta."
          secondary={{ label: 'Ver integraciones', href: '/es/os/integrations' }}
        />
      </div>
    );
  }

  const ranked = [...campaigns].sort((a, b) => b.spend_cents - a.spend_cents);
  const withTraffic = campaigns.filter((c) => c.impressions >= 500);
  const best = withTraffic.length
    ? [...withTraffic].sort((a, b) => b.ctr - a.ctr)[0]
    : null;
  const worst = withTraffic.filter((c) => c.status === 'ACTIVE' && c.ctr < 1 && c.spend_cents > 1000);

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1
          className="text-lg font-semibold"
          style={{ color: 'var(--os-ink)', fontFamily: 'var(--os-font-display)' }}
        >
          Meta Ads
        </h1>
        <p className="text-[12px]" style={{ color: 'var(--os-ink-2)' }}>
          Rendimiento de campañas · últimos 30 días
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Inversión del mes" value={summary ? money(summary.spend_mtd) : '—'} />
        <Kpi label="Últimos 7 días" value={summary ? money(summary.spend_last_7d) : '—'} />
        <Kpi
          label="Campañas activas"
          value={summary ? String(summary.active_campaigns) : '—'}
          sub={`${campaigns.length} en total`}
        />
        <Kpi
          label="Mejor CTR"
          value={best ? best.ctr.toFixed(2) + '%' : '—'}
          sub={best ? best.name : 'Sin campañas con tráfico'}
        />
      </div>

      {worst.length > 0 && (
        <div
          className="rounded-xl border p-3 flex items-start gap-2.5"
          style={{ borderColor: 'var(--os-warn)', background: 'var(--os-warn-tint)' }}
        >
          <TrendingDown className="h-4 w-4 mt-0.5 flex-none" style={{ color: 'var(--os-warn)' }} />
          <div className="text-[12px]" style={{ color: 'var(--os-ink)' }}>
            <span className="font-semibold">{worst.length === 1 ? '1 campaña activa necesita revisión' : `${worst.length} campañas activas necesitan revisión`}</span>
            {' — CTR por debajo de 1% con inversión en curso: '}
            {worst.slice(0, 3).map((c) => c.name).join(' · ')}
            {worst.length > 3 ? '…' : ''}
          </div>
        </div>
      )}

      <div
        className="rounded-xl border overflow-x-auto"
        style={{ borderColor: 'var(--os-line)', background: 'var(--os-paper-2)' }}
      >
        <table className="w-full text-[12px]" style={{ color: 'var(--os-ink)' }}>
          <thead>
            <tr
              className="text-left text-[11px] uppercase tracking-wider"
              style={{ color: 'var(--os-ink-3)' }}
            >
              <th className="px-4 py-3 font-medium">Campaña</th>
              <th className="px-3 py-3 font-medium">Estado</th>
              <th className="px-3 py-3 font-medium text-right">Inversión</th>
              <th className="px-3 py-3 font-medium text-right">Impresiones</th>
              <th className="px-3 py-3 font-medium text-right">Clics</th>
              <th className="px-3 py-3 font-medium text-right">CTR</th>
              <th className="px-3 py-3 font-medium text-right">CPC</th>
              <th className="px-3 py-3 font-medium text-right">ROAS</th>
              <th className="px-4 py-3 font-medium text-right">Salud</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((c) => {
              const h = HEALTH_STYLE[campaignHealth(c)];
              return (
                <tr key={c.id} style={{ borderTop: '1px solid var(--os-line)' }}>
                  <td className="px-4 py-2.5 max-w-[260px] truncate font-medium">{c.name}</td>
                  <td className="px-3 py-2.5" style={{ color: 'var(--os-ink-2)' }}>
                    {c.status === 'ACTIVE' ? 'Activa' : c.status === 'PAUSED' ? 'Pausada' : c.status}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{money(c.spend_cents)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: 'var(--os-ink-2)' }}>
                    {num(c.impressions)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: 'var(--os-ink-2)' }}>
                    {num(c.clicks)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{c.ctr.toFixed(2)}%</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {c.cpc_cents > 0 ? money(c.cpc_cents) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {c.roas !== null && c.purchase_value_cents > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        {c.roas >= 1 && <TrendingUp className="h-3 w-3" style={{ color: 'var(--os-ok)' }} />}
                        {c.roas.toFixed(2)}×
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span
                      className="inline-block rounded-md px-2 py-0.5 text-[11px] font-medium"
                      style={{ color: h.color, background: h.bg }}
                    >
                      {h.label}
                    </span>
                  </td>
                </tr>
              );
            })}
            {ranked.length === 0 && (
              <tr style={{ borderTop: '1px solid var(--os-line)' }}>
                <td colSpan={9} className="px-4 py-6 text-center" style={{ color: 'var(--os-ink-3)' }}>
                  No hay campañas en la cuenta conectada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px]" style={{ color: 'var(--os-ink-4)' }}>
        Fuente: Meta Graph API · datos con caché de 5 minutos. El ROAS solo aparece cuando la campaña
        registra compras con valor (pixel o conversiones offline).
      </p>
    </div>
  );
}
