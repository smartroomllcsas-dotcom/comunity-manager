/**
 * Sprint 25 · IA aplicada v2 — Content Generator multi-canal.
 *
 * Genera 1 variante por plataforma (fb, ig-feed, ig-reel, tiktok, linkedin, x,
 * threads, pinterest) usando Sonnet + skills relevantes seleccionadas por
 * Haiku via `selectRelevantSkills`. Devuelve JSON estructurado con content,
 * hashtags, image prompt (opcional) y estimated_reach heurístico.
 *
 * Costo tracking: transparencia siempre. Sonnet 4 pricing usado:
 *   $3 / MTok input, $15 / MTok output → 0.003 + 0.015 / 1k tokens.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { selectRelevantSkills } from "@/lib/skills/selector";
import type { SkillEntry } from "@/lib/skills/registry";

export const SONNET_MODEL = "claude-sonnet-4-20250514";

// Precio Sonnet 4 (USD por 1k tokens).
const PRICE_INPUT_PER_1K = 0.003;
const PRICE_OUTPUT_PER_1K = 0.015;

export interface ContentGenBrief {
  clientId: string;
  brandVoice?: string;
  goal: string;
  targetAudience?: string;
  platforms: string[];
  keywords?: string[];
  language?: "es" | "en";
  urgency?: "high" | "normal";
}

export interface ContentVariant {
  platform: string;
  content: string;
  hashtags: string[];
  media_prompt?: string;
  estimated_reach?: "low" | "medium" | "high";
}

export interface ContentGenResult {
  variants: ContentVariant[];
  skills_used: string[];
  cost_estimate_usd: number;
}

// Límites suaves de caracteres por plataforma (post-proceso).
const CHAR_LIMITS: Record<string, number> = {
  x: 280,
  threads: 500,
  "ig-feed": 2200,
  "ig-reel": 2200,
  facebook: 63206,
  fb: 63206,
  linkedin: 3000,
  tiktok: 2200,
  pinterest: 500,
};

// Plataformas donde tiene sentido generar un image prompt.
const VISUAL_PLATFORMS = new Set(["ig-feed", "pinterest", "tt", "tiktok", "ig-reel"]);

function computeCostUsd(inputTokens: number, outputTokens: number): number {
  const c = (inputTokens / 1000) * PRICE_INPUT_PER_1K + (outputTokens / 1000) * PRICE_OUTPUT_PER_1K;
  return Math.round(c * 10000) / 10000;
}

function extractHashtags(text: string): string[] {
  const set = new Set<string>();
  const re = /#([A-Za-z0-9_À-ſ]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    set.add(m[1]);
  }
  return Array.from(set);
}

function clipToLimit(text: string, platform: string): string {
  const limit = CHAR_LIMITS[platform];
  if (!limit || text.length <= limit) return text;
  return text.slice(0, Math.max(0, limit - 1)).trimEnd() + "…";
}

function estimateReach(brief: ContentGenBrief, platform: string): "low" | "medium" | "high" {
  const hasKeywords = (brief.keywords?.length ?? 0) > 0;
  const hasAudience = !!brief.targetAudience;
  const score = (hasKeywords ? 1 : 0) + (hasAudience ? 1 : 0) + (VISUAL_PLATFORMS.has(platform) ? 1 : 0);
  if (score >= 2) return "high";
  if (score === 1) return "medium";
  return "low";
}

function buildSkillsBlock(skills: SkillEntry[]): string {
  if (!skills.length) return "";
  const blocks = skills
    .map((s) => `### Skill: ${s.name}\n${(s.description || "").trim()}`)
    .join("\n\n");
  return `\n\n## Skills relevantes activas\n${blocks}\n`;
}

function buildSystemPrompt(skills: SkillEntry[], brief: ContentGenBrief): string {
  const lang = brief.language === "en" ? "English" : "Spanish (LATAM)";
  return `Eres un content strategist multi-canal. Generas UNA variante por plataforma optimizada al formato de cada red social. Idioma de output: ${lang}.

Reglas:
- Cada plataforma tiene su propio ritmo, tono y estructura. NO recicles el mismo texto.
- Twitter/X: 280 chars max, hook + payoff, sin fluff. LinkedIn: hook fuerte + 2-3 párrafos + CTA. Instagram feed: story-driven, primer línea gancho, líneas cortas. TikTok/Reels: hook en 3 segundos, script conversacional. Threads: casual, encadenado.
- Hashtags: 3-6 relevantes por plataforma (excepto linkedin: 3, x: 0-2, tiktok: 5-8).
- Voz de marca: respeta el brandVoice si viene; si no, tono profesional-cercano.
- NO uses clichés IA ("En un mundo donde…", "Descubre cómo…", "Imagina…").
- Si la plataforma soporta visual (ig-feed, pinterest, tiktok, ig-reel): incluye un image_prompt específico y accionable para generar imagen (estilo, sujeto, composición, iluminación).

Output: JSON válido, sin fences, sin prosa.
Formato:
{
  "variants": [
    { "platform": "ig-feed", "content": "...", "hashtags": ["a","b"], "image_prompt": "..." },
    ...
  ]
}
${buildSkillsBlock(skills)}`;
}

function buildUserPrompt(brief: ContentGenBrief): string {
  const parts: string[] = [];
  parts.push(`Cliente: ${brief.clientId}`);
  parts.push(`Objetivo: ${brief.goal}`);
  if (brief.targetAudience) parts.push(`Audiencia objetivo: ${brief.targetAudience}`);
  if (brief.brandVoice) parts.push(`Voz de marca: ${brief.brandVoice}`);
  if (brief.keywords?.length) parts.push(`Keywords SEO: ${brief.keywords.join(", ")}`);
  if (brief.urgency === "high") parts.push(`Urgencia: alta — incluye sentido de scarcity`);
  parts.push(`Plataformas requeridas: ${brief.platforms.join(", ")}`);
  parts.push(`\nDevuelve UNA variante por plataforma en JSON.`);
  return parts.join("\n");
}

function parseVariants(raw: string, platforms: string[]): ContentVariant[] {
  const cleaned = raw.trim();
  // Intento directo.
  const tryParse = (txt: string): ContentVariant[] | null => {
    try {
      const parsed = JSON.parse(txt);
      const arr = Array.isArray(parsed) ? parsed : parsed?.variants;
      if (!Array.isArray(arr)) return null;
      return arr
        .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
        .map((v) => ({
          platform: String(v.platform ?? ""),
          content: String(v.content ?? ""),
          hashtags: Array.isArray(v.hashtags)
            ? v.hashtags.filter((h): h is string => typeof h === "string")
            : [],
          media_prompt: typeof v.image_prompt === "string" ? v.image_prompt : undefined,
        }));
    } catch {
      return null;
    }
  };

  const direct = tryParse(cleaned);
  if (direct) return direct;

  // Strip fences.
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    const via = tryParse(fenceMatch[1].trim());
    if (via) return via;
  }
  // Grab first {...} block.
  const braceMatch = cleaned.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    const via = tryParse(braceMatch[0]);
    if (via) return via;
  }

  // Último recurso: variant vacía por plataforma para no romper contrato.
  return platforms.map((p) => ({
    platform: p,
    content: "",
    hashtags: [],
  }));
}

export async function generateContent(
  brief: ContentGenBrief,
  client: Anthropic
): Promise<ContentGenResult> {
  if (!brief || !brief.clientId || !Array.isArray(brief.platforms) || brief.platforms.length === 0) {
    throw new Error("Brief inválido: se requiere clientId + platforms[]");
  }

  // 1. Selector de skills (Haiku).
  const briefSummary = `Content para ${brief.platforms.join(",")}. Goal: ${brief.goal}. ${brief.targetAudience ? "Audiencia: " + brief.targetAudience + ". " : ""}${brief.brandVoice ? "Voz: " + brief.brandVoice.slice(0, 200) + ". " : ""}${brief.keywords?.length ? "Keywords: " + brief.keywords.join(",") : ""}`;
  let skills: SkillEntry[] = [];
  try {
    skills = await selectRelevantSkills(briefSummary, [], { maxSkills: 3, client });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[content-generator] Skill selection soft-failed: ${msg}`);
  }

  // 2. Sonnet call.
  const system = buildSystemPrompt(skills, brief);
  const userPrompt = buildUserPrompt(brief);

  const resp = await client.messages.create({
    model: SONNET_MODEL,
    max_tokens: 2048,
    system,
    messages: [{ role: "user", content: userPrompt }],
  });

  const first = resp.content[0];
  const rawText = first && first.type === "text" ? first.text : "";
  const inputTokens = resp.usage?.input_tokens ?? 0;
  const outputTokens = resp.usage?.output_tokens ?? 0;

  // 3. Parse + post-proceso.
  const parsed = parseVariants(rawText, brief.platforms);
  const byPlatform = new Map(parsed.map((v) => [v.platform, v]));

  const variants: ContentVariant[] = brief.platforms.map((p) => {
    const v = byPlatform.get(p) ?? { platform: p, content: "", hashtags: [] };
    const clipped = clipToLimit(v.content, p);
    const extractedTags = extractHashtags(clipped);
    // Merge: hashtags declarados + inline detectados, dedupe.
    const mergedTags = Array.from(new Set([...v.hashtags, ...extractedTags]));
    const out: ContentVariant = {
      platform: p,
      content: clipped,
      hashtags: mergedTags,
      estimated_reach: estimateReach(brief, p),
    };
    if (VISUAL_PLATFORMS.has(p)) {
      out.media_prompt = v.media_prompt || `${brief.goal} — estilo visual coherente con la voz de marca, alta calidad, composición limpia`;
    }
    return out;
  });

  return {
    variants,
    skills_used: skills.map((s) => s.slug),
    cost_estimate_usd: computeCostUsd(inputTokens, outputTokens),
  };
}
