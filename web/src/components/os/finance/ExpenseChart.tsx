/**
 * ExpenseChart — dependency-free horizontal bars showing largest expense
 * categories. No recharts import (keeps bundle small; avoids new dep).
 * Values arrive in cents.
 */

const usd = (cents: number) =>
  (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

export function ExpenseChart({
  items,
  limit = 8,
}: {
  items: { category: string; totalCents: number }[];
  limit?: number;
}) {
  const rows = items.slice(0, limit);
  const max = Math.max(...rows.map((r) => r.totalCents), 1);

  if (rows.length === 0) {
    return (
      <div
        className="flex h-32 items-center justify-center rounded-xl border p-4 text-sm"
        style={{ borderColor: 'var(--border)', color: 'var(--text-2)', background: 'var(--surface-2)' }}
      >
        Sin gastos categorizados.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const pct = Math.max(4, Math.round((r.totalCents / max) * 100));
        return (
          <li key={r.category} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span style={{ color: 'var(--text-1)' }}>{r.category}</span>
              <span className="tabular-nums" style={{ color: 'var(--text-2)' }}>
                {usd(r.totalCents)}
              </span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full"
              style={{ background: 'var(--surface-1, rgba(148,163,184,0.15))' }}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, background: 'var(--accent, #6366f1)' }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
