import { followerBarModel, type FollowerPoint } from '@/lib/os/social-chart';
import { formatFollowers } from '@/components/os/SocialStats';

/**
 * Follower history as a bar diagram — one bar per snapshot, y-axis on round
 * follower values, sparse date labels, hover a bar for the exact count and
 * change. Server-rendered SVG; growth tips green, dips red, the newest bar
 * runs full accent so "now" is unmistakable.
 */
export function FollowerBarChart({ series }: { series: FollowerPoint[] }) {
  const model = followerBarModel(series);
  if (model.bars.length === 0) {
    return <p className="mt-4 text-xs text-os-dim">No snapshots yet — counts appear once a sync or scrape records this account.</p>;
  }

  const W = 920;
  const H = 220;
  const AXIS_L = 56; // y label strip
  const AXIS_B = 22; // x labels strip
  const plotW = W - AXIS_L - 8;
  const plotH = H - AXIS_B - 10;
  const n = model.bars.length;
  const slot = plotW / n;
  const barW = Math.max(3, Math.min(26, slot * 0.62));
  const span = Math.max(1, model.ceil - model.floor);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mt-2 block w-full"
      role="img"
      aria-label="Follower count over time as a bar chart"
    >
      {/* y gridlines + labels on round follower values */}
      {model.yTicks.map((v) => {
        const y = 10 + plotH - ((v - model.floor) / span) * plotH;
        if (y < 6 || y > 10 + plotH + 1) return null;
        return (
          <g key={`yt-${v}`}>
            <line x1={AXIS_L} x2={W - 8} y1={y} y2={y} stroke="var(--border)" strokeDasharray="2 4" />
            <text x={AXIS_L - 4} y={y + 3.5} textAnchor="end" fontSize="9" fill="var(--text-3)" fontFamily="monospace">
              {formatFollowers(v)}
            </text>
          </g>
        );
      })}

      {/* bars */}
      {model.bars.map((b, i) => {
        const cx = AXIS_L + slot * i + slot / 2;
        const barH = Math.max(2, b.h * plotH);
        const y = 10 + plotH - barH;
        const isLast = i === n - 1;
        const isUp = b.delta !== null && b.delta > 0;
        const isDown = b.delta !== null && b.delta < 0;
        const fill = isLast
          ? 'var(--accent)'
          : isUp
          ? 'var(--os-ok, #3df08c)'
          : isDown
          ? 'var(--os-err, #f87171)'
          : 'var(--border-strong)';

        return (
          <g key={b.date}>
            <rect x={cx - barW / 2} y={y} width={barW} height={barH} fill={fill} rx="1.5" opacity={isLast ? 1 : 0.72}>
              <title>
                {b.date}: {formatFollowers(b.followers)}
                {b.delta !== null ? ` (${b.delta >= 0 ? '+' : ''}${b.delta.toLocaleString()})` : ''}
              </title>
            </rect>
            {b.xLabel && (
              <text x={cx} y={H - 4} textAnchor="middle" fontSize="8.5" fill="var(--text-3)" fontFamily="monospace">
                {b.xLabel}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
