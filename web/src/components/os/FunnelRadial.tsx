'use client';

/**
 * Ported from FounderOS-DEMO/components/FunnelRadial.tsx
 * Changes: @/lib/funnel*, @/lib/funnel-radial, @/lib/funnel-viz imports removed;
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

export const ACQUISITIONS = ['Instagram', 'YouTube', 'Newsletter', 'X', 'LinkedIn', 'Forms', 'Word of mouth'];

// ── inlined types ────────────────────────────────────────────────────────────

export type FunnelRadialNode = FunnelSpaceNode & {
  segment: number;
  currentRing: number;
  rings: number[];
};

export type FunnelRadialSegment = {
  id: string;
  label: string;
  count: number;
  converted: number;
};

export type FunnelRadialModel = {
  nodes: FunnelRadialNode[];
  segments: FunnelRadialSegment[];
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

function decayedColor(base: string, decay: number, converted: boolean): string {
  if (converted) return 'var(--ok)';
  if (decay <= 0) return base;
  return `color-mix(in oklab, var(--err) ${Math.round(decay * 70)}%, ${base})`;
}

function decayedOpacity(decay: number): number {
  return Math.max(0.18, 1 - decay * 0.65);
}

// ── layout constants ─────────────────────────────────────────────────────────

const W = 1100;
const H = 680;
const CX = W / 2;
const CY = H / 2;
const TAU = Math.PI * 2;
const SEG_COUNT = ACQUISITIONS.length;
const SEG_SPAN = TAU / SEG_COUNT;
const SEG_INSET = 0.13;
const TOP = -Math.PI / 2;

const RING = [288, 228, 170, 114, 48];

const WEDGE_COLOR = [
  'var(--funnel-s0, hsl(240 80% 65%))',
  'var(--funnel-s1, hsl(200 80% 60%))',
  'var(--funnel-s2, hsl(160 70% 55%))',
  'var(--funnel-s3, hsl(120 60% 55%))',
  'var(--funnel-s5, hsl(60 80% 55%))',
  'var(--funnel-s6, hsl(30 80% 60%))',
];

const ENTER_DELAY = 500;
const HOP_MS = 950;
const DWELL_MS = 420;
const staggerMs = (count: number) => Math.min(340, 5000 / Math.max(1, count));

type Pos = { x: number; y: number };
const GOLDEN = 2.399963;

const polar = (a: number, r: number): Pos => ({
  x: Math.round((CX + Math.cos(a) * r) * 100) / 100,
  y: Math.round((CY + Math.sin(a) * r) * 100) / 100,
});

const wedgeAngle = (n: FunnelRadialNode, i: number): number =>
  TOP + n.segment * SEG_SPAN + SEG_INSET + (SEG_SPAN - 2 * SEG_INSET) * rnd(i, 11);

function bandRadius(n: FunnelRadialNode, i: number, ring: number): number {
  if (ring >= RING.length - 1) return 6 + rnd(i, 12) * (RING[4] - 16);
  const outer = RING[ring] - 8;
  const inner = RING[ring + 1] + 12;
  const depth = 0.15 + 0.6 * (n.likelihood / 100) + rnd(i, 1) * 0.2;
  return outer - (outer - inner) * Math.min(0.95, depth);
}

function orbitTarget(n: FunnelRadialNode, i: number, tMs: number): Pos {
  if (n.currentRing >= RING.length - 1) {
    const a = i * GOLDEN + tMs * 0.00005 * (rnd(i, 3) > 0.5 ? 1 : -1);
    return polar(a, bandRadius(n, i, 4));
  }
  const wobble = Math.sin(tMs * (0.00018 + rnd(i, 2) * 0.00014) + rnd(i, 4) * TAU) * 0.09;
  const breath = Math.sin(tMs * 0.0009 + i * 1.3) * 2.4;
  return polar(wedgeAngle(n, i) + wobble, bandRadius(n, i, n.currentRing) + breath);
}

function replayPos(n: FunnelRadialNode, i: number, tMs: number, stagger: number): Pos | null {
  const a = wedgeAngle(n, i);
  let t = tMs - (ENTER_DELAY + i * stagger);
  if (t <= 0) return polar(a, RING[0] + 46 + rnd(i, 5) * 26);
  const stops = [RING[0] + 46, ...n.rings.map((ring) => bandRadius(n, i, ring))];
  const twist = (rnd(i, 8) > 0.5 ? 1 : -1) * 0.07;
  const coreDelta = ((((i * GOLDEN) % TAU) - a + TAU * 1.5) % TAU) - Math.PI;
  for (let leg = 0; leg < stops.length - 1; leg++) {
    if (t < HOP_MS) {
      const u = easeInOut(t / HOP_MS);
      const toCore = n.rings[leg] >= RING.length - 1;
      const angle = toCore ? a + coreDelta * u : a + Math.sin(u * Math.PI) * twist;
      return polar(angle, stops[leg] + (stops[leg + 1] - stops[leg]) * u);
    }
    t -= HOP_MS;
    if (t < DWELL_MS) return polar(a, stops[leg + 1]);
    t -= DWELL_MS;
  }
  return null;
}

// ── component ────────────────────────────────────────────────────────────────

export function FunnelRadial({
  model,
  initialLeadId,
}: {
  model: FunnelRadialModel;
  initialLeadId?: string | null;
}) {
  const { nodes, segments } = model;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, SVGGElement>());
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
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      nodes.forEach((n, i) => {
        const { x, y } = orbitTarget(n, i, 0);
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
        const target = replayPos(n, i, t, stagger) ?? orbitTarget(n, i, t);
        const prev = posRef.current.get(n.id) ?? target;
        const next = { x: prev.x + (target.x - prev.x) * k, y: prev.y + (target.y - prev.y) * k };
        posRef.current.set(n.id, next);
        el.setAttribute('transform', `translate(${next.x.toFixed(1)}, ${next.y.toFixed(1)})`);
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [nodes]);

  if (nodes.length === 0) {
    return <p className="py-6 text-center font-mono text-[11.5px] text-os-dim">No journeys for this filter yet.</p>;
  }

  const selected = nodes.find((n) => n.id === selectedId) ?? null;
  const anchorNode = selected ?? (hoverId ? nodes.find((n) => n.id === hoverId) ?? null : null);
  const convertedTotal = segments.reduce((sum, s) => sum + s.converted, 0);

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

      {anchorNode && (
        <div className="pointer-events-none absolute left-2 top-1.5 z-20 flex items-baseline gap-2 font-mono">
          <span className="text-[12px] font-semibold text-os-text">{anchorNode.name}</span>
          <span className="text-[9.5px] uppercase tracking-[0.12em] text-os-dim">
            {anchorNode.likelihood}% · {anchorNode.daysSinceLastTouch}d quiet
          </span>
        </div>
      )}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        role="img"
        aria-label="Clients spiralling from their acquisition source into the conversion core"
        onClick={() => setSelectedId(null)}
      >
        {RING.slice(0, -1).map((r, s) => (
          <g key={`ring-${s}`}>
            <circle cx={CX} cy={CY} r={r} fill="none" stroke="var(--border)" strokeDasharray="2 6" />
            <text
              x={CX + 9}
              y={CY - r + 13}
              fill="var(--text-3)"
              fontSize={9}
              fontFamily="var(--font-mono)"
              style={{ textTransform: 'uppercase', letterSpacing: '0.14em' }}
            >
              {FUNNEL_STAGES[s]?.label}
            </text>
          </g>
        ))}

        {segments.map((seg, sIdx) => {
          const boundary = TOP + sIdx * SEG_SPAN;
          const mid = boundary + SEG_SPAN / 2;
          const lp = polar(mid, RING[0] + 24);
          const cos = Math.cos(mid);
          const anchor = cos > 0.35 ? 'start' : cos < -0.35 ? 'end' : 'middle';
          return (
            <g key={seg.id}>
              <line
                x1={polar(boundary, RING[4] + 12).x}
                y1={polar(boundary, RING[4] + 12).y}
                x2={polar(boundary, RING[0]).x}
                y2={polar(boundary, RING[0]).y}
                stroke="var(--border)"
                strokeOpacity={0.7}
              />
              <circle cx={polar(mid, RING[0]).x} cy={polar(mid, RING[0]).y} r={2.5} fill={WEDGE_COLOR[sIdx]} />
              <text
                x={lp.x}
                y={Math.round((lp.y + Math.sin(mid) * 7 + 3) * 100) / 100}
                textAnchor={anchor}
                fill={seg.count > 0 ? 'var(--text-2)' : 'var(--text-3)'}
                fontSize={10.5}
                fontFamily="var(--font-mono)"
                style={{ textTransform: 'uppercase', letterSpacing: '0.14em' }}
              >
                {seg.label} · {seg.count}
                {seg.converted > 0 && (
                  <tspan fill="var(--ok)"> ✓{seg.converted}</tspan>
                )}
              </text>
            </g>
          );
        })}

        <circle
          cx={CX} cy={CY} r={RING[4] + 10}
          fill="none" stroke="var(--ok)" strokeOpacity={0.45} strokeDasharray="3 7"
        />
        <circle cx={CX} cy={CY} r={RING[4]} fill="var(--surface-2)" stroke="var(--ok)" strokeOpacity={0.55} strokeWidth={1.2} />
        <text x={CX} y={CY - 2} textAnchor="middle" fill="var(--text-2)" fontSize={10} fontFamily="var(--font-mono)" style={{ textTransform: 'uppercase', letterSpacing: '0.18em' }}>
          converted
        </text>
        <text x={CX} y={CY + 14} textAnchor="middle" fill="var(--ok)" fontSize={13} fontFamily="var(--font-mono)">
          {convertedTotal}
        </text>

        {nodes.map((n, i) => {
          const color = decayedColor(WEDGE_COLOR[n.segment], n.decay, n.state === 'converted');
          const emphasized = hoverId === n.id || selectedId === n.id;
          const pulses = n.state === 'converted' || (n.relationship === 'hot' && n.decay < 0.5);
          const start = polar(wedgeAngle(n, i), RING[0] + 46);
          return (
            <g
              key={n.id}
              ref={(el) => {
                if (el) nodeRefs.current.set(n.id, el);
                else nodeRefs.current.delete(n.id);
              }}
              transform={`translate(${start.x.toFixed(1)}, ${start.y.toFixed(1)})`}
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
              <circle
                r={n.radius + 2.5}
                fill="none"
                stroke={color}
                strokeWidth={0.8}
                opacity={emphasized ? 0.9 : 0.35 * decayedOpacity(n.decay)}
                strokeDasharray={n.relationship === 'cold' ? '2 3' : undefined}
              />
              {n.relationship === 'hot' && (
                <circle r={n.radius + 5} fill="none" stroke={color} strokeWidth={0.6} opacity={0.25 * decayedOpacity(n.decay)} />
              )}
              <circle r={n.radius} fill={color} stroke="var(--bg)" strokeWidth={1} opacity={emphasized ? 1 : decayedOpacity(n.decay)} />
              {emphasized && (
                <text y={-n.radius - 9} textAnchor="middle" fill="var(--text)" fontSize={11} fontFamily="var(--font-mono)" style={{ pointerEvents: 'none' }}>
                  {n.name}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {selected && <FunnelNodeCard node={selected} onClose={() => setSelectedId(null)} />}

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-wide text-os-dim">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: 'var(--funnel-s1, hsl(200 80% 60%))' }} /> hue = where they came from
        </span>
        <span>rings run outside → in · center = purchase</span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: 'color-mix(in oklab, var(--err) 70%, var(--funnel-s1, hsl(200 80% 60%)))', opacity: 0.6 }} />
          {' '}fades red after {DECAY_FADE_START}d quiet → archive at {DECAY_DAYS}d
        </span>
        <span className="ml-auto">click a node for details</span>
      </div>
    </div>
  );
}
