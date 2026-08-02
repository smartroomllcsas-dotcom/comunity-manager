"use client";

// Sprint 25 · Agente K — Dashboard cliente-side de analytics unificadas.
//
// Layout (mobile-first, se expande a grid en >= md):
//
//   ┌────────────────────────────────────────────────────────────────┐
//   │  Filters: [client dropdown]  [7d 30d 90d]  [☑ ig ☑ fb ☑ tt ...] │
//   ├────────────────────────────────────────────────────────────────┤
//   │  StatCard   StatCard   StatCard   StatCard                     │
//   │  Impressions Engagement Growth   Posts published               │
//   ├────────────────────────────────────────────────────────────────┤
//   │  Impressions timeseries (line, SVG inline)                     │
//   │  ────────────────────────────────                              │
//   │  Engagement by platform (bar chart, SVG inline)                │
//   ├────────────────────────────────────────────────────────────────┤
//   │  Top posts table (thumbnail placeholder, platform, impressions,│
//   │  engagement rate, link)                                        │
//   ├────────────────────────────────────────────────────────────────┤
//   │  [Exportar PDF]  ← stub (TODO)                                 │
//   └────────────────────────────────────────────────────────────────┘
//
// Charts: SVG inline (paths + rects) — sin dependencias externas para
// mantener el bundle liviano.

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Eye, Heart, TrendingUp, Users, Download } from "lucide-react";

// -----------------------------------------------------------------------------
// Types (exportados para el server component)
// -----------------------------------------------------------------------------

export interface AnalyticsPayload {
  range: string;
  days: number;
  mock?: boolean;
  summary: {
    impressions: number;
    engagement: number;
    growth: number;
    top_platform: string | null;
    posts_published: number;
  };
  by_platform: Array<{ platform: string; impressions: number; engagement: number; posts: number }>;
  top_posts: Array<{
    post_id: string;
    platform: string;
    impressions: number;
    likes: number; comments: number; shares: number; saves: number; clicks: number;
    engagement_rate: number;
    snapshot_at: string;
  }>;
  timeseries: Array<{ date: string; impressions: number; engagement: number }>;
}

interface Client { id: string; name: string }

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

const RANGES: Array<{ key: "7d" | "30d" | "90d"; label: string }> = [
  { key: "7d", label: "7 días" },
  { key: "30d", label: "30 días" },
  { key: "90d", label: "90 días" },
];

const PLATFORM_OPTIONS = [
  { key: "ig-feed",          label: "Instagram" },
  { key: "fb",               label: "Facebook" },
  { key: "tiktok",           label: "TikTok" },
  { key: "linkedin-company", label: "LinkedIn" },
  { key: "threads",          label: "Threads" },
];

const PLATFORM_COLORS: Record<string, string> = {
  "ig-feed": "#e1306c",
  "ig-reel": "#e1306c",
  "ig-story": "#e1306c",
  instagram: "#e1306c",
  fb: "#1877f2",
  facebook: "#1877f2",
  tiktok: "#00f2ea",
  "linkedin-company": "#0a66c2",
  "linkedin-personal": "#0a66c2",
  linkedin: "#0a66c2",
  threads: "#a1a1aa",
};

export default function AnalyticsDashboard({ initial }: { initial: AnalyticsPayload | null }) {
  const [data, setData] = useState<AnalyticsPayload | null>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<string>("");
  const [range, setRange] = useState<"7d" | "30d" | "90d">("30d");
  const [platforms, setPlatforms] = useState<string[]>(PLATFORM_OPTIONS.map((p) => p.key));

  // Sprint 26 · Agente P — estado del export PDF.
  const [exportState, setExportState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [exportMsg, setExportMsg] = useState<string>("");

  // Cargar lista de clientes (para el dropdown). Fail-silent: si /api/clients
  // no existe o no responde, dejamos el dropdown vacío.
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/clients", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        if (Array.isArray(j?.clients)) setClients(j.clients);
        else if (Array.isArray(j)) setClients(j);
      } catch { /* noop */ }
    })();
  }, []);

  const reload = useCallback(async (opts: { mock?: boolean } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set("range", range);
      if (clientId) qs.set("client_id", clientId);
      if (platforms.length && platforms.length < PLATFORM_OPTIONS.length) {
        qs.set("platforms", platforms.join(","));
      }
      if (opts.mock) qs.set("mock", "1");
      const r = await fetch(`/api/analytics?${qs.toString()}`, { cache: "no-store" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || `HTTP ${r.status}`);
      }
      setData(await r.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [range, clientId, platforms]);

  // Refetch al cambiar filtros (salvo el mount inicial que ya trae `initial`).
  const [firstMount, setFirstMount] = useState(true);
  useEffect(() => {
    if (firstMount) { setFirstMount(false); return; }
    reload();
  }, [range, clientId, platforms, reload, firstMount]);

  const summary = data?.summary;

  return (
    <div className="p-6 flex flex-col gap-6 min-h-screen bg-[#0d1117] text-white">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-blue-400" /> Analytics
          </h1>
          <p className="text-sm text-[#8b949e]">
            Métricas unificadas cross-canal · último snapshot cada hora
            {data?.mock && <span className="ml-2 rounded bg-amber-500/20 text-amber-300 px-2 py-0.5 text-xs">DATOS MOCK</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => reload({ mock: true })}
          className="text-xs px-3 py-1.5 rounded-md bg-[#1a1f2e] border border-[#2d333b] hover:bg-[#242a37] text-[#8b949e]"
        >
          Cargar datos mock
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl bg-[#1a1f2e] border border-[#2d333b]">
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="bg-[#0d1117] border border-[#2d333b] rounded-md px-3 py-2 text-sm"
        >
          <option value="">Todos los clientes</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <div className="flex rounded-md overflow-hidden border border-[#2d333b]">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={`px-3 py-2 text-sm ${range === r.key ? "bg-blue-600 text-white" : "bg-[#0d1117] text-[#8b949e] hover:bg-[#1a1f2e]"}`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {PLATFORM_OPTIONS.map((p) => {
            const active = platforms.includes(p.key);
            return (
              <label
                key={p.key}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md border cursor-pointer text-xs ${
                  active ? "border-blue-500 bg-blue-500/10 text-white" : "border-[#2d333b] text-[#8b949e]"
                }`}
              >
                <input
                  type="checkbox"
                  className="hidden"
                  checked={active}
                  onChange={(e) => {
                    setPlatforms((cur) =>
                      e.target.checked ? [...cur, p.key] : cur.filter((x) => x !== p.key),
                    );
                  }}
                />
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PLATFORM_COLORS[p.key] || "#8b949e" }} />
                {p.label}
              </label>
            );
          })}
        </div>

        {loading && <span className="text-xs text-[#8b949e] ml-auto">Cargando…</span>}
        {error && <span className="text-xs text-red-400 ml-auto">{error}</span>}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Eye}       label="Impressions"      value={fmtNum(summary?.impressions)} color="#3b82f6" />
        <StatCard icon={Heart}     label="Engagement"       value={fmtNum(summary?.engagement)}  color="#e11d48" />
        <StatCard icon={TrendingUp} label="Growth (followers)" value={fmtNum(summary?.growth)}    color="#22c55e" />
        <StatCard icon={Users}     label="Posts publicados" value={fmtNum(summary?.posts_published)} color="#a855f7" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Impressions por día">
          <LineChart data={data?.timeseries ?? []} />
        </ChartCard>
        <ChartCard title="Engagement por canal">
          <BarChartByPlatform data={data?.by_platform ?? []} />
        </ChartCard>
      </div>

      {/* Top posts table */}
      <div className="rounded-xl bg-[#1a1f2e] border border-[#2d333b] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#2d333b]">
          <h3 className="text-sm font-semibold">Top posts</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#0d1117] text-[#8b949e]">
              <tr>
                <th className="text-left px-4 py-2">Post</th>
                <th className="text-left px-4 py-2">Canal</th>
                <th className="text-right px-4 py-2">Impressions</th>
                <th className="text-right px-4 py-2">Engagement</th>
                <th className="text-right px-4 py-2">Rate</th>
                <th className="text-left px-4 py-2">Link</th>
              </tr>
            </thead>
            <tbody>
              {(data?.top_posts ?? []).length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-[#8b949e]">
                  Sin datos aún — publica algunos posts o carga datos mock.
                </td></tr>
              )}
              {(data?.top_posts ?? []).map((p) => {
                const eng = p.likes + p.comments + p.shares + p.saves;
                return (
                  <tr key={p.post_id} className="border-t border-[#2d333b] hover:bg-[#0d1117]">
                    <td className="px-4 py-2 flex items-center gap-2">
                      <div className="h-9 w-9 rounded bg-[#0d1117] border border-[#2d333b] flex items-center justify-center text-[10px] text-[#8b949e]">IMG</div>
                      <span className="font-mono text-xs">{p.post_id.slice(0, 8)}…</span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PLATFORM_COLORS[p.platform] || "#8b949e" }} />
                        {p.platform}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtNum(p.impressions)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtNum(eng)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{(p.engagement_rate * 100).toFixed(2)}%</td>
                    <td className="px-4 py-2">
                      <a href={`/composer?post=${p.post_id}`} className="text-blue-400 hover:underline text-xs">ver</a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Export — Sprint 26 · Agente P */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          disabled={exportState === "loading"}
          onClick={async () => {
            if (!clientId) {
              setExportState("error");
              setExportMsg("Selecciona un cliente para exportar.");
              return;
            }
            setExportState("loading");
            setExportMsg("Generando PDF... (~15-30s)");
            try {
              const days = data?.days ?? (range === "7d" ? 7 : range === "30d" ? 30 : 90);
              const end = new Date();
              end.setUTCDate(end.getUTCDate() - 1);
              const start = new Date(end);
              start.setUTCDate(start.getUTCDate() - (days - 1));
              const iso = (d: Date) => d.toISOString().slice(0, 10);
              const res = await fetch("/api/reports", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  client_id: clientId,
                  period_type: "custom",
                  period_start: iso(start),
                  period_end: iso(end),
                  include_insights: true,
                }),
              });
              if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                throw new Error(j.error || `HTTP ${res.status}`);
              }
              const j = await res.json();
              setExportState("success");
              setExportMsg(`PDF listo (${((j.size_bytes ?? 0) / 1024).toFixed(0)} KB)`);
              const url = j.public_url || `/api/reports/${j.id}`;
              window.open(url, "_blank", "noopener,noreferrer");
            } catch (e) {
              setExportState("error");
              setExportMsg(e instanceof Error ? e.message : String(e));
            }
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#1a1f2e] border border-[#2d333b] hover:bg-[#242a37] disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          <Download className="h-4 w-4" /> {exportState === "loading" ? "Generando..." : "Exportar PDF"}
        </button>
        <a href="/reports-cm" className="text-xs text-blue-400 hover:underline">
          Personalizar branding →
        </a>
        {exportMsg && (
          <span
            className={`text-xs ${
              exportState === "success"
                ? "text-green-400"
                : exportState === "error"
                  ? "text-red-400"
                  : "text-blue-400"
            }`}
          >
            {exportMsg}
          </span>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Sub-components
// -----------------------------------------------------------------------------

function StatCard({
  icon: Icon, label, value, color,
}: { icon: React.ElementType; label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl bg-[#1a1f2e] border border-[#2d333b] p-5 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[#8b949e] text-sm">{label}</span>
        <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + "20" }}>
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
      </div>
      <div className="text-3xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-[#1a1f2e] border border-[#2d333b] p-4 flex flex-col gap-3 min-h-[280px]">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="flex-1 min-h-[220px]">{children}</div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Inline SVG charts (sin deps)
// -----------------------------------------------------------------------------

function LineChart({ data }: { data: Array<{ date: string; impressions: number; engagement: number }> }) {
  const { width, height, pad } = { width: 600, height: 220, pad: 32 };
  if (data.length === 0) {
    return <EmptyChart label="Sin datos" />;
  }

  const max = Math.max(1, ...data.map((d) => d.impressions));
  const xStep = (width - pad * 2) / Math.max(1, data.length - 1);

  const pointsImpr = data
    .map((d, i) => {
      const x = pad + i * xStep;
      const y = height - pad - (d.impressions / max) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const pointsEng = data
    .map((d, i) => {
      const x = pad + i * xStep;
      const y = height - pad - (d.engagement / max) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const areaImpr = `M ${pad},${height - pad} L ${pointsImpr.split(" ").join(" L ")} L ${(width - pad).toFixed(1)},${height - pad} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
      {/* baseline */}
      <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#2d333b" />
      {/* impressions area */}
      <path d={areaImpr} fill="rgba(59,130,246,0.15)" />
      {/* impressions line */}
      <polyline points={pointsImpr} fill="none" stroke="#3b82f6" strokeWidth="2" />
      {/* engagement line */}
      <polyline points={pointsEng} fill="none" stroke="#e11d48" strokeWidth="1.5" strokeDasharray="4 3" />
      {/* labels edges */}
      <text x={pad} y={height - 8} fontSize="10" fill="#8b949e">{data[0].date.slice(5)}</text>
      <text x={width - pad} y={height - 8} fontSize="10" fill="#8b949e" textAnchor="end">
        {data[data.length - 1].date.slice(5)}
      </text>
      {/* legend */}
      <g transform={`translate(${pad + 4}, ${pad - 12})`}>
        <rect width="10" height="10" fill="#3b82f6" />
        <text x="14" y="9" fontSize="10" fill="#8b949e">Impressions</text>
        <rect width="10" height="10" fill="#e11d48" transform="translate(100, 0)" />
        <text x="114" y="9" fontSize="10" fill="#8b949e">Engagement</text>
      </g>
    </svg>
  );
}

function BarChartByPlatform({ data }: { data: Array<{ platform: string; impressions: number; engagement: number; posts: number }> }) {
  const width = 600, height = 220, pad = 32;
  if (data.length === 0) return <EmptyChart label="Sin datos por canal" />;

  const max = Math.max(1, ...data.map((d) => d.engagement));
  const barW = (width - pad * 2) / data.length - 8;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
      <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#2d333b" />
      {data.map((d, i) => {
        const x = pad + i * (barW + 8);
        const h = (d.engagement / max) * (height - pad * 2);
        const y = height - pad - h;
        const color = PLATFORM_COLORS[d.platform] || "#8b949e";
        return (
          <g key={d.platform}>
            <rect x={x} y={y} width={barW} height={h} fill={color} rx={3} />
            <text x={x + barW / 2} y={y - 4} fontSize="10" fill="#c9d1d9" textAnchor="middle">
              {fmtNum(d.engagement)}
            </text>
            <text x={x + barW / 2} y={height - pad + 14} fontSize="10" fill="#8b949e" textAnchor="middle">
              {shortPlatform(d.platform)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="w-full h-full flex items-center justify-center text-sm text-[#8b949e]">
      {label}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Utils
// -----------------------------------------------------------------------------

function fmtNum(n: number | undefined | null): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function shortPlatform(p: string): string {
  if (p.startsWith("ig")) return "IG";
  if (p === "fb" || p === "facebook") return "FB";
  if (p.startsWith("linkedin")) return "LI";
  if (p === "tiktok") return "TT";
  if (p === "threads") return "TH";
  return p.slice(0, 3).toUpperCase();
}
