import { getTranslations } from 'next-intl/server';
import { getOSRepositoryForRequest, requireOrgIdFromRequest } from '@/lib/os/server';
import { BrainCore } from '@/components/os/brain/BrainCore';
import { NeuralGraph } from '@/components/os/brain/NeuralGraph';
import type { KnowledgeNode } from '@/lib/os/schemas/knowledge-node';
import type { KnowledgeEdge } from '@/lib/os/schemas/knowledge-edge';
import type { KnowledgeKind } from '@/lib/os/schemas/knowledge-kind';
import Link from 'next/link';

export default async function BrainPage() {
  const t = await getTranslations('os.brain');

  let nodes: KnowledgeNode[] = [];
  let edges: KnowledgeEdge[] = [];
  let kinds: KnowledgeKind[] = [];

  try {
    const orgId = await requireOrgIdFromRequest();
    const repo  = await getOSRepositoryForRequest();

    [nodes, kinds] = await Promise.all([
      repo.knowledge.nodes.all(orgId),
      repo.knowledge.kinds.all(orgId),
    ]);

    if (nodes.length > 0) {
      // Fetch edges for first 100 nodes to keep payload bounded
      const edgeSets = await Promise.all(
        nodes.slice(0, 100).map(n => repo.knowledge.edges.forNode(orgId, n.id)),
      );
      // Dedup by edge id
      const seen = new Set<number>();
      for (const set of edgeSets) {
        for (const e of set) {
          if (!seen.has(e.id)) { seen.add(e.id); edges.push(e); }
        }
      }
    }
  } catch {
    // Unauthenticated in dev — render empty state
  }

  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('title')}</h1>
          <p className="page-sub">{t('subtitle')}</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {nodes.length > 0 && (
            <span className="text-sm text-zinc-400">
              {t('nodeCount', { count: nodes.length })}
            </span>
          )}
          <Link href="/os/brain/kinds" className="btn btn-sm">
            Manage kinds
          </Link>
        </div>
      </div>

      {nodes.length === 0 ? (
        <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
          <p className="text-sm text-zinc-400">{t('emptyState')}</p>
          <code className="mt-2 inline-block rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
            POST /api/os/brain/ingest
          </code>
        </div>
      ) : (
        <>
          <section className="mt-6">
            <BrainCore nodes={nodes} />
          </section>
          <section className="mt-8">
            <NeuralGraph nodes={nodes} edges={edges} kinds={kinds} />
          </section>
        </>
      )}
    </main>
  );
}
