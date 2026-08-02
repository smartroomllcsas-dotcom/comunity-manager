"use client";

/**
 * Sprint 25 · Client component for /listening.
 *
 * Layout:
 *   - Client selector (top)
 *   - 4 stat cards: Health Score, Sentiment 24h, Mentions 24h, Crisis Alerts
 *   - 30-day timeseries chart (SVG, no external chart lib to keep it light)
 *   - Filter chips (sentiment, urgency)
 *   - Feed of recent mentions with action buttons
 *   - Crisis banner if latest snapshot has crisis_triggered=true
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Flame,
  MessageCircle,
  X,
} from "lucide-react";

type ClientOption = { id: string; name: string };

type Snapshot = {
  snapshot_at: string;
  window_hours: number;
  mentions_count: number;
  sentiment_avg: number | null;
  sentiment_delta_pct: number | null;
  positive_pct: number | null;
  neutral_pct: number | null;
  negative_pct: number | null;
  crisis_triggered: boolean;
  health_score: number | null;
};

type Mention = {
  id: string;
  platform: string;
  source_type: string;
  source_url: string | null;
  author_handle: string;
  content: string;
  sentiment_score: number | null;
  sentiment_label: "positive" | "neutral" | "negative" | null;
  intent_label: string | null;
  urgency_score: number | null;
  is_processed: boolean;
  responded_at: string | null;
  fetched_at: string;
};

type SentimentFilter = "all" | "positive" | "neutral" | "negative";

function healthColor(score: number | null | undefined): string {
  if (score == null) return "text-muted-foreground";
  if (score >= 70) return "text-emerald-400";
  if (score >= 40) return "text-amber-400";
  return "text-red-400";
}

function sentimentColor(label: string | null | undefined): string {
  if (label === "positive") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  if (label === "negative") return "bg-red-500/15 text-red-300 border-red-500/30";
  return "bg-slate-500/15 text-slate-300 border-slate-500/30";
}

export function ListeningView({
  clients,
  initialClientId,
}: {
  clients: ClientOption[];
  initialClientId: string;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(initialClientId);
  const [series, setSeries] = useState<Snapshot[]>([]);
  const [latest, setLatest] = useState<Snapshot | null>(null);
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [loading, setLoading] = useState(true);
  const [sentimentFilter, setSentimentFilter] =
    useState<SentimentFilter>("all");
  const [urgencyOnly, setUrgencyOnly] = useState(false);
  const [windowKey, setWindowKey] = useState<"24h" | "7d" | "30d">("30d");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const healthUrl = `/api/mentions/health?client_id=${encodeURIComponent(clientId)}&window=${windowKey}`;
      const mentionsUrl = (() => {
        const params = new URLSearchParams({ client_id: clientId, limit: "50" });
        if (sentimentFilter !== "all") params.set("sentiment", sentimentFilter);
        if (urgencyOnly) params.set("urgency_min", "4");
        return `/api/mentions?${params.toString()}`;
      })();

      const [healthRes, mentionsRes] = await Promise.all([
        fetch(healthUrl, { cache: "no-store" }),
        fetch(mentionsUrl, { cache: "no-store" }),
      ]);
      const healthJson = healthRes.ok
        ? await healthRes.json()
        : { latest: null, series: [] };
      const mentionsJson = mentionsRes.ok
        ? await mentionsRes.json()
        : { mentions: [] };

      setLatest(healthJson.latest ?? null);
      setSeries(healthJson.series ?? []);
      setMentions(mentionsJson.mentions ?? []);
    } finally {
      setLoading(false);
    }
  }, [clientId, sentimentFilter, urgencyOnly, windowKey]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleClientChange = (id: string) => {
    setClientId(id);
    router.replace(`/listening?client_id=${encodeURIComponent(id)}`);
  };

  const patchMention = async (
    id: string,
    action: "responded" | "ignored" | "escalated",
  ) => {
    const res = await fetch(`/api/mentions?id=${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) {
      setMentions((prev) => prev.filter((m) => m.id !== id));
    }
  };

  const crisisCount = useMemo(
    () => series.filter((s) => s.crisis_triggered).length,
    [series],
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Client selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-muted-foreground">Cliente:</label>
        <select
          value={clientId}
          onChange={(e) => handleClientChange(e.target.value)}
          className="h-9 rounded-md border border-border bg-[#1a1f2e] px-3 text-sm"
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="ml-auto flex gap-1">
          {(["24h", "7d", "30d"] as const).map((w) => (
            <button
              key={w}
              onClick={() => setWindowKey(w)}
              className={`h-8 rounded-md border border-border px-3 text-xs transition ${
                windowKey === w
                  ? "bg-primary text-primary-foreground"
                  : "bg-[#1a1f2e] hover:bg-[#232a3a]"
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* Crisis banner */}
      {latest?.crisis_triggered && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5" />
          <div>
            <div className="font-medium text-red-300">
              Alerta de crisis reputacional
            </div>
            <div className="text-sm text-red-200/80">
              El sentiment cayo{" "}
              {Math.abs(Number(latest.sentiment_delta_pct ?? 0)).toFixed(1)}%
              en las ultimas 24h. Revisa las menciones urgentes ya.
            </div>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Activity}
          label="Health Score"
          value={
            latest?.health_score != null ? String(latest.health_score) : "--"
          }
          hint={latest ? "0-100 (compuesto)" : "sin datos aun"}
          valueClassName={healthColor(latest?.health_score ?? null)}
        />
        <StatCard
          icon={
            (latest?.sentiment_delta_pct ?? 0) >= 0 ? ArrowUp : ArrowDown
          }
          label="Sentiment 24h"
          value={
            latest?.sentiment_avg != null
              ? Number(latest.sentiment_avg).toFixed(2)
              : "--"
          }
          hint={
            latest?.sentiment_delta_pct != null
              ? `${Number(latest.sentiment_delta_pct).toFixed(1)}% vs anterior`
              : "sin baseline"
          }
        />
        <StatCard
          icon={MessageCircle}
          label="Menciones 24h"
          value={String(latest?.mentions_count ?? 0)}
          hint={`${Math.round(Number(latest?.positive_pct ?? 0))}% positivas`}
        />
        <StatCard
          icon={Flame}
          label="Alertas de crisis"
          value={String(crisisCount)}
          hint={`en la ventana ${windowKey}`}
          valueClassName={crisisCount > 0 ? "text-red-400" : ""}
        />
      </div>

      {/* Timeseries chart */}
      <div className="rounded-xl border border-border bg-[#1a1f2e] p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium">
            Health score - ventana {windowKey}
          </h2>
          <span className="text-xs text-muted-foreground">
            {series.length} snapshot{series.length === 1 ? "" : "s"}
          </span>
        </div>
        <HealthChart series={series} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "positive", "neutral", "negative"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSentimentFilter(s)}
            className={`h-8 rounded-full border px-3 text-xs transition ${
              sentimentFilter === s
                ? "border-primary bg-primary/20 text-primary-foreground"
                : "border-border bg-[#1a1f2e] hover:bg-[#232a3a]"
            }`}
          >
            {s === "all" ? "Todas" : s}
          </button>
        ))}
        <button
          onClick={() => setUrgencyOnly((v) => !v)}
          className={`h-8 rounded-full border px-3 text-xs transition inline-flex items-center gap-1 ${
            urgencyOnly
              ? "border-red-500/60 bg-red-500/15 text-red-300"
              : "border-border bg-[#1a1f2e] hover:bg-[#232a3a]"
          }`}
        >
          <Flame className="h-3 w-3" /> Solo urgentes (&gt;=4)
        </button>
      </div>

      {/* Mention feed */}
      <div className="rounded-xl border border-border bg-[#1a1f2e] overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-medium">Menciones recientes</h2>
          <span className="text-xs text-muted-foreground">
            {loading ? "cargando..." : `${mentions.length} resultado(s)`}
          </span>
        </div>
        {mentions.length === 0 && !loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No hay menciones que coincidan con los filtros.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {mentions.map((m) => (
              <MentionRow
                key={m.id}
                mention={m}
                onAction={patchMention}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  valueClassName,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-[#1a1f2e] p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </div>
      <div className={`text-3xl font-semibold ${valueClassName ?? ""}`}>
        {value}
      </div>
      {hint && (
        <div className="text-xs text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}

function HealthChart({ series }: { series: Snapshot[] }) {
  if (series.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-xs text-muted-foreground">
        Aun no hay snapshots. El cron corre cada hora.
      </div>
    );
  }
  const w = 800;
  const h = 120;
  const pad = 8;
  const values = series.map((s) => s.health_score ?? 50);
  const minV = 0;
  const maxV = 100;
  const stepX = series.length > 1 ? (w - pad * 2) / (series.length - 1) : 0;
  const points = values
    .map((v, i) => {
      const x = pad + i * stepX;
      const y = pad + (1 - (v - minV) / (maxV - minV)) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-32"
      preserveAspectRatio="none"
    >
      <line
        x1={pad}
        x2={w - pad}
        y1={h / 2}
        y2={h / 2}
        stroke="currentColor"
        strokeOpacity="0.1"
      />
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.9"
        strokeWidth="2"
      />
      {series.map((s, i) => {
        if (!s.crisis_triggered) return null;
        const x = pad + i * stepX;
        return (
          <circle
            key={i}
            cx={x}
            cy={pad + (1 - ((s.health_score ?? 0) - minV) / (maxV - minV)) * (h - pad * 2)}
            r="3.5"
            fill="rgb(248 113 113)"
          />
        );
      })}
    </svg>
  );
}

function MentionRow({
  mention,
  onAction,
}: {
  mention: Mention;
  onAction: (
    id: string,
    action: "responded" | "ignored" | "escalated",
  ) => void;
}) {
  return (
    <li className="p-4 flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {mention.platform}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full border ${sentimentColor(mention.sentiment_label)}`}
            >
              {mention.sentiment_label ?? "n/a"}
            </span>
            {mention.intent_label && (
              <span className="text-xs px-2 py-0.5 rounded-full border border-border bg-[#232a3a]">
                {mention.intent_label}
              </span>
            )}
            {(mention.urgency_score ?? 0) >= 4 && (
              <span className="text-xs px-2 py-0.5 rounded-full border border-red-500/40 bg-red-500/10 text-red-300 inline-flex items-center gap-1">
                <Flame className="h-3 w-3" /> u{mention.urgency_score}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              @{mention.author_handle}
            </span>
          </div>
          <div className="text-sm text-foreground/90 whitespace-pre-wrap break-words">
            {mention.content}
          </div>
          {mention.source_url && (
            <a
              href={mention.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary underline"
            >
              Ver origen
            </a>
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <button
            onClick={() => onAction(mention.id, "responded")}
            className="h-7 rounded-md border border-border bg-[#232a3a] hover:bg-[#2c3448] px-2 text-xs inline-flex items-center gap-1"
            title="Marcar respondida"
          >
            <CheckCircle2 className="h-3 w-3" /> Respondida
          </button>
          <button
            onClick={() => onAction(mention.id, "ignored")}
            className="h-7 rounded-md border border-border bg-[#232a3a] hover:bg-[#2c3448] px-2 text-xs inline-flex items-center gap-1"
            title="Ignorar"
          >
            <X className="h-3 w-3" /> Ignorar
          </button>
          <button
            onClick={() => onAction(mention.id, "escalated")}
            className="h-7 rounded-md border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-300 px-2 text-xs inline-flex items-center gap-1"
            title="Escalar"
          >
            <Flame className="h-3 w-3" /> Escalar
          </button>
        </div>
      </div>
    </li>
  );
}
