/**
 * Sprint 25 · IA aplicada v2 — Repurposing Engine.
 *
 * Convierte contenido largo (blog post, video transcript, markdown) en
 * múltiples formatos short-form: tweets, LinkedIn carousels, IG captions,
 * TikTok scripts. Usa Sonnet + skills content-strategy/blog-writing/
 * tiktok-content-strategy vía `selectRelevantSkills`.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { selectRelevantSkills } from "@/lib/skills/selector";
import type { SkillEntry } from "@/lib/skills/registry";

export const SONNET_MODEL = "claude-sonnet-4-20250514";

const PRICE_INPUT_PER_1K = 0.003;
const PRICE_OUTPUT_PER_1K = 0.015;

// Fetch timeout defensivo: 15s por request HTTP.
const FETCH_TIMEOUT_MS = 15_000;

// Corta el material de entrada para no explotar el presupuesto de tokens.
const MAX_SOURCE_CHARS = 24_000;

export interface RepurposeSource {
  url?: string;
  markdown?: string;
  transcript?: string;
}

export interface LinkedinCarousel {
  title: string;
  slides: string[];
}

export interface TiktokScript {
  hook: string;
  body: string;
  cta: string;
}

export interface RepurposeResult {
  tweets: string[];
  linkedin_carousels: LinkedinCarousel[];
  instagram_posts: string[];
  tiktok_scripts: TiktokScript[];
  cost_estimate_usd: number;
  source_kind: "url" | "markdown" | "transcript" | "youtube-stub";
  skills_used: string[];
}

function computeCostUsd(inputTokens: number, outputTokens: number): number {
  const c = (inputTokens / 1000) * PRICE_INPUT_PER_1K + (outputTokens / 1000) * PRICE_OUTPUT_PER_1K;
  return Math.round(c * 10000) / 10000;
}

function isYouTubeUrl(u: string): boolean {
  return /(?:youtube\.com\/(?:watch|shorts)|youtu\.be\/)/i.test(u);
}

/** Extrae texto legible de HTML mediante regex simple. Sin dependencias. */
function extractTextFromHtml(html: string): string {
  // Quita scripts/styles/nav/footer.
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ");
  // Extrae bloques semánticos.
  const chunks: string[] = [];
  const blockRe = /<(?:p|h[1-6]|li|blockquote|article|section)[^>]*>([\s\S]*?)<\/(?:p|h[1-6]|li|blockquote|article|section)>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(stripped)) !== null) {
    const txt = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (txt.length > 20) chunks.push(txt);
  }
  if (chunks.length === 0) {
    // Fallback: strip todo el HTML.
    return stripped.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  return chunks.join("\n\n");
}

async function fetchAndExtract(url: string): Promise<string> {
  const resp = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; CM-Repurposer/1.0)",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} al fetchear ${url}`);
  const ct = resp.headers.get("content-type") || "";
  const body = await resp.text();
  if (ct.includes("text/html") || /<html/i.test(body)) {
    return extractTextFromHtml(body);
  }
  return body;
}

function buildSystemPrompt(skills: SkillEntry[]): string {
  const skillsBlock = skills.length
    ? "\n\n## Skills activas\n" +
      skills.map((s) => `### ${s.name}\n${(s.description || "").trim()}`).join("\n\n")
    : "";
  return `Eres un repurposing engine. Convierte contenido largo en múltiples formatos short-form respetando best practices de cada plataforma.

Requisitos exactos de output:
- tweets: 10 total. Los primeros 5 forman un thread hilado (empieza con "1/", "2/"...). Los otros 5 son standalone, cada uno con hook propio. Cada tweet ≤ 270 chars.
- linkedin_carousels: 3 carousels. Cada uno tiene title (≤80 chars) y slides (array de 6-8 slides de texto, cada slide ≤ 220 chars, primera slide = hook, última slide = CTA).
- instagram_posts: 5 captions independientes. Cada uno con hook en primera línea, cuerpo con storytelling y 4-6 hashtags al final.
- tiktok_scripts: 2 scripts. Cada uno con hook (primeros 3 segundos, gancho pattern-interrupt), body (30-45s), cta (CTA claro).

Reglas de calidad:
- NO clichés IA. NO "En un mundo donde", "Descubre", "Imagina".
- Preserva ideas específicas del material original — cita datos, ejemplos, quotes.
- Idioma: mismo que el input.
- Output: JSON puro, sin fences, sin prosa fuera del JSON.${skillsBlock}`;
}

function buildUserPrompt(material: string, sourceKind: string): string {
  return `Fuente (${sourceKind}):
"""
${material.slice(0, MAX_SOURCE_CHARS)}
"""

Genera el output en JSON con esta forma exacta:
{
  "tweets": ["...", "...", ...],
  "linkedin_carousels": [{"title": "...", "slides": ["...", ...]}, ...],
  "instagram_posts": ["...", "...", ...],
  "tiktok_scripts": [{"hook": "...", "body": "...", "cta": "..."}, ...]
}`;
}

function safeStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function parseResult(raw: string): {
  tweets: string[];
  linkedin_carousels: LinkedinCarousel[];
  instagram_posts: string[];
  tiktok_scripts: TiktokScript[];
} {
  const empty = {
    tweets: [] as string[],
    linkedin_carousels: [] as LinkedinCarousel[],
    instagram_posts: [] as string[],
    tiktok_scripts: [] as TiktokScript[],
  };
  const tryParse = (txt: string): typeof empty | null => {
    try {
      const parsed = JSON.parse(txt);
      if (!parsed || typeof parsed !== "object") return null;
      const p = parsed as Record<string, unknown>;
      return {
        tweets: safeStringArray(p.tweets),
        linkedin_carousels: Array.isArray(p.linkedin_carousels)
          ? p.linkedin_carousels
              .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
              .map((c) => ({
                title: typeof c.title === "string" ? c.title : "",
                slides: safeStringArray(c.slides),
              }))
          : [],
        instagram_posts: safeStringArray(p.instagram_posts),
        tiktok_scripts: Array.isArray(p.tiktok_scripts)
          ? p.tiktok_scripts
              .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
              .map((s) => ({
                hook: typeof s.hook === "string" ? s.hook : "",
                body: typeof s.body === "string" ? s.body : "",
                cta: typeof s.cta === "string" ? s.cta : "",
              }))
          : [],
      };
    } catch {
      return null;
    }
  };

  const cleaned = raw.trim();
  const direct = tryParse(cleaned);
  if (direct) return direct;

  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    const via = tryParse(fence[1].trim());
    if (via) return via;
  }
  const brace = cleaned.match(/\{[\s\S]*\}/);
  if (brace) {
    const via = tryParse(brace[0]);
    if (via) return via;
  }
  return empty;
}

export async function repurpose(
  src: RepurposeSource,
  client: Anthropic
): Promise<RepurposeResult> {
  if (!src || (!src.url && !src.markdown && !src.transcript)) {
    throw new Error("RepurposeSource requiere url, markdown o transcript");
  }

  let material = "";
  let sourceKind: RepurposeResult["source_kind"] = "markdown";

  if (src.transcript) {
    material = src.transcript;
    sourceKind = "transcript";
  } else if (src.url) {
    if (isYouTubeUrl(src.url)) {
      // FIXME(sprint-25): integrar Whisper / YouTube transcript API para
      // convertir video en transcript reproducible. Por ahora devolvemos stub.
      return {
        tweets: [],
        linkedin_carousels: [],
        instagram_posts: [],
        tiktok_scripts: [],
        cost_estimate_usd: 0,
        source_kind: "youtube-stub",
        skills_used: [],
      };
    }
    try {
      material = await fetchAndExtract(src.url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Fetch de ${src.url} falló: ${msg}`);
    }
    sourceKind = "url";
  } else if (src.markdown) {
    material = src.markdown;
    sourceKind = "markdown";
  }

  if (!material || material.trim().length < 40) {
    throw new Error("Material insuficiente para repurposing (min 40 chars)");
  }

  // Skills selector.
  const summaryForSkills = `Repurposing de contenido long-form a tweets, LinkedIn carousels, IG captions, TikTok scripts. Material: ${material.slice(0, 300)}`;
  let skills: SkillEntry[] = [];
  try {
    skills = await selectRelevantSkills(summaryForSkills, [], { maxSkills: 3, client });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[repurposing] Skill selection soft-failed: ${msg}`);
  }

  const resp = await client.messages.create({
    model: SONNET_MODEL,
    max_tokens: 4096,
    system: buildSystemPrompt(skills),
    messages: [{ role: "user", content: buildUserPrompt(material, sourceKind) }],
  });

  const first = resp.content[0];
  const rawText = first && first.type === "text" ? first.text : "";
  const inputTokens = resp.usage?.input_tokens ?? 0;
  const outputTokens = resp.usage?.output_tokens ?? 0;

  const parsed = parseResult(rawText);

  return {
    ...parsed,
    cost_estimate_usd: computeCostUsd(inputTokens, outputTokens),
    source_kind: sourceKind,
    skills_used: skills.map((s) => s.slug),
  };
}
