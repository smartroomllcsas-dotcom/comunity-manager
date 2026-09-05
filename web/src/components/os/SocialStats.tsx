import { Minus, TrendingDown, TrendingUp } from 'lucide-react';

export function formatFollowers(n: number | null): string {
  return n === null ? '—' : n.toLocaleString('en-US');
}

export function formatPct(n: number | null): string {
  if (n === null) return '—';
  const rounded = Math.abs(n) < 10 ? n.toFixed(2) : n.toFixed(1);
  return `${n >= 0 ? '+' : ''}${rounded}%`;
}

/** Growth chip — em-dash when history is too short to compute, never a fake 0. */
export function GrowthBadge({ label, value }: { label: string; value: number | null }) {
  const Icon = value === null ? Minus : value >= 0 ? TrendingUp : TrendingDown;
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-os-border px-2 py-1">
      <Icon className={`h-3 w-3 ${value === null ? 'text-os-dim' : value >= 0 ? 'text-os-ok' : 'text-os-err'}`} />
      <span className={`font-mono text-xs font-semibold ${value === null ? 'text-os-dim' : 'text-os-text'}`}>
        {formatPct(value)}
      </span>
      <span className="text-[10px] uppercase tracking-wider text-os-dim">{label}</span>
    </div>
  );
}

/** Tiny grayscale bar series of follower history. */
export function Sparkline({ series }: { series: { date: string; followers: number }[] }) {
  if (series.length === 0) {
    return <div className="text-[10px] text-os-dim">no history yet — syncs daily</div>;
  }
  const min = Math.min(...series.map((s) => s.followers));
  const max = Math.max(...series.map((s) => s.followers));
  const span = Math.max(1, max - min);
  const W = 120;
  const H = 32;
  const step = W / Math.max(1, series.length - 1);

  const pts = series
    .map((s, i) => `${(i * step).toFixed(1)},${(H - ((s.followers - min) / span) * H).toFixed(1)}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-8 w-[120px]" aria-hidden>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" className="text-os-dim" />
    </svg>
  );
}
