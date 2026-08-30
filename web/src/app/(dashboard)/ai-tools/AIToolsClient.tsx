"use client";

// Sprint 25 · UI cliente para el playground de IA. 3 tabs. Estilo consistente
// con /composer (dark palette, badges, botones minimal).

import * as React from "react";
import { useActiveBrand } from "@/hooks/useActiveBrand";

type Tab = "generate" | "repurpose" | "draft";

/** clientId editable que arranca con la marca activa del BrandSwitcher (no demo). */
function useBrandClientId() {
  const { activeClientId } = useActiveBrand();
  const [clientId, setClientId] = React.useState("");
  React.useEffect(() => {
    if (activeClientId) setClientId((prev) => (prev === "" ? activeClientId : prev));
  }, [activeClientId]);
  return [clientId, setClientId] as const;
}

interface GenVariant {
  platform: string;
  content: string;
  hashtags: string[];
  media_prompt?: string;
  estimated_reach?: string;
}
interface GenResult {
  variants: GenVariant[];
  skills_used: string[];
  cost_estimate_usd: number;
}

interface RepurposeResult {
  tweets: string[];
  linkedin_carousels: Array<{ title: string; slides: string[] }>;
  instagram_posts: string[];
  tiktok_scripts: Array<{ hook: string; body: string; cta: string }>;
  cost_estimate_usd: number;
  source_kind: string;
  skills_used: string[];
}

interface DraftResult {
  drafts: Array<{ text: string; tone: string; confidence: number }>;
  recommended: number;
  should_escalate: boolean;
  reasoning: string;
  cost_estimate_usd: number;
  skills_used: string[];
}

const ALL_PLATFORMS = ["ig-feed", "ig-reel", "tiktok", "linkedin", "x", "threads", "fb", "pinterest"];

const tabBase =
  "px-4 py-2 text-sm rounded-t-md border-b-2 transition-colors cursor-pointer";
const tabActive = "border-[#58a6ff] text-[#e6edf3]";
const tabInactive = "border-transparent text-[#8b949e] hover:text-[#e6edf3]";
const boxCls =
  "rounded-md border border-[#30363d] bg-[#0d1117] p-4 text-[#e6edf3]";
const inputCls =
  "w-full bg-[#010409] border border-[#30363d] rounded-md p-2 text-sm text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]";
const btnCls =
  "px-4 py-2 rounded-md bg-[#238636] hover:bg-[#2ea043] text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed";

export default function AIToolsClient() {
  const [tab, setTab] = React.useState<Tab>("generate");
  return (
    <div>
      <div className="flex gap-2 border-b border-[#30363d] mb-4">
        <button
          type="button"
          className={`${tabBase} ${tab === "generate" ? tabActive : tabInactive}`}
          onClick={() => setTab("generate")}
        >
          Generate
        </button>
        <button
          type="button"
          className={`${tabBase} ${tab === "repurpose" ? tabActive : tabInactive}`}
          onClick={() => setTab("repurpose")}
        >
          Repurpose
        </button>
        <button
          type="button"
          className={`${tabBase} ${tab === "draft" ? tabActive : tabInactive}`}
          onClick={() => setTab("draft")}
        >
          Draft Response
        </button>
      </div>

      {tab === "generate" && <GenerateTab />}
      {tab === "repurpose" && <RepurposeTab />}
      {tab === "draft" && <DraftTab />}
    </div>
  );
}

function CostBadge({ usd }: { usd: number }) {
  return (
    <span className="inline-block text-xs px-2 py-0.5 rounded bg-[#1f6feb1a] text-[#58a6ff] border border-[#1f6feb40]">
      ${usd.toFixed(4)} USD
    </span>
  );
}

function SkillsBadges({ skills }: { skills: string[] }) {
  if (!skills.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {skills.map((s) => (
        <span
          key={s}
          className="text-xs px-2 py-0.5 rounded bg-[#8957e51a] text-[#a371f7] border border-[#8957e540]"
        >
          {s}
        </span>
      ))}
    </div>
  );
}

// ── Tab 1: Generate ──────────────────────────────────────────────────────────

function GenerateTab() {
  const [clientId, setClientId] = useBrandClientId();
  const [goal, setGoal] = React.useState("");
  const [audience, setAudience] = React.useState("");
  const [brandVoice, setBrandVoice] = React.useState("");
  const [platforms, setPlatforms] = React.useState<string[]>(["ig-feed", "x", "linkedin"]);
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<GenResult | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  const togglePlatform = (p: string) => {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  const run = async () => {
    setLoading(true);
    setErr(null);
    setResult(null);
    try {
      const r = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          goal,
          targetAudience: audience || undefined,
          brandVoice: brandVoice || undefined,
          platforms,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      setResult(data as GenResult);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={boxCls}>
      <div className="grid gap-3 mb-4">
        <div>
          <label className="text-xs text-[#8b949e] block mb-1">Client ID</label>
          <input
            className={inputCls}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-[#8b949e] block mb-1">
            Goal (ej. &quot;vender curso fintech CTO&quot;, &quot;generar leads B2B&quot;)
          </label>
          <input
            className={inputCls}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Cold email para fintech CTO"
          />
        </div>
        <div>
          <label className="text-xs text-[#8b949e] block mb-1">Target audience</label>
          <input
            className={inputCls}
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            placeholder="CTOs de fintech Series A-B en LATAM"
          />
        </div>
        <div>
          <label className="text-xs text-[#8b949e] block mb-1">Brand voice</label>
          <textarea
            className={inputCls}
            rows={2}
            value={brandVoice}
            onChange={(e) => setBrandVoice(e.target.value)}
            placeholder="Directa, técnica, sin fluff. Emoji nunca."
          />
        </div>
        <div>
          <label className="text-xs text-[#8b949e] block mb-1">Platforms</label>
          <div className="flex flex-wrap gap-2">
            {ALL_PLATFORMS.map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => togglePlatform(p)}
                className={`text-xs px-2 py-1 rounded border ${
                  platforms.includes(p)
                    ? "bg-[#238636] border-[#2ea043] text-white"
                    : "bg-transparent border-[#30363d] text-[#8b949e]"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>
      <button className={btnCls} onClick={run} disabled={loading || !goal || !platforms.length}>
        {loading ? "Generando…" : "Ejecutar"}
      </button>

      {err && (
        <div className="mt-4 p-3 rounded bg-[#f851491a] border border-[#f8514940] text-[#ff7b72] text-sm">
          {err}
        </div>
      )}

      {result && (
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-3">
            <CostBadge usd={result.cost_estimate_usd} />
            <SkillsBadges skills={result.skills_used} />
          </div>
          <div className="grid gap-3">
            {result.variants.map((v) => (
              <div key={v.platform} className="border border-[#30363d] rounded p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-[#58a6ff] uppercase">
                    {v.platform}
                  </span>
                  {v.estimated_reach && (
                    <span className="text-xs text-[#8b949e]">
                      reach: {v.estimated_reach}
                    </span>
                  )}
                </div>
                <div className="text-sm whitespace-pre-wrap">{v.content}</div>
                {v.hashtags.length > 0 && (
                  <div className="mt-2 text-xs text-[#7ee787]">
                    {v.hashtags.map((h) => `#${h}`).join(" ")}
                  </div>
                )}
                {v.media_prompt && (
                  <div className="mt-2 text-xs text-[#8b949e] italic">
                    Image prompt: {v.media_prompt}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 2: Repurpose ─────────────────────────────────────────────────────────

function RepurposeTab() {
  const [markdown, setMarkdown] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<RepurposeResult | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setErr(null);
    setResult(null);
    try {
      const body: Record<string, string> = {};
      if (url) body.url = url;
      else body.markdown = markdown;
      const r = await fetch("/api/ai/repurpose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      setResult(data as RepurposeResult);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={boxCls}>
      <div className="grid gap-3 mb-4">
        <div>
          <label className="text-xs text-[#8b949e] block mb-1">URL (blog / artículo)</label>
          <input
            className={inputCls}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://ejemplo.com/blog/post"
          />
        </div>
        <div className="text-center text-xs text-[#8b949e]">o</div>
        <div>
          <label className="text-xs text-[#8b949e] block mb-1">Markdown / texto directo</label>
          <textarea
            className={inputCls}
            rows={8}
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            placeholder="Pega aquí el contenido long-form…"
          />
        </div>
      </div>
      <button
        className={btnCls}
        onClick={run}
        disabled={loading || (!url && !markdown)}
      >
        {loading ? "Repurpose…" : "Ejecutar"}
      </button>

      {err && (
        <div className="mt-4 p-3 rounded bg-[#f851491a] border border-[#f8514940] text-[#ff7b72] text-sm">
          {err}
        </div>
      )}

      {result && (
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-3">
            <CostBadge usd={result.cost_estimate_usd} />
            <span className="text-xs text-[#8b949e]">source: {result.source_kind}</span>
            <SkillsBadges skills={result.skills_used} />
          </div>

          {result.source_kind === "youtube-stub" && (
            <div className="p-3 rounded bg-[#f2cc601a] border border-[#f2cc6040] text-[#f2cc60] text-sm mb-3">
              FIXME: integración YouTube transcript pendiente. Pega la transcripción manualmente por ahora.
            </div>
          )}

          <Section title={`Tweets (${result.tweets.length})`}>
            <ol className="list-decimal ml-5 space-y-2 text-sm">
              {result.tweets.map((t, i) => (
                <li key={i} className="whitespace-pre-wrap">{t}</li>
              ))}
            </ol>
          </Section>

          <Section title={`LinkedIn Carousels (${result.linkedin_carousels.length})`}>
            <div className="grid gap-3">
              {result.linkedin_carousels.map((c, i) => (
                <div key={i} className="border border-[#30363d] rounded p-3">
                  <div className="font-semibold text-sm mb-2">{c.title}</div>
                  <ol className="list-decimal ml-5 space-y-1 text-xs text-[#8b949e]">
                    {c.slides.map((s, j) => (
                      <li key={j}>{s}</li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </Section>

          <Section title={`Instagram posts (${result.instagram_posts.length})`}>
            <div className="grid gap-2">
              {result.instagram_posts.map((p, i) => (
                <div key={i} className="border border-[#30363d] rounded p-2 text-sm whitespace-pre-wrap">
                  {p}
                </div>
              ))}
            </div>
          </Section>

          <Section title={`TikTok scripts (${result.tiktok_scripts.length})`}>
            <div className="grid gap-3">
              {result.tiktok_scripts.map((s, i) => (
                <div key={i} className="border border-[#30363d] rounded p-3 text-sm">
                  <div>
                    <span className="text-xs text-[#58a6ff]">HOOK:</span> {s.hook}
                  </div>
                  <div className="mt-1">
                    <span className="text-xs text-[#58a6ff]">BODY:</span> {s.body}
                  </div>
                  <div className="mt-1">
                    <span className="text-xs text-[#58a6ff]">CTA:</span> {s.cta}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

// ── Tab 3: Draft Response ────────────────────────────────────────────────────

function DraftTab() {
  const [clientId, setClientId] = useBrandClientId();
  const [platform, setPlatform] = React.useState("instagram-dm");
  const [incoming, setIncoming] = React.useState("");
  const [brandVoice, setBrandVoice] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<DraftResult | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setErr(null);
    setResult(null);
    try {
      const r = await fetch("/api/ai/draft-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          platform,
          incomingMessage: incoming,
          brandVoiceSample: brandVoice || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      setResult(data as DraftResult);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={boxCls}>
      <div className="grid gap-3 mb-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[#8b949e] block mb-1">Client ID</label>
            <input
              className={inputCls}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-[#8b949e] block mb-1">Platform</label>
            <input
              className={inputCls}
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              placeholder="instagram-dm"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-[#8b949e] block mb-1">Mensaje entrante</label>
          <textarea
            className={inputCls}
            rows={3}
            value={incoming}
            onChange={(e) => setIncoming(e.target.value)}
            placeholder="Hola, hace 5 días que no me llega el pedido…"
          />
        </div>
        <div>
          <label className="text-xs text-[#8b949e] block mb-1">
            Brand voice sample (mensajes históricos aprobados)
          </label>
          <textarea
            className={inputCls}
            rows={3}
            value={brandVoice}
            onChange={(e) => setBrandVoice(e.target.value)}
            placeholder="Ejemplos de respuestas anteriores…"
          />
        </div>
      </div>
      <button className={btnCls} onClick={run} disabled={loading || !incoming}>
        {loading ? "Drafting…" : "Ejecutar"}
      </button>

      {err && (
        <div className="mt-4 p-3 rounded bg-[#f851491a] border border-[#f8514940] text-[#ff7b72] text-sm">
          {err}
        </div>
      )}

      {result && (
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <CostBadge usd={result.cost_estimate_usd} />
            {result.should_escalate && (
              <span className="text-xs px-2 py-0.5 rounded bg-[#f851491a] text-[#ff7b72] border border-[#f8514940]">
                ESCALATE
              </span>
            )}
            <SkillsBadges skills={result.skills_used} />
          </div>
          {result.reasoning && (
            <div className="text-xs text-[#8b949e] italic mb-3">
              Reasoning: {result.reasoning}
            </div>
          )}
          <div className="grid gap-3">
            {result.drafts.map((d, i) => (
              <div
                key={i}
                className={`border rounded p-3 ${
                  i === result.recommended
                    ? "border-[#2ea043] bg-[#23863615]"
                    : "border-[#30363d]"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold uppercase text-[#58a6ff]">
                    {d.tone}
                  </span>
                  <span className="text-xs text-[#8b949e]">
                    confidence: {(d.confidence * 100).toFixed(0)}%
                  </span>
                  {i === result.recommended && (
                    <span className="text-xs text-[#7ee787]">★ recomendado</span>
                  )}
                </div>
                <div className="text-sm whitespace-pre-wrap">{d.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-[#e6edf3] mb-2">{title}</h3>
      {children}
    </div>
  );
}
