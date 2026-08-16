'use client';

/**
 * Ported from FounderOS-DEMO/components/FunnelSpace.tsx
 * Changes: @/lib/funnel*, @/lib/funnel-viz, @/lib/schemas imports removed;
 * all constants/types/helpers inlined. FunnelNodeCard import updated to local path.
 */
import { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { FunnelNodeCard, type FunnelSpaceNode } from '@/components/os/FunnelNodeCard';

// ── inlined constants ────────────────────────────────────────────────────────

const DECAY_DAYS = 90;
const DECAY_FADE_START = 21;

const FUNNEL_STAGES: { id: string; label: string }[] = [
  { id: 'first_touch', label: 'First touch' },
  { id: 'engaged', label: 'Engaged' },
  { id: 'nurtured', label: 'Nurtured' },
  { id: 'opted_in', label: 'Opted in' },
  { id: 'converted', label: 'Converted' },
];

// ── inlined types ────────────────────────────────────────────────────────────

export type FunnelStageSummaryRow = {
  id: string;
  total: number;
  conversionFromPrev: number | null;
};

export type FunnelSummary = {
  stages: FunnelStageSummaryRow[];
  totalLeads: number;
  totalConverted: number;
};

// ── inlined viz helpers ──────────────────────────────────────────────────────

function rnd(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function smoothK(dtMs: number): number {
  return 1 - Math.exp(-dtMs / 80);
}

function orbitSpread(count: number): number {
  return Math.max(1, 1 + Math.log2(Math.max(1, count / 5)) * 0.4);
}

function decayedColor(base: string, decay: number, converted: boolean): string {
  if (converted) return 'var(--ok)';
  if (decay <= 0) return base;
  return `color-mix(in oklab, var(--err) ${Math.round(decay * 70)}%, ${base})`;
}

function decayedOpacity(decay: number): number {
  return Math.max(0.18, 1 - decay * 0.65);
}

function usd(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

// ── layout constants ─────────────────────────────────────────────────────────

const W = 1100;
const H = 460;
const CY = H / 2 - 14;
const HUB_X0 = 100;
const HUB_GAP = (W - 200) / (FUNNEL_STAGES.length - 1);
const hubX = (i: number) => HUB_X0 + i * HUB_GAP;
const hubR = (i: number) => (i === FUNNEL_STAGES.length - 1 ? 34 : 24);

const SEGMENT_COLOR = [
  'var(--funnel-s0, hsl(240 80% 65%))',
  'var(--funnel-s1, hsl(200 80% 60%))',
  'var(--funnel-s2, hsl(160 70% 55%))',
  'var(--funnel-s3, hsl(120 60% 55%))',
  'var(--funnel-s4, hsl(80 70% 50%))',
];

const nodeColor = (n: FunnelSpaceNode) => decayedColor(SEGMENT_COLOR[n.currentHub], n.decay, n.state === 'converted');
const nodeOpacity = (n: FunnelSpaceNode) => decayedOpacity(n.decay);

const ENTER_DELAY = 500;
const HOP_MS = 950;
const DWELL_MS = 420;
const PULSES = 9;

const staggerMs = (count: number) => Math.min(340, 5000 / Math.max(1, count));

type Pos = { x: number; y: number };
const GOLDEN = 2.399963;

function orbitTarget(n: FunnelSpaceNode, i: number, tMs: number, spread: number): Pos {
  const speed = (0.0001 + rnd(i, 2) * 0.00012) * (rnd(i, 3) > 0.5 ? 1 : -1);
  const a = i * GOLDEN + rnd(i, 4) * 0.5 + tMs * speed;
  const r = hubR(n.currentHub) + 5 + ((1 - n.likelihood / 100) * 20 + rnd(i, 1) * 7) * spread;
  const yFlat = 0.85 / Math.sqrt(spread);
  return {
    x: hubX(n.currentHub) + Math.cos(a) * r + Math.sin(tMs * 0.0007 + i * 2.1) * 1.6,
    y: CY + Math.sin(a) * r * yFlat + Math.sin(tMs * 0.0009 + i * 1.3) * 2.2,
  };
}

function replayPos(n: FunnelSpaceNode, i: number, tMs: number, stagger: number): Pos | null {
  let t = tMs - (ENTER_DELAY + i * stagger);
  if (t <= 0) return { x: hubX(n.hubs[0]) - 60 - rnd(i, 5) * 30, y: CY + (rnd(i, 6) - 0.5) * 80 };
  for (let leg = 0; leg < n.hubs.length - 1; leg++) {
    if (t < HOP_MS) {
      const u = easeInOut(t / HOP_MS);
      const x0 = hubX(n.hubs[leg]);
      const x1 = hubX(n.hubs[leg + 1]);
      return {
        x: x0 + (x1 - x0) * u,
        y: CY - Math.sin(u * Math.PI) * (18 + rnd(i, 7) * 22) * (rnd(i, 8) > 0.5 ? 1 : -1),
      };
    }
    t -= HOP_MS;
    if (t < DWELL_MS) {
      const hub = n.hubs[leg + 1];
      return { x: hubX(hub), y: CY };
    }
    t -= DWELL_MS;
  }
  return null;
}

// ── component ────────────────────────────────────────────────────────────────

export function FunnelSpace({
  nodes,
  summary,
  initialLeadId,
}: {
  nodes: FunnelSpaceNode[];
  summary: FunnelSummary;
  initialLeadId?: string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, SVGGElement>());
  const pulseRefs = useRef(new Map<number, SVGCircleElement>());
  const posRef = useRef(new Map<string, Pos>());

  useEffect(() => {
    if (initialLeadId && nodes.some((n) => n.id === initialLeadId)) setSelectedId(initialLeadId);
  }, [initialLeadId, nodes]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ids = new Set(nodes.map((n) => n.id));
    for (const k of [...posRef.current.keys()]) if (!ids.has(k)) posRef.current.delete(k);
    const counts = new Map<number, number>();
    for (const n of nodes) counts.set(n.currentHub, (counts.get(n.currentHub) ?? 0) + 1);
    const spread = (n: FunnelSpaceNode) => orbitSpread(counts.get(n.currentHub) ?? 0);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      nodes.forEach((n, i) => {
        const { x, y } = orbitTarget(n, i, 0, spread(n));
        nodeRefs.current.get(n.id)?.setAttribute('transform', `translate(${x.toFixed(1)}, ${y.toFixed(1)})`);
      });
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    let last = t0;
    const stagger = staggerMs(nodes.length);
    const frame = (nowMs: number) => {
      const t = nowMs - t0;
      const k = smoothK(nowMs - last);
      last = nowMs;
      nodes.forEach((n, i) => {
        const el = nodeRefs.current.get(n.id);
        if (!el) return;
        const target = replayPos(n, i, t, stagger) ?? orbitTarget(n, i, t, spread(n));
        const prev = posRef.current.get(n.id) ?? target;
        const next = { x: prev.x + (target.x - prev.x) * k, y: prev.y + (target.y - prev.y) * k };
        posRef.current.set(n.id, next);
        el.setAttribute('transform', `translate(${next.x.toFixed(1)}, ${next.y.toFixed(1)})`);
      });
      for (let p = 0; p < PULSES; p++) {
        const el = pulseRefs.current.get(p);
        if (!el) continue;
        const leg = p % (FUNNEL_STAGES.length - 1);
        const u = (t * (0.00008 + rnd(p, 9) * 0.00005) + rnd(p, 10)) % 1;
        el.setAttribute('cx', String(hubX(leg) + (hubX(leg + 1) - hubX(leg)) * u));
        el.setAttribute('cy', String(CY + Math.sin(u * Math.PI * 2 + p) * 2));
        el.setAttribute('opacity', String(0.5 * Math.sin(u * Math.PI)));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [nodes]);

  if (nodes.length === 0) {
    return <p className="py-6 text-center font-mono text-[11.5px] text-os-dim">No journeys for this filter yet.</p>;
  }

  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  return (
    <div ref={rootRef} className="funnel-space-root relative">
      <button
        onClick={() => {
          if (document.fullscreenElement) void document.exitFullscreen();
          else void rootRef.current?.requestFullscreen();
        }}
        aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        className="absolute right-1 top-1 z-20 rounded border border-os-border bg-os-surface2 p-1.5 text-os-dim transition-colors hover:border-os-border-strong hover:text-os-text"
      >
        {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
      </button>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        role="img"
        aria-label="Clients orbiting their funnel stage from first touch to conversion"
        onClick={() => setSelectedId(null)}
      >
        <line x1={hubX(0)} x2={hubX(FUNNEL_STAGES.length - 1)} y1={CY} y2={CY} stroke="var(--border)" />
        {Array.from({ length: PULSES }, (_, p) => (
          <circle
            key={`pulse-${p}`}
            ref={(el) => {
              if (el) pulseRefs.current.set(p, el);
              else pulseRefs.current.delete(p);
            }}
            r={1.8}
            fill="var(--funnel-warm, var(--accent))"
            opacity={0}
          />
        ))}

        {FUNNEL_STAGES.map((s, i) => {
          const r = hubR(i);
          const seg = SEGMENT_COLOR[i];
          const row = summary.stages[i];
          return (
            <g key={s.id}>
              <circle cx={hubX(i)} cy={CY} r={r + 10} fill="none" stroke={seg} strokeOpacity={0.45} strokeDasharray="3 7" />
              <circle cx={hubX(i)} cy={CY} r={r} fill="var(--surface-2)" stroke={seg} strokeOpacity={0.6} strokeWidth={1.2} />
              <circle cx={hubX(i)} cy={CY} r={2.5} fill={seg} />
              <text x={hubX(i)} y={CY - r - 52} textAnchor="middle" fill="var(--text-2)" fontSize={10.5} fontFamily="var(--font-mono)" style={{ textTransform: 'uppercase', letterSpacing: '0.16em' }}>
                {s.label}
              </text>
              <text x={hubX(i)} y={CY - r - 36} textAnchor="middle" fill="var(--text-3)" fontSize={10} fontFamily="var(--font-mono)">
                {row ? `${row.total}${row.conversionFromPrev != null ? ` · ${row.conversionFromPrev}%` : ''}` : ''}
              </text>
            </g>
          );
        })}

        {nodes.map((n, i) => {
          const color = nodeColor(n);
          const emphasized = hoverId === n.id || selectedId === n.id;
          const pulses = n.state === 'converted' || (n.relationship === 'hot' && n.decay < 0.5);
          return (
            <g
              key={n.id}
              ref={(el) => {
                if (el) nodeRefs.current.set(n.id, el);
                else nodeRefs.current.delete(n.id);
              }}
              transform={`translate(${hubX(n.hubs[0]) - 60}, ${CY})`}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHoverId(n.id)}
              onMouseLeave={() => setHoverId(null)}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedId((cur) => (cur === n.id ? null : n.id));
              }}
            >
              {pulses && (
                <circle
                  className="funnel-halo"
                  r={n.radius + 3}
                  fill="none"
                  stroke={color}
                  style={{
                    animationDelay: `${(i % 6) * 0.4}s`,
                    animationDuration: n.state === 'converted' ? '3.4s' : '2.6s',
                  }}
                />
              )}
              <circle r={n.radius + 2.5} fill="none" stroke={color} strokeWidth={0.8} opacity={emphasized ? 0.9 : 0.35 * nodeOpacity(n)} strokeDasharray={n.relationship === 'cold' ? '2 3' : undefined} />
              {n.relationship === 'hot' && <circle r={n.radius + 5} fill="none" stroke={color} strokeWidth={0.6} opacity={0.25 * nodeOpacity(n)} />}
              <circle r={n.radius} fill={color} stroke="var(--bg)" strokeWidth={1} opacity={emphasized ? 1 : nodeOpacity(n)} />
              {emphasized && (
                <text y={-n.radius - 9} textAnchor="middle" fill="var(--text)" fontSize={11} fontFamily="var(--font-mono)" style={{ pointerEvents: 'none' }}>
                  {n.name}
                  {n.state === 'converted' && n.amountUsd != null ? ` · ${usd(n.amountUsd)}` : ''}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {selected && <FunnelNodeCard node={selected} onClose={() => setSelectedId(null)} />}

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-wide text-os-dim">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: 'var(--funnel-s1, hsl(200 80% 60%))' }} /> hue = its stage
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: 'color-mix(in oklab, var(--err) 70%, var(--funnel-s1, hsl(200 80% 60%)))', opacity: 0.6 }} />
          {' '}fades red after {DECAY_FADE_START}d quiet → archive at {DECAY_DAYS}d
        </span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--ok)]" /> converted</span>
        <span className="ml-auto">size + closeness = ICP fit · click a node</span>
      </div>
    </div>
  );
}
