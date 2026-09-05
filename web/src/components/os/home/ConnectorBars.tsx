import type { Connector } from '@/lib/os/repository';

interface ConnectorBarsProps {
  connectors: Connector[];
}

/**
 * Live connector map — one bar per connector, height + color driven by status.
 * Ported from FounderOS-DEMO/app/page.tsx; adapted to the CM Connector schema
 * (status: 'live' | 'configured' | 'not_configured' | 'error').
 * Honest stand-in for a time series — connector uptime has no history yet.
 */
export function ConnectorBars({ connectors }: ConnectorBarsProps) {
  const w = 120;
  const h = 28;
  const gap = 2;
  const items = connectors.slice(0, 16);
  if (items.length === 0) {
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        <rect x="0" y={h / 2 - 1} width={w} height={2} fill="var(--os-border, #333)" opacity="0.5" />
      </svg>
    );
  }

  const bw = Math.max(2, (w - gap * (items.length - 1)) / items.length);
  const color = (s: Connector['status']): string => {
    if (s === 'live') return 'var(--os-ok, #46d38a)';
    if (s === 'error') return 'var(--os-err, #f45b69)';
    if (s === 'configured') return 'var(--os-warn, #f0b24a)';
    return 'var(--os-dim, #6b7280)';
  };
  const barH = (s: Connector['status']): number => {
    if (s === 'live') return h - 4;
    if (s === 'error') return h - 10;
    if (s === 'configured') return h - 12;
    return 6;
  };

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {items.map((c, i) => {
        const bh = barH(c.status);
        return (
          <rect
            key={c.id}
            x={(i * (bw + gap)).toFixed(1)}
            y={(h - bh).toFixed(1)}
            width={bw.toFixed(1)}
            height={bh}
            fill={color(c.status)}
            opacity={c.status === 'live' ? 1 : 0.75}
          />
        );
      })}
    </svg>
  );
}
