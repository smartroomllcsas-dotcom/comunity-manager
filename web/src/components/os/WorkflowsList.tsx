'use client';

import { useState } from 'react';
import { GitFork, DollarSign, Layers, X, ChevronRight } from 'lucide-react';
import type { Workflow, WorkflowStep } from '@/lib/os/schemas/workflow';

// ── WorkflowMap (SVG, no d3 dep) ─────────────────────────────────────────────

const KIND_COLOR: Record<WorkflowStep['kind'], string> = {
  trigger:   'var(--ok)',
  condition: 'var(--warn)',
  action:    'var(--os-accent)',
  wait:      'var(--text-3)',
  branch:    '#a78bfa',
};

const NODE_W = 120;
const NODE_H = 36;
const GAP_X  = 60;
const GAP_Y  = 56;
const PAD    = 24;

function layoutNodes(steps: WorkflowStep[]) {
  // Simple left-to-right topological layout
  const indexMap = new Map(steps.map((s, i) => [s.id, i]));
  const col: number[] = new Array(steps.length).fill(0);
  const row: number[] = new Array(steps.length).fill(0);

  // Compute columns via BFS from roots
  const inDegree = new Map(steps.map((s) => [s.id, 0]));
  for (const s of steps) {
    if (s.next)    inDegree.set(s.next,    (inDegree.get(s.next)    ?? 0) + 1);
    if (s.onError) inDegree.set(s.onError, (inDegree.get(s.onError) ?? 0) + 1);
  }
  const queue: string[] = steps.filter((s) => (inDegree.get(s.id) ?? 0) === 0).map((s) => s.id);
  while (queue.length) {
    const id = queue.shift()!;
    const i  = indexMap.get(id);
    if (i == null) continue;
    const step = steps[i];
    for (const nid of [step.next, step.onError]) {
      if (!nid) continue;
      const ni = indexMap.get(nid);
      if (ni == null) continue;
      col[ni] = Math.max(col[ni], col[i] + 1);
      queue.push(nid);
    }
  }

  // Assign rows within each column
  const colCount = new Map<number, number>();
  for (let i = 0; i < steps.length; i++) {
    const c = col[i];
    row[i] = colCount.get(c) ?? 0;
    colCount.set(c, row[i] + 1);
  }

  const maxCol = Math.max(0, ...col);
  const maxRow = Math.max(0, ...row);
  const W = PAD * 2 + (maxCol + 1) * NODE_W + maxCol * GAP_X;
  const H = PAD * 2 + (maxRow + 1) * NODE_H + maxRow * GAP_Y;

  const nodes = steps.map((s, i) => ({
    step: s,
    x: PAD + col[i] * (NODE_W + GAP_X),
    y: PAD + row[i] * (NODE_H + GAP_Y),
  }));

  return { nodes, W: Math.max(W, 300), H: Math.max(H, 120) };
}

function WorkflowMap({ steps }: { steps: WorkflowStep[] }) {
  if (steps.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-lg border border-os-border bg-os-surface2">
        <span className="font-mono text-[11px] text-os-dim">No steps defined</span>
      </div>
    );
  }

  const { nodes, W, H } = layoutNodes(steps);
  const nodeMap = new Map(nodes.map((n) => [n.step.id, n]));

  const edges: { x1: number; y1: number; x2: number; y2: number; error: boolean }[] = [];
  for (const n of nodes) {
    for (const [targetId, isError] of [[n.step.next, false], [n.step.onError, true]] as [string | null | undefined, boolean][]) {
      if (!targetId) continue;
      const t = nodeMap.get(targetId);
      if (!t) continue;
      edges.push({
        x1: n.x + NODE_W,
        y1: n.y + NODE_H / 2,
        x2: t.x,
        y2: t.y + NODE_H / 2,
        error: isError,
      });
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-os-border bg-os-surface2 p-2">
      <svg width={W} height={H} style={{ display: 'block' }}>
        {edges.map((e, i) => (
          <path
            key={i}
            d={`M${e.x1},${e.y1} C${e.x1 + GAP_X / 2},${e.y1} ${e.x2 - GAP_X / 2},${e.y2} ${e.x2},${e.y2}`}
            fill="none"
            stroke={e.error ? 'var(--err, #f87171)' : 'var(--os-border-strong, #444)'}
            strokeWidth={1.5}
            strokeDasharray={e.error ? '4 3' : undefined}
          />
        ))}
        {nodes.map(({ step, x, y }) => (
          <g key={step.id}>
            <rect
              x={x} y={y} width={NODE_W} height={NODE_H}
              rx={6}
              fill="var(--os-surface, #1a1a1a)"
              stroke={KIND_COLOR[step.kind]}
              strokeWidth={1.5}
            />
            <text
              x={x + NODE_W / 2} y={y + NODE_H / 2 - 6}
              textAnchor="middle"
              fill={KIND_COLOR[step.kind]}
              fontSize={8}
              fontFamily="monospace"
              textLength={Math.min(step.kind.length * 6, NODE_W - 16)}
              lengthAdjust="spacingAndGlyphs"
            >
              {step.kind.toUpperCase()}
            </text>
            <text
              x={x + NODE_W / 2} y={y + NODE_H / 2 + 8}
              textAnchor="middle"
              fill="var(--os-text, #e5e5e5)"
              fontSize={10}
              fontFamily="monospace"
              textLength={Math.min(step.label.length * 6.5, NODE_W - 16)}
              lengthAdjust="spacingAndGlyphs"
            >
              {step.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ── WorkflowCard ──────────────────────────────────────────────────────────────

function WorkflowCard({ wf, onOpen }: { wf: Workflow; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="group flex w-full flex-col gap-2 rounded-lg border border-os-border bg-os-surface p-4 text-left transition-colors hover:border-os-border-strong hover:bg-os-surface2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[13px] font-semibold text-os-text group-hover:text-white">
            {wf.name}
          </p>
          {wf.subtitle && (
            <p className="mt-0.5 truncate text-[11px] text-os-dim">{wf.subtitle}</p>
          )}
        </div>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-os-dim transition-colors group-hover:text-os-text" />
      </div>
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1 font-mono text-[11px] text-os-dim">
          <Layers className="h-3 w-3" />
          {wf.steps.length} step{wf.steps.length !== 1 ? 's' : ''}
        </span>
        {wf.revenueUsd > 0 && (
          <span className="flex items-center gap-1 font-mono text-[11px] text-os-dim">
            <DollarSign className="h-3 w-3" />
            {wf.revenueUsd.toLocaleString()}
          </span>
        )}
      </div>
    </button>
  );
}

// ── WorkflowDetail panel ──────────────────────────────────────────────────────

function WorkflowDetail({ wf, onClose }: { wf: Workflow; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-os-border-strong bg-os-surface"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-os-border px-5 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <GitFork className="h-4 w-4 shrink-0 text-os-accent" />
            <span className="truncate font-mono text-[13px] font-semibold text-os-text">{wf.name}</span>
            {wf.subtitle && (
              <span className="hidden truncate font-mono text-[11px] text-os-dim sm:block">· {wf.subtitle}</span>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 text-os-dim transition-colors hover:text-os-text">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4 space-y-4">
          {/* Meta */}
          <div className="flex gap-4 font-mono text-[11px] text-os-dim">
            <span className="flex items-center gap-1">
              <Layers className="h-3 w-3" />
              {wf.steps.length} step{wf.steps.length !== 1 ? 's' : ''}
            </span>
            {wf.revenueUsd > 0 && (
              <span className="flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                ${wf.revenueUsd.toLocaleString()}
              </span>
            )}
          </div>

          {/* Graph */}
          <WorkflowMap steps={wf.steps} />

          {/* Steps table */}
          {wf.steps.length > 0 && (
            <div>
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-os-dim">Steps</p>
              <div className="divide-y divide-os-border rounded-lg border border-os-border overflow-hidden">
                {wf.steps.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 bg-os-surface2 px-3 py-2">
                    <span
                      className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase"
                      style={{ background: KIND_COLOR[s.kind] + '22', color: KIND_COLOR[s.kind] }}
                    >
                      {s.kind}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-os-text">{s.label}</span>
                    <span className="shrink-0 font-mono text-[10px] text-os-dim">{s.id}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Editor deferred notice */}
          <p className="rounded-lg border border-os-border bg-os-surface2 px-4 py-3 font-mono text-[11px] text-os-dim">
            Editor visual → Sprint 3. Por ahora insertar vía SQL o{' '}
            <code className="rounded bg-os-surface px-1 text-os-accent">POST /api/os/workflows</code>.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── WorkflowsList (exported) ──────────────────────────────────────────────────

export function WorkflowsList({ workflows }: { workflows: Workflow[] }) {
  const [selected, setSelected] = useState<Workflow | null>(null);

  if (workflows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-os-border bg-os-surface py-16 text-center">
        <GitFork className="h-8 w-8 text-os-dim" strokeWidth={1.4} />
        <p className="font-mono text-[13px] text-os-muted">No workflows.</p>
        <p className="max-w-sm font-mono text-[11px] text-os-dim">
          Sprint 3 traerá el editor visual — mientras, insertar manualmente vía SQL o{' '}
          <code className="rounded bg-os-surface2 px-1 text-os-accent">POST /api/os/workflows</code>.
        </p>
      </div>
    );
  }

  const sorted = [...workflows].sort((a, b) => a.ord - b.ord || a.name.localeCompare(b.name));

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sorted.map((wf) => (
          <WorkflowCard key={wf.id} wf={wf} onOpen={() => setSelected(wf)} />
        ))}
      </div>
      {selected && <WorkflowDetail wf={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
