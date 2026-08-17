'use client';

import { useMemo } from 'react';
import type { Agent, Connector, Goal } from '@/lib/os/repository';

interface HomeSocialGraphProps {
  agents: Agent[];
  connectors: Connector[];
  goals: Goal[];
}

interface Node {
  id: string;
  label: string;
  x: number;
  y: number;
  radius: number;
  tone: 'accent' | 'ok' | 'warn' | 'err' | 'dim';
  kind: 'agent' | 'connector' | 'goal' | 'hub';
}

interface Edge {
  from: string;
  to: string;
  strength: number;
}

const TONE_COLOR: Record<Node['tone'], string> = {
  accent: 'var(--os-accent, #7cf)',
  ok: 'var(--os-ok, #46d38a)',
  warn: 'var(--os-warn, #f0b24a)',
  err: 'var(--os-err, #f45b69)',
  dim: 'var(--os-dim, #6b7280)',
};

function connectorTone(status: Connector['status']): Node['tone'] {
  if (status === 'live') return 'ok';
  if (status === 'error') return 'err';
  if (status === 'configured') return 'warn';
  return 'dim';
}

function agentTone(status: Agent['status']): Node['tone'] {
  if (status === 'active') return 'ok';
  if (status === 'training') return 'warn';
  if (status === 'idle') return 'dim';
  return 'dim';
}

function goalTone(status: Goal['lastStatus']): Node['tone'] {
  if (status === 'ok') return 'ok';
  if (status === 'breach') return 'err';
  return 'dim';
}

/**
 * Zero-dep force-arranged graph on SVG. Layout is deterministic (nodes placed
 * on 3 rings around a central "OS" hub) so it never re-flows on hover.
 * Sprint N can replace with react-force-graph-2d if we ever need real physics.
 */
export function HomeSocialGraph({ agents, connectors, goals }: HomeSocialGraphProps) {
  const { nodes, edges } = useMemo(() => {
    const w = 800;
    const h = 320;
    const cx = w / 2;
    const cy = h / 2;

    const hub: Node = {
      id: 'hub',
      label: 'OS',
      x: cx,
      y: cy,
      radius: 22,
      tone: 'accent',
      kind: 'hub',
    };

    const connectorNodes: Node[] = connectors.slice(0, 12).map((c, i, arr) => {
      const angle = (i / arr.length) * Math.PI * 2;
      const r = 130;
      return {
        id: `c-${c.id}`,
        label: c.provider.split(' ')[0].slice(0, 8),
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r * 0.75,
        radius: 10,
        tone: connectorTone(c.status),
        kind: 'connector',
      };
    });

    const agentNodes: Node[] = agents.slice(0, 8).map((a, i, arr) => {
      const angle = (i / arr.length) * Math.PI * 2 + Math.PI / arr.length;
      const r = 220;
      return {
        id: `a-${a.id}`,
        label: a.name.slice(0, 10),
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r * 0.7,
        radius: 12,
        tone: agentTone(a.status),
        kind: 'agent',
      };
    });

    const goalNodes: Node[] = goals.slice(0, 6).map((g, i, arr) => {
      const angle = (i / arr.length) * Math.PI * 2 - Math.PI / 4;
      const r = 310;
      return {
        id: `g-${g.id}`,
        label: g.title.slice(0, 10),
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r * 0.6,
        radius: 8,
        tone: goalTone(g.lastStatus ?? null),
        kind: 'goal',
      };
    });

    // Clamp inside viewport.
    const all = [hub, ...connectorNodes, ...agentNodes, ...goalNodes].map((n) => ({
      ...n,
      x: Math.max(n.radius + 4, Math.min(w - n.radius - 4, n.x)),
      y: Math.max(n.radius + 4, Math.min(h - n.radius - 4, n.y)),
    }));

    const es: Edge[] = [];
    // Hub → connectors
    for (const c of connectorNodes) es.push({ from: 'hub', to: c.id, strength: c.tone === 'ok' ? 1 : 0.35 });
    // Hub → agents
    for (const a of agentNodes) es.push({ from: 'hub', to: a.id, strength: a.tone === 'ok' ? 0.9 : 0.3 });
    // Agents → nearest connector (topologically)
    for (let i = 0; i < agentNodes.length; i++) {
      const target = connectorNodes[i % Math.max(1, connectorNodes.length)];
      if (target) es.push({ from: agentNodes[i].id, to: target.id, strength: 0.25 });
    }
    // Goals → hub (goals are watchers on the OS)
    for (const g of goalNodes) es.push({ from: g.id, to: 'hub', strength: g.tone === 'err' ? 0.9 : 0.3 });

    return { nodes: all, edges: es };
  }, [agents, connectors, goals]);

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  if (agents.length === 0 && connectors.length === 0 && goals.length === 0) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-lg border border-dashed border-os-border bg-os-surface">
        <p className="font-mono text-[11px] text-os-dim">Sin datos para el grafo aún</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-os-border bg-os-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-wider text-os-dim">
          Grafo del OS · agentes · conectores · goals
        </div>
        <div className="flex gap-3 font-mono text-[9.5px] uppercase tracking-wider text-os-dim">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: TONE_COLOR.ok }} /> Live
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: TONE_COLOR.warn }} /> Config
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: TONE_COLOR.err }} /> Error
          </span>
        </div>
      </div>
      <svg viewBox="0 0 800 320" className="h-auto w-full" role="img" aria-label="Grafo del OS">
        {edges.map((e, i) => {
          const a = nodeById.get(e.from);
          const b = nodeById.get(e.to);
          if (!a || !b) return null;
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={TONE_COLOR[b.tone]}
              strokeOpacity={e.strength * 0.5 + 0.1}
              strokeWidth={e.strength * 1.4 + 0.4}
            />
          );
        })}
        {nodes.map((n) => (
          <g key={n.id} transform={`translate(${n.x}, ${n.y})`}>
            <circle
              r={n.radius}
              fill={n.kind === 'hub' ? 'var(--os-surface2, #1a1a1a)' : `${TONE_COLOR[n.tone]}22`}
              stroke={TONE_COLOR[n.tone]}
              strokeWidth={n.kind === 'hub' ? 2 : 1.2}
            />
            <text
              y={n.radius + 12}
              textAnchor="middle"
              className="fill-current"
              style={{ fontSize: n.kind === 'hub' ? 11 : 9, fontFamily: 'monospace' }}
              fill={TONE_COLOR[n.tone]}
            >
              {n.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
