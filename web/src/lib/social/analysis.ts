/**
 * Análisis de un comentario: sentimiento, intención y urgencia.
 *
 * Es lo que prometía el módulo "Escucha social" y nunca llegó a hacer. Aquí va
 * sobre los comentarios que ya entran por webhook, en la misma pantalla en la
 * que se responden: si el análisis vive en otro sitio, nadie lo mira.
 *
 * Nunca lanza. Un comentario sin analizar se atiende igual que antes; lo que no
 * puede pasar es que un fallo del modelo deje sin responder a un cliente.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export type Sentiment = "positivo" | "neutral" | "negativo";
export type Intent = "pregunta" | "compra" | "queja" | "elogio" | "spam" | "otro";

export type CommentAnalysis = {
  sentiment: Sentiment;
  /** -1 (lo peor) a 1 (lo mejor). */
  sentiment_score: number;
  intent: Intent;
  /** 0 a 100. Alto = alguien tiene que mirarlo ya. */
  urgency: number;
};

const SENTIMENTS: Sentiment[] = ["positivo", "neutral", "negativo"];
const INTENTS: Intent[] = ["pregunta", "compra", "queja", "elogio", "spam", "otro"];

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Acepta lo que devuelva el modelo y se queda sólo con lo que encaja. */
export function parseAnalysis(raw: unknown): CommentAnalysis | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  // El modelo a veces envuelve el JSON en ``` o lo precede de una frase.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }

  const sentiment = String(obj.sentiment || "").toLowerCase() as Sentiment;
  const intent = String(obj.intent || "").toLowerCase() as Intent;
  const score = Number(obj.sentiment_score);
  const urgency = Number(obj.urgency);

  if (!SENTIMENTS.includes(sentiment)) return null;
  return {
    sentiment,
    sentiment_score: Number.isFinite(score) ? clamp(Number(score.toFixed(3)), -1, 1) : 0,
    intent: INTENTS.includes(intent) ? intent : "otro",
    urgency: Number.isFinite(urgency) ? Math.round(clamp(urgency, 0, 100)) : 0,
  };
}

export async function analyzeComment(
  message: string,
  brandName: string | null
): Promise<CommentAnalysis | null> {
  const text = String(message || "").trim();
  if (!text) return null;
  try {
    const { generateAIResponse } = await import("@/lib/chatbot/ai");
    const raw = await generateAIResponse({
      systemPrompt:
        `Clasificas comentarios que la gente deja en las publicaciones y pautas de ` +
        `${brandName || "una empresa"} en Facebook e Instagram.\n\n` +
        `Devuelve SÓLO un JSON, sin explicaciones ni \`\`\`:\n` +
        `{"sentiment":"positivo|neutral|negativo","sentiment_score":-1..1,` +
        `"intent":"pregunta|compra|queja|elogio|spam|otro","urgency":0..100}\n\n` +
        `Criterios:\n` +
        `- sentiment_score: -1 es una queja furiosa, 0 es neutro, 1 es un elogio entusiasta.\n` +
        `- intent "compra": pide precio, disponibilidad o quiere comprar.\n` +
        `- intent "queja": reclamo, pedido que no llegó, mal servicio, acusación.\n` +
        `- intent "spam": publicidad ajena, enlaces raros, texto sin relación.\n` +
        `- urgency alto (70+) sólo si alguien está molesto en público, habla de una estafa, ` +
        `de un pedido perdido, de un cobro mal hecho o amenaza con reclamar. ` +
        `Una pregunta normal de precio NO es urgente.`,
      conversationHistory: [{ role: "user", content: text.slice(0, 700) }],
      maxTokens: 120,
    });
    return parseAnalysis(raw);
  } catch (e) {
    console.warn("[comments] no se pudo analizar el comentario:", e);
    return null;
  }
}

/**
 * ¿Este comentario lo tiene que ver una persona antes de que conteste el
 * agente? Responder solo a una queja pública es peor que no responder.
 */
export function needsHumanReason(
  analysis: CommentAnalysis | null,
  opts: { holdNegative: boolean; urgencyThreshold: number }
): string | null {
  if (!analysis || !opts.holdNegative) return null;
  if (analysis.intent === "queja") return "Es un reclamo: mejor que lo conteste una persona.";
  if (analysis.sentiment === "negativo") return "El comentario es negativo: mejor que lo conteste una persona.";
  if (analysis.urgency >= opts.urgencyThreshold) return `Urgencia ${analysis.urgency}/100: conviene mirarlo ya.`;
  return null;
}

export type CommentsSummary = {
  total24h: number;
  positivos: number;
  neutrales: number;
  negativos: number;
  sinAnalizar: number;
  negativosPct: number;
  pendientesPersona: number;
  crisis: boolean;
};

/**
 * Resumen de las últimas 24 h de una marca, con el aviso de crisis: varios
 * comentarios y una proporción alta de negativos. Con dos comentarios malos no
 * se avisa de nada — sería ruido y dejarían de mirarlo.
 */
export async function commentsSummary(
  organizationId: string,
  brandId: string,
  opts: { crisisMinComments?: number; crisisNegativePct?: number } = {}
): Promise<CommentsSummary> {
  const minComments = opts.crisisMinComments ?? 5;
  const negativePct = opts.crisisNegativePct ?? 40;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const empty: CommentsSummary = {
    total24h: 0,
    positivos: 0,
    neutrales: 0,
    negativos: 0,
    sinAnalizar: 0,
    negativosPct: 0,
    pendientesPersona: 0,
    crisis: false,
  };

  try {
    const admin = createAdminClient("smarttalk");
    const { data } = await admin
      .from("social_comments")
      .select("sentiment, needs_human, status")
      .eq("organization_id", organizationId)
      .eq("brand_id", brandId)
      .gte("commented_at", since)
      .limit(1000);

    const rows = (data || []) as Array<{ sentiment: string | null; needs_human: boolean | null; status: string | null }>;
    const positivos = rows.filter((r) => r.sentiment === "positivo").length;
    const negativos = rows.filter((r) => r.sentiment === "negativo").length;
    const neutrales = rows.filter((r) => r.sentiment === "neutral").length;
    const pendientesPersona = rows.filter((r) => r.needs_human && r.status !== "ignorado").length;
    const negativosPct = rows.length ? Math.round((negativos / rows.length) * 100) : 0;

    return {
      total24h: rows.length,
      positivos,
      neutrales,
      negativos,
      sinAnalizar: rows.length - positivos - negativos - neutrales,
      negativosPct,
      pendientesPersona,
      crisis: rows.length >= minComments && negativosPct >= negativePct,
    };
  } catch {
    return empty;
  }
}
