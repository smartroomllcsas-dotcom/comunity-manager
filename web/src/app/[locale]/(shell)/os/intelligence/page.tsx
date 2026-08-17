/**
 * OS · Intelligence — 3-column dashboard combining Brain graph + AI signals
 * (LLM usage/cost from os_agent_runs) + recent insights.
 */
import { getOSRepositoryForRequest, requireOrgIdFromRequest } from '@/lib/os/server';
import { BrainCore } from '@/components/os/brain/BrainCore';
import { NeuralGraph } from '@/components/os/brain/NeuralGraph';
import { EmptyState } from '@/components/os/EmptyState';
import type { KnowledgeNode } from '@/lib/os/schemas/knowledge-node';
import type { KnowledgeEdge } from '@/lib/os/schemas/knowledge-edge';
import type { KnowledgeKind } from '@/lib/os/schemas/knowledge-kind';
import { BrainCircuit, Zap, Activity } from 'lucide-react';

interface AgentRunSummary {
  totalRuns: number;
  totalTokens: number;
  estimatedCostUsd: number;
  successRate: number;
  recent: Array<{ id: string; agent: string; at: string; tokens?: number; ok?: boolean | null }>;
}

async function loadSignals(): Promise<AgentRunSummary> {
  try {
    const orgId = await requireOrgIdFromRequest();
    const repo = await getOSRepositoryForRequest();
    // Repo may not have a dedicated agent-runs accessor — fall back to activity feed
    // as a graceful shim so the panel renders without runtime errors.
    const activity = await repo.activity.recent(orgId, 20).catch(() => [] as any[]);
    const runs = (activity ?? []).filter((a: any) => a?.kind?.includes?.('agent'));
    return {
      totalRuns: runs.length,
      totalTokens: runs.reduce((s: number, r: any) => s + (r?.payload?.tokens ?? 0), 0),
      estimatedCostUsd: runs.reduce((s: number, r: any) => s + (r?.payload?.cost_usd ?? 0), 0),
      successRate:
        runs.length > 0
          ? runs.filter((r: any) => r.ok !== false).length / runs.length
          : 0,
      recent: runs.slice(0, 5).map((r: any) => ({
        id: String(r.id ?? Math.random()),
        agent: r?.payload?.agent ?? r?.kind ?? 'agent',
        at: r?.at ?? new Date().toISOString(),
        tokens: r?.payload?.tokens,
        ok: r?.ok ?? null,
      })),
    };
  } catch {
    return { totalRuns: 0, totalTokens: 0, estimatedCostUsd: 0, successRate: 0, recent: [] };
  }
}

async function loadBrain() {
  let nodes: KnowledgeNode[] = [];
  let edges: KnowledgeEdge[] = [];
  let kinds: KnowledgeKind[] = [];

  try {
    const orgId = await requireOrgIdFromRequest();
    const repo = await getOSRepositoryForRequest();
    [nodes, kinds] = await Promise.all([
      repo.knowledge.nodes.all(orgId),
      repo.knowledge.kinds.all(orgId),
    ]);
    if (nodes.length > 0) {
      const edgeSets = await Promise.all(
        nodes.slice(0, 100).map((n) => repo.knowledge.edges.forNode(orgId, n.id)),
      );
      const seen = new Set<number>();
      for (const set of edgeSets) {
        for (const e of set) {
          if (!seen.has(e.id)) {
            seen.add(e.id);
            edges.push(e);
          }
        }
      }
    }
  } catch {
    // unauthenticated in dev
  }
  return { nodes, edges, kinds };
}

export default async function IntelligencePage() {
  const [signals, brain] = await Promise.all([loadSignals(), loadBrain()]);

  const hasContent = brain.nodes.length > 0 || signals.totalRuns > 0;

  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">Intelligence</h1>
          <p className="page-sub">Cross-signal dashboard: knowledge, AI usage and recent insights.</p>
        </div>
      </div>

      {!hasContent ? (
        <EmptyState
          icon={BrainCircuit}
          title="Intelligence layer is quiet"
          description="No knowledge nodes ingested and no agent runs recorded yet. Feed the brain to unlock signals."
          action={{ label: 'Open Brain', href: '/os/brain' }}
          secondary={{ label: 'Configure agents', href: '/os/agents' }}
        />
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {/* Column 1 · AI Signals */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <div className="mb-4 flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-zinc-100">AI Signals</h2>
            </div>
            <dl className="space-y-3">
              <div className="flex items-baseline justify-between">
                <dt className="text-xs text-zinc-500">Runs (recent)</dt>
                <dd className="text-lg font-bold text-zinc-100">{signals.totalRuns}</dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="text-xs text-zinc-500">Tokens</dt>
                <dd className="text-lg font-bold text-zinc-100">
                  {signals.totalTokens.toLocaleString()}
                </dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="text-xs text-zinc-500">Est. cost</dt>
                <dd className="text-lg font-bold text-zinc-100">
                  ${signals.estimatedCostUsd.toFixed(2)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="text-xs text-zinc-500">Success</dt>
                <dd className="text-lg font-bold text-emerald-400">
                  {(signals.successRate * 100).toFixed(0)}%
                </dd>
              </div>
            </dl>
          </section>

          {/* Column 2 · Graph */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 lg:col-span-1">
            <div className="mb-4 flex items-center gap-2">
              <BrainCircuit className="h-4 w-4 text-violet-400" />
              <h2 className="text-sm font-semibold text-zinc-100">Knowledge Graph</h2>
              <span className="ml-auto text-[10px] text-zinc-600">{brain.nodes.length} nodes</span>
            </div>
            {brain.nodes.length === 0 ? (
              <p className="text-xs text-zinc-500">No nodes yet.</p>
            ) : (
              <>
                <BrainCore nodes={brain.nodes} />
                <div className="mt-4 h-64 overflow-hidden rounded-lg border border-zinc-800/60">
                  <NeuralGraph nodes={brain.nodes} edges={brain.edges} kinds={brain.kinds} />
                </div>
              </>
            )}
          </section>

          {/* Column 3 · Recent insights */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <div className="mb-4 flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-zinc-100">Recent insights</h2>
            </div>
            {signals.recent.length === 0 ? (
              <p className="text-xs text-zinc-500">No agent runs recorded.</p>
            ) : (
              <ul className="space-y-2">
                {signals.recent.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-2 rounded-md border border-zinc-800/60 bg-zinc-900/60 px-3 py-2"
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        r.ok === false ? 'bg-red-400' : 'bg-emerald-400'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-zinc-200">{r.agent}</p>
                      <p className="text-[10px] text-zinc-500">
                        {new Date(r.at).toLocaleString()}
                      </p>
                    </div>
                    {r.tokens != null && (
                      <span className="text-[10px] text-zinc-600">{r.tokens} tok</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
