// Sprint 26 · Media Storage wrapper (Supabase Storage self-hosted)
// ---------------------------------------------------------------------------
// Sube/borra/firma assets del bucket `cm-assets`. Server-side only: usa
// SUPABASE_SERVICE_ROLE_KEY. NUNCA importar desde codigo cliente.
//
// Layout de path: {organization_id}/{client_id}/{yyyy-mm}/{uuid}.{ext}
//
// Limites:
//   - size max 100 MB
//   - mime types: image/* (salvo SVG), video mp4/mov/webm, audio comunes,
//     PDF, Office y texto plano. SVG/HTML/ejecutables bloqueados.

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "cm-assets";
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

const ALLOWED_MIME_PREFIXES = ["image/"];

// Bloqueados aunque encajen en un prefijo permitido. SVG y HTML se ejecutan en
// el navegador —scripts embebidos, XSS mediante `<foreignObject>`— y aquí no
// hay sanitización. Es una lista de denegación **sobre** la de permisos, no en
// lugar de ella.
const BLOCKED_MIME_EXACT = new Set([
  "image/svg+xml",
  "image/svg",
  "text/html",
  "application/xhtml+xml",
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/x-executable",
  "application/x-sh",
  "application/x-shellscript",
  "application/javascript",
  "text/javascript",
]);

const ALLOWED_MIME_EXACT = new Set([
  // Video
  "video/mp4",
  "video/mov",
  "video/quicktime",
  "video/webm",
  // Audio: los formatos que mandan WhatsApp, Messenger e Instagram.
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
  "audio/opus",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/aac",
  "audio/amr",
  // Documentos
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
]);

function getStorageAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "media/storage: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required",
    );
  }
  return createClient(url.trim(), key.trim(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function isAllowedMime(mime: string): boolean {
  if (!mime) return false;
  // El mime puede llegar con parámetros (`text/plain; charset=utf-8`).
  const lower = mime.split(";")[0].trim().toLowerCase();
  // La denegación va primero: `image/svg+xml` encaja en el prefijo `image/`.
  if (BLOCKED_MIME_EXACT.has(lower)) return false;
  if (ALLOWED_MIME_EXACT.has(lower)) return true;
  return ALLOWED_MIME_PREFIXES.some((p) => lower.startsWith(p));
}

function extFromMime(mime: string, fallback = "bin"): string {
  const m = mime.toLowerCase();
  if (m === "image/jpeg" || m === "image/jpg") return "jpg";
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  if (m === "image/gif") return "gif";
  if (m === "image/svg+xml") return "svg";
  if (m === "video/mp4") return "mp4";
  if (m === "video/mov" || m === "video/quicktime") return "mov";
  if (m === "video/webm") return "webm";
  if (m === "audio/mpeg" || m === "audio/mp3") return "mp3";
  if (m === "audio/ogg") return "ogg";
  if (m === "audio/opus") return "opus";
  if (m === "audio/wav" || m === "audio/x-wav") return "wav";
  if (m === "audio/mp4") return "m4a";
  if (m === "audio/aac") return "aac";
  if (m === "audio/amr") return "amr";
  if (m === "application/pdf") return "pdf";
  if (m === "application/msword") return "doc";
  if (m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (m === "application/vnd.ms-excel") return "xls";
  if (m === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "xlsx";
  if (m === "application/vnd.ms-powerpoint") return "ppt";
  if (m === "application/vnd.openxmlformats-officedocument.presentationml.presentation") return "pptx";
  if (m === "text/plain") return "txt";
  if (m === "text/csv") return "csv";
  const guess = m.split("/")[1];
  return guess ? guess.split("+")[0] : fallback;
}

function monthFolder(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export type UploadInput = {
  file: Blob | Buffer | ArrayBuffer;
  mimeType: string;
  organizationId: string;
  clientId: string;
  folder?: string; // optional subfolder inside the month bucket
  filenameHint?: string; // will be sanitized; only used for extension detection
  sizeBytes?: number;
};

export type UploadResult = {
  ok: true;
  path: string;
  publicUrl: string;
  bucket: string;
  size: number;
  mimeType: string;
} | {
  ok: false;
  error: string;
};

/** Sube un asset al bucket cm-assets y retorna path + URL publica. */
export async function uploadAsset(input: UploadInput): Promise<UploadResult> {
  if (!input.organizationId || !input.clientId) {
    return { ok: false, error: "organizationId y clientId son requeridos" };
  }
  if (!isAllowedMime(input.mimeType)) {
    return { ok: false, error: `Mime type no permitido: ${input.mimeType}` };
  }

  // Normalizar a Buffer para pesar/subir
  let buffer: Buffer;
  if (Buffer.isBuffer(input.file)) {
    buffer = input.file;
  } else if (input.file instanceof ArrayBuffer) {
    buffer = Buffer.from(input.file);
  } else {
    // Blob
    const ab = await (input.file as Blob).arrayBuffer();
    buffer = Buffer.from(ab);
  }
  const size = buffer.byteLength;
  if (size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `Archivo excede tamaño maximo (${Math.round(size / 1024 / 1024)} MB > 100 MB)`,
    };
  }

  const ext = extFromMime(input.mimeType, "bin");
  const folder = input.folder ? `${input.folder.replace(/[^a-zA-Z0-9_-]/g, "")}/` : "";
  const path = `${input.organizationId}/${input.clientId}/${monthFolder()}/${folder}${randomUUID()}.${ext}`;

  const admin = getStorageAdmin();
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: input.mimeType,
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    return { ok: false, error: `storage.upload: ${error.message}` };
  }

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
  return {
    ok: true,
    path,
    publicUrl: pub.publicUrl,
    bucket: BUCKET,
    size,
    mimeType: input.mimeType,
  };
}

export async function deleteAsset(
  path: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!path) return { ok: false, error: "path requerido" };
  const admin = getStorageAdmin();
  const { error } = await admin.storage.from(BUCKET).remove([path]);
  if (error) return { ok: false, error: `storage.remove: ${error.message}` };
  return { ok: true };
}

export async function getSignedUrl(
  path: string,
  ttlSeconds = 3600,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const admin = getStorageAdmin();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, ttlSeconds);
  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message || "no se pudo firmar la URL" };
  }
  return { ok: true, url: data.signedUrl };
}

/** Descarga una URL externa y retorna Buffer + contentType detectado. */
export async function downloadRemoteAsset(
  url: string,
  timeoutMs = 60_000,
): Promise<
  | { ok: true; buffer: Buffer; mimeType: string; size: number }
  | { ok: false; error: string }
> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) {
      return { ok: false, error: `download HTTP ${res.status}` };
    }
    const mimeType = res.headers.get("content-type")?.split(";")[0].trim() || "application/octet-stream";
    const ab = await res.arrayBuffer();
    const buffer = Buffer.from(ab);
    return { ok: true, buffer, mimeType, size: buffer.byteLength };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "download failed",
    };
  }
}

export { BUCKET };
