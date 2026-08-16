import { pieSlices, type PieItem } from '@/lib/os/social-chart';

const SLICE_VARS = ['--funnel-s0', '--funnel-s1', '--funnel-s2', '--funnel-s3', '--funnel-s5', '--funnel-s6'];

const rad = (deg: number) => (deg * Math.PI) / 180;

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const sweep = Math.min(a1 - a0, 359.98);
  const x0 = cx + r * Math.cos(rad(a0));
  const y0 = cy + r * Math.sin(rad(a0));
  const x1 = cx + r * Math.cos(rad(a0 + sweep));
  const y1 = cy + r * Math.sin(rad(a0 + sweep));
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export function SharePie({
  items,
  total,
  centerLabel,
  format,
  framed = true,
  stacked = false,
  donutPx = 132,
  ariaLabel,
}: {
  items: PieItem[];
  total: number;
  centerLabel: string;
  format: (value: number) => string;
  framed?: boolean;
  stacked?: boolean;
  donutPx?: number;
  ariaLabel?: string;
}) {
  const slices = pieSlices(items);
  const R = donutPx / 2;
  const stroke = Math.max(14, R * 0.28);
  const r = R - stroke / 2;

  const donut = (
    <svg
      viewBox={`0 0 ${donutPx} ${donutPx}`}
      width={donutPx}
      height={donutPx}
      aria-label={ariaLabel}
      role="img"
      className="shrink-0"
    >
      {slices.length === 0 ? (
        <circle cx={R} cy={R} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
      ) : (
        slices.map((s, i) => (
          <path
            key={s.key}
            d={arcPath(R, R, r, s.startAngle, s.endAngle)}
            fill="none"
            stroke={`var(${SLICE_VARS[i % SLICE_VARS.length]})`}
            strokeWidth={stroke}
            strokeLinecap="butt"
          >
            <title>{s.label}: {format(s.value)} ({(s.share * 100).toFixed(1)}%)</title>
          </path>
        ))
      )}
      <text x={R} y={R - 5} textAnchor="middle" fontSize="13" fontWeight="600" fontFamily="monospace" fill="var(--text)">
        {format(total)}
      </text>
      <text x={R} y={R + 10} textAnchor="middle" fontSize="8" fontFamily="monospace" fill="var(--text-3)">
        {centerLabel}
      </text>
    </svg>
  );

  const legend = (
    <ul className="flex flex-col gap-1.5">
      {slices.map((s, i) => (
        <li key={s.key} className="flex items-center gap-2 text-[11px]">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: `var(${SLICE_VARS[i % SLICE_VARS.length]})` }}
          />
          <span className="min-w-0 flex-1 truncate text-os-muted">{s.label}</span>
          <span className="font-mono text-os-text">{format(s.value)}</span>
          <span className="w-10 text-right font-mono text-os-dim">{(s.share * 100).toFixed(0)}%</span>
        </li>
      ))}
      {slices.length === 0 && (
        <li className="font-mono text-[10px] text-os-dim">no data</li>
      )}
    </ul>
  );

  const inner = stacked ? (
    <div className="flex flex-col gap-4">
      <div className="flex justify-center">{donut}</div>
      {legend}
    </div>
  ) : (
    <div className="flex items-center gap-5">
      {donut}
      {legend}
    </div>
  );

  if (!framed) return inner;

  return (
    <div className="rounded-lg-t border border-os-border bg-os-surface px-5 py-[18px]">
      {inner}
    </div>
  );
}
