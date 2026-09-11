/**
 * Reglas de comentarios POR EMPRESA: qué hace la plataforma cuando alguien
 * comenta una publicación o una pauta de esa marca.
 *
 * Se guardan en `public.settings` bajo `lead_agent_comment_rules:<brandId>`,
 * igual que el resto de configuraciones por marca (sin migración nueva).
 */
import { supabaseAdmin } from "@/lib/supabase";

export type CommentRules = {
  /** Si está apagado, los comentarios se guardan pero no se hace nada solo. */
  enabled: boolean;
  /** Responder el comentario en público automáticamente. */
  auto_public_reply: boolean;
  /**
   * Cómo se escribe la respuesta pública:
   *  - "ai": el agente de la empresa la redacta leyendo el comentario (no es
   *    genérica y cada una sale distinta, que es lo que evita el spam).
   *  - "texts": rota entre los textos fijos configurados abajo.
   */
  public_reply_mode: "ai" | "texts";
  /** Instrucciones extra para la respuesta de la IA (tono, qué no decir). */
  ai_reply_instructions: string;
  /** Textos de respuesta pública; se va rotando para no repetir siempre igual. */
  public_reply_texts: string[];
  /** Tope de respuestas públicas por hora (protección anti-spam de Meta). */
  max_public_replies_per_hour: number;
  /** Escribirle al interno (mensaje privado) automáticamente. */
  auto_dm: boolean;
  /** Texto del mensaje al interno. */
  dm_text: string;
  /** Sólo el primer comentario de cada persona (no responder cada comentario). */
  only_first_per_author: boolean;
  /** Si el comentario contiene alguna de estas palabras, no se hace nada. */
  ignore_keywords: string[];
  /** Sólo actuar si el comentario contiene alguna de estas palabras (vacío = todos). */
  only_keywords: string[];
};

export const DEFAULT_COMMENT_RULES: CommentRules = {
  enabled: false,
  auto_public_reply: true,
  public_reply_mode: "ai",
  ai_reply_instructions:
    "Responde en una o dos frases, con el nombre de la persona si lo sabes, mencionando lo que preguntó. " +
    "No des precios ni enlaces. Cierra invitando a revisar el mensaje que le acabamos de enviar al interno.",
  max_public_replies_per_hour: 20,
  public_reply_texts: [
    "¡Hola {{nombre}}! 😊 Gracias por comentar, te acabamos de escribir al interno con la información 💬",
    "¡Hola {{nombre}}! Con gusto te ayudamos, revisa tu bandeja de mensajes que ya te escribimos ✨",
  ],
  auto_dm: true,
  dm_text:
    "¡Hola {{nombre}}! 👋 Vi tu comentario en nuestra publicación y con gusto te ayudo por aquí. Cuéntame, ¿qué necesitas?",
  only_first_per_author: true,
  ignore_keywords: [],
  only_keywords: [],
};

const KEY_PREFIX = "lead_agent_comment_rules:";

function cleanList(v: unknown, max = 20): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .slice(0, max);
}

export function sanitizeRules(input: unknown): CommentRules {
  const d = DEFAULT_COMMENT_RULES;
  if (!input || typeof input !== "object") return d;
  const o = input as Partial<CommentRules>;
  const texts = cleanList(o.public_reply_texts, 10).map((t) => t.slice(0, 800));
  return {
    enabled: typeof o.enabled === "boolean" ? o.enabled : d.enabled,
    auto_public_reply: typeof o.auto_public_reply === "boolean" ? o.auto_public_reply : d.auto_public_reply,
    public_reply_mode: o.public_reply_mode === "texts" ? "texts" : d.public_reply_mode,
    ai_reply_instructions:
      typeof o.ai_reply_instructions === "string" && o.ai_reply_instructions.trim()
        ? o.ai_reply_instructions.trim().slice(0, 900)
        : d.ai_reply_instructions,
    max_public_replies_per_hour: Math.max(1, Math.min(120, Number(o.max_public_replies_per_hour) || d.max_public_replies_per_hour)),
    public_reply_texts: texts.length ? texts : d.public_reply_texts,
    auto_dm: typeof o.auto_dm === "boolean" ? o.auto_dm : d.auto_dm,
    dm_text: (typeof o.dm_text === "string" && o.dm_text.trim() ? o.dm_text.trim() : d.dm_text).slice(0, 900),
    only_first_per_author:
      typeof o.only_first_per_author === "boolean" ? o.only_first_per_author : d.only_first_per_author,
    ignore_keywords: cleanList(o.ignore_keywords).map((k) => k.toLowerCase()),
    only_keywords: cleanList(o.only_keywords).map((k) => k.toLowerCase()),
  };
}

export async function getCommentRules(brandId: string): Promise<CommentRules> {
  try {
    const { data } = await supabaseAdmin
      .from("settings")
      .select("value")
      .eq("key", `${KEY_PREFIX}${brandId}`)
      .maybeSingle();
    return sanitizeRules(data?.value);
  } catch {
    return DEFAULT_COMMENT_RULES;
  }
}

export async function setCommentRules(
  brandId: string,
  value: unknown
): Promise<{ ok: true; value: CommentRules } | { ok: false; error: string }> {
  const clean = sanitizeRules(value);
  const { error } = await supabaseAdmin
    .from("settings")
    .upsert(
      { key: `${KEY_PREFIX}${brandId}`, value: clean, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: clean };
}

/** Reemplaza {{nombre}} y {{empresa}} en los textos configurados. */
export function renderCommentText(
  text: string,
  vars: { authorName?: string | null; brandName?: string | null }
): string {
  const full = String(vars.authorName || "").trim();
  const first = full.split(/\s+/)[0] || "";
  const safe = /^[@+\d]/.test(first) ? "" : first;
  return String(text || "")
    .replace(/\{\{\s*nombre\s*\}\}/gi, safe)
    .replace(/\{\{\s*empresa\s*\}\}/gi, String(vars.brandName || "").trim())
    .replace(/\s{2,}/g, " ")
    .replace(/¡Hola\s*!/g, "¡Hola!")
    .replace(/Hola\s*,/g, "Hola,")
    .trim();
}

/** ¿Este comentario debe atenderse según las reglas? */
export function commentMatchesRules(message: string, rules: CommentRules): boolean {
  const text = String(message || "").toLowerCase();
  if (rules.ignore_keywords.some((k) => text.includes(k))) return false;
  if (rules.only_keywords.length > 0 && !rules.only_keywords.some((k) => text.includes(k))) return false;
  return true;
}
