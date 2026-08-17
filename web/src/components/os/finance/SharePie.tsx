/**
 * SharePie — dependency-free donut using SVG + conic-gradient fallback.
 * Renders one arc per category with a center total and a legend of values.
 * Values arrive in cents.
 */

const PALETTE = [
  '#6366f1',
  '#22d3ee',
  '#f59e0b',
  '#ef4444',
  '#10b981',
  '#a855f7',
  '#f472b6',
  '#84cc16',
  '#0ea5e9',
  '#f97316',
];

type Slice = { label: string; cents: number; pct: number; color: string };

const usd = (cents: number) =>
  (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

function toSlices(items: { category: string; totalCents: number }[]): { slices: Slice[]; total: number } {
  const total = items.reduce((s, i) => s + i.totalCents, 0);
  if (total <= 0) return { slices: [], total: 0 };
  const slices = items.map((it, i) => ({
    label: it.category,
    cents: it.totalCents,
    pct: it.totalCents / total,
    color: PALETTE[i % PALETTE.length],
  }));
  return { slices, total };
}

/** Build SVG arc paths for a donut. */
function arcPath(cx: number, cy: number, rOuter: number, rInner: number, start: number, end: number): string {
  const large = end - start > Math.PI ? 1 : 0;
  const x1 = cx + rOuter * Math.cos(start);
  const y1 = cy + rOuter * Math.sin(start);
  const x2 = cx + rOuter * Math.cos(end);
  const y2 = cy + rOuter * Math.sin(end);
  const x3 = cx + rInner * Math.cos(end);
  const y3 = cy + rInner * Math.sin(end);
  const x4 = cx + rInner * Math.cos(start);
  const y4 = cy + rInner * Math.sin(start);
  return [
    `M ${x1} ${y1}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ');
}

export function SharePie({
  items,
  centerLabel = 'Total',
  donutPx = 160,
}: {
  items: { category: string; totalCents: number }[];
  centerLabel?: string;
  donutPx?: number;
}) {
  const { slices, total } = toSlices(items);

  if (slices.length === 0) {
    return (
      <div
        className="flex h-40 items-center justify-center rounded-xl border p-4 text-sm"
        style={{ borderColor: 'var(--border)', color: 'var(--text-2)', background: 'var(--surface-2)' }}
      >
        Sin datos aún — sube un extracto o conecta un procesador.
      </div>
    );
  }

  const size = donutPx;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 4;
  const rInner = rOuter * 0.62;

  let cursor = -Math.PI / 2;
  const paths = slices.map((s) => {
    const arc = s.pct * Math.PI * 2;
    const path = arcPath(cx, cy, rOuter, rInner, cursor, cursor + arc);
    cursor += arc;
    return { d: path, color: s.color, key: s.label };
  });

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Gastos por categoría">
          {paths.map((p) => (
            <path key={p.key} d={p.d} fill={p.color} />
          ))}
        </svg>
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
        >
          <div className="text-xs" style={{ color: 'var(--text-2)' }}>
            {centerLabel}
          </div>
          <div className="text-lg font-semibold" style={{ color: 'var(--text-1)' }}>
            {usd(total)}
          </div>
        </div>
      </div>

      <ul className="flex-1 space-y-1.5 text-xs">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 truncate" style={{ color: 'var(--text-1)' }}>
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: s.color }}
                aria-hidden
              />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="tabular-nums" style={{ color: 'var(--text-2)' }}>
              {usd(s.cents)} · {(s.pct * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
