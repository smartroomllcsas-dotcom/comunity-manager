/**
 * Medios de WhatsApp por QR (WAHA).
 *
 * WAHA entrega los adjuntos como una URL de SU servidor (p. ej.
 * `http://localhost:3000/api/files/...`), sólo accesible con la X-Api-Key.
 * Aquí se descarga con las credenciales del servidor y se guarda en
 * `cm-assets`, igual que los medios de Meta, para que el Inbox los muestre y
 * el agente de IA pueda interpretarlos.
 */
import { persistMedia, type DownloadedMedia } from "@/lib/inbox/media-resolver";
import { buildAttachmentContent, type AttachmentContent } from "@/lib/inbox/attachments";
import { MAX_UPLOAD_BYTES } from "@/lib/media/storage";

const DOWNLOAD_TIMEOUT_MS = 30_000;

export type WahaMediaInfo = {
  url?: string | null;
  mimetype?: string | null;
  filename?: string | null;
};

/** Tipo de mensaje a partir del mimetype del adjunto (WAHA no siempre manda `type`). */
export function attachmentTypeFromMime(
  mime: string | null | undefined,
  fallback: "image" | "video" | "audio" | "document" | "sticker" = "document",
): "image" | "video" | "audio" | "document" | "sticker" {
  const m = (mime || "").split(";")[0].trim().toLowerCase();
  if (m === "image/webp") return "sticker";
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m) return "document";
  return fallback;
}

/** La URL que manda WAHA apunta a su propio host; se reescribe al WAHA_BASE_URL público. */
export function resolveWahaMediaUrl(url: string, baseUrl = process.env.WAHA_BASE_URL || ""): string {
  if (!baseUrl) return url;
  try {
    const u = new URL(url);
    const base = new URL(baseUrl);
    u.protocol = base.protocol;
    // `host` sin puerto NO borra el puerto anterior (localhost:3000 → host:3000
    // y la descarga moría por timeout contra Cloudflare); se asigna aparte.
    u.hostname = base.hostname;
    u.port = base.port;
    if (base.pathname && base.pathname !== "/") {
      u.pathname = `${base.pathname.replace(/\/$/, "")}${u.pathname}`;
    }
    return u.toString();
  } catch {
    return url;
  }
}

export async function downloadWahaMedia(
  mediaUrl: string,
  opts: { baseUrl?: string; apiKey?: string; mimeType?: string | null; filename?: string | null } = {},
): Promise<{ ok: true; media: DownloadedMedia } | { ok: false; error: string }> {
  const apiKey = opts.apiKey ?? process.env.WAHA_API_KEY ?? "";
  const url = resolveWahaMediaUrl(mediaUrl, opts.baseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: apiKey ? { "X-Api-Key": apiKey } : {},
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, error: `waha_http_${res.status}` };
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > MAX_UPLOAD_BYTES) return { ok: false, error: "archivo_demasiado_grande" };
    const headerMime = (res.headers.get("content-type") || "").split(";")[0].trim();
    const mimeType =
      (opts.mimeType || "").split(";")[0].trim() ||
      (headerMime && headerMime !== "application/octet-stream" ? headerMime : "") ||
      "application/octet-stream";
    return {
      ok: true,
      media: { buffer, mimeType, size: buffer.byteLength, filename: opts.filename || null },
    };
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}${e.cause ? ` (${String((e.cause as Error)?.message || e.cause)})` : ""}` : "error";
    let host = "?";
    try {
      host = new URL(url).host;
    } catch {}
    console.warn("[waha-media] descarga fallida", { host, error: msg.slice(0, 200) });
    return {
      ok: false,
      error: msg.includes("abort") ? "descarga_timeout" : `descarga_fallida: ${msg.slice(0, 120)}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Descarga el adjunto de WAHA y lo guarda en cm-assets. Devuelve el contenido
 * del mensaje listo para insertar; si falla, un contenido con `media_error` y
 * la URL de WAHA en `provider_url` para reintentar después.
 */
export async function buildWahaAttachmentContent(input: {
  organizationId: string;
  brandId: string;
  media: WahaMediaInfo;
  caption?: string | null;
  providerType?: string | null;
}): Promise<AttachmentContent> {
  const mimeType = input.media.mimetype || null;
  const providerUrl = input.media.url ? resolveWahaMediaUrl(input.media.url) : null;
  const providerType = input.providerType || attachmentTypeFromMime(mimeType);
  const base = {
    providerType,
    mimeType,
    filename: input.media.filename || null,
    caption: input.caption || null,
    providerUrl,
    source: "whatsapp" as const,
  };

  if (!input.media.url) {
    return buildAttachmentContent({ ...base, mediaError: "waha_sin_url" });
  }

  const downloaded = await downloadWahaMedia(input.media.url, {
    mimeType,
    filename: input.media.filename || null,
  });
  if (!downloaded.ok) {
    return buildAttachmentContent({ ...base, mediaError: downloaded.error });
  }

  const stored = await persistMedia({
    organizationId: input.organizationId,
    brandId: input.brandId,
    media: downloaded.media,
    filenameHint: input.media.filename || null,
  });
  if (!stored.ok) {
    return buildAttachmentContent({ ...base, mimeType: downloaded.media.mimeType, mediaError: stored.error });
  }

  return buildAttachmentContent({
    ...base,
    mimeType: stored.result.mimeType,
    storagePath: stored.result.storagePath,
    sizeBytes: stored.result.size,
  });
}
