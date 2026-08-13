/**
 * Resolución y persistencia de medios entrantes del Inbox.
 *
 * **Sólo servidor.** Usa los tokens de canal y la `service_role` de storage.
 * Importarlo desde un componente cliente filtraría credenciales al navegador.
 *
 * Por qué hay que descargar los medios
 * ------------------------------------
 * Ninguno de los proveedores entrega algo que el navegador pueda pedir por su
 * cuenta:
 *
 *   - **WhatsApp** entrega un *media id*. Resolverlo da una URL de Graph que
 *     además exige `Authorization: Bearer`. Poner el id en `content.url` —lo
 *     que se hacía— produce un `<img src="1234567890">` roto.
 *   - **Meta** a veces entrega `attachment.payload.url`, firmada y con
 *     caducidad corta; otras veces sólo un id.
 *   - **Respond.io** entrega URLs externas que pueden desaparecer.
 *
 * Así que se descarga en el servidor y se guarda en `cm-assets`. La URL del
 * proveedor se conserva en `provider_url` para diagnóstico, pero **nunca** se
 * le sirve al navegador: podría llevar el token en la query.
 *
 * Resiliencia
 * -----------
 * Nada de esto puede tumbar un webhook. El mensaje se guarda primero y el medio
 * se resuelve después; si la descarga falla, el mensaje se queda con
 * `provider_media_id` / `provider_url` y un `media_error`, y el endpoint
 * `/api/inbox/messages/[id]/media` puede reintentarlo más tarde.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveToken } from "@/lib/auth/token-crypto";
import { isAllowedMime, uploadAsset, MAX_UPLOAD_BYTES } from "@/lib/media/storage";
import {
  buildAttachmentContent,
  extensionFromName,
  mimeFromExtension,
  type AttachmentContent,
  type AttachmentSource,
} from "./attachments";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";
const DOWNLOAD_TIMEOUT_MS = 30_000;

/**
 * Recorta cualquier credencial de un texto antes de registrarlo.
 *
 * Las URLs de Meta llevan el token en `access_token=` y los mensajes de error
 * de `fetch` suelen incluir la URL completa. Sin esto, un fallo de descarga
 * dejaría el token del canal escrito en los logs.
 */
export function redactSecrets(value: string): string {
  return value
    .replace(/access_token=[^&\s"']+/gi, "access_token=[REDACTADO]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTADO]")
    .replace(/EAA[A-Za-z0-9]{20,}/g, "[REDACTADO]");
}

function mediaLog(event: string, context: Record<string, unknown>) {
  const safe = JSON.parse(redactSecrets(JSON.stringify({ event, ...context })));
  console.warn(`[inbox-media] ${event} ${JSON.stringify(safe)}`);
}

export interface DownloadedMedia {
  buffer: Buffer;
  mimeType: string;
  size: number;
  filename: string | null;
}

/** Conserva el MIME declarado por el canal cuando el CDN responde genérico. */
export function preferDeclaredMime(
  media: DownloadedMedia,
  declaredMime?: string | null,
): DownloadedMedia {
  const detected = media.mimeType.trim().toLowerCase();
  const declared = declaredMime?.split(";")[0].trim().toLowerCase() || "";
  if ((!detected || detected === "application/octet-stream") && declared) {
    return { ...media, mimeType: declared };
  }
  return media;
}

/** Nombre propuesto por el servidor remoto, si lo dice. */
function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      // Cabecera mal formada: se ignora y se prueba con el formato simple.
    }
  }
  const simple = /filename="?([^";]+)"?/i.exec(header);
  return simple ? simple[1] : null;
}

/**
 * Descarga un binario con cabeceras opcionales.
 *
 * Devuelve un resultado, no lanza: quien llama está dentro de un webhook y un
 * throw perdería el mensaje.
 */
export async function downloadMedia(
  url: string,
  headers: Record<string, string> = {},
): Promise<{ ok: true; media: DownloadedMedia } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) {
      return { ok: false, error: `descarga_fallida_http_${response.status}` };
    }

    const declared = response.headers.get("content-length");
    if (declared && Number(declared) > MAX_UPLOAD_BYTES) {
      return { ok: false, error: "archivo_demasiado_grande" };
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.byteLength > MAX_UPLOAD_BYTES) {
      return { ok: false, error: "archivo_demasiado_grande" };
    }

    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim();
    const filename = filenameFromContentDisposition(
      response.headers.get("content-disposition"),
    );

    return {
      ok: true,
      media: {
        buffer,
        // Un `application/octet-stream` no dice nada: si el nombre trae
        // extensión, se prefiere lo que ésta indique.
        mimeType:
          contentType && contentType !== "application/octet-stream"
            ? contentType
            : mimeFromExtension(extensionFromName(filename || url)) || contentType || "",
        size: buffer.byteLength,
        filename,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "error_desconocido";
    return {
      ok: false,
      error: message.includes("abort") ? "descarga_timeout" : "descarga_fallida",
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** Token en claro de un canal. Nunca sale de este módulo hacia el cliente. */
export function channelToken(channel: {
  access_token?: string | null;
  access_token_ciphertext?: string | null;
}): string | null {
  return resolveToken(channel.access_token_ciphertext, channel.access_token) || null;
}

/**
 * Resuelve un media id de Graph (WhatsApp y Meta usan el mismo mecanismo).
 *
 * Son dos pasos: pedir los metadatos —que traen una `url` de un solo uso— y
 * después descargarla con `Authorization: Bearer`. Sin esa cabecera Graph
 * responde 401 aunque la URL sea correcta.
 */
export async function resolveGraphMedia(
  mediaId: string,
  token: string,
): Promise<{ ok: true; media: DownloadedMedia } | { ok: false; error: string }> {
  if (!mediaId || !token) return { ok: false, error: "media_id_o_token_ausente" };

  const metadataUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(mediaId)}`;
  let metadata: { url?: string; mime_type?: string; file_size?: number };
  try {
    const response = await fetch(metadataUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      return { ok: false, error: `metadata_http_${response.status}` };
    }
    metadata = (await response.json()) as typeof metadata;
  } catch {
    return { ok: false, error: "metadata_inaccesible" };
  }

  if (!metadata?.url) return { ok: false, error: "metadata_sin_url" };

  const downloaded = await downloadMedia(metadata.url, {
    Authorization: `Bearer ${token}`,
  });
  if (!downloaded.ok) return downloaded;

  return {
    ok: true,
    media: {
      ...preferDeclaredMime(downloaded.media, metadata.mime_type),
    },
  };
}

export interface PersistInput {
  organizationId: string;
  brandId: string;
  media: DownloadedMedia;
  filenameHint?: string | null;
}

export interface PersistResult {
  storagePath: string;
  mimeType: string;
  size: number;
}

/**
 * Guarda el binario en `cm-assets`.
 *
 * La ruta es `organization_id/brand_id/inbox/aaaa-mm/uuid.ext`: `uploadAsset`
 * ya compone `org/client/aaaa-mm/<folder>/uuid.ext`, así que basta con pasar
 * `inbox` como carpeta. **No se crea tabla nueva**: la referencia vive en el
 * JSONB del propio mensaje.
 */
export async function persistMedia(
  input: PersistInput,
): Promise<{ ok: true; result: PersistResult } | { ok: false; error: string }> {
  const mimeType = input.media.mimeType || "application/octet-stream";
  if (!isAllowedMime(mimeType)) {
    // No es un fallo transitorio: reintentar no lo va a permitir. Se deja
    // constancia para que el motivo sea visible en la interfaz.
    return { ok: false, error: `tipo_no_permitido:${mimeType}` };
  }

  const uploaded = await uploadAsset({
    file: input.media.buffer,
    mimeType,
    organizationId: input.organizationId,
    clientId: input.brandId,
    folder: "inbox",
    filenameHint: input.filenameHint || undefined,
    sizeBytes: input.media.size,
  });

  if (!uploaded.ok) return { ok: false, error: redactSecrets(uploaded.error) };

  return {
    ok: true,
    result: {
      storagePath: uploaded.path,
      mimeType: uploaded.mimeType,
      size: uploaded.size,
    },
  };
}

export interface ResolveAttachmentInput {
  source: AttachmentSource;
  organizationId: string;
  brandId: string;
  providerType?: string | null;
  providerMediaId?: string | null;
  providerUrl?: string | null;
  filename?: string | null;
  caption?: string | null;
  mimeType?: string | null;
  /** Token del canal. Nunca se escribe en el contenido resultante. */
  token?: string | null;
}

/**
 * Descarga, guarda y devuelve el contenido listo para el JSONB del mensaje.
 *
 * **Nunca lanza.** Si algo falla devuelve el contenido igualmente, con
 * `provider_media_id` / `provider_url` intactos y `media_error` explicando por
 * qué: el mensaje se guarda siempre y el medio se puede reintentar después.
 */
export async function resolveAndPersistAttachment(
  input: ResolveAttachmentInput,
): Promise<AttachmentContent> {
  const base = {
    providerType: input.providerType,
    mimeType: input.mimeType,
    filename: input.filename,
    caption: input.caption,
    providerMediaId: input.providerMediaId,
    providerUrl: input.providerUrl,
    source: input.source,
  };

  let downloaded: { ok: true; media: DownloadedMedia } | { ok: false; error: string } | null =
    null;

  try {
    if (input.providerUrl && /^https?:\/\//i.test(input.providerUrl)) {
      // Las URLs de Meta ya vienen firmadas; mandar además el Bearer no
      // estorba y es lo que exige Graph cuando la URL es de `lookaside`.
      downloaded = await downloadMedia(
        input.providerUrl,
        input.token ? { Authorization: `Bearer ${input.token}` } : {},
      );
    }

    if ((!downloaded || !downloaded.ok) && input.providerMediaId && input.token) {
      downloaded = await resolveGraphMedia(input.providerMediaId, input.token);
    }
  } catch (error) {
    downloaded = {
      ok: false,
      error: redactSecrets(error instanceof Error ? error.message : "error_desconocido"),
    };
  }

  if (!downloaded) {
    return buildAttachmentContent({ ...base, mediaError: "sin_origen_descargable" });
  }
  if (!downloaded.ok) {
    mediaLog("descarga_fallida", {
      source: input.source,
      organization_id: input.organizationId,
      brand_id: input.brandId,
      reason: downloaded.error,
      has_media_id: Boolean(input.providerMediaId),
    });
    return buildAttachmentContent({ ...base, mediaError: downloaded.error });
  }

  const media = preferDeclaredMime(downloaded.media, input.mimeType);

  const stored = await persistMedia({
    organizationId: input.organizationId,
    brandId: input.brandId,
    media,
    filenameHint: input.filename || media.filename,
  });

  if (!stored.ok) {
    mediaLog("guardado_fallido", {
      source: input.source,
      organization_id: input.organizationId,
      brand_id: input.brandId,
      reason: stored.error,
    });
    return buildAttachmentContent({
      ...base,
      mimeType: media.mimeType || input.mimeType,
      filename: input.filename || media.filename,
      mediaError: stored.error,
    });
  }

  return buildAttachmentContent({
    ...base,
    mimeType: stored.result.mimeType,
    filename: input.filename || downloaded.media.filename,
    storagePath: stored.result.storagePath,
    sizeBytes: stored.result.size,
  });
}

/** Canal con lo justo para resolver un medio. Sin exponer el token al llamador. */
export async function loadChannelForMedia(channelId: string) {
  const admin = createAdminClient("smarttalk");
  const { data } = await admin
    .from("channels")
    .select("id, organization_id, brand_id, type, access_token, access_token_ciphertext")
    .eq("id", channelId)
    .maybeSingle();
  return data as
    | {
        id: string;
        organization_id: string;
        brand_id: string;
        type: string;
        access_token: string | null;
        access_token_ciphertext: string | null;
      }
    | null;
}

/**
 * Resuelve el medio de un mensaje **ya guardado** y actualiza su contenido.
 *
 * Este es el orden que exige la resiliencia: primero se guarda el mensaje —que
 * es lo que no se puede perder— y sólo después se intenta el medio. Si la
 * descarga falla, el mensaje sigue ahí con `provider_media_id` intacto y el
 * endpoint `/api/inbox/messages/[id]/media` lo reintenta cuando alguien lo abre.
 *
 * **Nunca lanza.** Se invoca sin `await` desde los webhooks.
 */
export async function resolveMessageAttachment(input: {
  messageId: string;
  organizationId: string;
  brandId: string;
  channelId?: string | null;
  content: AttachmentContent;
}): Promise<void> {
  try {
    const { content } = input;
    // Ya resuelto, o nada que resolver.
    if (content.storage_path) return;
    if (!content.provider_media_id && !content.provider_url) return;

    const channel = input.channelId ? await loadChannelForMedia(input.channelId) : null;

    const resolved = await resolveAndPersistAttachment({
      source: content.source,
      organizationId: input.organizationId,
      brandId: input.brandId,
      providerType: content.type,
      providerMediaId: content.provider_media_id || null,
      providerUrl: content.provider_url || null,
      filename: content.filename || null,
      caption: content.caption || null,
      mimeType: content.mime_type || null,
      token: channel ? channelToken(channel) : null,
    });

    // Sin `storage_path` no hay nada nuevo que guardar: se deja el mensaje como
    // está para no pisar el contenido original con un error.
    if (!resolved.storage_path) return;

    const admin = createAdminClient("smarttalk");
    await admin
      .from("messages")
      .update({ content: { ...content, ...resolved } })
      .eq("id", input.messageId);
  } catch (error) {
    mediaLog("resolucion_diferida_fallida", {
      message_id: input.messageId,
      reason: redactSecrets(error instanceof Error ? error.message : "error_desconocido"),
    });
  }
}

/** Dispara la resolución sin bloquear el webhook. */
export function scheduleAttachmentResolution(
  input: Parameters<typeof resolveMessageAttachment>[0],
) {
  void resolveMessageAttachment(input);
}
