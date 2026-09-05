/**
 * OS · Variants — A/B testing dashboard.
 * `os_experiments` table doesn't exist yet — mock rows show shape.
 */
import Link from 'next/link';
import { EmptyState } from '@/components/os/EmptyState';
import { FlaskConical, Plus } from 'lucide-react';

interface Experiment {
  id: string;
  name: string;
  hypothesis: string;
  sampleSize: number;
  status: 'draft' | 'running' | 'won' | 'lost';
  createdAt: string;
}

// Mock rows — swap for repo.experiments.list(orgId) once the table lands.
const MOCK: Experiment[] = [];

const STATUS_STYLES: Record<Experiment['status'], string> = {
  draft: 'bg-zinc-700/50 text-zinc-400 ring-zinc-600/40',
  running: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  won: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
  lost: 'bg-red-500/15 text-red-400 ring-red-500/30',
};

export default async function VariantsPage() {
  const experiments = MOCK; // TODO: repo.experiments.list(orgId) — Sprint 3

  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">Variants</h1>
          <p className="page-sub">A/B tests, creative variants and multivariate experiments.</p>
        </div>
        <div className="ml-auto">
          <Link
            href="/os/variants/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-400"
          >
            <Plus className="h-3.5 w-3.5" />
            New experiment
          </Link>
        </div>
      </div>

      {experiments.length === 0 ? (
        <EmptyState
          icon={FlaskConical}
          title="No experiments yet"
          description="Run your first A/B test to learn which creative, copy or offer converts best. Experiments unlock CRO signals for the Content agent."
          action={{ label: 'New experiment', href: '/os/variants/new' }}
          secondary={{ label: 'Learn about CRO', href: '/os/reference' }}
        />
      ) : (
        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {experiments.map((exp) => (
            <article
              key={exp.id}
              className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 transition-colors hover:border-zinc-700"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-zinc-100">{exp.name}</h3>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ring-1 ${
                    STATUS_STYLES[exp.status]
                  }`}
                >
                  {exp.status}
                </span>
              </div>
              <p className="text-xs text-zinc-400 line-clamp-3">{exp.hypothesis}</p>
              <div className="mt-2 flex items-center justify-between border-t border-zinc-800/60 pt-2 text-[11px] text-zinc-500">
                <span>Sample: {exp.sampleSize.toLocaleString()}</span>
                <span>{new Date(exp.createdAt).toLocaleDateString()}</span>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
