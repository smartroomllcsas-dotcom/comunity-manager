/**
 * OS · System — health, feature flags, danger zone.
 */
import { Server, Flag, AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

interface HealthSnapshot {
  nextVersion: string;
  supabaseUrl: string;
  lastMigration: string | null;
  serverReachable: boolean | null;
  serverLatencyMs?: number;
  timestamp: string;
}

function maskUrl(url: string | undefined): string {
  if (!url) return 'not-set';
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname.slice(0, 8)}••••${u.hostname.slice(-4)}`;
  } catch {
    return url.slice(0, 12) + '••••';
  }
}

async function loadHealth(): Promise<HealthSnapshot> {
  const nextVersion = (() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('next/package.json').version as string;
    } catch {
      return 'unknown';
    }
  })();

  let serverReachable: boolean | null = null;
  let serverLatencyMs: number | undefined;
  try {
    const start = Date.now();
    const res = await fetch('http://100.103.216.114:8092/health', {
      signal: AbortSignal.timeout(1500),
      cache: 'no-store',
    }).catch(() => null);
    serverLatencyMs = Date.now() - start;
    serverReachable = res != null && res.ok;
  } catch {
    serverReachable = false;
  }

  return {
    nextVersion,
    supabaseUrl: maskUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
    lastMigration: process.env.LAST_MIGRATION ?? null,
    serverReachable,
    serverLatencyMs,
    timestamp: new Date().toISOString(),
  };
}

// Flags surfaced from src/lib/flags.ts — extend when new flags are added.
const KNOWN_FLAGS: Array<{ key: string; description: string; enabled: boolean }> = [
  { key: 'community-os', description: 'Community OS shell (cohort-gated)', enabled: true },
];

export default async function SystemPage() {
  const health = await loadHealth();

  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">System</h1>
          <p className="page-sub">Health, feature flags and destructive operations.</p>
        </div>
      </div>

      {/* System Health */}
      <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Server className="h-4 w-4 text-blue-400" />
          <h2 className="text-sm font-semibold text-zinc-100">System Health</h2>
          <span className="ml-auto text-[10px] text-zinc-600">
            Checked {new Date(health.timestamp).toLocaleTimeString()}
          </span>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/60 p-3">
            <dt className="text-[10px] uppercase tracking-wider text-zinc-500">Next.js</dt>
            <dd className="mt-1 text-sm font-semibold text-zinc-100">v{health.nextVersion}</dd>
          </div>
          <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/60 p-3">
            <dt className="text-[10px] uppercase tracking-wider text-zinc-500">Supabase</dt>
            <dd className="mt-1 truncate font-mono text-xs text-zinc-300">{health.supabaseUrl}</dd>
          </div>
          <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/60 p-3">
            <dt className="text-[10px] uppercase tracking-wider text-zinc-500">Last migration</dt>
            <dd className="mt-1 truncate font-mono text-xs text-zinc-300">
              {health.lastMigration ?? '—'}
            </dd>
          </div>
          <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/60 p-3">
            <dt className="text-[10px] uppercase tracking-wider text-zinc-500">Server (tailnet)</dt>
            <dd className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  health.serverReachable === true
                    ? 'bg-emerald-400'
                    : health.serverReachable === false
                    ? 'bg-red-400'
                    : 'bg-zinc-500'
                }`}
              />
              <span className="text-zinc-100">
                {health.serverReachable === true
                  ? `up · ${health.serverLatencyMs}ms`
                  : health.serverReachable === false
                  ? 'unreachable'
                  : 'unknown'}
              </span>
            </dd>
          </div>
        </dl>
      </section>

      {/* Feature Flags */}
      <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Flag className="h-4 w-4 text-violet-400" />
          <h2 className="text-sm font-semibold text-zinc-100">Feature Flags</h2>
          <span className="ml-auto rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">
            read-only
          </span>
        </div>
        <ul className="divide-y divide-zinc-800/60">
          {KNOWN_FLAGS.map((f) => (
            <li key={f.key} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs text-zinc-100">{f.key}</p>
                <p className="text-[11px] text-zinc-500">{f.description}</p>
              </div>
              <span
                className={`inline-flex h-5 w-9 items-center rounded-full ${
                  f.enabled ? 'bg-emerald-500/40' : 'bg-zinc-700'
                } px-0.5 transition-colors`}
                aria-hidden
              >
                <span
                  className={`h-4 w-4 rounded-full bg-white transition-transform ${
                    f.enabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Danger Zone */}
      <section className="mt-6 rounded-xl border border-red-500/30 bg-red-500/5 p-5">
        <div className="mb-4 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <h2 className="text-sm font-semibold text-red-300">Danger Zone</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action="/api/os/system/health" method="post">
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/20 disabled:opacity-60"
              title="Endpoint stub — Sprint 2"
            >
              <Trash2 className="h-3.5 w-3.5" /> Purge cache
            </button>
          </form>
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/20 disabled:opacity-60"
            title="Endpoint stub — Sprint 2"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Rebuild search index
          </button>
        </div>
        <p className="mt-3 text-[11px] text-red-300/60">
          These actions are irreversible. Buttons currently ship disabled — endpoints stubbed for Sprint 2.
        </p>
      </section>
    </main>
  );
}
