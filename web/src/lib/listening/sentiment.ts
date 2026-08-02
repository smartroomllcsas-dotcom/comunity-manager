/**
 * Sprint 25 · Sentiment analysis via Claude Haiku 4.5.
 *
 * Batch de hasta 50 mentions por call:
 *  - Prompt caching en el system prompt (brand context + schema).
 *  - JSON structured output; 1 reintento con "responde SOLO JSON" si falla parse.
 *  - Fallback a neutral por default si el batch entero falla.
 *
 * Costo target 2026: ~$0.001 per 50 mentions (Haiku input $0.80 / MTok,
 * output $4 / MTok; batch tipico ~4k input + ~2k output = ~$0.011 /1000 mentions).
 */

import type Anthropic from "@anthropic-ai/sdk";

export const HAIKU_MODEL = "claude-haiku-4-5-20251001";

export interface SentimentResult {
  sentiment_score: number; // -1.0 to +1.0
  sentiment_label: "positive" | "neutral" | "negative";
  intent_label: string; // 'complaint','praise','question','spam','sales_intent','crisis'
  urgency_score: number; // 1-5
  reasoning?: string;
}

const NEUTRAL: SentimentResult = {
  sentiment_score: 0,
  sentiment_label: "neutral",
  intent_label: "question",
  urgency_score: 1,
  reasoning: "fallback",
};

const BATCH_MAX = 50;

function buildSystemPrompt(brandName: string): string {
  return [
    `Eres un analista de sentiment para social listening de la marca "${brandName}".`,
    `Analizas menciones (comentarios, DMs, mentions, reviews) y devuelves un JSON array.`,
    ``,
    `Para CADA mention retorna un objeto con:`,
    `  - sentiment_score  : numero -1.0 (muy negativo) a +1.0 (muy positivo)`,
    `  - sentiment_label  : "positive" | "neutral" | "negative"`,
    `  - intent_label     : "complaint" | "praise" | "question" | "spam" | "sales_intent" | "crisis"`,
    `  - urgency_score    : entero 1 (ignorable) a 5 (crisis, responder YA)`,
    `  - reasoning        : string <= 80 chars, en espanol`,
    ``,
    `Reglas:`,
    `  - "crisis" = riesgo reputacional real (viral negativo, amenaza legal, dano fisico).`,
    `  - "sales_intent" = pregunta de compra/precio.`,
    `  - urgency 5 solo si intent=complaint|crisis Y el autor podria escalar publicamente.`,
    `  - urgency 4 si es queja legitima que debe responderse en <2h.`,
    `  - urgency <=2 para praise/question rutinaria.`,
    `  - Spam / bots / referidos irrelevantes -> intent=spam, sentiment=neutral, urgency=1.`,
    `  - Menciona la marca sin opinar -> neutral / question / urgency 1-2.`,
    ``,
    `Responde SOLO con JSON array valido, sin markdown, sin texto extra. Mismo orden que el input.`,
  ].join("\n");
}

function parseArray(raw: string): SentimentResult[] | null {
  // Strip fences si el modelo se les escapa.
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return null;
    return parsed.map(normalize);
  } catch {
    return null;
  }
}

function normalize(item: unknown): SentimentResult {
  const it = (item ?? {}) as Record<string, unknown>;
  const score =
    typeof it.sentiment_score === "number"
      ? Math.max(-1, Math.min(1, it.sentiment_score))
      : 0;
  const label =
    it.sentiment_label === "positive" ||
    it.sentiment_label === "negative"
      ? it.sentiment_label
      : "neutral";
  const intent =
    typeof it.intent_label === "string" ? it.intent_label : "question";
  const urgency =
    typeof it.urgency_score === "number"
      ? Math.max(1, Math.min(5, Math.round(it.urgency_score)))
      : 1;
  const reasoning =
    typeof it.reasoning === "string" ? it.reasoning.slice(0, 200) : undefined;
  return {
    sentiment_score: score,
    sentiment_label: label,
    intent_label: intent,
    urgency_score: urgency,
    reasoning,
  };
}

export async function analyzeSentimentBatch(
  mentions: Array<{ content: string; language?: string }>,
  client: Anthropic,
  brandName: string,
): Promise<SentimentResult[]> {
  if (mentions.length === 0) return [];

  const chunks: Array<Array<{ content: string; language?: string }>> = [];
  for (let i = 0; i < mentions.length; i += BATCH_MAX) {
    chunks.push(mentions.slice(i, i + BATCH_MAX));
  }

  const results: SentimentResult[] = [];
  for (const chunk of chunks) {
    const userText = JSON.stringify(
      chunk.map((m, idx) => ({
        idx,
        lang: m.language || "es",
        text: m.content.slice(0, 1000),
      })),
    );

    let parsed: SentimentResult[] | null = null;
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      try {
        const resp = await client.messages.create({
          model: HAIKU_MODEL,
          max_tokens: Math.min(4096, chunk.length * 120),
          system: [
            {
              type: "text",
              text: buildSystemPrompt(brandName),
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [
            {
              role: "user",
              content:
                attempt === 0
                  ? `Analiza estas ${chunk.length} menciones:\n${userText}`
                  : `Tu ultima respuesta no fue JSON valido. Reintenta. Responde SOLO con un JSON array de ${chunk.length} objetos, sin markdown. Input:\n${userText}`,
            },
          ],
        });
        const text = resp.content
          .filter((c) => c.type === "text")
          .map((c) => (c as { text: string }).text)
          .join("");
        parsed = parseArray(text);
        if (parsed && parsed.length !== chunk.length) {
          // Pad / truncate: mejor tener algo que perder el batch entero.
          if (parsed.length < chunk.length) {
            while (parsed.length < chunk.length) parsed.push({ ...NEUTRAL });
          } else {
            parsed = parsed.slice(0, chunk.length);
          }
        }
      } catch (err) {
        console.warn(
          "[listening/sentiment] Haiku call failed:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    if (!parsed) {
      for (let i = 0; i < chunk.length; i++) results.push({ ...NEUTRAL });
    } else {
      results.push(...parsed);
    }
  }

  return results;
}
