/**
 * OS · Integrations — honest-status connections board.
 * Server Component: probes all connectors at render time.
 */
import { getTranslations } from 'next-intl/server';
import { requireOrgIdFromRequest } from '@/lib/os/server';
import { probeAll, connectorRegistry } from '@/lib/os/connectors';
import type { ProbeStatus } from '@/lib/os/connectors/base';

// ---------------------------------------------------------------------------
// Status pill
// ---------------------------------------------------------------------------

const PILL_STYLES: Record<ProbeStatus, string> = {
  live: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30',
  configured: 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30',
  not_configured: 'bg-zinc-700/50 text-zinc-400 ring-1 ring-zinc-600/40',
  error: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30',
};

const PILL_LABELS: Record<ProbeStatus, string> = {
  live: 'Live',
  configured: 'Configured',
  not_configured: 'Not configured',
  error: 'Error',
};

function StatusPill({ status }: { status: ProbeStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PILL_STYLES[status]}`}
    >
      <span
        className={`mr-1 h-1.5 w-1.5 rounded-full ${
          status === 'live'
            ? 'bg-emerald-400'
            : status === 'configured'
            ? 'bg-blue-400'
            : status === 'error'
            ? 'bg-red-400'
            : 'bg-zinc-500'
        }`}
      />
      {PILL_LABELS[status]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function OsIntegrationsPage() {
  const t = await getTranslations('os.integrations');

  // If not authenticated, fall back to all not_configured without crashing
  let entries: Awaited<ReturnType<typeof probeAll>> = [];
  try {
    const orgId = await requireOrgIdFromRequest();
    entries = await probeAll(orgId);
  } catch {
    entries = connectorRegistry.map((adapter) => ({
      adapter,
      result: { status: 'not_configured' as const },
    }));
  }

  return (
    <main className="content">
      {/* Page header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('title')}</h1>
          <p className="page-sub">Live status of all connected services</p>
        </div>
      </div>

      {/* Connections strip */}
      <section className="connections-strip mt-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {entries.map(({ adapter, result }) => (
            <div
              key={adapter.id}
              className="connector-card flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur-sm transition-colors hover:border-zinc-700"
            >
              {/* Header row */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-zinc-100">{adapter.label}</p>
                  <p className="mt-0.5 text-xs text-zinc-500 capitalize">{adapter.kind}</p>
                </div>
                <StatusPill status={result.status} />
              </div>

              {/* Error message */}
              {result.status === 'error' && result.error && (
                <p className="truncate text-xs text-red-400" title={result.error}>
                  {result.error}
                </p>
              )}

              {/* Meta details */}
              {result.meta && Object.keys(result.meta).length > 0 && result.status !== 'error' && (
                <dl className="space-y-0.5">
                  {Object.entries(result.meta)
                    .filter(([k]) => k !== 'note')
                    .slice(0, 2)
                    .map(([k, v]) => (
                      <div key={k} className="flex gap-1 text-xs">
                        <dt className="text-zinc-500 capitalize">
                          {k.replace(/([A-Z])/g, ' $1').toLowerCase()}:
                        </dt>
                        <dd className="truncate text-zinc-300">{String(v)}</dd>
                      </div>
                    ))}
                  {Boolean(result.meta.note) && (
                    <p className="text-xs italic text-zinc-600">{String(result.meta.note)}</p>
                  )}
                </dl>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
