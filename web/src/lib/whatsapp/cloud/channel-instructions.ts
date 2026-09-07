/**
 * Instrucciones del agente de IA POR CANAL, para una misma empresa.
 *
 * El prompt de la empresa aplica a todos los canales; aquí se añade lo que
 * cambia según por dónde escribe el cliente: en WhatsApp se responde de una
 * forma, en Instagram/Messenger de otra (tono, qué ofrecer, qué no decir…).
 *
 * Se guarda en `public.settings` (tabla clave/valor JSON ya existente) bajo
 * `lead_agent_channel_instructions:<brandId>`, para no depender de una
 * migración en la base self-hosted.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export type ChannelInstructionKind = "whatsapp" | "instagram" | "messenger";
export type ChannelInstructions = Partial<Record<ChannelInstructionKind, string>>;

export const CHANNEL_INSTRUCTION_KINDS: ChannelInstructionKind[] = ["whatsapp", "instagram", "messenger"];
export const CHANNEL_INSTRUCTION_LABELS: Record<ChannelInstructionKind, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger (Facebook)",
};
export const CHANNEL_INSTRUCTION_MAX = 4000;

const KEY_PREFIX = "lead_agent_channel_instructions:";

/** Tipo de `smarttalk.channels` → canal de instrucciones. */
export function channelKindForType(type: string | null | undefined): ChannelInstructionKind | null {
  const t = (type || "").toLowerCase();
  if (!t) return null;
  if (t.startsWith("whatsapp") || t === "waha") return "whatsapp";
  if (t === "instagram") return "instagram";
  if (t === "facebook_messenger" || t === "messenger" || t === "facebook") return "messenger";
  return null;
}

function sanitize(input: unknown): ChannelInstructions {
  const out: ChannelInstructions = {};
  if (!input || typeof input !== "object") return out;
  for (const kind of CHANNEL_INSTRUCTION_KINDS) {
    const v = (input as Record<string, unknown>)[kind];
    if (typeof v === "string" && v.trim()) out[kind] = v.trim().slice(0, CHANNEL_INSTRUCTION_MAX);
  }
  return out;
}

export async function getChannelInstructions(brandId: string): Promise<ChannelInstructions> {
  try {
    const pub = createAdminClient("public");
    const { data } = await pub
      .from("settings")
      .select("value")
      .eq("key", `${KEY_PREFIX}${brandId}`)
      .maybeSingle();
    return sanitize(data?.value);
  } catch {
    return {};
  }
}

export async function setChannelInstructions(
  brandId: string,
  instructions: unknown,
): Promise<{ ok: true; value: ChannelInstructions } | { ok: false; error: string }> {
  const value = sanitize(instructions);
  const pub = createAdminClient("public");
  const { error } = await pub
    .from("settings")
    .upsert({ key: `${KEY_PREFIX}${brandId}`, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return { ok: false, error: error.message };
  return { ok: true, value };
}

/** Bloque de prompt para el canal de la conversación; vacío si no hay nada configurado. */
export function channelInstructionsPrompt(
  instructions: ChannelInstructions,
  kind: ChannelInstructionKind | null,
): string {
  if (!kind) return "";
  const text = instructions[kind];
  if (!text) return "";
  return (
    `## Instrucciones específicas para ${CHANNEL_INSTRUCTION_LABELS[kind]} (este cliente escribe por ${CHANNEL_INSTRUCTION_LABELS[kind]})\n` +
    `Estas instrucciones tienen prioridad sobre las generales cuando se contradigan:\n${text}`
  );
}
