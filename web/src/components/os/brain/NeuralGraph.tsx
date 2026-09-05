'use client';

import { useEffect, useRef } from 'react';
import type { KnowledgeNode } from '@/lib/os/schemas/knowledge-node';
import type { KnowledgeEdge } from '@/lib/os/schemas/knowledge-edge';
import type { KnowledgeKind } from '@/lib/os/schemas/knowledge-kind';

interface NeuralGraphProps {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  /** Dynamic kinds from os_knowledge_kinds. Falls back to static defaults if omitted. */
  kinds?: KnowledgeKind[];
}

/** Static fallback palette used when kinds are not loaded yet */
const FALLBACK_HUE: Record<string, string> = {
  contact:  '#5ec9f8',
  topic:    '#a78bfa',
  decision: '#3df08c',
  event:    '#f59e0b',
  tag:      '#f472b6',
  custom:   '#888888',
};

interface NodePos {
  id: string;
  x: number;
  y: number;
  label: string;
  kind: string;
  vx: number;
  vy: number;
}

/**
 * Minimal canvas-based force-directed graph.
 * No external deps — pure geometry.
 */
export function NeuralGraph({ nodes, edges, kinds }: NeuralGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Build color lookup: dynamic kinds override static fallbacks
  const colorMap: Record<string, string> = { ...FALLBACK_HUE };
  if (kinds) {
    for (const k of kinds) colorMap[k.id] = k.color;
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || nodes.length === 0) return;

    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Seed positions randomly
    const posMap = new Map<string, NodePos>();
    for (const n of nodes) {
      posMap.set(n.id, {
        id: n.id,
        x: Math.random() * W,
        y: Math.random() * H,
        label: n.label,
        kind: n.kind,
        vx: 0,
        vy: 0,
      });
    }

    const edgeIndex = edges.map(e => ({
      from: posMap.get(e.fromNodeId),
      to:   posMap.get(e.toNodeId),
      w:    e.weight,
    })).filter(e => e.from && e.to);

    const REPULSION = 800;
    const ATTRACTION = 0.04;
    const DAMPING    = 0.85;
    const MAX_ITER   = 120;

    let frame = 0;
    let raf: number;

    const tick = () => {
      if (frame++ > MAX_ITER) return;

      const pts = [...posMap.values()];

      // Repulsion between all node pairs
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i], b = pts[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = REPULSION / (dist * dist);
          const fx = (dx / dist) * force, fy = (dy / dist) * force;
          a.vx -= fx; a.vy -= fy;
          b.vx += fx; b.vy += fy;
        }
      }

      // Attraction along edges
      for (const e of edgeIndex) {
        const a = e.from!, b = e.to!;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = dist * ATTRACTION * (e.w ?? 1);
        const fx = (dx / dist) * force, fy = (dy / dist) * force;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }

      // Integrate + dampen + clamp
      for (const p of pts) {
        p.vx *= DAMPING; p.vy *= DAMPING;
        p.x = Math.max(20, Math.min(W - 20, p.x + p.vx));
        p.y = Math.max(20, Math.min(H - 20, p.y + p.vy));
      }

      // Draw
      ctx.clearRect(0, 0, W, H);

      // Edges
      ctx.lineWidth = 0.8;
      for (const e of edgeIndex) {
        const a = e.from!, b = e.to!;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.stroke();
      }

      // Nodes
      for (const p of pts) {
        const color = colorMap[p.kind] ?? '#888';
        const r = 5;

        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
        ctx.fillStyle = `${color}22`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = '9px sans-serif';
        ctx.fillText(p.label.slice(0, 18), p.x + r + 3, p.y + 3);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [nodes, edges, kinds]);

  if (nodes.length === 0) return null;

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
      <canvas
        ref={canvasRef}
        className="h-[420px] w-full"
        style={{ display: 'block' }}
      />
      <div className="absolute bottom-3 right-3 flex flex-wrap gap-2">
        {Object.entries(colorMap).map(([kind, color]) => (
          <span key={kind} className="flex items-center gap-1 text-xs text-zinc-400">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
            {kinds?.find(k => k.id === kind)?.label ?? kind}
          </span>
        ))}
      </div>
    </div>
  );
}
