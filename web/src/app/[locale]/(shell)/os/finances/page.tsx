import Link from 'next/link';
import { DollarSign, TrendingUp, Wallet, CreditCard, FileText } from 'lucide-react';

const CONNECTORS = [
  { icon: CreditCard, label: 'Stripe', status: 'Sin configurar', href: '/es/os/integrations' },
  { icon: Wallet, label: 'Wise', status: 'Sin configurar', href: '/es/os/integrations' },
  { icon: FileText, label: 'ePayco', status: 'Sin configurar', href: '/settings/billing' },
];

export default function OsFinancesPage() {
  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">Finanzas</h1>
          <div className="page-sub">
            Ingresos, gastos y estados de cuenta consolidados por marca
          </div>
        </div>
      </div>

      {/* KPIs vacíos hasta conectar Stripe/Wise */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 mt-4">
        {[
          { label: 'MRR', value: '—', hint: 'Conecta Stripe' },
          { label: 'Gasto mensual', value: '—', hint: 'Sube estados de cuenta' },
          { label: 'Runway', value: '—', hint: 'Requiere MRR + gasto' },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border p-4"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
          >
            <div className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-2)' }}>
              {kpi.label}
            </div>
            <div className="mt-1 text-2xl font-semibold" style={{ color: 'var(--text-1)' }}>
              {kpi.value}
            </div>
            <div className="mt-1 text-xs" style={{ color: 'var(--text-2)' }}>
              {kpi.hint}
            </div>
          </div>
        ))}
      </div>

      {/* Connectors */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-1)' }}>
          Fuentes de datos financieros
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {CONNECTORS.map((c) => (
            <Link
              key={c.label}
              href={c.href}
              className="flex items-center gap-3 rounded-xl border p-4 transition-colors hover:bg-white/5"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ background: 'oklch(70% 0.14 250 / 0.12)', color: 'oklch(70% 0.14 250)' }}
              >
                <c.icon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                  {c.label}
                </div>
                <div className="text-xs" style={{ color: 'var(--text-2)' }}>
                  {c.status}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Bank statement upload placeholder */}
      <div
        className="mt-8 rounded-xl border border-dashed p-6 text-center"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
      >
        <TrendingUp className="mx-auto h-6 w-6 mb-2" style={{ color: 'oklch(70% 0.14 250)' }} />
        <div className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
          Subir estado de cuenta bancario
        </div>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-2)' }}>
          Sube un CSV o PDF y la IA extrae ingresos/gastos categorizados
        </p>
        <button
          disabled
          className="mt-3 inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium opacity-60"
          style={{ background: 'var(--surface-3, #1f2937)', color: 'var(--text-2)' }}
        >
          <DollarSign className="h-3 w-3" />
          Próximamente
        </button>
      </div>
    </main>
  );
}
