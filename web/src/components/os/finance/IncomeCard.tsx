/**
 * Small KPI card for a single figure (income / expenses / net).
 * Server-safe — no client hooks. Values arrive in cents.
 */
import type { LucideIcon } from 'lucide-react';

const usd = (cents: number) =>
  (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

export function IncomeCard({
  label,
  cents,
  hint,
  Icon,
  tone = 'neutral',
}: {
  label: string;
  cents: number | null;
  hint?: string;
  Icon?: LucideIcon;
  tone?: 'neutral' | 'positive' | 'negative';
}) {
  const value = cents === null ? '—' : usd(cents);
  const toneColor =
    tone === 'positive'
      ? 'text-emerald-500'
      : tone === 'negative'
      ? 'text-rose-500'
      : undefined;

  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
    >
      <div
        className="flex items-center gap-2 text-xs uppercase tracking-wide"
        style={{ color: 'var(--text-2)' }}
      >
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
        {label}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${toneColor ?? ''}`} style={toneColor ? undefined : { color: 'var(--text-1)' }}>
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-xs" style={{ color: 'var(--text-2)' }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}
