/**
 * Respuestas fijas por canal: cuando el mensaje del cliente coincide con un
 * patrón, se envía un texto EXACTO (sin pasar por la IA). Sirve para frases
 * que la empresa exige tal cual ("Escribe QUIERO SER MAYORISTA…").
 *
 * Se guardan en `public.settings` bajo `lead_agent_fixed_replies:<brandId>`:
 *   { whatsapp: [{ match, reply, unless? }], instagram: [...], messenger: [...] }
 *
 * - match:  regex (sin distinguir mayúsculas) contra el mensaje del cliente.
 * - unless: regex; si el mensaje actual o alguno anterior del cliente en la
 *           conversación coincide, la respuesta fija NO se envía y responde la IA
 *           (p. ej. ya escribió "QUIERO SER MAYORISTA": toca el siguiente paso).
 * - once:   si ya se envió ese mismo texto en la conversación, no se repite
 *           (responde la IA, que sabe recordarlo con dulzura).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { CHANNEL_INSTRUCTION_KINDS, type ChannelInstructionKind } from "./channel-instructions";

export type FixedReply = { match: string; reply: string; unless?: string; once?: boolean };
export type FixedReplies = Partial<Record<ChannelInstructionKind, FixedReply[]>>;

const KEY_PREFIX = "lead_agent_fixed_replies:";

function safeRegex(src: string): RegExp | null {
  try {
    return new RegExp(src, "i");
  } catch {
    return null;
  }
}

function sanitize(input: unknown): FixedReplies {
  const out: FixedReplies = {};
  if (!input || typeof input !== "object") return out;
  for (const kind of CHANNEL_INSTRUCTION_KINDS) {
    const list = (input as Record<string, unknown>)[kind];
    if (!Array.isArray(list)) continue;
    const clean: FixedReply[] = [];
    for (const item of list) {
      const r = item as Partial<FixedReply>;
      if (typeof r?.match !== "string" || !r.match.trim() || !safeRegex(r.match)) continue;
      if (typeof r.reply !== "string" || !r.reply.trim()) continue;
      const unless = typeof r.unless === "string" && r.unless.trim() && safeRegex(r.unless) ? r.unless.trim() : undefined;
      clean.push({
        match: r.match.trim(),
        reply: r.reply.trim().slice(0, 4000),
        ...(unless ? { unless } : {}),
        ...(r.once ? { once: true } : {}),
      });
    }
    if (clean.length) out[kind] = clean;
  }
  return out;
}

export async function getFixedReplies(brandId: string): Promise<FixedReplies> {
  try {
    const pub = createAdminClient("public");
    const { data } = await pub.from("settings").select("value").eq("key", `${KEY_PREFIX}${brandId}`).maybeSingle();
    return sanitize(data?.value);
  } catch {
    return {};
  }
}

export async function setFixedReplies(
  brandId: string,
  value: unknown,
): Promise<{ ok: true; value: FixedReplies } | { ok: false; error: string }> {
  const clean = sanitize(value);
  const pub = createAdminClient("public");
  const { error } = await pub
    .from("settings")
    .upsert({ key: `${KEY_PREFIX}${brandId}`, value: clean, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: clean };
}

/**
 * Devuelve el texto fijo a enviar, o null si ninguna regla aplica.
 * `previousCustomerTexts`: mensajes anteriores del cliente en la conversación.
 */
export function matchFixedReply(
  rules: FixedReply[] | undefined,
  messageText: string,
  previousCustomerTexts: string[] = [],
  previousBotTexts: string[] = [],
): string | null {
  const text = (messageText || "").trim();
  if (!text || !rules?.length) return null;
  for (const rule of rules) {
    const m = safeRegex(rule.match);
    if (!m || !m.test(text)) continue;
    if (rule.once && previousBotTexts.some((t) => t.trim() === rule.reply.trim())) continue;
    if (rule.unless) {
      const u = safeRegex(rule.unless);
      if (u && (u.test(text) || previousCustomerTexts.some((t) => u.test(t)))) continue;
    }
    return rule.reply;
  }
  return null;
}
