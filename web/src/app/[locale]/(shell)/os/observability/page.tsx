import { getTranslations } from 'next-intl/server';
import { loadMetrics } from '@/lib/os/observability';

// ─── helpers ─────────────────────────────────────────────────────────────────

function successRateClass(rate: number): string {
  if (rate >= 0.95) return 'ok';
  if (rate >= 0.85) return 'warn';
  return 'err';
}

function formatUsd(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

function formatAt(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function ObservabilityPage() {
  const t = await getTranslations('os.observability');
  const orgId = (process.env.LEONEL_ORG_IDS || '').split(',').filter(Boolean)[0];

  const metrics = orgId
    ? await loadMetrics(orgId).catch(() => null)
    : null;

  const m = metrics ?? {
    agentRuns24h: 0,
    agentRunsSuccessRate: 1,
    costToday: 0,
    costLast7d: 0,
    activityLast24h: 0,
    cronLastRuns: [],
    goalsBreachCount: 0,
    connectorsLive: 0,
    connectorsError: 0,
  };

  const rateClass = successRateClass(m.agentRunsSuccessRate);
  const ratePercent = (m.agentRunsSuccessRate * 100).toFixed(1);

  return (
    <main className="content">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('title')}</h1>
          <p className="page-sub">{t('subtitle')}</p>
        </div>
      </div>

      {/* ── Metric cards ────────────────────────────────────────────────── */}
      <div className="pulse-grid" style={{ marginBottom: 'var(--os-s-8)' }}>

        {/* Agent runs 24h */}
        <div className="card">
          <p className="card-label">{t('cards.agentRuns')}</p>
          <p className="card-metric">{m.agentRuns24h}</p>
          <p className={`card-hint ${rateClass}`}>
            {t('cards.successRate')} {ratePercent}%
          </p>
        </div>

        {/* Cost today */}
        <div className="card">
          <p className="card-label">{t('cards.costToday')}</p>
          <p className="card-metric">{formatUsd(m.costToday)}</p>
          <p className="card-hint">{t('cards.sinceMidnight')}</p>
        </div>

        {/* Cost 7d */}
        <div className="card">
          <p className="card-label">{t('cards.cost7d')}</p>
          <p className="card-metric">{formatUsd(m.costLast7d)}</p>
          <p className="card-hint">{t('cards.rollingWeek')}</p>
        </div>

        {/* Activity 24h */}
        <div className="card">
          <p className="card-label">{t('cards.activity24h')}</p>
          <p className="card-metric">{m.activityLast24h}</p>
          <p className="card-hint">{t('cards.events')}</p>
        </div>

        {/* Goals breach */}
        <div className="card">
          <p className="card-label">{t('cards.goalsBreach')}</p>
          <p className="card-metric">{m.goalsBreachCount}</p>
          {m.goalsBreachCount > 0 && (
            <p className="card-hint err">{t('cards.goalsBreachAlert')}</p>
          )}
        </div>

        {/* Connectors */}
        <div className="card">
          <p className="card-label">{t('cards.connectors')}</p>
          <p className="card-metric">
            <span style={{ color: 'var(--os-ok)' }}>{m.connectorsLive}</span>
            <span className="sep">/</span>
            <span className={m.connectorsError > 0 ? '' : ''} style={{ color: m.connectorsError > 0 ? 'var(--os-err)' : 'var(--os-ink-3)' }}>
              {m.connectorsError}
            </span>
          </p>
          <p className="card-hint">{t('cards.connectorsHint')}</p>
        </div>
      </div>

      {/* ── Cron last runs table ─────────────────────────────────────────── */}
      <section>
        <h2 className="page-title" style={{ fontSize: 'var(--os-text-md)', marginBottom: 'var(--os-s-4)' }}>
          {t('cronTable.title')}
        </h2>

        {m.cronLastRuns.length === 0 ? (
          <p style={{ color: 'var(--os-ink-3)', fontSize: 'var(--os-text-sm)' }}>{t('cronTable.empty')}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 'var(--os-text-sm)',
              fontFamily: 'var(--os-font-mono)',
            }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--os-line-2)', color: 'var(--os-ink-3)' }}>
                  <th style={{ textAlign: 'left', padding: 'var(--os-s-2) var(--os-s-3)', fontWeight: 500 }}>{t('cronTable.endpoint')}</th>
                  <th style={{ textAlign: 'left', padding: 'var(--os-s-2) var(--os-s-3)', fontWeight: 500 }}>{t('cronTable.at')}</th>
                  <th style={{ textAlign: 'left', padding: 'var(--os-s-2) var(--os-s-3)', fontWeight: 500 }}>{t('cronTable.status')}</th>
                </tr>
              </thead>
              <tbody>
                {m.cronLastRuns.map((row, i) => (
                  <tr
                    key={i}
                    style={{ borderBottom: '1px solid var(--os-line)', color: 'var(--os-ink-2)' }}
                  >
                    <td style={{ padding: 'var(--os-s-2) var(--os-s-3)' }}>{row.endpoint}</td>
                    <td style={{ padding: 'var(--os-s-2) var(--os-s-3)' }}>{formatAt(row.at)}</td>
                    <td style={{ padding: 'var(--os-s-2) var(--os-s-3)' }}>
                      <span style={{
                        color: row.ok ? 'var(--os-ok)' : 'var(--os-err)',
                        fontWeight: 600,
                      }}>
                        {row.ok ? t('cronTable.ok') : t('cronTable.err')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
