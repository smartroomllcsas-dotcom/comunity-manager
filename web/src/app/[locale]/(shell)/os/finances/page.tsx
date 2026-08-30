/**
 * Finances page — Community Manager OS.
 *
 * Ports FounderOS-DEMO/app/finances into CM's Supabase-backed data model:
 *   - Live payment processors: Stripe / Wise / FanBasis (via lib/finance/payments)
 *   - Persisted transactions in smarttalk.finance_transactions (via getFinanceKPIs)
 *   - StatementUploader posts CSV -> /api/os/finance/upload
 *
 * All processor probes return `not_configured` when their env keys are missing,
 * so the page renders honestly on a fresh clone.
 */
import Link from 'next/link';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  DollarSign,
  FileText,
  Landmark,
  Scale,
  Send,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { requireOrgIdFromRequest } from '@/lib/os/server';
import { resolveBrandIds } from '@/lib/os/scope';
import {
  configuredProcessors,
  getFinanceKPIs,
  stripeSnapshot,
  wiseOutgoing,
  fanbasisMonthToDateIncome,
  type ConnectorState,
} from '@/lib/finance/payments';
import { IncomeCard } from '@/components/os/finance/IncomeCard';
import { SharePie } from '@/components/os/finance/SharePie';
import { ExpenseChart } from '@/components/os/finance/ExpenseChart';
import { StatementUploader } from '@/components/os/finance/StatementUploader';

export const dynamic = 'force-dynamic';

const usd = (cents: number, showCents = false) =>
  (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: showCents ? 2 : 0,
  });

function ago(unix: number): string {
  const mins = Math.round((Date.now() - unix * 1000) / 60_000);
  if (mins < 60) return `${Math.max(0, mins)}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function ConnectorPill({ state, note }: { state: ConnectorState; note?: string }) {
  const color =
    state === 'live'
      ? { bg: 'rgba(16,185,129,0.12)', fg: '#10b981', label: 'activo' }
      : state === 'error'
      ? { bg: 'rgba(244,63,94,0.12)', fg: '#f43f5e', label: 'error' }
      : { bg: 'rgba(148,163,184,0.15)', fg: 'var(--text-2)', label: 'sin configurar' };

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
      style={{ background: color.bg, color: color.fg }}
      title={note}
    >
      {color.label}
    </span>
  );
}

export default async function OsFinancesPage() {
  const orgId = await requireOrgIdFromRequest();
  const brandIds = await resolveBrandIds(orgId);

  const [kpis, stripeR, wiseR, fbVantageR, fbLaunchR] = await Promise.all([
    getFinanceKPIs(brandIds),
    stripeSnapshot(),
    wiseOutgoing(),
    fanbasisMonthToDateIncome(process.env.FANBASIS_API_KEY_VANTAGE),
    fanbasisMonthToDateIncome(process.env.FANBASIS_API_KEY_LAUNCHPAD),
  ]);

  const processors = configuredProcessors();

  // Merge live processor income into KPIs (Stripe MTD + FanBasis MTD).
  const stripeMtd = stripeR.status === 'live' ? stripeR.mtdCents : 0;
  const fbVantageMtd = fbVantageR.status === 'live' ? fbVantageR.mtdCents : 0;
  const fbLaunchMtd = fbLaunchR.status === 'live' ? fbLaunchR.mtdCents : 0;
  const liveProcessorIncome = stripeMtd + fbVantageMtd + fbLaunchMtd;

  const mtdIncomeCents = kpis.mtdIncomeCents + liveProcessorIncome;
  const netCents = mtdIncomeCents - kpis.mtdExpensesCents;
  const netTone: 'positive' | 'negative' | 'neutral' =
    netCents > 0 ? 'positive' : netCents < 0 ? 'negative' : 'neutral';

  const recentCharges = stripeR.status === 'live' ? stripeR.snapshot.recentCharges : [];
  const wiseTransfers = wiseR.status === 'live' ? wiseR.transfers : [];

  const connectorRows: {
    id: string;
    label: string;
    Icon: typeof CreditCard;
    state: ConnectorState;
    note?: string;
    href: string;
  }[] = [
    {
      id: 'stripe',
      label: 'Stripe',
      Icon: CreditCard,
      state: stripeR.status,
      note: stripeR.status === 'error' ? stripeR.error : undefined,
      href: '/es/os/integrations',
    },
    {
      id: 'wise',
      label: 'Wise',
      Icon: Wallet,
      state: wiseR.status,
      note: wiseR.status === 'error' ? wiseR.error : undefined,
      href: '/es/os/integrations',
    },
    {
      id: 'fanbasis-vantage',
      label: 'FanBasis · Vantage',
      Icon: Landmark,
      state: fbVantageR.status,
      note: fbVantageR.status === 'error' ? fbVantageR.error : undefined,
      href: '/es/os/integrations',
    },
    {
      id: 'fanbasis-launchpad',
      label: 'FanBasis · Launchpad',
      Icon: Landmark,
      state: fbLaunchR.status,
      note: fbLaunchR.status === 'error' ? fbLaunchR.error : undefined,
      href: '/es/os/integrations',
    },
  ];

  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">Finanzas</h1>
          <div className="page-sub">
            Ingresos MTD, gastos y extractos consolidados por marca · {kpis.monthLabel} · {brandIds.length}{' '}
            marca{brandIds.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <IncomeCard
          label="Ingresos MTD"
          cents={mtdIncomeCents}
          hint={
            liveProcessorIncome > 0
              ? `${usd(liveProcessorIncome)} en vivo de procesadores`
              : 'Sin procesadores en vivo'
          }
          Icon={ArrowUpRight}
          tone="positive"
        />
        <IncomeCard
          label="Gastos MTD"
          cents={kpis.mtdExpensesCents}
          hint={`${kpis.txCount} transaccion${kpis.txCount === 1 ? '' : 'es'} · ${kpis.byCategory.length} categoría${kpis.byCategory.length === 1 ? '' : 's'}`}
          Icon={ArrowDownLeft}
          tone="negative"
        />
        <IncomeCard
          label="Neto MTD"
          cents={netCents}
          hint={netCents >= 0 ? 'En verde este mes' : 'Gastos superan ingresos'}
          Icon={Scale}
          tone={netTone}
        />
      </div>

      {/* Charts row */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section
          className="rounded-xl border p-4"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
        >
          <header className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              Gastos por categoría
            </h2>
            <span className="text-xs" style={{ color: 'var(--text-2)' }}>
              {kpis.monthLabel}
            </span>
          </header>
          <SharePie items={kpis.byCategory} centerLabel="Gastos" />
        </section>

        <section
          className="rounded-xl border p-4"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
        >
          <header className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              Top categorías
            </h2>
            <span className="text-xs" style={{ color: 'var(--text-2)' }}>
              MTD
            </span>
          </header>
          <ExpenseChart items={kpis.byCategory} />
        </section>
      </div>

      {/* Connectors */}
      <section
        className="mt-6 rounded-xl border p-4"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
      >
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
            Procesadores de pago
          </h2>
          <span className="text-xs" style={{ color: 'var(--text-2)' }}>
            {processors.filter((p) => p.configured).length}/{processors.length} configurados
          </span>
        </header>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {connectorRows.map((c) => (
            <Link
              key={c.id}
              href={c.href}
              className="flex items-center gap-3 rounded-lg border p-3 transition hover:opacity-80"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-1, transparent)' }}
            >
              <c.Icon className="h-4 w-4 shrink-0" style={{ color: 'var(--text-2)' }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
                    {c.label}
                  </span>
                  <ConnectorPill state={c.state} note={c.note} />
                </div>
                {c.note ? (
                  <div className="mt-0.5 truncate text-[11px]" style={{ color: 'var(--text-2)' }}>
                    {c.note}
                  </div>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Recent activity — Stripe charges + Wise transfers when live */}
      {(recentCharges.length > 0 || wiseTransfers.length > 0) && (
        <section
          className="mt-6 rounded-xl border p-4"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
        >
          <header className="mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" style={{ color: 'var(--text-2)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              Actividad reciente
            </h2>
          </header>
          <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {recentCharges.map((c, i) => (
              <li key={`stripe-${i}`} className="flex items-center justify-between py-2 text-sm">
                <span className="flex items-center gap-2 truncate" style={{ color: 'var(--text-1)' }}>
                  <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="truncate">{c.description}</span>
                </span>
                <span className="ml-4 tabular-nums" style={{ color: 'var(--text-2)' }}>
                  {usd(c.amount, true)} · {ago(c.created)}
                </span>
              </li>
            ))}
            {wiseTransfers.map((t, i) => (
              <li key={`wise-${i}`} className="flex items-center justify-between py-2 text-sm">
                <span className="flex items-center gap-2 truncate" style={{ color: 'var(--text-1)' }}>
                  <Send className="h-3.5 w-3.5 text-sky-500" />
                  <span className="truncate">
                    {t.reference ?? 'Wise transfer'} · {t.status}
                  </span>
                </span>
                <span className="ml-4 tabular-nums" style={{ color: 'var(--text-2)' }}>
                  {usd(t.amountCents, true)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Statement uploader */}
      <section
        className="mt-6 rounded-xl border p-4"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
      >
        <header className="mb-2 flex items-center gap-2">
          <FileText className="h-4 w-4" style={{ color: 'var(--text-2)' }} />
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
            Subir extracto (CSV)
          </h2>
        </header>
        <p className="text-xs" style={{ color: 'var(--text-2)' }}>
          Extractos bancarios y de tarjeta se parsean automáticamente y se guardan en{' '}
          <code>smarttalk.finance_transactions</code> con categorización por palabras clave.
        </p>
        <StatementUploader />
      </section>

      <p className="mt-6 text-[11px]" style={{ color: 'var(--text-2)' }}>
        <DollarSign className="mr-1 inline h-3 w-3" />
        Los procesadores sin llave en el entorno se muestran como <em>sin configurar</em> — nunca
        mostramos un cero como si fuera ingreso real.
      </p>
    </main>
  );
}
