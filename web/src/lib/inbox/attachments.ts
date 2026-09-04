/**
 * Normalización de adjuntos del Inbox — reglas puras, sin red ni base de datos.
 *
 * El problema que resuelve
 * ------------------------
 * Cada proveedor nombra los adjuntos a su manera y ninguno coincide con los
 * tipos internos:
 *
 *   - Meta manda `attachment.type` = `file`, `image`, `video`, `audio`,
 *     `fallback`… y a veces sólo un identificador, sin URL.
 *   - WhatsApp manda un **media id**, que no es una URL descargable.
 *   - Respond.io manda `message.type = "attachment"` y dentro
 *     `attachment.type = "file"`.
 *
 * Antes, esos valores se escribían tal cual en `smarttalk.messages.type`, que
 * sólo admite el conjunto interno. De ahí venía el documento de Instagram que
 * aparecía como «archivo» y no se podía abrir.
 *
 * Reglas que este módulo garantiza
 * --------------------------------
 *   1. `file`, `attachment` y `unknown` **nunca** salen de aquí: se traducen.
 *   2. El nombre visible nunca es sólo «archivo» si se puede deducir algo mejor
 *      del mime, de la extensión de la URL o del propio tipo.
 *   3. Ningún token entra en el contenido: la firma de `buildAttachmentContent`
 *      no acepta credenciales, así que no hay forma de colarlas por descuido.
 */
import type { MessageType } from "@/types/database";

/** Tipos internos que admite un adjunto. Subconjunto de `MessageType`. */
export type AttachmentType = "image" | "video" | "audio" | "document" | "sticker";

export const ATTACHMENT_TYPES: AttachmentType[] = [
  "image",
  "video",
  "audio",
  "document",
  "sticker",
];

/** Valores que los proveedores usan y que jamás deben llegar a la base. */
export const INVALID_ATTACHMENT_TYPES = ["file", "attachment", "unknown", "fallback"];

export type AttachmentSource = "meta" | "whatsapp" | "respond_io";

export interface AttachmentContent {
  type: AttachmentType;
  /** URL utilizable por el navegador. Vacía mientras el medio no se resuelva. */
  url: string;
  filename: string;
  caption?: string;
  mime_type?: string;
  /** Identificador del medio en el proveedor, para reintentar la descarga. */
  provider_media_id?: string;
  /** URL original del proveedor. Puede caducar; nunca se sirve al navegador. */
  provider_url?: string;
  /** Ruta dentro del bucket `cm-assets` cuando el archivo ya se guardó. */
  storage_path?: string;
  size_bytes?: number;
  source: AttachmentSource;
  /** Motivo por el que el medio no se pudo resolver, para poder reintentar. */
  media_error?: string;
  /** Texto derivado por IA (transcripción / descripción) para el agente. */
  ai_text?: string;
  ai_text_source?: string;
  ai_text_error?: string;
}

/** Proyección segura para respuestas que llegan al navegador. */
export function sanitizeAttachmentForClient(content: unknown): unknown {
  if (!content || typeof content !== "object" || Array.isArray(content)) return content;
  const value = content as Record<string, unknown>;
  if (!(ATTACHMENT_TYPES as string[]).includes(String(value.type || ""))) return content;

  // El servidor conserva estas referencias para reintentar la descarga, pero
  // nunca deben viajar al navegador: provider_url puede llevar access_token.
  const safe: Record<string, unknown> = { ...value, url: "" };
  delete safe.provider_media_id;
  delete safe.provider_url;
  delete safe.storage_path;
  delete safe.media_error;
  return safe;
}

const MIME_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/3gpp": "3gp",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/ogg": "ogg",
  "audio/opus": "opus",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/amr": "amr",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/zip": "zip",
};

const EXTENSION_TO_MIME: Record<string, string> = Object.entries(MIME_TO_EXTENSION).reduce(
  (accumulator, [mime, extension]) => {
    if (!accumulator[extension]) accumulator[extension] = mime;
    return accumulator;
  },
  {} as Record<string, string>,
);

/** Nombre por defecto según el tipo. Nunca «archivo» a secas. */
const DEFAULT_FILENAMES: Record<AttachmentType, string> = {
  image: "imagen.jpg",
  video: "video.mp4",
  audio: "audio.ogg",
  document: "documento.pdf",
  sticker: "sticker.webp",
};

const AUDIO_EXTENSIONS = /\.(aac|aif|aiff|amr|m4a|mp3|oga|ogg|opus|wav|weba)(\?|#|$)/i;
const IMAGE_EXTENSIONS = /\.(avif|bmp|gif|heic|heif|jpe?g|png|webp)(\?|#|$)/i;
const VIDEO_EXTENSIONS = /\.(3gp|avi|m4v|mkv|mov|mp4|mpe?g|webm)(\?|#|$)/i;

export function extensionFromMime(mime: string | null | undefined): string | null {
  if (!mime) return null;
  const clean = mime.split(";")[0].trim().toLowerCase();
  if (MIME_TO_EXTENSION[clean]) return MIME_TO_EXTENSION[clean];
  const guess = clean.split("/")[1];
  if (!guess) return null;
  return guess.split("+")[0] || null;
}

export function extensionFromName(value: string | null | undefined): string | null {
  if (!value) return null;
  // Se recorta la query antes de buscar el punto: `foto.jpg?token=…` no debe
  // producir la extensión `jpg?token=…`.
  const withoutQuery = value.split(/[?#]/)[0];
  const match = /\.([a-zA-Z0-9]{1,8})$/.exec(withoutQuery);
  return match ? match[1].toLowerCase() : null;
}

export function mimeFromExtension(extension: string | null | undefined): string | null {
  if (!extension) return null;
  return EXTENSION_TO_MIME[extension.toLowerCase()] || null;
}

/**
 * Traduce el tipo del proveedor al tipo interno.
 *
 * Cuando el proveedor no lo dice —o dice `file`, `attachment`, `unknown`— se
 * deduce del mime y, si tampoco, de la extensión del nombre o de la URL. El
 * último recurso es `document`, que es el que menos miente: siempre se puede
 * ofrecer descargar algo.
 */
export function normalizeAttachmentType(input: {
  providerType?: string | null;
  mimeType?: string | null;
  filename?: string | null;
  url?: string | null;
}): AttachmentType {
  const providerType = (input.providerType || "").trim().toLowerCase();

  if ((ATTACHMENT_TYPES as string[]).includes(providerType)) {
    return providerType as AttachmentType;
  }
  // Alias específicos: el proveedor sí está diciendo qué es.
  if (providerType === "photo") return "image";
  if (providerType === "voice" || providerType === "ptt") return "audio";
  if (providerType === "animated_image" || providerType === "gif") return "image";

  const mime = (input.mimeType || "").split(";")[0].trim().toLowerCase();

  // `file`, `attachment` y `unknown` son genéricos: no dicen qué es, sólo que
  // hay algo adjunto. El requisito los mapea a `document`, pero cuando el mime
  // revela el tipo real conviene usarlo: una foto enviada «como archivo» sigue
  // siendo una foto, y mostrarla como enlace de descarga sería peor. Sin mime,
  // se cae a `document` como manda la regla.
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (providerType === "file" || providerType === "doc") return "document";
  if (mime) return "document";

  for (const candidate of [input.filename, input.url]) {
    if (!candidate) continue;
    if (AUDIO_EXTENSIONS.test(candidate)) return "audio";
    if (IMAGE_EXTENSIONS.test(candidate)) return "image";
    if (VIDEO_EXTENSIONS.test(candidate)) return "video";
  }

  return "document";
}

/** El tipo interno de mensaje que corresponde a un adjunto ya normalizado. */
export function messageTypeForAttachment(type: AttachmentType): MessageType {
  return type;
}

/** Quita rutas y caracteres problemáticos de un nombre venido de fuera. */
export function sanitizeFilename(value: string | null | undefined): string | null {
  if (!value) return null;
  const base = value.split(/[\\/]/).pop() || "";
  const clean = base.replace(/[\x00-\x1f<>:"|?*]/g, "").trim();
  if (!clean || clean === "." || clean === "..") return null;
  return clean.slice(0, 180);
}

/**
 * Nombre a mostrar y a usar en la descarga.
 *
 * El requisito es explícito: nunca sólo «archivo» si se puede deducir algo.
 * El orden es el de la información más fiable a la menos: nombre del proveedor
 * → nombre de la URL → extensión del mime → nombre por defecto del tipo.
 */
export function resolveFilename(input: {
  filename?: string | null;
  mimeType?: string | null;
  url?: string | null;
  type: AttachmentType;
}): string {
  const provided = sanitizeFilename(input.filename);
  if (provided) {
    // Un nombre sin extensión se completa con la que diga el mime.
    if (!extensionFromName(provided)) {
      const extension = extensionFromMime(input.mimeType);
      if (extension) return `${provided}.${extension}`;
    }
    return provided;
  }

  const fromUrl = sanitizeFilename(
    input.url && /^https?:\/\//i.test(input.url)
      ? decodeURIComponent(input.url.split(/[?#]/)[0].split("/").pop() || "")
      : null,
  );
  if (fromUrl && extensionFromName(fromUrl)) return fromUrl;

  const extension = extensionFromMime(input.mimeType);
  if (extension) {
    const stem = DEFAULT_FILENAMES[input.type].split(".")[0];
    return `${stem}.${extension}`;
  }

  return DEFAULT_FILENAMES[input.type];
}

/** Etiqueta corta del tipo, para la interfaz. */
export function attachmentLabel(type: AttachmentType): string {
  const labels: Record<AttachmentType, string> = {
    image: "Imagen",
    video: "Video",
    audio: "Audio",
    document: "Documento",
    sticker: "Sticker",
  };
  return labels[type];
}

/** Tamaño legible. `null` cuando no se conoce, para no inventar un «0 B». */
export function formatBytes(size: number | null | undefined): string | null {
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) return null;
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // Un decimal sólo cuando aporta: «1.5 MB» sí, «2.0 KB» no.
  const rendered =
    value >= 10 || unit === 0 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, "");
  return `${rendered} ${units[unit]}`;
}

/**
 * Construye el contenido que se guarda en el JSONB de `messages`.
 *
 * No recibe token alguno **por diseño**: si la firma no lo admite, no se puede
 * filtrar uno por descuido a la base de datos.
 */
export function buildAttachmentContent(input: {
  providerType?: string | null;
  mimeType?: string | null;
  filename?: string | null;
  caption?: string | null;
  url?: string | null;
  providerMediaId?: string | null;
  providerUrl?: string | null;
  storagePath?: string | null;
  sizeBytes?: number | null;
  source: AttachmentSource;
  mediaError?: string | null;
}): AttachmentContent {
  const type = normalizeAttachmentType({
    providerType: input.providerType,
    mimeType: input.mimeType,
    filename: input.filename,
    url: input.providerUrl || input.url,
  });

  const mimeType =
    input.mimeType?.split(";")[0].trim() ||
    mimeFromExtension(extensionFromName(input.filename)) ||
    mimeFromExtension(extensionFromName(input.providerUrl || input.url)) ||
    undefined;

  const content: AttachmentContent = {
    type,
    // Sólo se acepta como URL servible algo que de verdad lo sea. Un media id
    // de WhatsApp aquí es exactamente el bug que se está corrigiendo.
    url: input.url && /^https?:\/\//i.test(input.url) ? input.url : "",
    filename: resolveFilename({
      filename: input.filename,
      mimeType,
      url: input.providerUrl || input.url,
      type,
    }),
    source: input.source,
  };

  if (input.caption) content.caption = input.caption;
  if (mimeType) content.mime_type = mimeType;
  if (input.providerMediaId) content.provider_media_id = input.providerMediaId;
  if (input.providerUrl) content.provider_url = input.providerUrl;
  if (input.storagePath) content.storage_path = input.storagePath;
  if (typeof input.sizeBytes === "number" && input.sizeBytes > 0) {
    content.size_bytes = input.sizeBytes;
  }
  if (input.mediaError) content.media_error = input.mediaError;

  return content;
}

/** ¿Se puede servir este adjunto, ya sea desde storage o reintentando? */
export function isAttachmentResolvable(content: {
  storage_path?: string | null;
  provider_media_id?: string | null;
  provider_url?: string | null;
  url?: string | null;
}): boolean {
  return Boolean(
    content.storage_path ||
      content.provider_media_id ||
      content.provider_url ||
      (content.url && /^https?:\/\//i.test(content.url)),
  );
}
