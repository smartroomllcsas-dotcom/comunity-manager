/**
 * ConnectionCard — extended connector card with config summary,
 * last-checked timestamp and reconnect CTA. Server component (no client state).
 */
import type { ConnectorAdapter, ProbeResult } from '@/lib/os/connectors';
import type { ProbeStatus } from '@/lib/os/connectors/base';

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

interface Props {
  adapter: ConnectorAdapter;
  result: ProbeResult;
  checkedAt?: string;
}

export function ConnectionCard({ adapter, result, checkedAt }: Props) {
  const canReconnect = result.status === 'error' || result.status === 'configured' || result.status === 'live';
  const canConfigure = result.status === 'not_configured';

  return (
    <div className="connector-card flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur-sm transition-colors hover:border-zinc-700">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-100">{adapter.label}</p>
          <p className="mt-0.5 text-xs text-zinc-500 capitalize">{adapter.kind}</p>
        </div>
        <StatusPill status={result.status} />
      </div>

      {/* Error */}
      {result.status === 'error' && result.error && (
        <p className="truncate text-xs text-red-400" title={result.error}>
          {result.error}
        </p>
      )}

      {/* Meta / config summary */}
      {result.meta && Object.keys(result.meta).length > 0 && result.status !== 'error' && (
        <dl className="space-y-0.5">
          {Object.entries(result.meta)
            .filter(([k]) => k !== 'note')
            .slice(0, 3)
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

      {/* Footer: last-checked + actions */}
      <div className="mt-auto flex items-center justify-between pt-2 border-t border-zinc-800/60">
        <span className="text-[10px] text-zinc-600">
          Checked {checkedAt ?? 'just now'}
        </span>
        <div className="flex gap-1.5">
          {canConfigure && (
            <a
              href={`/os/integrations/setup/${adapter.id}`}
              className="rounded-md bg-blue-500/15 px-2 py-0.5 text-[11px] font-medium text-blue-300 ring-1 ring-blue-500/30 hover:bg-blue-500/25"
            >
              Configure
            </a>
          )}
          {canReconnect && (
            <a
              href={`/os/integrations/setup/${adapter.id}?reconnect=1`}
              className="rounded-md bg-zinc-800/80 px-2 py-0.5 text-[11px] font-medium text-zinc-300 ring-1 ring-zinc-700 hover:bg-zinc-700/80"
            >
              Reconnect
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
