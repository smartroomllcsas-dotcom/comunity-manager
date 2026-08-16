import { getTranslations } from 'next-intl/server';
import { loadAnalytics, type OsAnalytics } from '@/lib/os/analytics';

// ─── helpers ──────────────────────────────────────────────────────────────────

function pct(n: number) {
  return (n * 100).toFixed(1) + '%';
}

function usd(n: number) {
  return '$' + n.toFixed(4);
}

function reliabilityColor(failures: number, runs: number) {
  if (runs === 0) return 'text-zinc-500';
  const rate = failures / runs;
  if (rate === 0) return 'text-emerald-400';
  if (rate < 0.05) return 'text-yellow-400';
  return 'text-red-400';
}

// ─── inline SVG bar chart for goals health ────────────────────────────────────

function GoalsHealthChart({ data }: { data: OsAnalytics['goalsHealthDaily'] }) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-zinc-500 py-6 text-center">
        Sin datos de goals en el período.
      </p>
    );
  }

  const W = 600;
  const H = 120;
  const BAR_W = Math.max(4, Math.floor((W - 40) / data.length) - 2);
  const maxVal = Math.max(...data.map(d => d.passCount + d.breachCount), 1);

  return (
    <svg
      viewBox={`0 0 ${W} ${H + 20}`}
      className="w-full max-w-2xl"
      aria-label="Goals health daily bar chart"
    >
      {data.map((d, i) => {
        const total = d.passCount + d.breachCount;
        const barH = Math.round((total / maxVal) * H);
        const passH = total > 0 ? Math.round((d.passCount / total) * barH) : 0;
        const breachH = barH - passH;
        const x = 20 + i * (BAR_W + 2);
        const yBase = H;

        return (
          <g key={d.date}>
            {/* breach (red, bottom) */}
            {breachH > 0 && (
              <rect
                x={x}
                y={yBase - breachH}
                width={BAR_W}
                height={breachH}
                className="fill-red-500/60"
              />
            )}
            {/* pass (green, on top of breach) */}
            {passH > 0 && (
              <rect
                x={x}
                y={yBase - breachH - passH}
                width={BAR_W}
                height={passH}
                className="fill-emerald-500/70"
              />
            )}
            {/* date label every ~7 bars */}
            {i % Math.max(1, Math.floor(data.length / 6)) === 0 && (
              <text
                x={x + BAR_W / 2}
                y={H + 16}
                textAnchor="middle"
                className="fill-zinc-500 text-[8px]"
                fontSize={8}
              >
                {d.date.slice(5)}
              </text>
            )}
          </g>
        );
      })}
      {/* legend */}
      <rect x={W - 90} y={4} width={8} height={8} className="fill-emerald-500/70" />
      <text x={W - 78} y={12} fontSize={8} className="fill-zinc-400">Pass</text>
      <rect x={W - 90} y={16} width={8} height={8} className="fill-red-500/60" />
      <text x={W - 78} y={24} fontSize={8} className="fill-zinc-400">Breach</text>
    </svg>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function OsAnalyticsPage() {
  const t = await getTranslations('os.analytics');

  const orgId = (process.env.LEONEL_ORG_IDS || '').split(',').filter(Boolean)[0];

  let data: OsAnalytics | null = null;

  if (orgId) {
    try {
      data = await loadAnalytics(orgId, 30);
    } catch {
      // render empty state on DB errors
    }
  }

  const kpis = data
    ? [
        { label: t('kpi.runs'),          value: String(data.totalAgentRuns) },
        { label: t('kpi.cost'),          value: usd(data.totalCostUsd) },
        { label: t('kpi.successRate'),   value: pct(data.successRate) },
        { label: t('kpi.costPerMsg'),    value: usd(data.costPerMessage) },
      ]
    : [];

  return (
    <main className="content">
      {/* ── Page header ───────────────────────────────────────────────── */}
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('title')}</h1>
          <div className="page-sub">{t('subtitle', { days: 30 })}</div>
        </div>
      </div>

      {/* ── Empty state ───────────────────────────────────────────────── */}
      {!data && (
        <div className="mt-10 flex flex-col items-center gap-4 rounded-xl border border-dashed border-zinc-700 p-12 text-center">
          <div className="text-4xl">📊</div>
          <p className="text-sm text-zinc-400">{t('emptyState')}</p>
        </div>
      )}

      {data && (
        <>
          {/* ── KPI cards ─────────────────────────────────────────────── */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map(kpi => (
              <div
                key={kpi.label}
                className="flex flex-col gap-1 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5"
              >
                <span className="text-xs text-zinc-500">{kpi.label}</span>
                <span className="text-2xl font-semibold text-zinc-100">{kpi.value}</span>
              </div>
            ))}
          </div>

          {/* ── Goals health chart ────────────────────────────────────── */}
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold text-zinc-300">{t('goalsHealth')}</h2>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
              <GoalsHealthChart data={data.goalsHealthDaily} />
            </div>
          </section>

          {/* ── Top agents table ──────────────────────────────────────── */}
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold text-zinc-300">{t('topAgents')}</h2>
            <div className="overflow-x-auto rounded-xl border border-zinc-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/80">
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">{t('col.agent')}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500">{t('col.runs')}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500">{t('col.successRate')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topAgents.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-6 text-center text-xs text-zinc-500">
                        {t('noAgentRuns')}
                      </td>
                    </tr>
                  )}
                  {data.topAgents.map((a, idx) => (
                    <tr
                      key={a.agentId}
                      className={
                        idx % 2 === 0
                          ? 'bg-zinc-900/40'
                          : 'bg-zinc-900/20'
                      }
                    >
                      <td className="px-4 py-2.5 font-medium text-zinc-200">{a.name}</td>
                      <td className="px-4 py-2.5 text-right text-zinc-400">{a.runs}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span
                          className={
                            a.successRate >= 0.95
                              ? 'text-emerald-400'
                              : a.successRate >= 0.8
                              ? 'text-yellow-400'
                              : 'text-red-400'
                          }
                        >
                          {pct(a.successRate)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Cron reliability table ────────────────────────────────── */}
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold text-zinc-300">{t('cronReliability')}</h2>
            <div className="overflow-x-auto rounded-xl border border-zinc-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/80">
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">{t('col.endpoint')}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500">{t('col.runs')}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500">{t('col.failures')}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500">{t('col.failRate')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cronReliability.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-xs text-zinc-500">
                        {t('noCronData')}
                      </td>
                    </tr>
                  )}
                  {data.cronReliability.map((c, idx) => (
                    <tr
                      key={c.endpoint}
                      className={idx % 2 === 0 ? 'bg-zinc-900/40' : 'bg-zinc-900/20'}
                    >
                      <td className="px-4 py-2.5 font-mono text-xs text-zinc-300">{c.endpoint}</td>
                      <td className="px-4 py-2.5 text-right text-zinc-400">{c.runs}</td>
                      <td className="px-4 py-2.5 text-right text-zinc-400">{c.failures}</td>
                      <td className={`px-4 py-2.5 text-right ${reliabilityColor(c.failures, c.runs)}`}>
                        {c.runs > 0 ? pct(c.failures / c.runs) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
