"use client";
/**
 * Anuncios — inversión y rendimiento de la pauta de UNA empresa.
 *
 * Los números mandan, así que la pantalla se lee de arriba abajo: primero lo
 * que costó y cuánto rindió, después el detalle campaña por campaña, y al final
 * la página de Facebook. Nada se inventa: si falta algo, se dice qué falta.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Megaphone, RefreshCw, AlertTriangle, ExternalLink, Plug, CalendarRange } from "lucide-react";
import { useActiveBrand } from "@/hooks/useActiveBrand";
import { BrandPicker } from "@/components/broadcasts/BrandPicker";

export const dynamic = "force-dynamic";

type Metric = { name: string; value: string | number };
type Campaign = { id: string; name: string; status?: string; objective?: string; updated_time?: string };
type PageMetric = { name: string; values?: Array<{ value: number }> };

const MONEY = new Set(["Inversión", "Costo por clic"]);

const PERIODOS = [
  { id: "today", label: "Hoy" },
  { id: "yesterday", label: "Ayer" },
  { id: "last_7d", label: "Últimos 7 días" },
  { id: "last_14d", label: "Últimos 14 días" },
  { id: "last_30d", label: "Últimos 30 días" },
  { id: "last_90d", label: "Últimos 90 días" },
  { id: "this_month", label: "Este mes" },
  { id: "last_month", label: "Mes pasado" },
  { id: "maximum", label: "Todo el historial" },
] as const;

/** Formato colombiano: los miles con punto y la plata con su símbolo. */
function show(metric: Metric): string {
  const n = Number(metric.value);
  if (!Number.isFinite(n)) return String(metric.value);
  if (MONEY.has(metric.name)) {
    return n.toLocaleString("es-CO", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  }
  if (metric.name === "CTR") return `${n.toFixed(2)} %`;
  return n.toLocaleString("es-CO", { maximumFractionDigits: 0 });
}

const HINT: Record<string, string> = {
  "Inversión": "Lo gastado en el periodo",
  "Impresiones": "Veces que se mostró",
  "Clics": "Personas que hicieron clic",
  "CTR": "De cada 100 que lo vieron, cuántas hicieron clic",
  "Costo por clic": "Lo que costó cada clic",
  "Personas alcanzadas": "Personas distintas que lo vieron",
};

const PAGE_LABEL: Record<string, string> = {
  page_impressions: "Veces que se vio la página",
  page_engaged_users: "Personas que interactuaron",
  page_post_engagements: "Interacciones con publicaciones",
};

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "bg-green-500/15 text-green-300",
  PAUSED: "bg-amber-500/15 text-amber-300",
  ARCHIVED: "bg-zinc-500/15 text-zinc-400",
  DELETED: "bg-red-500/15 text-red-300",
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Activa",
  PAUSED: "En pausa",
  ARCHIVED: "Archivada",
  DELETED: "Eliminada",
};

export default function AnunciosPage() {
  const { activeClientId, activeClient } = useActiveBrand();
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [pageMetrics, setPageMetrics] = useState<PageMetric[]>([]);
  const [account, setAccount] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [needsConnect, setNeedsConnect] = useState(false);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<string>("last_7d");
  // Fechas propias: sólo se aplican cuando las dos están puestas.
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const custom = Boolean(desde && hasta && desde <= hasta);

  const load = useCallback(async () => {
    if (!activeClientId) return;
    setLoading(true);
    try {
      const rango = custom
        ? `since=${desde}&until=${hasta}`
        : `range=${periodo}`;
      const [insightRes, campaignRes] = await Promise.all([
        fetch(`/api/meta/insights?clientId=${activeClientId}&${rango}`, { cache: "no-store" }),
        fetch(`/api/meta/campaigns?clientId=${activeClientId}`, { cache: "no-store" }),
      ]);
      const insight = await insightRes.json().catch(() => null);
      const campaign = await campaignRes.json().catch(() => null);
      setMetrics(Array.isArray(insight?.insights) ? insight.insights : []);
      setPageMetrics(Array.isArray(insight?.page) ? insight.page : []);
      setCampaigns(Array.isArray(campaign?.campaigns) ? campaign.campaigns : []);
      setAccount(insight?.adAccountId ?? null);
      setReason(insight?.reason || campaign?.reason || null);
      setNeedsConnect(Boolean(insight?.needsConnect));
    } finally {
      setLoading(false);
    }
  }, [activeClientId, periodo, desde, hasta, custom]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-full bg-[#0d1117]">
      <header className="flex flex-wrap items-center gap-3 border-b border-[#2d333b] bg-[#161b22] px-6 py-4">
        <div className="min-w-[220px] flex-1">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-white">
            <Megaphone className="h-5 w-5 text-violet-300" /> Anuncios
          </h1>
          <p className="text-xs text-[#8b949e]">
            Inversión y rendimiento de la pauta de <span className="text-white">{activeClient?.name ?? "—"}</span>
            {account && <span className="text-[#6e7681]"> · act_{account}</span>}
          </p>
        </div>
        <BrandPicker />
        <button
          onClick={() => void load()}
          className="rounded-md border border-[#2d333b] p-2 text-[#8b949e] transition hover:text-white"
          title="Actualizar"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </header>

      <div className="space-y-6 p-6">
        {/* Periodo: preajustes para el día a día, fechas propias para un informe */}
        <div className="flex flex-wrap items-center gap-2">
          <CalendarRange className="h-4 w-4 text-[#6e7681]" />
          <div className="flex flex-wrap gap-1">
            {PERIODOS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPeriodo(p.id);
                  setDesde("");
                  setHasta("");
                }}
                className={`rounded-full px-3 py-1 text-xs transition ${
                  !custom && periodo === p.id
                    ? "bg-violet-500/20 text-violet-200"
                    : "text-[#8b949e] hover:text-white"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-[#6e7681]">
            <span>o entre</span>
            <input
              type="date"
              value={desde}
              max={hasta || undefined}
              onChange={(e) => setDesde(e.target.value)}
              className="rounded-md border border-[#2d333b] bg-[#0d1117] px-2 py-1 text-xs text-white"
            />
            <span>y</span>
            <input
              type="date"
              value={hasta}
              min={desde || undefined}
              onChange={(e) => setHasta(e.target.value)}
              className="rounded-md border border-[#2d333b] bg-[#0d1117] px-2 py-1 text-xs text-white"
            />
            {(desde || hasta) && (
              <button
                type="button"
                onClick={() => {
                  setDesde("");
                  setHasta("");
                }}
                className="text-[#8b949e] underline-offset-2 hover:text-white hover:underline"
              >
                Quitar
              </button>
            )}
          </div>
        </div>

        {reason && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-100">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{reason}</span>
            {needsConnect && (
              <Link
                href="/clients"
                className="inline-flex items-center gap-1.5 rounded-md border border-violet-500/40 bg-violet-500/15 px-3 py-1.5 text-xs font-medium text-violet-100 transition hover:bg-violet-500/25"
              >
                <Plug className="h-3.5 w-3.5" /> Conectar
              </Link>
            )}
          </div>
        )}

        {/* Últimos 7 días */}
        <section>
          <h2 className="mb-3 text-xs uppercase tracking-[0.14em] text-[#6e7681]">
            {custom
              ? `Del ${desde} al ${hasta}`
              : PERIODOS.find((p) => p.id === periodo)?.label || "Periodo"}
          </h2>
          {metrics.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#2d333b] p-10 text-center">
              <Megaphone className="mx-auto h-7 w-7 text-[#2d333b]" />
              <p className="mt-3 text-sm font-medium text-white">
                {loading ? "Cargando…" : "Sin datos de inversión"}
              </p>
              {!loading && !reason && (
                <p className="text-xs text-[#8b949e]">Esta cuenta no registró actividad en el periodo elegido.</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              {metrics.map((m) => (
                <div key={m.name} className="rounded-xl border border-[#2d333b] bg-[#161b22] p-4">
                  <p className="text-2xl font-semibold tabular-nums text-white">{show(m)}</p>
                  <p className="mt-1 text-xs font-medium text-[#8b949e]">{m.name}</p>
                  {HINT[m.name] && <p className="mt-0.5 text-[10px] leading-snug text-[#6e7681]">{HINT[m.name]}</p>}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Campañas */}
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-xs uppercase tracking-[0.14em] text-[#6e7681]">Campañas</h2>
            {campaigns.length > 0 && (
              <span className="text-xs text-[#6e7681]">
                {campaigns.length} {campaigns.length === 1 ? "campaña" : "campañas"}
              </span>
            )}
          </div>
          {campaigns.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#2d333b] p-10 text-center text-xs text-[#8b949e]">
              {loading ? "Cargando…" : "Esta cuenta publicitaria no tiene campañas."}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[#2d333b] bg-[#161b22]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2d333b] text-left text-[11px] uppercase tracking-wider text-[#6e7681]">
                    <th className="px-4 py-2.5 font-medium">Campaña</th>
                    <th className="px-4 py-2.5 font-medium">Estado</th>
                    <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Objetivo</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id} className="border-b border-[#2d333b] last:border-0">
                      <td className="px-4 py-3 text-white">{c.name}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            STATUS_STYLE[c.status ?? ""] || "bg-zinc-500/15 text-zinc-400"
                          }`}
                        >
                          {STATUS_LABEL[c.status ?? ""] || c.status || "—"}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 text-[#8b949e] sm:table-cell">
                        {(c.objective || "").replace(/^OUTCOME_/, "").toLowerCase() || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Página de Facebook */}
        {pageMetrics.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs uppercase tracking-[0.14em] text-[#6e7681]">Página de Facebook</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {pageMetrics.map((p) => {
                const total = (p.values || []).reduce((sum, v) => sum + (Number(v.value) || 0), 0);
                return (
                  <div key={p.name} className="rounded-xl border border-[#2d333b] bg-[#161b22] p-4">
                    <p className="text-2xl font-semibold tabular-nums text-white">
                      {total.toLocaleString("es-CO")}
                    </p>
                    <p className="mt-1 text-xs text-[#8b949e]">{PAGE_LABEL[p.name] || p.name}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <p className="flex flex-wrap items-center gap-2 text-[11px] text-[#6e7681]">
          Los datos vienen de Meta, sin retoques.
          <a
            href="https://adsmanager.facebook.com/adsmanager"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[#8b949e] transition hover:text-white"
          >
            <ExternalLink className="h-3 w-3" /> Abrir el Administrador de anuncios
          </a>
        </p>
      </div>
    </div>
  );
}
