'use client';

import type { KnowledgeNode, NodeKind } from '@/lib/os/schemas/knowledge-node';

const KIND_COLORS: Record<NodeKind, string> = {
  contact:  'bg-blue-500/20 text-blue-300 border-blue-500/30',
  topic:    'bg-violet-500/20 text-violet-300 border-violet-500/30',
  decision: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  event:    'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  tag:      'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
  custom:   'bg-rose-500/20 text-rose-300 border-rose-500/30',
};

interface BrainCoreProps {
  nodes: KnowledgeNode[];
}

export function BrainCore({ nodes }: BrainCoreProps) {
  // Group nodes by kind
  const byKind = nodes.reduce<Record<string, KnowledgeNode[]>>((acc, n) => {
    (acc[n.kind] ??= []).push(n);
    return acc;
  }, {});

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {(Object.entries(byKind) as [NodeKind, KnowledgeNode[]][]).map(([kind, items]) => (
        <div
          key={kind}
          className={`rounded-lg border px-4 py-3 ${KIND_COLORS[kind]}`}
        >
          <p className="text-xs font-medium uppercase tracking-widest opacity-70">{kind}</p>
          <p className="mt-1 text-2xl font-bold">{items.length}</p>
          <p className="mt-0.5 truncate text-xs opacity-60">
            {items[0]?.label ?? '—'}
            {items.length > 1 ? ` +${items.length - 1}` : ''}
          </p>
        </div>
      ))}
    </div>
  );
}
