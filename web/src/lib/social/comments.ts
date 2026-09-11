/**
 * Comentarios de publicaciones y pautas (Facebook e Instagram).
 *
 * Flujo completo, siempre dentro de UNA empresa:
 *   1. Llega el comentario por webhook y se guarda en `smarttalk.social_comments`.
 *   2. Según las reglas de la empresa se responde en público y/o se le escribe
 *      al interno (private reply de Meta).
 *   3. El mensaje al interno abre el chat en el Inbox con el contacto ya creado.
 *      Cuando la persona contesta, el agente de la empresa sigue la conversación.
 *
 * Meta sólo permite UN mensaje al interno por comentario y dentro de 7 días.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveToken } from "@/lib/auth/token-crypto";
import { replyToComment, sendPrivateReplyToComment } from "@/lib/meta";
import {
  commentMatchesRules,
  getCommentRules,
  renderCommentText,
  type CommentRules,
} from "./comment-rules";

export type CommentPlatform = "facebook" | "instagram";

export type IncomingComment = {
  platform: CommentPlatform;
  commentId: string;
  parentId: string | null;
  postId: string | null;
  postPermalink: string | null;
  adId: string | null;
  authorId: string | null;
  authorName: string | null;
  message: string;
  commentedAt: string | null;
  raw: Record<string, unknown>;
};

export type CommentChannel = {
  id: string;
  organization_id: string;
  brand_id: string;
  type: string;
  meta_business_id: string | null;
  access_token: string | null;
  access_token_ciphertext: string | null;
  config: Record<string, unknown> | null;
};

const PRIVATE_REPLY_WINDOW_MS = 7 * 24 * 3600_000;

export type PrivateReplyCheck = { allowed: boolean; reason?: string };

/**
 * Meta sólo deja UN mensaje al interno por comentario y dentro de 7 días.
 * Se comprueba antes de intentarlo para no quemar el intento ni mostrar un
 * error de la API al asesor.
 */
export function checkPrivateReplyAllowed(row: {
  dm_sent_at?: string | null;
  commented_at?: string | null;
  author_id?: string | null;
}): PrivateReplyCheck {
  if (row.dm_sent_at) {
    return { allowed: false, reason: "Ya se le escribió al interno por este comentario. Meta permite sólo uno." };
  }
  if (row.commented_at) {
    const age = Date.now() - new Date(row.commented_at).getTime();
    if (age > PRIVATE_REPLY_WINDOW_MS) {
      return {
        allowed: false,
        reason: "Pasaron los 7 días que da Meta para escribir al interno por este comentario.",
      };
    }
  }
  return { allowed: true };
}

/** ¿El cambio del webhook es un comentario nuevo de otra persona? */
export function parseCommentChange(
  platform: CommentPlatform,
  field: string,
  value: Record<string, unknown>,
  selfIds: string[]
): IncomingComment | null {
  if (platform === "facebook") {
    if (field !== "feed") return null;
    if (String(value.item || "") !== "comment") return null;
    const verb = String(value.verb || "add");
    if (verb !== "add") return null;
    const from = (value.from || {}) as { id?: string; name?: string };
    const commentId = String(value.comment_id || "");
    const message = String(value.message || "");
    if (!commentId) return null;
    if (from.id && selfIds.includes(String(from.id))) return null; // comentario propio
    const post = (value.post || {}) as { permalink_url?: string };
    return {
      platform,
      commentId,
      parentId: value.parent_id ? String(value.parent_id) : null,
      postId: value.post_id ? String(value.post_id) : null,
      postPermalink: post.permalink_url || (value.permalink_url ? String(value.permalink_url) : null),
      adId: value.ad_id ? String(value.ad_id) : null,
      authorId: from.id ? String(from.id) : null,
      authorName: from.name ? String(from.name) : null,
      message,
      commentedAt: value.created_time ? new Date(Number(value.created_time) * 1000).toISOString() : null,
      raw: value,
    };
  }

  // Instagram
  if (field !== "comments") return null;
  const from = (value.from || {}) as { id?: string; username?: string };
  const commentId = String(value.id || "");
  if (!commentId) return null;
  if (from.id && selfIds.includes(String(from.id))) return null;
  const media = (value.media || {}) as { id?: string; ad_id?: string };
  return {
    platform,
    commentId,
    parentId: value.parent_id ? String(value.parent_id) : null,
    postId: media.id ? String(media.id) : null,
    postPermalink: null,
    adId: media.ad_id ? String(media.ad_id) : null,
    authorId: from.id ? String(from.id) : null,
    authorName: from.username ? String(from.username) : null,
    message: String(value.text || ""),
    commentedAt: value.timestamp ? new Date(String(value.timestamp)).toISOString() : null,
    raw: value,
  };
}

/** Guarda el comentario (o lo devuelve si ya estaba). */
export async function storeComment(
  channel: CommentChannel,
  comment: IncomingComment
): Promise<{ id: string; isNew: boolean } | null> {
  const admin = createAdminClient("smarttalk");
  const { data: existing } = await admin
    .from("social_comments")
    .select("id")
    .eq("comment_id", comment.commentId)
    .maybeSingle();
  if (existing?.id) return { id: existing.id as string, isNew: false };

  const { data, error } = await admin
    .from("social_comments")
    .insert({
      organization_id: channel.organization_id,
      brand_id: channel.brand_id,
      channel_id: channel.id,
      platform: comment.platform,
      comment_id: comment.commentId,
      parent_id: comment.parentId,
      post_id: comment.postId,
      post_permalink: comment.postPermalink,
      is_ad: Boolean(comment.adId),
      ad_id: comment.adId,
      author_id: comment.authorId,
      author_name: comment.authorName,
      message: comment.message,
      commented_at: comment.commentedAt || new Date().toISOString(),
      status: "nuevo",
      metadata: comment.raw,
    })
    .select("id")
    .single();
  if (error) {
    // 23505: llegó dos veces el mismo comentario
    if (error.code === "23505") {
      const { data: dup } = await admin
        .from("social_comments")
        .select("id")
        .eq("comment_id", comment.commentId)
        .maybeSingle();
      return dup?.id ? { id: dup.id as string, isNew: false } : null;
    }
    console.error("[comments] no se pudo guardar el comentario:", error.message);
    return null;
  }
  return data?.id ? { id: data.id as string, isNew: true } : null;
}

function channelToken(channel: CommentChannel): string | null {
  return resolveToken(channel.access_token_ciphertext, channel.access_token);
}

/** Id propio del canal (página de Facebook o cuenta de Instagram). */
export function channelSelfId(channel: CommentChannel): string | null {
  const cfg = (channel.config || {}) as Record<string, unknown>;
  return (
    channel.meta_business_id ||
    (typeof cfg.legacy_id === "string" ? cfg.legacy_id : null) ||
    null
  );
}

export type ActionResult = { ok: true; detail?: string } | { ok: false; error: string };

/** Responde el comentario en público. */
export async function replyPublicly(
  channel: CommentChannel,
  commentRowId: string,
  commentId: string,
  text: string,
  handledBy: "auto" | "manual",
  agentId?: string | null
): Promise<ActionResult> {
  const token = channelToken(channel);
  if (!token) return { ok: false, error: "El canal no tiene credenciales de Meta" };
  const admin = createAdminClient("smarttalk");
  try {
    const platform: CommentPlatform = channel.type === "instagram" ? "instagram" : "facebook";
    const res = await replyToComment(token, platform, commentId, text);
    await admin
      .from("social_comments")
      .update({
        public_reply_text: text,
        public_reply_id: (res?.id as string | undefined) || null,
        public_replied_at: new Date().toISOString(),
        status: "respondido",
        handled_by: handledBy,
        replied_by: agentId || null,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", commentRowId);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    await admin
      .from("social_comments")
      .update({ last_error: msg.slice(0, 400), updated_at: new Date().toISOString() })
      .eq("id", commentRowId);
    return { ok: false, error: msg };
  }
}

/**
 * Escribe al interno a quien comentó y deja el chat listo en el Inbox:
 * crea el contacto y la conversación, y guarda el mensaje como del agente,
 * para que cuando la persona responda el agente siga la charla.
 */
export async function sendPrivateReply(
  channel: CommentChannel,
  commentRowId: string,
  comment: { commentId: string; authorName: string | null; commentedAt: string | null },
  text: string,
  handledBy: "auto" | "manual",
  agentId?: string | null
): Promise<ActionResult> {
  const token = channelToken(channel);
  if (!token) return { ok: false, error: "El canal no tiene credenciales de Meta" };
  const admin = createAdminClient("smarttalk");

  const { data: current } = await admin
    .from("social_comments")
    .select("dm_sent_at, commented_at, author_id")
    .eq("id", commentRowId)
    .maybeSingle();
  const check = checkPrivateReplyAllowed({
    dm_sent_at: (current?.dm_sent_at as string | null) ?? null,
    commented_at: (current?.commented_at as string | null) ?? comment.commentedAt,
  });
  if (!check.allowed) {
    await admin
      .from("social_comments")
      .update({ last_error: check.reason, updated_at: new Date().toISOString() })
      .eq("id", commentRowId);
    return { ok: false, error: check.reason as string };
  }

  try {
    const senderId = channel.type === "instagram" ? channelSelfId(channel) || undefined : undefined;
    const res = await sendPrivateReplyToComment(token, comment.commentId, text, { senderId });
    const recipientId = (res?.recipient_id as string | undefined) || null;
    const now = new Date().toISOString();

    let contactId: string | null = null;
    let conversationId: string | null = null;
    if (recipientId) {
      const linked = await linkConversation(channel, recipientId, comment.authorName, text);
      contactId = linked.contactId;
      conversationId = linked.conversationId;
    }

    await admin
      .from("social_comments")
      .update({
        dm_text: text,
        dm_message_id: (res?.message_id as string | undefined) || null,
        dm_sent_at: now,
        status: "respondido",
        handled_by: handledBy,
        replied_by: agentId || null,
        contact_id: contactId,
        conversation_id: conversationId,
        last_error: null,
        updated_at: now,
      })
      .eq("id", commentRowId);
    return { ok: true, detail: conversationId ? "chat abierto" : "enviado" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    await admin
      .from("social_comments")
      .update({ last_error: msg.slice(0, 400), updated_at: new Date().toISOString() })
      .eq("id", commentRowId);
    return { ok: false, error: msg };
  }
}

/** Crea (o reusa) contacto y conversación del canal y guarda el mensaje enviado. */
async function linkConversation(
  channel: CommentChannel,
  providerContactId: string,
  authorName: string | null,
  text: string
): Promise<{ contactId: string | null; conversationId: string | null }> {
  const admin = createAdminClient("smarttalk");
  try {
    const { data: existingContact } = await admin
      .from("contacts")
      .select("id, name")
      .eq("organization_id", channel.organization_id)
      .eq("brand_id", channel.brand_id)
      .eq("wa_id", providerContactId)
      .maybeSingle();

    let contactId = (existingContact?.id as string | undefined) || null;
    if (!contactId) {
      const { data: inserted } = await admin
        .from("contacts")
        .insert({
          organization_id: channel.organization_id,
          brand_id: channel.brand_id,
          wa_id: providerContactId,
          name: authorName,
          last_message_at: new Date().toISOString(),
          custom_fields: { source: "comentario", source_platform: channel.type },
        })
        .select("id")
        .single();
      contactId = (inserted?.id as string | undefined) || null;
    }
    if (!contactId) return { contactId: null, conversationId: null };

    const { data: existingConv } = await admin
      .from("conversations")
      .select("id")
      .eq("contact_id", contactId)
      .eq("channel_id", channel.id)
      .in("status", ["open", "pending"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let conversationId = (existingConv?.id as string | undefined) || null;
    if (!conversationId) {
      const { data: created } = await admin
        .from("conversations")
        .insert({
          organization_id: channel.organization_id,
          brand_id: channel.brand_id,
          contact_id: contactId,
          channel_id: channel.id,
          status: "open",
          unread_count: 0,
          metadata: { channel: channel.type, channel_id: channel.id, source: "comentario" },
        })
        .select("id")
        .single();
      conversationId = (created?.id as string | undefined) || null;
    }
    if (!conversationId) return { contactId, conversationId: null };

    // El mensaje queda como del agente: así, cuando la persona responda, el
    // agente de la empresa continúa la conversación con normalidad.
    await admin.from("messages").insert({
      conversation_id: conversationId,
      contact_id: contactId,
      direction: "outbound",
      type: "text",
      content: { type: "text", text },
      status: "sent",
      is_bot: true,
    });
    await admin
      .from("conversations")
      .update({ last_message_preview: text.slice(0, 100), updated_at: new Date().toISOString() })
      .eq("id", conversationId);
    return { contactId, conversationId };
  } catch (e) {
    console.error("[comments] no se pudo abrir el chat:", e);
    return { contactId: null, conversationId: null };
  }
}

/**
 * Respuesta pública redactada por el agente de la empresa leyendo el comentario.
 * Así cada respuesta es distinta y habla de lo que la persona preguntó, que es
 * justo lo que evita que Meta la marque como spam.
 * Si no hay agente o falla, devuelve null y se usan los textos fijos.
 */
export async function composePublicReply(
  brandId: string,
  comment: { message: string; authorName: string | null },
  rules: CommentRules,
  brandName: string | null
): Promise<string | null> {
  if (rules.public_reply_mode !== "ai") return null;
  if (!comment.message.trim()) return null;
  try {
    const admin = createAdminClient("smarttalk");
    const { data: agent } = await admin
      .from("ai_agents")
      .select("system_prompt")
      .eq("brand_id", brandId)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();

    const first = String(comment.authorName || "").trim().split(/\s+/)[0] || "";
    const who = /^[@+\d]/.test(first) ? "" : first;
    const systemPrompt =
      `${(agent?.system_prompt as string | undefined) || `Eres quien atiende las redes de ${brandName || "la empresa"}.`}\n\n` +
      `## Respuesta PÚBLICA a un comentario\n` +
      `Escribes una respuesta que verá todo el mundo debajo de un comentario en Facebook o Instagram.\n` +
      `Reglas obligatorias:\n` +
      `- Máximo 2 frases, menos de 250 caracteres.\n` +
      `- Habla de lo que la persona preguntó; nunca una frase genérica de plantilla.\n` +
      `- Nada de precios, enlaces, teléfonos ni correos.\n` +
      `- Trato cercano${who ? `; puedes llamarla ${who}` : ""}. Un emoji como máximo.\n` +
      `- Devuelve SÓLO el texto de la respuesta, sin comillas ni explicaciones.\n` +
      (rules.ai_reply_instructions ? `- ${rules.ai_reply_instructions}\n` : "");

    const { generateAIResponse } = await import("@/lib/chatbot/ai");
    const raw = await generateAIResponse({
      systemPrompt,
      conversationHistory: [{ role: "user", content: comment.message.slice(0, 500) }],
      maxTokens: 200,
    });
    const text = String(raw || "")
      .replace(/^["'\s]+|["'\s]+$/g, "")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (!text || text.length < 3) return null;
    return text.slice(0, 280);
  } catch (e) {
    console.warn("[comments] la IA no pudo redactar la respuesta pública:", e);
    return null;
  }
}

/**
 * Protección anti-spam: Meta castiga responder muchos comentarios seguidos y
 * repetir el mismo texto. Se limita por hora y no se repite el texto anterior.
 */
async function publicRepliesLastHour(brandId: string): Promise<number> {
  const admin = createAdminClient("smarttalk");
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin
    .from("social_comments")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brandId)
    .gte("public_replied_at", since);
  return count ?? 0;
}

async function lastPublicReplyText(brandId: string): Promise<string | null> {
  const admin = createAdminClient("smarttalk");
  const { data } = await admin
    .from("social_comments")
    .select("public_reply_text")
    .eq("brand_id", brandId)
    .not("public_reply_text", "is", null)
    .order("public_replied_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.public_reply_text as string | undefined) || null;
}

/** Elige un texto fijo distinto al último usado. */
export function pickVariant(texts: string[], lastUsed: string | null): string {
  const options = texts.filter((t) => t.trim());
  if (options.length === 0) return "";
  const fresh = options.filter((t) => t.trim() !== String(lastUsed || "").trim());
  const pool = fresh.length > 0 ? fresh : options;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** ¿Ya se le respondió antes a esta persona en esta empresa? */
async function authorAlreadyHandled(brandId: string, authorId: string | null): Promise<boolean> {
  if (!authorId) return false;
  const admin = createAdminClient("smarttalk");
  const { data } = await admin
    .from("social_comments")
    .select("id")
    .eq("brand_id", brandId)
    .eq("author_id", authorId)
    .eq("status", "respondido")
    .limit(1);
  return Boolean(data && data.length > 0);
}

/**
 * Aplica las reglas de la empresa a un comentario recién llegado.
 * Devuelve qué se hizo (para el log del webhook).
 */
export async function handleIncomingComment(
  channel: CommentChannel,
  comment: IncomingComment,
  brandName: string | null
): Promise<{ stored: boolean; publicReply: boolean; dm: boolean; skipped?: string }> {
  const stored = await storeComment(channel, comment);
  if (!stored) return { stored: false, publicReply: false, dm: false };
  if (!stored.isNew) return { stored: true, publicReply: false, dm: false, skipped: "duplicado" };

  const rules: CommentRules = await getCommentRules(channel.brand_id);
  if (!rules.enabled) return { stored: true, publicReply: false, dm: false, skipped: "reglas apagadas" };
  if (!commentMatchesRules(comment.message, rules)) {
    return { stored: true, publicReply: false, dm: false, skipped: "no cumple las palabras configuradas" };
  }
  if (rules.only_first_per_author && (await authorAlreadyHandled(channel.brand_id, comment.authorId))) {
    return { stored: true, publicReply: false, dm: false, skipped: "ya se le respondió antes" };
  }

  const vars = { authorName: comment.authorName, brandName };
  let publicReply = false;
  let dm = false;

  if (rules.auto_public_reply) {
    if ((await publicRepliesLastHour(channel.brand_id)) >= rules.max_public_replies_per_hour) {
      await createAdminClient("smarttalk")
        .from("social_comments")
        .update({
          last_error: `Se alcanzó el tope de ${rules.max_public_replies_per_hour} respuestas públicas por hora; respóndelo a mano.`,
        })
        .eq("id", stored.id);
    } else {
      const composed = await composePublicReply(channel.brand_id, comment, rules, brandName);
      const text = composed || renderCommentText(pickVariant(rules.public_reply_texts, await lastPublicReplyText(channel.brand_id)), vars);
      if (text.trim()) {
        // Pausa corta y variable: responder al instante y en ráfaga es lo que
        // Meta lee como automatización agresiva.
        await new Promise((r) => setTimeout(r, 3000 + Math.random() * 7000));
        const res = await replyPublicly(channel, stored.id, comment.commentId, text, "auto");
        publicReply = res.ok;
      }
    }
  }
  if (rules.auto_dm && rules.dm_text) {
    const res = await sendPrivateReply(
      channel,
      stored.id,
      { commentId: comment.commentId, authorName: comment.authorName, commentedAt: comment.commentedAt },
      renderCommentText(rules.dm_text, vars),
      "auto"
    );
    dm = res.ok;
  }
  return { stored: true, publicReply, dm };
}
