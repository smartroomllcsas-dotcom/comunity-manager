/**
 * Comentarios de publicaciones y pautas — SIEMPRE por empresa (clientId = marca).
 *
 * GET  ?clientId=&status=       → { comments, rules, channels }
 * PUT  { clientId, rules }      → guarda las reglas y, si se activa, suscribe
 *                                 la página de Facebook y la cuenta de Instagram
 *                                 al aviso de comentarios.
 * POST { clientId, id, action } → "reply" (público), "dm" (al interno),
 *                                 "both", "ignore".
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCmClientAccess } from "@/lib/cm-client-access";
import { resolveToken } from "@/lib/auth/token-crypto";
import { subscribePageToApp, subscribeInstagramAccountToApp } from "@/lib/meta";
import { getCommentRules, setCommentRules, renderCommentText } from "@/lib/social/comment-rules";
import {
  channelSelfId,
  checkPrivateReplyAllowed,
  composePublicReply,
  pickVariant,
  replyPublicly,
  sendPrivateReply,
  type CommentChannel,
} from "@/lib/social/comments";

export const maxDuration = 120;

async function loadChannels(orgId: string, brandId: string): Promise<CommentChannel[]> {
  const admin = createAdminClient("smarttalk");
  const { data } = await admin
    .from("channels")
    .select("id, organization_id, brand_id, type, name, status, meta_business_id, access_token, access_token_ciphertext, config")
    .eq("organization_id", orgId)
    .eq("brand_id", brandId)
    .in("type", ["facebook_messenger", "instagram"]);
  return (data || []) as unknown as CommentChannel[];
}

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId");
  const status = request.nextUrl.searchParams.get("status");
  if (!clientId) return NextResponse.json({ error: "clientId requerido" }, { status: 400 });
  const access = await getCmClientAccess(request, clientId);
  if (!access?.organizationId) return NextResponse.json({ error: "No autorizado para esta empresa" }, { status: 403 });

  const admin = createAdminClient("smarttalk");
  let query = admin
    .from("social_comments")
    .select("*")
    .eq("organization_id", access.organizationId)
    .eq("brand_id", access.clientId)
    .order("commented_at", { ascending: false })
    .limit(200);
  if (status && status !== "all") query = query.eq("status", status);

  const [{ data: comments }, rules, channels] = await Promise.all([
    query,
    getCommentRules(access.clientId),
    loadChannels(access.organizationId, access.clientId),
  ]);

  const annotated = ((comments || []) as Array<Record<string, unknown>>).map((c) => {
    const check = checkPrivateReplyAllowed({
      dm_sent_at: (c.dm_sent_at as string | null) ?? null,
      commented_at: (c.commented_at as string | null) ?? null,
    });
    return { ...c, dm_allowed: check.allowed, dm_blocked_reason: check.reason || null };
  });

  return NextResponse.json({
    comments: annotated,
    rules,
    channels: channels.map((c) => ({
      id: c.id,
      type: c.type,
      name: (c as unknown as { name?: string }).name || c.type,
      connected: Boolean(resolveToken(c.access_token_ciphertext, c.access_token)),
    })),
  });
}

const rulesSchema = z.object({
  clientId: z.string().uuid(),
  rules: z.object({
    enabled: z.boolean().optional(),
    auto_public_reply: z.boolean().optional(),
    public_reply_mode: z.enum(["ai", "texts"]).optional(),
    ai_reply_instructions: z.string().max(900).optional(),
    max_public_replies_per_hour: z.number().int().min(1).max(120).optional(),
    public_reply_texts: z.array(z.string().max(800)).max(10).optional(),
    auto_dm: z.boolean().optional(),
    dm_text: z.string().max(900).optional(),
    only_first_per_author: z.boolean().optional(),
    ignore_keywords: z.array(z.string().max(60)).max(20).optional(),
    only_keywords: z.array(z.string().max(60)).max(20).optional(),
  }),
});

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = rulesSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validación fallida" }, { status: 422 });
  const access = await getCmClientAccess(request, parsed.data.clientId);
  if (!access?.organizationId) return NextResponse.json({ error: "No autorizado para esta empresa" }, { status: 403 });

  const current = await getCommentRules(access.clientId);
  const saved = await setCommentRules(access.clientId, { ...current, ...parsed.data.rules });
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 500 });

  // Al activar, pedimos a Meta que nos avise de los comentarios de esta empresa.
  const notices: string[] = [];
  if (saved.value.enabled) {
    for (const channel of await loadChannels(access.organizationId, access.clientId)) {
      const token = resolveToken(channel.access_token_ciphertext, channel.access_token);
      const selfId = channelSelfId(channel);
      if (!token || !selfId) {
        notices.push(`${channel.type === "instagram" ? "Instagram" : "Facebook"}: sin credenciales, vuelve a conectarlo en Canales.`);
        continue;
      }
      try {
        if (channel.type === "instagram") await subscribeInstagramAccountToApp(selfId, token);
        else await subscribePageToApp(selfId, token);
      } catch (e) {
        notices.push(
          `${channel.type === "instagram" ? "Instagram" : "Facebook"}: ${e instanceof Error ? e.message : "no se pudo suscribir"}`
        );
      }
    }
  }
  return NextResponse.json({ rules: saved.value, notices });
}

const actionSchema = z.object({
  clientId: z.string().uuid(),
  id: z.string().uuid(),
  action: z.enum(["reply", "dm", "both", "ignore"]),
  text: z.string().max(900).optional(),
  dmText: z.string().max(900).optional(),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validación fallida" }, { status: 422 });
  const { clientId, id, action, text, dmText } = parsed.data;
  const access = await getCmClientAccess(request, clientId);
  if (!access?.organizationId) return NextResponse.json({ error: "No autorizado para esta empresa" }, { status: 403 });

  const admin = createAdminClient("smarttalk");
  const { data: row } = await admin
    .from("social_comments")
    .select("*")
    .eq("id", id)
    .eq("organization_id", access.organizationId)
    .eq("brand_id", access.clientId)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Comentario no encontrado en esta empresa" }, { status: 404 });

  if (action === "ignore") {
    await admin
      .from("social_comments")
      .update({ status: "ignorado", handled_by: "manual", replied_by: access.cmUserId, updated_at: new Date().toISOString() })
      .eq("id", id);
    return NextResponse.json({ ok: true, status: "ignorado" });
  }

  const channels = await loadChannels(access.organizationId, access.clientId);
  const channel = channels.find((c) => c.id === row.channel_id) || channels.find((c) => c.type === (row.platform === "instagram" ? "instagram" : "facebook_messenger"));
  if (!channel) return NextResponse.json({ error: "El canal de esta empresa ya no está disponible" }, { status: 409 });

  const rules = await getCommentRules(access.clientId);
  const { brandName } = await import("@/lib/smarttalk/lead-alerts");
  const vars = { authorName: row.author_name as string | null, brandName: await brandName(access.clientId) };
  const results: string[] = [];
  const errors: string[] = [];

  if (action === "dm" || action === "both") {
    // Límite de Meta: se avisa antes de intentarlo.
    const check = checkPrivateReplyAllowed({
      dm_sent_at: (row.dm_sent_at as string | null) ?? null,
      commented_at: (row.commented_at as string | null) ?? null,
    });
    if (!check.allowed) {
      if (action === "dm") return NextResponse.json({ error: check.reason }, { status: 409 });
      errors.push(check.reason as string);
    }
  }

  if (action === "reply" || action === "both") {
    const composed = text
      ? null
      : await composePublicReply(
          access.clientId,
          { message: (row.message as string) || "", authorName: (row.author_name as string | null) || null },
          rules,
          vars.brandName
        );
    const message = composed || renderCommentText(text || pickVariant(rules.public_reply_texts, null), vars);
    if (!message.trim()) return NextResponse.json({ error: "Escribe la respuesta" }, { status: 422 });
    const res = await replyPublicly(channel, id, row.comment_id as string, message, "manual", access.cmUserId);
    res.ok ? results.push("respuesta publicada") : errors.push(res.error);
  }
  if ((action === "dm" || action === "both") && errors.length === 0) {
    const message = renderCommentText(dmText || text || rules.dm_text, vars);
    if (!message.trim()) return NextResponse.json({ error: "Escribe el mensaje al interno" }, { status: 422 });
    const res = await sendPrivateReply(
      channel,
      id,
      {
        commentId: row.comment_id as string,
        authorName: row.author_name as string | null,
        commentedAt: row.commented_at as string | null,
      },
      message,
      "manual",
      access.cmUserId
    );
    res.ok ? results.push(res.detail === "chat abierto" ? "mensaje enviado y chat abierto" : "mensaje al interno enviado") : errors.push(res.error);
  }

  if (errors.length > 0 && results.length === 0) {
    return NextResponse.json({ error: errors.join(" · ") }, { status: 502 });
  }
  return NextResponse.json({ ok: true, detail: results.join(" · "), warning: errors.join(" · ") || null });
}
