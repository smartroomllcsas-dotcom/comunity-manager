/**
 * GET /api/inbox/messages/[messageId]/media — servir el adjunto de un mensaje.
 *
 * Es la **única** puerta por la que un adjunto llega al navegador. Antes la
 * interfaz ponía en `<img src>` lo que hubiera en `content.url`, que según el
 * canal podía ser un media id de WhatsApp (roto) o una URL de Meta con el token
 * del canal en la query (una fuga).
 *
 * Qué comprueba, en orden
 * -----------------------
 *   1. Hay sesión. Si no, 401.
 *   2. El mensaje existe y su conversación es accesible para este agente,
 *      usando `getAccessibleConversation`, que ya aplica organización y marca.
 *      Cualquier fallo responde **404**, nunca 403: un 403 confirmaría que ese
 *      identificador existe en otra organización.
 *
 * Qué hace después
 * ----------------
 *   - Si el adjunto ya está en `cm-assets`, redirige a una URL firmada de vida
 *     corta. Es más barato que hacer de proxy y la firma caduca sola.
 *   - Si sólo hay `provider_media_id` / `provider_url` —mensajes anteriores a
 *     esta corrección, o descargas que fallaron en su día— **lo resuelve ahora**
 *     y guarda el resultado en el mensaje, para que la próxima vez sea directo.
 *   - Si el proveedor ya no lo tiene, responde un error controlado en JSON, no
 *     un enlace roto.
 *
 * `?download=1` fuerza `Content-Disposition: attachment`. Como una redirección
 * no permite imponer esa cabecera, en ese caso el archivo se transmite desde el
 * servidor.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessibleConversation, getBrandScopeAgent } from "@/lib/smarttalk/brand-scope";
import { getSignedUrl } from "@/lib/media/storage";
import {
  channelToken,
  downloadMedia,
  loadChannelForMedia,
  resolveGraphMedia,
  persistMedia,
  preferDeclaredMime,
  redactSecrets,
} from "@/lib/inbox/media-resolver";
import type { AttachmentContent } from "@/lib/inbox/attachments";

const SIGNED_URL_TTL_SECONDS = 300;

/** RFC 5987: nombres con acentos o espacios deben ir codificados. */
function contentDisposition(filename: string, download: boolean) {
  const fallback = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `${download ? "attachment" : "inline"}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function notFound() {
  // Mismo cuerpo para «no existe» y «no es tuyo».
  return NextResponse.json({ error: "Mensaje no encontrado." }, { status: 404 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const agent = await getBrandScopeAgent(user.id).catch(() => null);
  if (!agent) return notFound();

  const admin = createAdminClient("smarttalk");
  const { data: message } = await admin
    .from("messages")
    .select("id, conversation_id, content, channel_id")
    .eq("id", messageId)
    .maybeSingle();

  if (!message) return notFound();

  // El aislamiento real: organización y marca los aplica esta consulta.
  const conversation = await getAccessibleConversation(
    agent,
    (message as { conversation_id: string }).conversation_id,
  ).catch(() => null);
  if (!conversation) return notFound();

  const content = ((message as { content: unknown }).content || {}) as AttachmentContent;
  const download = request.nextUrl.searchParams.get("download") === "1";
  const filename = content.filename || "archivo";

  // --- 1. Ya está guardado: URL firmada, o streaming si piden descarga -------
  if (content.storage_path) {
    if (!download) {
      const signed = await getSignedUrl(content.storage_path, SIGNED_URL_TTL_SECONDS);
      if (signed.ok) return NextResponse.redirect(signed.url);
      // Si firmar falla se sigue al camino de streaming en vez de rendirse.
    }

    const signed = await getSignedUrl(content.storage_path, SIGNED_URL_TTL_SECONDS);
    if (signed.ok) {
      const file = await downloadMedia(signed.url);
      if (file.ok) {
        return new NextResponse(new Uint8Array(file.media.buffer), {
          headers: {
            "Content-Type": content.mime_type || file.media.mimeType || "application/octet-stream",
            "Content-Disposition": contentDisposition(filename, download),
            "Cache-Control": "private, max-age=300",
          },
        });
      }
    }
    return NextResponse.json(
      { error: "El archivo no está disponible en este momento.", code: "storage_unavailable" },
      { status: 502 },
    );
  }

  // --- 2. Aún no está guardado: resolverlo ahora ----------------------------
  const channelId =
    (message as { channel_id?: string | null }).channel_id ||
    (conversation as { channel_id?: string | null }).channel_id ||
    null;
  const channel = channelId ? await loadChannelForMedia(channelId) : null;
  const token = channel ? channelToken(channel) : null;

  let resolved: Awaited<ReturnType<typeof downloadMedia>> | null = null;

  const legacyUrl = content.url && /^https?:\/\//i.test(content.url) ? content.url : null;
  const providerUrl = content.provider_url || legacyUrl;
  if (providerUrl && /^https?:\/\//i.test(providerUrl)) {
    resolved = await downloadMedia(
      providerUrl,
      token ? { Authorization: `Bearer ${token}` } : {},
    );
  }
  if ((!resolved || !resolved.ok) && content.provider_media_id && token) {
    resolved = await resolveGraphMedia(content.provider_media_id, token);
  }

  if (!resolved || !resolved.ok) {
    // Error controlado y sin secretos: la interfaz muestra «Archivo no
    // disponible» en vez de un enlace roto.
    return NextResponse.json(
      {
        error: "El proveedor ya no tiene disponible este archivo.",
        code: "provider_unavailable",
        reason: resolved && !resolved.ok ? redactSecrets(resolved.error) : "sin_origen_descargable",
      },
      { status: 410 },
    );
  }

  // Se guarda para que la próxima consulta no dependa del proveedor. Si el
  // guardado falla, el archivo se entrega igual: el usuario ya esperó.
  const media = preferDeclaredMime(resolved.media, content.mime_type);
  const stored = await persistMedia({
    organizationId: (conversation as { organization_id: string }).organization_id,
    brandId: (conversation as { brand_id: string }).brand_id,
    media,
    filenameHint: filename,
  });

  if (stored.ok) {
    await admin
      .from("messages")
      .update({
        content: {
          ...content,
          storage_path: stored.result.storagePath,
          mime_type: stored.result.mimeType || media.mimeType || content.mime_type,
          size_bytes: stored.result.size,
          media_error: undefined,
        },
      })
      .eq("id", messageId);
  }

  return new NextResponse(new Uint8Array(media.buffer), {
    headers: {
      "Content-Type":
        media.mimeType || content.mime_type || "application/octet-stream",
      "Content-Disposition": contentDisposition(filename, download),
      "Cache-Control": "private, max-age=300",
    },
  });
}
