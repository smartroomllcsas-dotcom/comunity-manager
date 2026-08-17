/**
 * OS · Integrations — honest-status connections board.
 * Server Component: probes all connectors at render time.
 *
 * FounderOS parity (2026-08-16):
 *  - Category grouping (Payments · Messaging · Analytics · Storage · Dev · Other)
 *  - Extended ConnectionCard (config summary + reconnect CTA)
 *  - API Keys management panel (masked + rotate placeholder)
 */
import { getTranslations } from 'next-intl/server';
import { requireOrgIdFromRequest } from '@/lib/os/server';
import { probeAll, connectorRegistry } from '@/lib/os/connectors';
import type { ConnectorAdapter, ProbeEntry } from '@/lib/os/connectors';
import { ConnectionCard } from '@/components/os/integrations/ConnectionCard';
import { ApiKeys } from '@/components/os/integrations/ApiKeys';

// ---------------------------------------------------------------------------
// Category taxonomy
// ---------------------------------------------------------------------------

type Category = 'Payments' | 'Messaging' | 'Analytics' | 'Storage' | 'Dev' | 'Other';

const CATEGORY_ORDER: Category[] = ['Messaging', 'Payments', 'Analytics', 'Storage', 'Dev', 'Other'];

function categorize(adapter: ConnectorAdapter): Category {
  const id = adapter.id.toLowerCase();
  const kind = String(adapter.kind).toLowerCase();

  if (['stripe', 'wise', 'paypal'].some((k) => id.includes(k))) return 'Payments';
  if (
    ['meta', 'waha', 'instagram', 'slack', 'whatsapp', 'gmail'].some((k) => id.includes(k)) ||
    ['channel', 'inbox', 'messaging', 'email'].includes(kind)
  ) return 'Messaging';
  if (['analytics', 'ga', 'mixpanel', 'posthog'].some((k) => id.includes(k))) return 'Analytics';
  if (['notion', 'drive', 'dropbox', 'storage', 's3'].some((k) => id.includes(k))) return 'Storage';
  if (['webhook', 'cron', 'github', 'vercel'].some((k) => id.includes(k))) return 'Dev';
  return 'Other';
}

const GRID = 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function OsIntegrationsPage() {
  const t = await getTranslations('os.integrations');

  let entries: ProbeEntry[] = [];
  try {
    const orgId = await requireOrgIdFromRequest();
    entries = await probeAll(orgId);
  } catch {
    entries = connectorRegistry.map((adapter) => ({
      adapter,
      result: { status: 'not_configured' as const },
    }));
  }

  // Bucket by category
  const buckets = new Map<Category, ProbeEntry[]>();
  for (const cat of CATEGORY_ORDER) buckets.set(cat, []);
  for (const entry of entries) {
    buckets.get(categorize(entry.adapter))!.push(entry);
  }

  const connectedCount = entries.filter((e) => e.result.status === 'live' || e.result.status === 'configured').length;
  const checkedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <main className="content">
      {/* Page header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('title')}</h1>
          <p className="page-sub">
            Live status of all connected services · {connectedCount}/{entries.length} active
          </p>
        </div>
      </div>

      {/* Category summary strip (server-rendered anchors) */}
      <section className="mt-5 flex flex-wrap gap-2">
        {CATEGORY_ORDER.filter((cat) => (buckets.get(cat)?.length ?? 0) > 0).map((cat) => {
          const list = buckets.get(cat) ?? [];
          return (
            <a
              key={cat}
              href={`#cat-${cat.toLowerCase()}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900/60 px-3 py-1 text-xs font-medium text-zinc-300 ring-1 ring-zinc-800 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            >
              <span>{cat}</span>
              <span className="inline-flex min-w-[1.25rem] justify-center rounded-full bg-zinc-800 px-1 text-[10px] font-semibold text-zinc-500">
                {list.length}
              </span>
            </a>
          );
        })}
      </section>

      {/* Grouped grids */}
      {CATEGORY_ORDER.map((cat) => {
        const list = buckets.get(cat) ?? [];
        if (list.length === 0) return null;
        return (
          <section key={cat} id={`cat-${cat.toLowerCase()}`} className="mt-8">
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
              {cat} · <span className="text-zinc-600">{list.length}</span>
            </h2>
            <div className={GRID}>
              {list.map(({ adapter, result }) => (
                <ConnectionCard key={adapter.id} adapter={adapter} result={result} checkedAt={checkedAt} />
              ))}
            </div>
          </section>
        );
      })}

      {/* API Keys management */}
      <section className="mt-10">
        <ApiKeys />
      </section>
    </main>
  );
}
