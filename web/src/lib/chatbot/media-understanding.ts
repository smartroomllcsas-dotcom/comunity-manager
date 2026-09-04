/**
 * Comprensión de medios entrantes para el agente de IA.
 *
 * Hasta ahora el agente sólo se ejecutaba con mensajes de texto: un audio, una
 * imagen o un video entraban al Inbox pero el agente ni los veía ni respondía.
 * Este módulo convierte el adjunto en texto para que el agente tenga contexto:
 *
 *   - Imágenes, stickers, PDF y documentos → Claude. Imágenes y PDF van
 *     nativos (visión / documentos); Word, Excel, PowerPoint, TXT y CSV se
 *     convierten a texto antes (son ZIP con XML, o texto plano).
 *   - Audio y video → OpenAI (transcripción con gpt-4o-transcribe). Claude no
 *     acepta audio ni video, así que se usa un proveedor que sí. De un video
 *     se transcribe la pista de audio (no se describen las imágenes). Requiere
 *     `OPENAI_API_KEY`; sin ella el agente recibe un aviso y pide al cliente
 *     que escriba.
 *
 * El texto derivado se guarda en `content.ai_text` del mensaje para no volver
 * a pagar el análisis cuando se reconstruye el historial.
 *
 * **Sólo servidor.** Contrato BEST-EFFORT: nunca lanza. Un fallo aquí no puede
 * tumbar un webhook ni impedir que el agente responda con lo que tenga.
 */
import Anthropic from "@anthropic-ai/sdk";
import { unzipSync, strFromU8 } from "fflate";
import { createAdminClient } from "@/lib/supabase/admin";
import { downloadAsset } from "@/lib/media/storage";
import {
  channelToken,
  loadChannelForMedia,
  resolveAndPersistAttachment,
} from "@/lib/inbox/media-resolver";
import type { AttachmentContent } from "@/lib/inbox/attachments";
import type { MessageContent } from "@/types/database";

// Modelo para leer imágenes/PDF. Configurable por env para cambiarlo sin
// redeploy (mismo criterio que CHATBOT_AI_MODEL).
const MEDIA_MODEL = process.env.CHATBOT_MEDIA_MODEL || "claude-opus-5";
const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-transcribe";

// Límites de los proveedores: Claude acepta imágenes hasta 10 MB (API directa)
// y PDF hasta 32 MB; OpenAI transcribe archivos hasta 25 MB. Por encima no se
// analiza. Los documentos convertidos a texto se recortan a un tope de
// caracteres para no disparar el costo con un Excel enorme.
const CLAUDE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const CLAUDE_PDF_MAX_BYTES = 32 * 1024 * 1024;
const OFFICE_MAX_BYTES = 25 * 1024 * 1024;
const DOCUMENT_TEXT_MAX_CHARS = 40_000;
const OPENAI_AUDIO_MAX_BYTES = 25 * 1024 * 1024;

const CLAUDE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const PLAIN_TEXT_TYPES = new Set(["text/plain", "text/csv", "text/markdown"]);
const OFFICE_TYPES: Record<string, "docx" | "xlsx" | "pptx"> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};
// Formatos que acepta /v1/audio/transcriptions. La extensión del nombre de
// archivo es lo que OpenAI usa para detectar el formato, por eso se manda una
// coherente con el mime. (AMR, 3GP y MOV no están soportados.)
const OPENAI_AUDIO_EXT: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
  "audio/flac": "flac",
};
const OPENAI_VIDEO_EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/mpeg": "mpeg",
};

const LABELS: Record<string, string> = {
  image: "Imagen",
  sticker: "Sticker",
  video: "Video",
  audio: "Audio de voz",
  document: "Documento",
};

function log(event: string, context: Record<string, unknown>) {
  console.warn(`[media-understanding] ${event} ${JSON.stringify(context)}`);
}

function cleanMime(value: string | null | undefined): string {
  return (value || "").split(";")[0].trim().toLowerCase();
}

/**
 * Texto que representa un mensaje para el historial del agente. Para texto
 * devuelve el texto; para adjuntos usa `ai_text` si ya fue analizado; para el
 * resto, una etiqueta que al menos dice qué llegó.
 */
export function inboundContentToText(content: unknown): string {
  if (!content || typeof content !== "object") return "[mensaje]";
  const value = content as Record<string, unknown>;
  const type = String(value.type || "");

  if (type === "text" && typeof value.text === "string") return value.text;

  if (type === "location") {
    const name = typeof value.name === "string" && value.name ? ` (${value.name})` : "";
    return `[Ubicación compartida${name}: ${value.latitude}, ${value.longitude}]`;
  }

  if (type === "interactive" && typeof value.body === "string") return value.body;
  if (type === "template" && typeof value.template_name === "string") {
    return typeof value.text === "string" && value.text.trim()
      ? value.text.trim()
      : `[Plantilla enviada: ${value.template_name}]`;
  }

  const label = LABELS[type] || "Adjunto";
  const caption =
    typeof value.caption === "string" && value.caption.trim()
      ? ` Texto que lo acompaña: «${value.caption.trim()}»`
      : "";

  if (typeof value.ai_text === "string" && value.ai_text.trim()) {
    return `[${label} enviado por el cliente. Contenido: ${value.ai_text.trim()}]${caption}`;
  }

  if (typeof value.ai_text_error === "string") {
    return (
      `[${label} recibido pero no se pudo interpretar automáticamente.` +
      ` Pídele amablemente al cliente que lo escriba en texto.]${caption}`
    );
  }

  return `[${label} recibido]${caption}`;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");
}

/** Texto plano de un XML de Office: los párrafos/celdas separados por saltos. */
function xmlToText(xml: string): string {
  return decodeXmlEntities(
    xml
      .replace(/<\/(w:p|a:p|w:tr|row)>/g, "\n")
      .replace(/<\/(w:tc|c)>/g, "\t")
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extrae el texto de un .docx / .xlsx / .pptx sin dependencias pesadas: son
 * ZIP con XML. Para Excel los textos viven en sharedStrings y los números en
 * las celdas; se devuelven ambos, hoja por hoja. Es un extracto para dar
 * contexto, no una conversión fiel.
 */
export function extractOfficeText(buffer: Buffer, kind: "docx" | "xlsx" | "pptx"): string {
  const files = unzipSync(new Uint8Array(buffer));
  const read = (name: string) => (files[name] ? strFromU8(files[name]) : "");
  const names = Object.keys(files).sort();

  if (kind === "docx") {
    return xmlToText(read("word/document.xml"));
  }

  if (kind === "pptx") {
    return names
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]))
      .map((n, i) => `--- Diapositiva ${i + 1} ---\n${xmlToText(read(n))}`)
      .join("\n\n");
  }

  const shared: string[] = [];
  const sharedXml = read("xl/sharedStrings.xml");
  for (const match of sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    shared.push(decodeXmlEntities(match[1].replace(/<[^>]+>/g, "")));
  }
  const sheets = names.filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  return sheets
    .map((n, i) => {
      const xml = read(n);
      const rows: string[] = [];
      for (const row of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
        const cells: string[] = [];
        for (const cell of row[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
          const attrs = cell[1];
          const inner = cell[2];
          const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
          const inline = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1];
          if (/t="s"/.test(attrs)) cells.push(shared[Number(v)] ?? "");
          else if (inline !== undefined) cells.push(decodeXmlEntities(inline));
          else cells.push(decodeXmlEntities(v));
        }
        if (cells.some((c) => c.trim())) rows.push(cells.join("\t"));
      }
      return `--- Hoja ${i + 1} ---\n${rows.join("\n")}`;
    })
    .join("\n\n")
    .trim();
}

async function describeWithClaude(input: {
  kind: "image" | "pdf" | "text";
  mimeType: string;
  data: Buffer;
  /** Nombre del archivo, para que el modelo sepa qué está leyendo. */
  filename?: string | null;
}): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    log("sin_anthropic_api_key", {});
    return null;
  }
  const client = new Anthropic({ apiKey });
  const base64 = input.data.toString("base64");

  let block: Anthropic.ContentBlockParam;
  if (input.kind === "image") {
    block = {
      type: "image",
      source: {
        type: "base64",
        media_type: input.mimeType as Anthropic.Base64ImageSource["media_type"],
        data: base64,
      },
    };
  } else if (input.kind === "pdf") {
    block = {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: base64 },
      ...(input.filename ? { title: input.filename } : {}),
    };
  } else {
    // Texto ya extraído (TXT/CSV/Word/Excel/PowerPoint): va como documento
    // de texto plano, recortado para acotar el costo.
    let text = input.data.toString("utf8");
    if (text.length > DOCUMENT_TEXT_MAX_CHARS) {
      text = text.slice(0, DOCUMENT_TEXT_MAX_CHARS) + "\n\n[… documento recortado …]";
    }
    block = {
      type: "document",
      source: { type: "text", media_type: "text/plain", data: text },
      ...(input.filename ? { title: input.filename } : {}),
    };
  }

  const prompt =
    input.kind === "image"
      ? "Un cliente envió esta imagen por chat a una agencia de marketing y desarrollo de software. " +
        "Describe en español y en máximo 80 palabras qué muestra, transcribe cualquier texto visible " +
        "(nombres, precios, marcas, mensajes) y di si parece relacionada con un proyecto digital " +
        "(web, app, tienda, anuncios), con otra cosa, o si es sólo un saludo/meme/sticker."
      : "Un cliente envió este documento por chat a una agencia de marketing y desarrollo de software. " +
        "Resume en español y en máximo 120 palabras de qué trata, qué pide o propone, y cualquier " +
        "dato clave (empresa, contacto, presupuesto, fechas).";

  const response = await client.messages.create({
    model: MEDIA_MODEL,
    max_tokens: 1024,
    system:
      "Eres un asistente que convierte adjuntos de chat en contexto breve y fiel para un " +
      "agente comercial. No inventes: si algo no se ve o no se entiende, dilo.",
    messages: [{ role: "user", content: [block, { type: "text", text: prompt }] }],
  });

  if (response.stop_reason === "refusal") {
    log("claude_refusal", { kind: input.kind });
    return null;
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  return text || null;
}

async function transcribeWithOpenAI(input: {
  kind: "audio" | "video";
  mimeType: string;
  extension: string;
  data: Buffer;
}): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    log("sin_openai_api_key", { kind: input.kind });
    return null;
  }

  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(input.data)], { type: input.mimeType }),
    `${input.kind}.${input.extension}`,
  );
  form.append("model", TRANSCRIBE_MODEL);
  form.append("response_format", "json");
  // El prompt orienta vocabulario y estilo; no fuerza el idioma.
  form.append(
    "prompt",
    "Mensaje de voz de un cliente por WhatsApp a una agencia de marketing y desarrollo de " +
      "software (páginas web, apps, CRM, tiendas online, anuncios). Mayormente en español.",
  );

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const body = (await response.text()).slice(0, 300);
    log("openai_error", { status: response.status, body, kind: input.kind });
    return null;
  }

  const payload = (await response.json()) as { text?: string };
  const text = (payload.text || "").trim();
  return text || null;
}

/**
 * Se asegura de que el adjunto esté descargado en `cm-assets` (lo resuelve si
 * hace falta, igual que el resolver diferido del Inbox) y devuelve el contenido
 * ya con `storage_path`, o null si no se pudo.
 */
async function ensureStored(input: {
  messageId: string;
  organizationId: string;
  brandId: string;
  channelId?: string | null;
  content: AttachmentContent;
}): Promise<AttachmentContent | null> {
  const { content } = input;
  if (content.storage_path) return content;
  if (!content.provider_media_id && !content.provider_url) return null;

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

  if (!resolved.storage_path) {
    log("descarga_fallida", { message_id: input.messageId, reason: resolved.media_error });
    return null;
  }

  const merged = { ...content, ...resolved };
  const admin = createAdminClient("smarttalk");
  await admin.from("messages").update({ content: merged }).eq("id", input.messageId);
  return merged;
}

async function persistAiText(
  messageId: string,
  content: AttachmentContent,
  patch: { ai_text?: string; ai_text_source?: string; ai_text_error?: string },
) {
  const admin = createAdminClient("smarttalk");
  await admin
    .from("messages")
    .update({ content: { ...content, ...patch } })
    .eq("id", messageId);
}

/**
 * Convierte un adjunto entrante en texto para el agente. Descarga el medio si
 * hace falta, lo analiza con el modelo adecuado, guarda el resultado en el
 * mensaje y devuelve el texto listo para `messageText`.
 *
 * Nunca lanza: si algo falla, devuelve igualmente un texto que le dice al
 * agente qué llegó y que no pudo interpretarse.
 */
export async function understandInboundMedia(input: {
  messageId: string;
  organizationId: string;
  brandId: string;
  channelId?: string | null;
  content: AttachmentContent;
}): Promise<string> {
  const { content } = input;
  const withError = (error: string) =>
    inboundContentToText({ ...content, ai_text_error: error } as unknown as MessageContent);

  try {
    const stored = await ensureStored(input);
    if (!stored?.storage_path) {
      await persistAiText(input.messageId, content, { ai_text_error: "sin_archivo" }).catch(
        () => undefined,
      );
      return withError("sin_archivo");
    }

    const file = await downloadAsset(stored.storage_path);
    if (!file.ok) {
      log("lectura_storage_fallida", { message_id: input.messageId, reason: file.error });
      await persistAiText(input.messageId, stored, { ai_text_error: "lectura_storage" });
      return withError("lectura_storage");
    }

    const mimeType = cleanMime(stored.mime_type) || cleanMime(file.mimeType);
    let aiText: string | null = null;
    let source: string | null = null;
    let error: string | null = null;

    if (stored.type === "image" || stored.type === "sticker") {
      if (!CLAUDE_IMAGE_TYPES.has(mimeType)) error = `formato_no_soportado:${mimeType}`;
      else if (file.buffer.byteLength > CLAUDE_IMAGE_MAX_BYTES) error = "imagen_demasiado_grande";
      else {
        aiText = await describeWithClaude({ kind: "image", mimeType, data: file.buffer });
        source = "claude";
      }
    } else if (stored.type === "document") {
      const filename = stored.filename || null;
      const office = OFFICE_TYPES[mimeType];
      if (mimeType === "application/pdf") {
        if (file.buffer.byteLength > CLAUDE_PDF_MAX_BYTES) error = "pdf_demasiado_grande";
        else {
          aiText = await describeWithClaude({ kind: "pdf", mimeType, data: file.buffer, filename });
          source = "claude";
        }
      } else if (PLAIN_TEXT_TYPES.has(mimeType)) {
        aiText = await describeWithClaude({ kind: "text", mimeType, data: file.buffer, filename });
        source = "claude";
      } else if (office) {
        if (file.buffer.byteLength > OFFICE_MAX_BYTES) error = "documento_demasiado_grande";
        else {
          const text = extractOfficeText(file.buffer, office);
          if (!text) error = "documento_sin_texto";
          else {
            aiText = await describeWithClaude({
              kind: "text",
              mimeType: "text/plain",
              data: Buffer.from(text, "utf8"),
              filename,
            });
            source = "claude";
          }
        }
      } else {
        error = `formato_no_soportado:${mimeType}`;
      }
    } else if (stored.type === "audio" || stored.type === "video") {
      const extension = (stored.type === "audio" ? OPENAI_AUDIO_EXT : OPENAI_VIDEO_EXT)[mimeType];
      if (!process.env.OPENAI_API_KEY) error = "sin_openai_api_key";
      else if (!extension) error = `formato_no_soportado:${mimeType}`;
      else if (file.buffer.byteLength > OPENAI_AUDIO_MAX_BYTES) error = "archivo_demasiado_grande";
      else {
        aiText = await transcribeWithOpenAI({
          kind: stored.type,
          mimeType,
          extension,
          data: file.buffer,
        });
        source = "openai";
      }
    } else {
      error = `tipo_no_analizable:${stored.type}`;
    }

    if (aiText && source) {
      const updated = { ...stored, ai_text: aiText, ai_text_source: source };
      await persistAiText(input.messageId, stored, { ai_text: aiText, ai_text_source: source });
      return inboundContentToText(updated as unknown as MessageContent);
    }

    const reason = error || "analisis_sin_resultado";
    log("sin_texto", { message_id: input.messageId, type: stored.type, reason });
    await persistAiText(input.messageId, stored, { ai_text_error: reason });
    return withError(reason);
  } catch (e) {
    const reason = e instanceof Error ? e.message.slice(0, 200) : "error_desconocido";
    log("excepcion", { message_id: input.messageId, reason });
    return withError("excepcion");
  }
}
