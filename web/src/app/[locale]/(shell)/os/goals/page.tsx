import { getTranslations } from 'next-intl/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Target } from 'lucide-react';
import { createSupabaseRepository } from '@/lib/os/adapters/supabase';
import type { Goal } from '@/lib/os/repository';
import { EmptyState } from '@/components/os/EmptyState';

// ─── helpers ─────────────────────────────────────────────────────────────────

function statusBadge(status: Goal['lastStatus']) {
  if (status === 'ok') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        OK
      </span>
    );
  }
  if (status === 'breach') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-400">
        <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
        Breach
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-700/60 px-2 py-0.5 text-xs font-medium text-zinc-400">
      <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
      Unknown
    </span>
  );
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function OsGoalsPage() {
  const t = await getTranslations('os.goals');

  // ── resolve orgId ──────────────────────────────────────────────────────────
  // Sprint 1: read first org from env. Sprint 2: derive from session/auth.
  const orgId = (process.env.LEONEL_ORG_IDS || '').split(',').filter(Boolean)[0];

  let goals: Goal[] = [];

  if (orgId) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {},
        },
      },
    );
    const repo = createSupabaseRepository(supabase);
    try {
      goals = await repo.goals.all(orgId);
    } catch {
      // render empty state on DB errors
    }
  }

  return (
    <main className="content">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('title')}</h1>
          <div className="page-sub">
            Sentinel corre cada 15 min · {goals.length} objetivos registrados
          </div>
        </div>
      </div>

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {goals.length === 0 && (
        <EmptyState
          icon={Target}
          title="Define tu primer objetivo"
          description="Los objetivos se evalúan cada 15 min. Si una métrica se sale del rango (SLA de respuesta, budget diario, alcance), el sentinel notifica y escalata según tu política."
          action={{ label: 'Crear objetivo', href: '/es/os/goals/new' }}
          secondary={{ label: 'Ver ejemplos', href: '/es/os/reference' }}
        />
      )}

      {/* ── Goals grid ───────────────────────────────────────────────────── */}
      {goals.length > 0 && (
        <div className="goals-grid mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((g) => {
            const predKey = (g.spec as Record<string, unknown>)?.predicateKey as string | undefined;
            return (
              <article
                key={g.id}
                className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5"
              >
                {/* title + badge */}
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-sm font-semibold leading-snug text-zinc-100">
                    {g.title}
                  </h2>
                  {statusBadge(g.lastStatus)}
                </div>

                {/* predicate key */}
                {predKey && (
                  <code className="rounded bg-zinc-800 px-2 py-1 font-mono text-xs text-zinc-400">
                    {predKey}
                  </code>
                )}

                {/* cadence */}
                <div className="text-xs text-zinc-500">
                  Cadencia:{' '}
                  <span className="text-zinc-400">{g.cadence}</span>
                </div>

                {/* last check */}
                <div className="text-xs text-zinc-500">
                  Último check:{' '}
                  <span className="text-zinc-400">
                    {formatDate(g.lastCheckedAt)}
                  </span>
                </div>

                {/* evidence on breach */}
                {g.lastStatus === 'breach' && Boolean(g.lastEvidence) && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-red-400 hover:text-red-300">
                      Ver evidencia
                    </summary>
                    <pre className="mt-2 overflow-x-auto rounded bg-red-950/40 p-2 text-xs text-red-300">
                      {JSON.stringify(g.lastEvidence, null, 2)}
                    </pre>
                  </details>
                )}
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
