'use client';

/**
 * Workflow map — horizontal chain of workflow steps for the selected workflow.
 *
 * Adapted from FounderOS-DEMO/components/WorkflowMap.tsx for the CM Workflow
 * schema (see @/lib/os/schemas/workflow): steps use `kind` (trigger, condition,
 * action, wait, branch) rather than owner/tools/leak. Each step renders with a
 * kind-tinted card. Config-declared tools (e.g. `config.tool = "slack"`) get a
 * ToolBrandLogo chip.
 *
 * Client component: local state for the selected workflow. No d3, no data-fetch —
 * accepts server-loaded workflows via props.
 */
import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Zap,
  GitBranch,
  Play,
  Clock,
  ShieldQuestion,
  ChevronRight,
  Plus,
  DollarSign,
  Layers,
} from 'lucide-react';
import type { Workflow, WorkflowStep } from '@/lib/os/schemas/workflow';
import { ToolBrandLogo } from './ToolBrandLogo';

// ── kind visuals ────────────────────────────────────────────────────────────

type StepKind = WorkflowStep['kind'];

const KIND_COLOR: Record<StepKind, string> = {
  trigger: 'var(--ok)',
  condition: 'var(--warn)',
  action: 'var(--os-accent, oklch(70% 0.14 250))',
  wait: 'var(--text-3)',
  branch: '#a78bfa',
};

const KIND_ICON: Record<StepKind, ReactNode> = {
  trigger: <Play className="h-3 w-3" />,
  condition: <ShieldQuestion className="h-3 w-3" />,
  action: <Zap className="h-3 w-3" />,
  wait: <Clock className="h-3 w-3" />,
  branch: <GitBranch className="h-3 w-3" />,
};

// ── helpers ─────────────────────────────────────────────────────────────────

function usd(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return `$${Math.round(n)}`;
}

/** Best-effort extraction of tool ids from a step's config. */
function extractTools(step: WorkflowStep): string[] {
  const cfg = step.config ?? {};
  const t = cfg['tool'] ?? cfg['tools'] ?? cfg['channel'] ?? cfg['provider'];
  if (typeof t === 'string') return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string');
  return [];
}

// ── sub-components ──────────────────────────────────────────────────────────

function StepCard({ step }: { step: WorkflowStep }) {
  const color = KIND_COLOR[step.kind];
  const tools = extractTools(step);
  return (
    <div
      className="relative flex w-[224px] shrink-0 flex-col gap-2 rounded-xl border p-3"
      style={{
        borderColor: `color-mix(in oklab, ${color} 40%, var(--border, #333))`,
        background: `color-mix(in oklab, ${color} 6%, var(--surface, transparent))`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-semibold leading-tight" style={{ color: 'var(--text-1, currentColor)' }}>
          {step.label || step.id}
        </span>
        <span
          className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide"
          style={{
            background: `color-mix(in oklab, ${color} 18%, transparent)`,
            color,
          }}
        >
          {KIND_ICON[step.kind]}
          {step.kind}
        </span>
      </div>

      {tools.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tools.map((t) => (
            <span
              key={t}
              className="flex items-center gap-1 rounded-md border py-0.5 pl-0.5 pr-1.5 font-mono text-[9px]"
              style={{ borderColor: 'var(--border, #333)', color: 'var(--text-3, #999)' }}
            >
              <ToolBrandLogo slug={t} size={12} />
              {t}
            </span>
          ))}
        </div>
      )}

      {step.onError && (
        <div
          className="mt-0.5 rounded-md border px-2 py-1 font-mono text-[9px] uppercase tracking-wide"
          style={{ borderColor: 'var(--border, #333)', color: 'var(--warn, #f59e0b)' }}
        >
          on error → {step.onError}
        </div>
      )}
    </div>
  );
}

function Edge({ label }: { label: string | null }) {
  return (
    <div className="flex min-w-[58px] shrink-0 flex-col items-center justify-center px-1">
      {label && (
        <span
          className="mb-1 whitespace-nowrap font-mono text-[9px] uppercase tracking-wide"
          style={{ color: 'var(--os-accent, oklch(70% 0.14 250))' }}
        >
          {label}
        </span>
      )}
      <div className="flex w-full items-center">
        <span className="h-px flex-1" style={{ background: 'var(--border, #333)' }} />
        <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--text-3, #666)' }} />
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="shrink-0">
      <div className="font-mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-3, #666)' }}>
        {label}
      </div>
      <div className="font-mono text-[15px] font-semibold" style={{ color: 'var(--text-1, currentColor)' }}>
        {value}
      </div>
      {sub && (
        <div className="font-mono text-[9px]" style={{ color: 'var(--text-3, #666)' }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── main ────────────────────────────────────────────────────────────────────

export function WorkflowMap({ workflows }: { workflows: Workflow[] }) {
  const [selectedId, setSelectedId] = useState(workflows[0]?.id ?? '');
  const current = workflows.find((w) => w.id === selectedId) ?? workflows[0];

  const stats = useMemo(() => {
    if (!current) return null;
    const toolSet = new Set<string>();
    const kindCount: Record<StepKind, number> = { trigger: 0, condition: 0, action: 0, wait: 0, branch: 0 };
    for (const s of current.steps) {
      kindCount[s.kind] += 1;
      for (const t of extractTools(s)) toolSet.add(t);
    }
    return {
      stepCount: current.steps.length,
      toolCount: toolSet.size,
      kindCount,
    };
  }, [current]);

  if (!current || !stats) {
    return (
      <div
        className="rounded-xl border border-dashed px-4 py-10 text-center text-xs"
        style={{ borderColor: 'var(--border, #333)', color: 'var(--text-3, #666)' }}
      >
        No hay workflows aún.{' '}
        <Link href="/os/workflows/new" className="underline">
          Crear el primero
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* workflow selector + builder actions */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {workflows.map((w) => {
          const on = w.id === selectedId;
          return (
            <button
              key={w.id}
              onClick={() => setSelectedId(w.id)}
              className="rounded-md border px-3 py-1.5 font-mono text-[11px] transition-colors"
              style={{
                borderColor: on ? 'var(--os-accent, oklch(70% 0.14 250))' : 'var(--border, #333)',
                color: on ? 'var(--os-accent, oklch(70% 0.14 250))' : 'var(--text-3, #999)',
              }}
            >
              {w.name}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href={`/os/workflows/${current.id}/edit`}
            className="flex items-center gap-1 rounded-md border px-2.5 py-1.5 font-mono text-[11px] transition-colors"
            style={{ borderColor: 'var(--border, #333)', color: 'var(--text-2, currentColor)' }}
          >
            Edit
          </Link>
          <Link
            href="/os/workflows/new"
            className="flex items-center gap-1 rounded-md border px-2.5 py-1.5 font-mono text-[11px] transition-colors"
            style={{
              borderColor: 'var(--os-accent, oklch(70% 0.14 250))',
              color: 'var(--os-accent, oklch(70% 0.14 250))',
            }}
          >
            <Plus className="h-3 w-3" /> New Workflow
          </Link>
        </div>
      </div>

      {current.subtitle && (
        <div className="mb-3 font-mono text-[11px]" style={{ color: 'var(--text-3, #666)' }}>
          {current.subtitle}
        </div>
      )}

      {/* legend */}
      <div
        className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[9.5px] uppercase tracking-wide"
        style={{ color: 'var(--text-3, #666)' }}
      >
        <span>legend</span>
        {(Object.keys(KIND_COLOR) as StepKind[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5" style={{ color: KIND_COLOR[k] }}>
            {KIND_ICON[k]} {k}
          </span>
        ))}
      </div>

      {/* the map */}
      <div className="overflow-x-auto pb-3">
        {current.steps.length === 0 ? (
          <div
            className="rounded-xl border border-dashed px-4 py-6 text-center text-xs"
            style={{ borderColor: 'var(--border, #333)', color: 'var(--text-3, #666)' }}
          >
            Sin steps.{' '}
            <Link href={`/os/workflows/${current.id}/edit`} className="underline">
              Añadir el primero
            </Link>
          </div>
        ) : (
          <div className="flex items-center">
            {current.steps.map((step, i) => (
              <div key={step.id} className="flex items-stretch">
                <StepCard step={step} />
                {i < current.steps.length - 1 && <Edge label={step.next ? '→' : null} />}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* bottom stats */}
      <div
        className="mt-3 flex flex-wrap items-center gap-x-7 gap-y-3 rounded-xl border px-4 py-3.5"
        style={{ borderColor: 'var(--border, #333)', background: 'var(--surface, transparent)' }}
      >
        <div className="min-w-0 shrink-0">
          <div className="text-[12.5px] font-semibold" style={{ color: 'var(--text-1, currentColor)' }}>
            {current.name}
          </div>
          <div className="flex items-center gap-1 font-mono text-[10px]" style={{ color: 'var(--text-3, #666)' }}>
            <DollarSign className="h-3 w-3" /> {usd(current.revenueUsd)}/mo revenue
          </div>
        </div>
        <Stat label="Steps" value={String(stats.stepCount)} />
        <Stat label="Tools" value={String(stats.toolCount)} />
        <div
          className="ml-auto flex shrink-0 items-center gap-3 font-mono text-[10px]"
          style={{ color: 'var(--text-3, #666)' }}
        >
          {(Object.keys(stats.kindCount) as StepKind[]).map((k) =>
            stats.kindCount[k] > 0 ? (
              <span key={k} className="flex items-center gap-1" style={{ color: KIND_COLOR[k] }}>
                <Layers className="h-3 w-3" /> {stats.kindCount[k]} {k}
              </span>
            ) : null
          )}
        </div>
      </div>
    </div>
  );
}
