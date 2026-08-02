/**
 * Sprint 26 · Inbox unificado — helpers de agrupación cross-source.
 *
 * Genera un ID estable de "conversación" a partir de (client_id, platform,
 * author_handle) usando un hash determinístico. Permite agrupar mentions de
 * cm_mentions + messages de smarttalk (cuando compartan handle+plataforma) en
 * un mismo hilo lógico.
 */

import { createHash } from "crypto";

export type ConversationSource = "cm_mentions" | "smarttalk";

export interface ConversationKeyInput {
  clientId: string;
  platform: string;
  authorHandle: string | null;
  // Cuando viene de smarttalk usamos el conversation_id nativo como override
  // — así no perdemos threads persistentes que ya existen.
  smarttalkConversationId?: string | null;
}

/** hash estable con prefijo por-source para poder revertir a la fila original. */
export function makeConversationKey(input: ConversationKeyInput): string {
  if (input.smarttalkConversationId) {
    return `st:${input.smarttalkConversationId}`;
  }
  const raw = [
    input.clientId,
    (input.platform || "").toLowerCase(),
    (input.authorHandle || "unknown").toLowerCase(),
  ].join("|");
  const h = createHash("sha1").update(raw).digest("hex").slice(0, 20);
  return `cm:${h}`;
}

/** parse a conversation key back into its source + payload. */
export function parseConversationKey(
  key: string,
): { source: ConversationSource; ref: string } | null {
  if (!key || typeof key !== "string") return null;
  if (key.startsWith("st:")) {
    return { source: "smarttalk", ref: key.slice(3) };
  }
  if (key.startsWith("cm:")) {
    return { source: "cm_mentions", ref: key.slice(3) };
  }
  return null;
}
