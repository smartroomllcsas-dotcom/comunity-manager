/**
 * Payments connectors — port of FounderOS-DEMO/lib/connectors/payments.ts,
 * adapted for Community Manager (no SQLite; aggregates come from Supabase).
 *
 * All adapters follow the same three-state contract as os connectors:
 *   { status: 'not_configured' } · { status: 'live', data } · { status: 'error', error }
 *
 * Never throws. Missing env keys are honest `not_configured`, not fake zeros.
 */
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';

const FANBASIS_API = 'https://api.fanbasis.com';

// ── Types ──────────────────────────────────────────────────────────────────

export type ConnectorState = 'live' | 'not_configured' | 'error';

export type StripeSnapshot = {
  available: { amount: number; currency: string }[];
  pending: { amount: number; currency: string }[];
  recentCharges: { amount: number; currency: string; description: string; created: number }[];
};

export type StripeResult =
  | { status: 'live'; snapshot: StripeSnapshot; mtdCents: number; currency: string }
  | { status: 'not_configured' }
  | { status: 'error'; error: string };

export type OutgoingTransfer = {
  amountCents: number;
  currency: string;
  status: string;
  created: string | number;
  reference?: string;
};

export type WiseResult =
  | { status: 'live'; transfers: OutgoingTransfer[] }
  | { status: 'not_configured' }
  | { status: 'error'; error: string };

export type FanbasisResult =
  | { status: 'live'; mtdCents: number }
  | { status: 'not_configured' }
  | { status: 'error'; error: string };

export type ProcessorInfo = { id: string; name: string; configured: boolean };

// ── Env registry ───────────────────────────────────────────────────────────

/** Which processors have keys in the env (honest config), not necessarily live. */
export function configuredProcessors(env: Record<string, string | undefined> = process.env): ProcessorInfo[] {
  return [
    { id: 'stripe', name: 'Stripe', configured: Boolean(env.STRIPE_SECRET_KEY) },
    {
      id: 'wise',
      name: 'Wise',
      configured: Boolean(env.WISE_API_TOKEN || env.WISE_1_TOKEN || env.WISE_2_TOKEN),
    },
    {
      id: 'fanbasis-vantage',
      name: 'FanBasis · Vantage',
      configured: Boolean(env.FANBASIS_API_KEY_VANTAGE),
    },
    {
      id: 'fanbasis-launchpad',
      name: 'FanBasis · Launchpad',
      configured: Boolean(env.FANBASIS_API_KEY_LAUNCHPAD),
    },
  ];
}

// ── Stripe ─────────────────────────────────────────────────────────────────

function monthStartUnix(now: Date): number {
  return Math.floor(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).getTime() / 1000);
}

/** Sum only charges that actually settled (paid + succeeded). */
export function sumChargeIncome(
  charges: { amount: number; currency: string; paid: boolean; status: string }[],
): { amountCents: number; currency: string; count: number } {
  let amountCents = 0;
  let count = 0;
  let currency = 'usd';
  for (const c of charges) {
    if (c.paid && c.status === 'succeeded') {
      amountCents += c.amount;
      count += 1;
      currency = c.currency;
    }
  }
  return { amountCents, currency, count };
}

export async function stripeSnapshot(
  env: Record<string, string | undefined> = process.env,
): Promise<StripeResult> {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) return { status: 'not_configured' };
  try {
    const stripe = new Stripe(key);
    const [balance, charges] = await Promise.all([
      stripe.balance.retrieve(),
      stripe.charges.list({ limit: 5 }),
    ]);

    const snap: StripeSnapshot = {
      available: balance.available.map((b) => ({ amount: b.amount, currency: b.currency })),
      pending: balance.pending.map((b) => ({ amount: b.amount, currency: b.currency })),
      recentCharges: charges.data.map((c) => ({
        amount: c.amount,
        currency: c.currency,
        description: c.description ?? c.id,
        created: c.created,
      })),
    };

    // MTD income — paginate settled charges since the 1st.
    const gte = monthStartUnix(new Date());
    const collected: { amount: number; currency: string; paid: boolean; status: string }[] = [];
    let remaining = 2000;
    for await (const c of stripe.charges.list({ created: { gte }, limit: 100 })) {
      collected.push({ amount: c.amount, currency: c.currency, paid: c.paid, status: c.status });
      if (--remaining <= 0) break;
    }
    const mtd = sumChargeIncome(collected);

    return { status: 'live', snapshot: snap, mtdCents: mtd.amountCents, currency: mtd.currency };
  } catch (e: any) {
    return { status: 'error', error: e?.message ?? 'stripe_error' };
  }
}

// ── Wise ───────────────────────────────────────────────────────────────────

export function parseWiseTransfers(raw: unknown): OutgoingTransfer[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r: any) => {
      const amt = r?.sourceValue ?? r?.amount?.value;
      const cur = r?.sourceCurrency ?? r?.amount?.currency ?? 'USD';
      const status = r?.status ?? 'unknown';
      const created = r?.created ?? r?.createdAt ?? 0;
      if (typeof amt !== 'number') return null;
      return {
        amountCents: Math.round(amt * 100),
        currency: String(cur),
        status: String(status),
        created,
        reference: r?.reference ?? r?.targetName,
      } as OutgoingTransfer;
    })
    .filter((t): t is OutgoingTransfer => t !== null);
}

export async function wiseOutgoing(
  env: Record<string, string | undefined> = process.env,
): Promise<WiseResult> {
  const tokens = [env.WISE_API_TOKEN, env.WISE_1_TOKEN, env.WISE_2_TOKEN].filter(
    (t): t is string => Boolean(t),
  );
  if (tokens.length === 0) return { status: 'not_configured' };
  try {
    const all: OutgoingTransfer[] = [];
    for (const token of tokens) {
      const res = await fetch('https://api.wise.com/v1/transfers?limit=10', {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) continue;
      all.push(...parseWiseTransfers(await res.json()));
    }
    return { status: 'live', transfers: all };
  } catch (e: any) {
    return { status: 'error', error: e?.message ?? 'wise_error' };
  }
}

// ── FanBasis ───────────────────────────────────────────────────────────────

export function parseFanbasisCustomers(raw: unknown): { totalSpentCents: number; month: string | null }[] {
  const arr = (raw as { data?: { customers?: unknown } })?.data?.customers;
  if (!Array.isArray(arr)) return [];
  return arr.map((row) => {
    const c = (row ?? {}) as Record<string, unknown>;
    const amt = Number(String(c.total_spent ?? '').replace(/,/g, ''));
    const d = typeof c.last_transaction_date === 'string' ? c.last_transaction_date.slice(0, 7) : null;
    return { totalSpentCents: Number.isFinite(amt) ? Math.round(amt * 100) : 0, month: d };
  });
}

export function sumFanbasisMonthCents(
  rows: { totalSpentCents: number; month: string | null }[],
  month: string,
): number {
  return rows.filter((r) => r.month === month).reduce((s, r) => s + r.totalSpentCents, 0);
}

export async function fanbasisMonthToDateIncome(
  apiKey: string | undefined,
  month: string = new Date().toISOString().slice(0, 7),
): Promise<FanbasisResult> {
  if (!apiKey) return { status: 'not_configured' };
  try {
    const all: { totalSpentCents: number; month: string | null }[] = [];
    for (let page = 1; page <= 50; page++) {
      const res = await fetch(`${FANBASIS_API}/customers?page=${page}&per_page=100`, {
        headers: { 'x-api-key': apiKey },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) break;
      const parsed = parseFanbasisCustomers(await res.json());
      if (parsed.length === 0) break;
      all.push(...parsed);
    }
    return { status: 'live', mtdCents: sumFanbasisMonthCents(all, month) };
  } catch (e: any) {
    return { status: 'error', error: e?.message ?? 'fanbasis_error' };
  }
}

// ── KPI aggregation from Supabase ──────────────────────────────────────────

export type FinanceKPIs = {
  mtdIncomeCents: number;
  mtdExpensesCents: number;
  netCents: number;
  byCategory: { category: string; totalCents: number }[];
  txCount: number;
  monthLabel: string;
};

/**
 * Aggregates transactions across the caller's brand set (from resolveBrandIds).
 * All amounts in cents. Positive amount_cents = income, negative = expense.
 * Falls back to zeros on any query failure — never throws.
 */
export async function getFinanceKPIs(brandIds: string[]): Promise<FinanceKPIs> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  const monthLabel = now.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const empty: FinanceKPIs = {
    mtdIncomeCents: 0,
    mtdExpensesCents: 0,
    netCents: 0,
    byCategory: [],
    txCount: 0,
    monthLabel,
  };
  if (brandIds.length === 0) return empty;

  try {
    const sb = createAdminClient('smarttalk');
    const { data, error } = await sb
      .from('finance_transactions')
      .select('amount_cents, category, tx_date')
      .in('brand_id', brandIds)
      .gte('tx_date', monthStart);

    if (error || !data) return empty;

    let income = 0;
    let expenses = 0;
    const catTotals = new Map<string, number>();

    for (const row of data as { amount_cents: number; category: string; tx_date: string }[]) {
      const amt = row.amount_cents ?? 0;
      if (amt >= 0) {
        income += amt;
      } else {
        const absCents = -amt;
        expenses += absCents;
        const cat = row.category || 'Uncategorized';
        catTotals.set(cat, (catTotals.get(cat) ?? 0) + absCents);
      }
    }

    const byCategory = [...catTotals.entries()]
      .map(([category, totalCents]) => ({ category, totalCents }))
      .sort((a, b) => b.totalCents - a.totalCents);

    return {
      mtdIncomeCents: income,
      mtdExpensesCents: expenses,
      netCents: income - expenses,
      byCategory,
      txCount: data.length,
      monthLabel,
    };
  } catch {
    return empty;
  }
}
