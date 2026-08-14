// E2E QA · Adjuntos del Inbox en los cinco canales.
// ---------------------------------------------------------------------------
// El defecto de origen: un documento de Instagram llegaba como tipo «file»,
// se guardaba con `filename: "archivo"` y con un identificador de mensaje en
// el campo `url`. En la interfaz salía un texto muerto, sin enlace.
//
// Aquí se cubren las tres capas donde eso se rompía:
//
//   1. **Normalización** — que `file`, `attachment` y `unknown` nunca lleguen a
//      `messages.type`, y que el nombre visible no sea sólo «archivo».
//   2. **Parseo por canal** — Instagram, Messenger, Facebook, WhatsApp y
//      Respond.io producen contenido válido y sin secretos.
//   3. **Endpoint seguro** — sesión, aislamiento por marca y errores
//      controlados.
//
// La interfaz se comprueba sobre el código: el proyecto no tiene jsdom.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FakeSupabase } from "./helpers/fake-supabase";
import { createFakeSupabase } from "./helpers/fake-supabase";

const H = vi.hoisted(() => ({
  current: null as FakeSupabase | null,
  /** Llamadas a `downloadMedia`, para comprobar URL y cabeceras. */
  downloads: [] as Array<{ url: string; headers: Record<string, string> }>,
  /** Llamadas a `resolveGraphMedia`, para comprobar qué token se usó. */
  graphCalls: [] as Array<{ mediaId: string; token: string }>,
  /** Llamadas a `persistMedia`, para comprobar la copia a cm-assets. */
  persisted: [] as Array<{ organizationId: string; brandId: string; filenameHint?: string | null }>,
  failDownload: false,
  failGraph: false,
  failPersist: false,
  downloadMime: "application/pdf",
}));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, NextRequest: class {} };
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => H.current!.admin() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => H.current!.server }));
vi.mock("@/lib/media/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/media/storage")>();
  return {
    ...actual,
    // No se toca Supabase Storage en pruebas; se comprueba qué se le pide.
    getSignedUrl: async (path: string) => ({ ok: true as const, url: `https://firmada.invalid/${path}` }),
  };
});
// Sólo se sustituyen las tres funciones que salen a la red o al almacenamiento.
// `loadChannelForMedia` y `channelToken` siguen siendo las reales: leen del
// Supabase falso, y son justamente las que resuelven el canal a partir de la
// conversación —lo que esta corrección arregla—.
vi.mock("@/lib/inbox/media-resolver", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/inbox/media-resolver")>();
  return {
    ...actual,
    downloadMedia: async (url: string, headers: Record<string, string> = {}) => {
      H.downloads.push({ url, headers });
      if (H.failDownload) return { ok: false as const, error: `descarga_fallida_http_404 ${url}` };
      const buffer = Buffer.from("contenido-binario-de-prueba");
      return {
        ok: true as const,
        media: { buffer, mimeType: H.downloadMime, size: buffer.byteLength, filename: null },
      };
    },
    resolveGraphMedia: async (mediaId: string, token: string) => {
      H.graphCalls.push({ mediaId, token });
      if (H.failGraph) return { ok: false as const, error: "metadata_http_404" };
      const buffer = Buffer.from("binario-desde-graph");
      return {
        ok: true as const,
        media: { buffer, mimeType: H.downloadMime, size: buffer.byteLength, filename: null },
      };
    },
    persistMedia: async (input: {
      organizationId: string;
      brandId: string;
      media: { mimeType: string; size: number };
      filenameHint?: string | null;
    }) => {
      H.persisted.push({
        organizationId: input.organizationId,
        brandId: input.brandId,
        filenameHint: input.filenameHint,
      });
      if (H.failPersist) return { ok: false as const, error: "storage_no_disponible" };
      return {
        ok: true as const,
        result: {
          storagePath: `${input.organizationId}/${input.brandId}/inbox/2026-08/guardado.bin`,
          mimeType: input.media.mimeType,
          size: input.media.size,
        },
      };
    },
  };
});

import {
  buildAttachmentContent,
  formatBytes,
  normalizeAttachmentType,
  resolveFilename,
  sanitizeFilename,
  sanitizeAttachmentForClient,
  INVALID_ATTACHMENT_TYPES,
} from "@/lib/inbox/attachments";
import { preferDeclaredMime, redactSecrets } from "@/lib/inbox/media-resolver";
import { isAllowedMime } from "@/lib/media/storage";
import { parseMetaMessage } from "@/lib/smarttalk/meta-parser";
import { GET as getMedia } from "@/app/api/inbox/messages/[messageId]/media/route";

const ORG = "org-adj";
const OTHER_ORG = "org-otra";
const BRAND = "brand-adj";
const OTHER_BRAND = "brand-otra";
const AGENT = "agent-adj";
/** Token del canal. Nunca debe aparecer en ninguna respuesta al navegador. */
const CHANNEL_TOKEN = "EAAtokendelcanalquenodebesalir0123456789";

// ---------------------------------------------------------------------------
// 1. Normalización
// ---------------------------------------------------------------------------
describe("Normalización de tipos de adjunto", () => {
  it("traduce file, attachment y unknown; nunca los deja pasar", () => {
    for (const providerType of INVALID_ATTACHMENT_TYPES) {
      const type = normalizeAttachmentType({ providerType });
      expect(type).toBe("document");
      expect(INVALID_ATTACHMENT_TYPES).not.toContain(type);
    }
  });

  it("conserva los tipos internos válidos", () => {
    for (const valid of ["image", "video", "audio", "document", "sticker"]) {
      expect(normalizeAttachmentType({ providerType: valid })).toBe(valid);
    }
  });

  it("deduce el tipo del mime cuando el proveedor dice file", () => {
    expect(normalizeAttachmentType({ providerType: "file", mimeType: "image/png" })).toBe("image");
    expect(normalizeAttachmentType({ providerType: "file", mimeType: "audio/ogg" })).toBe("audio");
    expect(normalizeAttachmentType({ providerType: "file", mimeType: "video/mp4" })).toBe("video");
    expect(normalizeAttachmentType({ providerType: "file", mimeType: "application/pdf" })).toBe("document");
  });

  it("deduce el tipo de la extensión cuando no hay mime", () => {
    expect(normalizeAttachmentType({ providerType: "attachment", filename: "nota.ogg" })).toBe("audio");
    expect(normalizeAttachmentType({ providerType: "unknown", url: "https://x.invalid/a/b.mp4" })).toBe("video");
    expect(normalizeAttachmentType({ providerType: null, filename: "foto.jpeg" })).toBe("image");
  });

  it("sin ninguna pista cae a document, que es lo que menos miente", () => {
    expect(normalizeAttachmentType({})).toBe("document");
  });
});

describe("Nombre de archivo", () => {
  it("nunca devuelve sólo «archivo»", () => {
    for (const type of ["image", "video", "audio", "document", "sticker"] as const) {
      const name = resolveFilename({ type });
      expect(name).not.toBe("archivo");
      expect(name).toMatch(/\.[a-z0-9]+$/i);
    }
  });

  it("usa nombres útiles por tipo cuando el proveedor no manda ninguno", () => {
    expect(resolveFilename({ type: "image" })).toBe("imagen.jpg");
    expect(resolveFilename({ type: "video" })).toBe("video.mp4");
    expect(resolveFilename({ type: "audio" })).toBe("audio.ogg");
    expect(resolveFilename({ type: "document" })).toBe("documento.pdf");
  });

  it("prefiere la extensión real del mime al nombre por defecto", () => {
    expect(resolveFilename({ type: "document", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }))
      .toBe("documento.docx");
    expect(resolveFilename({ type: "image", mimeType: "image/png" })).toBe("imagen.png");
  });

  it("conserva el nombre original cuando existe", () => {
    expect(resolveFilename({ type: "document", filename: "Contrato firmado.pdf" }))
      .toBe("Contrato firmado.pdf");
  });

  it("completa la extensión si el nombre del proveedor no la trae", () => {
    expect(resolveFilename({ type: "document", filename: "Contrato", mimeType: "application/pdf" }))
      .toBe("Contrato.pdf");
  });

  it("saca el nombre de la URL cuando no hay otro", () => {
    expect(resolveFilename({ type: "document", url: "https://cdn.invalid/files/informe%20anual.pdf" }))
      .toBe("informe anual.pdf");
  });

  it("no arrastra la query a la extensión", () => {
    const name = resolveFilename({ type: "image", url: "https://cdn.invalid/foto.jpg?token=abc123" });
    expect(name).toBe("foto.jpg");
    expect(name).not.toContain("token");
  });

  it("sanea rutas y caracteres peligrosos", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("mal\\nombre.pdf")).toBe("nombre.pdf");
    expect(sanitizeFilename("   ")).toBeNull();
  });
});

describe("Contenido guardado en el JSONB", () => {
  it("un media id NUNCA se publica como url servible", () => {
    const content = buildAttachmentContent({
      providerType: "image",
      providerMediaId: "1234567890",
      source: "whatsapp",
    });
    expect(content.url).toBe("");
    expect(content.provider_media_id).toBe("1234567890");
  });

  it("guarda type, filename, mime, caption, source y el origen del proveedor", () => {
    const content = buildAttachmentContent({
      providerType: "file",
      mimeType: "application/pdf",
      filename: "informe.pdf",
      caption: "Aquí va",
      providerUrl: "https://cdn.invalid/x.pdf",
      providerMediaId: "media-9",
      source: "meta",
    });
    expect(content).toMatchObject({
      type: "document",
      filename: "informe.pdf",
      mime_type: "application/pdf",
      caption: "Aquí va",
      provider_url: "https://cdn.invalid/x.pdf",
      provider_media_id: "media-9",
      source: "meta",
    });
  });

  it("no admite tokens: la firma no los acepta", () => {
    const content = buildAttachmentContent({
      providerType: "image",
      providerUrl: "https://cdn.invalid/x.jpg?access_token=EAAsecreto123",
      source: "meta",
    }) as unknown as Record<string, unknown>;
    // `provider_url` se conserva para reintentar, pero jamás se sirve al
    // navegador: el componente usa el endpoint interno (ver bloque de interfaz).
    expect(Object.keys(content)).not.toContain("token");
    expect(Object.keys(content)).not.toContain("access_token");
  });

  it("sanitiza referencias del proveedor antes de enviarlas al navegador", () => {
    const safe = sanitizeAttachmentForClient({
      type: "document",
      url: "https://lookaside.invalid/file.pdf?access_token=EAAsecreto",
      filename: "file.pdf",
      provider_url: "https://lookaside.invalid/file.pdf?access_token=EAAsecreto",
      provider_media_id: "media-1",
      storage_path: "org/brand/inbox/file.pdf",
      media_error: "fallo",
    }) as Record<string, unknown>;
    expect(safe).toMatchObject({ type: "document", filename: "file.pdf", url: "" });
    expect(safe).not.toHaveProperty("provider_url");
    expect(safe).not.toHaveProperty("provider_media_id");
    expect(safe).not.toHaveProperty("storage_path");
    expect(safe).not.toHaveProperty("media_error");
  });

  it("conserva el MIME declarado cuando el CDN responde octet-stream", () => {
    const media = preferDeclaredMime(
      { buffer: Buffer.from("pdf"), mimeType: "application/octet-stream", size: 3, filename: null },
      "application/pdf",
    );
    expect(media.mimeType).toBe("application/pdf");
  });

  it("formatBytes no inventa un tamaño cuando no se conoce", () => {
    expect(formatBytes(null)).toBeNull();
    expect(formatBytes(0)).toBeNull();
    expect(formatBytes(2048)).toBe("2 KB");
  });
});

// ---------------------------------------------------------------------------
// 2. Parseo por canal
// ---------------------------------------------------------------------------
describe("Meta · Instagram, Messenger y Facebook", () => {
  it("Instagram con attachment type=file y payload.url", () => {
    const parsed = parseMetaMessage({
      mid: "mid.instagram.1",
      attachments: [
        {
          type: "file",
          name: "cotizacion.pdf",
          mime_type: "application/pdf",
          payload: { url: "https://lookaside.invalid/cotizacion.pdf" },
        },
      ],
    } as never);

    // Antes esto se guardaba como type "document" con filename "archivo".
    expect(parsed.type).toBe("document");
    expect(parsed.content).toMatchObject({
      type: "document",
      filename: "cotizacion.pdf",
      mime_type: "application/pdf",
      provider_url: "https://lookaside.invalid/cotizacion.pdf",
      source: "meta",
    });
    expect(INVALID_ATTACHMENT_TYPES).not.toContain(parsed.type);
  });

  it("Instagram con attachment type=image", () => {
    const parsed = parseMetaMessage({
      mid: "mid.instagram.2",
      attachments: [{ type: "image", payload: { url: "https://lookaside.invalid/f.jpg" } }],
    } as never);
    expect(parsed.type).toBe("image");
    expect((parsed.content as { provider_url?: string }).provider_url).toBe(
      "https://lookaside.invalid/f.jpg",
    );
  });

  it("Messenger con un documento sin nombre deduce uno útil", () => {
    const parsed = parseMetaMessage({
      mid: "mid.messenger.1",
      attachment: { type: "file", mime_type: "application/pdf", payload: { url: "https://x.invalid/a" } },
    } as never);
    expect(parsed.type).toBe("document");
    // Ni «archivo» ni vacío.
    expect((parsed.content as { filename: string }).filename).toBe("documento.pdf");
  });

  it("el identificador del mensaje ya no acaba en `url`", () => {
    const parsed = parseMetaMessage({
      mid: "mid.sin.url",
      attachment: { type: "file", payload: {} },
    } as never);
    const content = parsed.content as { url: string; provider_media_id?: string };
    expect(content.url).toBe("");
    // Se conserva aparte, para poder reintentar.
    expect(content.provider_media_id).toBe("mid.sin.url");
  });

  it("un audio de Messenger se reconoce como audio, no como documento", () => {
    const parsed = parseMetaMessage({
      mid: "mid.audio",
      attachment: { type: "audio", payload: { url: "https://x.invalid/nota.ogg" } },
    } as never);
    expect(parsed.type).toBe("audio");
  });

  it("el texto sigue funcionando igual", () => {
    const parsed = parseMetaMessage({ text: "hola" } as never);
    expect(parsed.type).toBe("text");
  });
});

describe("WhatsApp · media id de image, audio y document", () => {
  // El parser vive dentro del módulo del webhook; se reproduce la llamada
  // pública construyendo el contenido con la misma función que él usa.
  const fromMediaId = (providerType: string, id: string, extra: Record<string, unknown> = {}) =>
    buildAttachmentContent({ providerType, providerMediaId: id, source: "whatsapp", ...extra });

  it("image: el id no se publica como url", () => {
    const content = fromMediaId("image", "wamid-image-1", { mimeType: "image/jpeg" });
    expect(content.type).toBe("image");
    expect(content.url).toBe("");
    expect(content.provider_media_id).toBe("wamid-image-1");
    expect(content.filename).toBe("imagen.jpg");
  });

  it("audio: mantiene el id y un nombre con extensión real", () => {
    const content = fromMediaId("audio", "wamid-audio-1", { mimeType: "audio/ogg" });
    expect(content.type).toBe("audio");
    expect(content.filename).toBe("audio.ogg");
    expect(content.provider_media_id).toBe("wamid-audio-1");
  });

  it("document: conserva el nombre que manda WhatsApp", () => {
    const content = fromMediaId("document", "wamid-doc-1", {
      mimeType: "application/pdf",
      filename: "factura-092.pdf",
    });
    expect(content.type).toBe("document");
    expect(content.filename).toBe("factura-092.pdf");
    expect(content.mime_type).toBe("application/pdf");
  });

  it("sticker sigue siendo sticker", () => {
    expect(fromMediaId("sticker", "wamid-stk").type).toBe("sticker");
  });
});

describe("Respond.io · attachment y file", () => {
  it("message.type=attachment con attachment.type=file da document", () => {
    const content = buildAttachmentContent({
      providerType: "file",
      providerUrl: "https://respond.invalid/f/abc",
      filename: "orden.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      caption: "La orden",
      source: "respond_io",
    });
    expect(content.type).toBe("document");
    expect(INVALID_ATTACHMENT_TYPES).not.toContain(content.type);
    expect(content.filename).toBe("orden.docx");
    expect(content.caption).toBe("La orden");
    expect(content.source).toBe("respond_io");
  });

  it("la ruta ya no inserta tipos crudos del proveedor", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/api/webhook/respond-io/route.ts"),
      "utf8",
    );
    expect(source).toContain("buildAttachmentContent");
    expect(source).not.toContain('msg.message.attachment?.type || "unknown"');
    expect(source).not.toContain('const msgType = msg.message.type === "text" ? "text" : msg.message.type;');
  });
});

// ---------------------------------------------------------------------------
// 3. Almacenamiento
// ---------------------------------------------------------------------------
describe("Almacenamiento cm-assets", () => {
  it("admite los tipos que mandan los canales", () => {
    for (const mime of [
      "image/jpeg",
      "image/png",
      "video/mp4",
      "video/quicktime",
      "video/webm",
      "audio/mpeg",
      "audio/ogg",
      "audio/opus",
      "audio/wav",
      "audio/mp4",
      "audio/amr",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain",
    ]) {
      expect(isAllowedMime(mime)).toBe(true);
    }
  });

  it("rechaza SVG, HTML y ejecutables", () => {
    // SVG encaja en el prefijo `image/`: sin la lista de denegación entraría.
    for (const mime of [
      "image/svg+xml",
      "text/html",
      "application/xhtml+xml",
      "application/x-msdownload",
      "application/x-sh",
      "text/javascript",
    ]) {
      expect(isAllowedMime(mime)).toBe(false);
    }
  });

  it("tolera parámetros en el mime", () => {
    expect(isAllowedMime("text/plain; charset=utf-8")).toBe(true);
    expect(isAllowedMime("image/svg+xml; charset=utf-8")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. Endpoint seguro
// ---------------------------------------------------------------------------
function seedMedia(currentUserId: string = AGENT) {
  return createFakeSupabase({
    currentUserId,
    tables: {
      agents: [
        {
          id: AGENT,
          organization_id: ORG,
          role: "admin",
          member_type: "agency_user",
          is_super_admin: false,
        },
      ],
      brand_advisor_assignments: [],
      conversations: [
        {
          id: "conv-1",
          organization_id: ORG,
          brand_id: BRAND,
          channel_id: "ch-1",
          contact: { visibility_status: "active" },
        },
        {
          id: "conv-otra",
          organization_id: OTHER_ORG,
          brand_id: OTHER_BRAND,
          channel_id: "ch-2",
          contact: { visibility_status: "active" },
        },
        // Misma marca, canal con token: el media id sólo se puede resolver si
        // el canal se toma de la conversación.
        {
          id: "conv-token",
          organization_id: ORG,
          brand_id: BRAND,
          channel_id: "ch-token",
          contact: { visibility_status: "active" },
        },
      ],
      // NINGÚN mensaje lleva `channel_id`: esa columna no existe en
      // `smarttalk.messages`. El canal vive en la conversación (migración 003).
      // Tenerla en las fixtures era lo que impedía que esta suite detectara el
      // defecto: el Supabase falso acepta cualquier columna, así que el `select`
      // roto pasaba aquí y fallaba sólo contra PostgREST real.
      messages: [
        {
          id: "msg-guardado",
          conversation_id: "conv-1",
          content: {
            type: "document",
            url: "",
            filename: "informe.pdf",
            mime_type: "application/pdf",
            storage_path: `${ORG}/${BRAND}/inbox/2026-08/abc.pdf`,
            source: "meta",
          },
        },
        {
          id: "msg-solo-id",
          conversation_id: "conv-1",
          content: {
            type: "image",
            url: "",
            filename: "imagen.jpg",
            provider_media_id: "wamid-historico",
            source: "whatsapp",
          },
        },
        {
          id: "msg-ajeno",
          conversation_id: "conv-otra",
          content: {
            type: "document",
            url: "",
            filename: "secreto.pdf",
            storage_path: `${OTHER_ORG}/${OTHER_BRAND}/inbox/2026-08/x.pdf`,
            source: "meta",
          },
        },
        // El caso real que disparó la investigación: documento de Meta con
        // `provider_url`, `conversation_id` válido y todavía sin `storage_path`.
        {
          id: "msg-provider-url",
          conversation_id: "conv-1",
          content: {
            type: "document",
            url: "",
            filename: "contrato.pdf",
            mime_type: "application/pdf",
            provider_url: "https://lookaside.fbsbx.com/adjunto/contrato.pdf",
            provider_media_id: "media-doc-1",
            source: "meta",
          },
        },
        // Sobre el canal con token: aquí sí se puede resolver por media id.
        {
          id: "msg-media-id-con-token",
          conversation_id: "conv-token",
          content: {
            type: "image",
            url: "",
            filename: "foto.jpg",
            mime_type: "image/jpeg",
            provider_media_id: "media-img-1",
            source: "whatsapp",
          },
        },
      ],
      channels: [
        {
          id: "ch-1",
          organization_id: ORG,
          brand_id: BRAND,
          type: "whatsapp_cloud_api",
          access_token: null,
          access_token_ciphertext: null,
        },
        {
          id: "ch-token",
          organization_id: ORG,
          brand_id: BRAND,
          type: "whatsapp_cloud_api",
          access_token: CHANNEL_TOKEN,
          access_token_ciphertext: null,
        },
      ],
    },
  });
}

function mediaRequest(params: Record<string, string> = {}) {
  return {
    method: "GET",
    headers: new Headers(),
    nextUrl: { searchParams: new URLSearchParams(params) },
  } as never;
}

async function callMedia(messageId: string, params: Record<string, string> = {}) {
  const response = await getMedia(mediaRequest(params), {
    params: Promise.resolve({ messageId }),
  });
  return response;
}

describe("GET /api/inbox/messages/[messageId]/media", () => {
  beforeEach(() => {
    H.current = seedMedia();
    H.downloads = [];
    H.graphCalls = [];
    H.persisted = [];
    H.failDownload = false;
    H.failGraph = false;
    H.failPersist = false;
    H.downloadMime = "application/pdf";
  });

  it("sin sesión responde 401", async () => {
    H.current = seedMedia();
    H.current.server.auth.getUser = async () => ({ data: { user: null } });

    const response = await callMedia("msg-guardado");
    expect(response.status).toBe(401);
  });

  it("un mensaje de otra organización responde 404, no 403", async () => {
    const response = await callMedia("msg-ajeno");
    expect(response.status).toBe(404);

    // Idéntico a un mensaje inexistente: no se revela que existe.
    const inexistente = await callMedia("msg-que-no-existe");
    expect(inexistente.status).toBe(404);
    expect(await response.json()).toEqual(await inexistente.json());
  });

  it("un mensaje autorizado y ya guardado redirige a una URL firmada", async () => {
    const response = await callMedia("msg-guardado");
    expect(response.status).toBe(307);
    const location = response.headers.get("location") || "";
    expect(location).toContain("firmada.invalid");
    expect(location).toContain(`${ORG}/${BRAND}/inbox`);
  });

  it("un mensaje histórico con sólo el media id devuelve un error controlado", async () => {
    // Sin token de canal no hay forma de resolverlo; debe ser un error legible,
    // no una excepción ni un enlace roto.
    const response = await callMedia("msg-solo-id");
    expect(response.status).toBe(410);
    const body = await response.json();
    expect(body.code).toBe("provider_unavailable");
    expect(JSON.stringify(body)).not.toContain("Bearer");
  });

  it("la respuesta de error nunca incluye tokens", async () => {
    const response = await callMedia("msg-solo-id");
    const serialized = JSON.stringify(await response.json());
    for (const secreto of ["access_token", "EAA", "Bearer "]) {
      expect(serialized).not.toContain(secreto);
    }
  });

  it("contempla URLs legacy de content.url sólo en servidor", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/api/inbox/messages/[messageId]/media/route.ts"),
      "utf8",
    );
    expect(source).toContain("const legacyUrl = content.url");
    expect(source).toContain("preferDeclaredMime");
  });
});

// ---------------------------------------------------------------------------
// 4 bis · El canal sale de la conversación, no del mensaje
// ---------------------------------------------------------------------------
// La causa confirmada: la ruta pedía `channel_id` en el `select` de `messages`,
// y esa columna no existe —el canal cuelga de `conversations` desde la
// migración 003—. PostgREST rechazaba la consulta entera, `data` volvía `null`
// y el `if (!message)` lo interpretaba como «no existe». Todos los adjuntos
// respondían «Mensaje no encontrado.» con el mensaje sano en la base.
describe("4 bis · Adjuntos: el canal se resuelve desde la conversación", () => {
  const MEDIA_ROUTE = "src/app/api/inbox/messages/[messageId]/media/route.ts";
  const routeSource = () => readFileSync(join(process.cwd(), MEDIA_ROUTE), "utf8");

  beforeEach(() => {
    H.current = seedMedia();
    H.downloads = [];
    H.graphCalls = [];
    H.persisted = [];
    H.failDownload = false;
    H.failGraph = false;
    H.failPersist = false;
    H.downloadMime = "application/pdf";
  });

  // --- Regresión de esquema ------------------------------------------------
  it("REGRESIÓN: la ruta no vuelve a seleccionar messages.channel_id", () => {
    const source = routeSource();

    // El `select` de mensajes, literal y sin `channel_id`.
    expect(source).toContain('.select("id, conversation_id, content")');
    expect(source).not.toMatch(/\.select\([^)]*conversation_id[^)]*channel_id/);
    // Y tampoco se lee del objeto mensaje.
    expect(source).not.toMatch(/message\s*as\s*\{\s*channel_id/);
    expect(source).not.toMatch(/\(message[^)]*\)\.channel_id/);
  });

  it("REGRESIÓN: el canal se toma de la conversación", () => {
    expect(routeSource()).toContain(
      '(conversation as { channel_id?: string | null }).channel_id',
    );
  });

  it("REGRESIÓN: `smarttalk.messages` no declara channel_id en el esquema", () => {
    const schema = readFileSync(
      join(process.cwd(), "supabase/migrations/20260514120001_001_initial_schema.sql"),
      "utf8",
    );
    const tabla = schema.slice(
      schema.indexOf("CREATE TABLE messages ("),
      schema.indexOf(");", schema.indexOf("CREATE TABLE messages (")),
    );
    expect(tabla).toContain("conversation_id");
    expect(tabla).not.toContain("channel_id");
  });

  it("un error de consulta NO se disfraza de «mensaje no encontrado»", async () => {
    H.current = seedMedia();
    (H.current as unknown as { store: Record<string, unknown> }).store.messages = [];
    H.current = createFakeSupabase({
      currentUserId: AGENT,
      errorOn: { messages: { select: { code: "42703", message: 'column messages.channel_id does not exist' } } },
      tables: {
        agents: [{ id: AGENT, organization_id: ORG, role: "admin", member_type: "agency_user" }],
        brand_advisor_assignments: [],
        conversations: [],
        messages: [],
        channels: [],
      },
    });

    const response = await callMedia("msg-guardado");
    const body = await response.json();

    // Antes: 404 «Mensaje no encontrado». Ahora el fallo se distingue.
    expect(response.status).toBe(500);
    expect(body.code).toBe("message_query_failed");
    // Y el detalle del esquema no se filtra al navegador.
    expect(JSON.stringify(body)).not.toContain("channel_id");
  });

  // --- Camino feliz --------------------------------------------------------
  it("un mensaje autorizado y almacenado abre", async () => {
    const response = await callMedia("msg-guardado");

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain(`${ORG}/${BRAND}/inbox`);
  });

  it("un mensaje con provider_url se descarga y se persiste", async () => {
    const response = await callMedia("msg-provider-url");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toContain("contrato.pdf");

    // Se descargó del proveedor…
    expect(H.downloads[0].url).toBe("https://lookaside.fbsbx.com/adjunto/contrato.pdf");
    // …se copió a cm-assets con la organización y la marca de la conversación…
    expect(H.persisted[0]).toMatchObject({ organizationId: ORG, brandId: BRAND });
    // …y quedó registrado en el mensaje para la próxima vez.
    const guardado = (H.current!.store.messages as Array<Record<string, unknown>>).find(
      (row) => row.id === "msg-provider-url",
    )!;
    const content = guardado.content as Record<string, unknown>;
    expect(content.storage_path).toBe(`${ORG}/${BRAND}/inbox/2026-08/guardado.bin`);
    expect(content.filename).toBe("contrato.pdf");
    expect(content.mime_type).toBe("application/pdf");
    expect(content.size_bytes).toBeGreaterThan(0);
  });

  it("una segunda apertura ya no consulta al proveedor", async () => {
    await callMedia("msg-provider-url");
    H.downloads = [];

    const response = await callMedia("msg-provider-url");

    expect(response.status).toBe(307);
    expect(H.downloads).toHaveLength(0);
  });

  it("un mensaje con provider_media_id se resuelve con el token del canal de la conversación", async () => {
    const response = await callMedia("msg-media-id-con-token");

    expect(response.status).toBe(200);
    expect(H.graphCalls).toHaveLength(1);
    expect(H.graphCalls[0]).toEqual({ mediaId: "media-img-1", token: CHANNEL_TOKEN });
    // El token salió de `conv-token → ch-token`, que es la única vía posible:
    // el mensaje no tiene ni puede tener `channel_id`.
    expect(H.persisted[0]).toMatchObject({ organizationId: ORG, brandId: BRAND });
  });

  it("si el guardado falla, el archivo se entrega igual", async () => {
    H.failPersist = true;

    const response = await callMedia("msg-provider-url");

    expect(response.status).toBe(200);
    const guardado = (H.current!.store.messages as Array<Record<string, unknown>>).find(
      (row) => row.id === "msg-provider-url",
    )!;
    // Sin storage_path: la próxima vez se vuelve a intentar.
    expect((guardado.content as Record<string, unknown>).storage_path).toBeUndefined();
  });

  it("?download=1 fuerza la descarga con el nombre original", async () => {
    const response = await callMedia("msg-provider-url", { download: "1" });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toContain("attachment");
    expect(response.headers.get("Content-Disposition")).toContain("contrato.pdf");
  });

  // --- Aislamiento ---------------------------------------------------------
  it("un mensaje de otra organización responde 404 y no descarga nada", async () => {
    const response = await callMedia("msg-ajeno");

    expect(response.status).toBe(404);
    expect(H.downloads).toHaveLength(0);
    expect(H.graphCalls).toHaveLength(0);
  });

  it("un asesor sin la marca asignada responde 404 sobre su propia organización", async () => {
    H.current!.store.agents = [
      { id: AGENT, organization_id: ORG, role: "agent", member_type: "brand_advisor" },
    ];
    H.current!.store.brand_advisor_assignments = [
      { id: "asig", agent_id: AGENT, organization_id: ORG, brand_id: "otra-marca-de-la-misma-org" },
    ];

    const response = await callMedia("msg-guardado");
    expect(response.status).toBe(404);
  });

  // --- Secretos ------------------------------------------------------------
  it("ninguna respuesta expone access_token, Bearer ni tokens EAA", async () => {
    const casos = [
      await callMedia("msg-guardado"),
      await callMedia("msg-provider-url"),
      await callMedia("msg-media-id-con-token"),
      await callMedia("msg-ajeno"),
      await callMedia("msg-solo-id"),
    ];

    for (const response of casos) {
      const cabeceras = JSON.stringify([...response.headers.entries()]);
      const cuerpo =
        response.headers.get("Content-Type")?.includes("application/json")
          ? JSON.stringify(await response.json())
          : "";
      for (const secreto of ["access_token", "Bearer ", "EAA", CHANNEL_TOKEN]) {
        expect(cabeceras).not.toContain(secreto);
        expect(cuerpo).not.toContain(secreto);
      }
    }
  });

  it("la respuesta nunca devuelve provider_url al navegador", async () => {
    const response = await callMedia("msg-provider-url");
    const cabeceras = JSON.stringify([...response.headers.entries()]);

    expect(response.headers.get("location")).toBeNull();
    expect(cabeceras).not.toContain("lookaside.fbsbx.com");
  });

  it("un fallo del proveedor no filtra el token en el motivo", async () => {
    H.failDownload = true;
    H.failGraph = true;

    const response = await callMedia("msg-media-id-con-token");
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(JSON.stringify(body)).not.toContain(CHANNEL_TOKEN);
    expect(JSON.stringify(body)).not.toContain("EAA");
  });

  // --- Cobertura por tipo de adjunto ---------------------------------------
  const TIPOS = [
    { type: "image", filename: "foto.png", mime: "image/png" },
    { type: "video", filename: "clip.mp4", mime: "video/mp4" },
    { type: "audio", filename: "nota.ogg", mime: "audio/ogg" },
    { type: "document", filename: "informe.pdf", mime: "application/pdf" },
    { type: "sticker", filename: "sticker.webp", mime: "image/webp" },
  ];

  it.each(TIPOS)("abre y persiste un adjunto de tipo $type", async ({ type, filename, mime }) => {
    H.downloadMime = mime;
    (H.current!.store.messages as Array<Record<string, unknown>>).push({
      id: `msg-tipo-${type}`,
      conversation_id: "conv-1",
      content: {
        type,
        url: "",
        filename,
        mime_type: mime,
        provider_url: `https://lookaside.fbsbx.com/${filename}`,
        source: "meta",
      },
    });

    const response = await callMedia(`msg-tipo-${type}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(mime);
    expect(response.headers.get("Content-Disposition")).toContain(filename);
    expect(H.persisted).toHaveLength(1);
  });

  // --- Cobertura por canal -------------------------------------------------
  const CANALES = [
    { source: "instagram", channelType: "instagram", conversationId: "conv-token" },
    { source: "messenger", channelType: "facebook_messenger", conversationId: "conv-token" },
    { source: "whatsapp", channelType: "whatsapp_cloud_api", conversationId: "conv-token" },
    { source: "respond_io", channelType: "respond_io", conversationId: "conv-token" },
  ];

  it.each(CANALES)("resuelve el adjunto de $source usando el canal de la conversación", async ({ source, channelType }) => {
    // El tipo del canal cambia; lo que no cambia es de dónde sale: la
    // conversación. Es lo que garantiza que los cuatro proveedores funcionen
    // con la misma ruta.
    const canal = (H.current!.store.channels as Array<Record<string, unknown>>).find(
      (row) => row.id === "ch-token",
    )!;
    canal.type = channelType;

    (H.current!.store.messages as Array<Record<string, unknown>>).push({
      id: `msg-canal-${source}`,
      conversation_id: "conv-token",
      content: {
        type: "image",
        url: "",
        filename: `${source}.jpg`,
        mime_type: "image/jpeg",
        provider_media_id: `media-${source}`,
        source,
      },
    });
    H.downloadMime = "image/jpeg";

    const response = await callMedia(`msg-canal-${source}`);

    expect(response.status).toBe(200);
    expect(H.graphCalls[0]).toEqual({ mediaId: `media-${source}`, token: CHANNEL_TOKEN });
    expect(H.persisted[0]).toMatchObject({ organizationId: ORG, brandId: BRAND });
  });

  it("una conversación sin canal no rompe: error controlado", async () => {
    (H.current!.store.conversations as Array<Record<string, unknown>>).push({
      id: "conv-sin-canal",
      organization_id: ORG,
      brand_id: BRAND,
      channel_id: null,
      contact: { visibility_status: "active" },
    });
    (H.current!.store.messages as Array<Record<string, unknown>>).push({
      id: "msg-sin-canal",
      conversation_id: "conv-sin-canal",
      content: { type: "image", url: "", filename: "x.jpg", provider_media_id: "m-1", source: "whatsapp" },
    });

    const response = await callMedia("msg-sin-canal");

    expect(response.status).toBe(410);
    expect((await response.json()).code).toBe("provider_unavailable");
  });
});

describe("Redacción de secretos en logs", () => {
  it("recorta access_token, Bearer y tokens EAA", () => {
    const sucio =
      "fallo GET https://graph.facebook.com/v21.0/123?access_token=EAAabcdefghijklmnopqrstuvwxyz " +
      "con Authorization: Bearer EAAzzzzzzzzzzzzzzzzzzzzzzzzz";
    const limpio = redactSecrets(sucio);
    expect(limpio).not.toContain("EAAabcdefghijklmnopqrstuvwxyz");
    expect(limpio).not.toContain("EAAzzzzzzzzzzzzzzzzzzzzzzzzz");
    expect(limpio).toContain("[REDACTADO]");
  });
});

// ---------------------------------------------------------------------------
// 5. Interfaz
// ---------------------------------------------------------------------------
describe("MessageBubble", () => {
  const bubble = () =>
    readFileSync(join(process.cwd(), "src/components/inbox/MessageBubble.tsx"), "utf8");

  it("ofrece Abrir y Descargar", () => {
    const source = bubble();
    // El texto va en su propia línea dentro del enlace, junto al icono.
    expect(source).toMatch(/<ExternalLink[^>]*\/>\s*Abrir/);
    expect(source).toMatch(/<Download[^>]*\/>\s*Descargar/);
    expect(source).toContain("attachment-actions");
    expect(source).toContain("download=1");
  });

  it("los enlaces apuntan al endpoint interno, nunca al proveedor", () => {
    const source = bubble();
    expect(source).toContain("`/api/inbox/messages/${messageId}/media`");
    // Ni `provider_url` ni `content.url` se usan como origen de un `src`.
    expect(source).not.toMatch(/src=\{content\.url\}/);
    expect(source).not.toMatch(/src=\{content\.provider_url\}/);
  });

  it("usa el endpoint interno aunque las referencias estén sanitizadas", () => {
    expect(bubble()).toContain("ATTACHMENT_TYPES");
  });

  it("los documentos muestran nombre y detalle, no sólo texto plano", () => {
    const source = bubble();
    expect(source).toContain("extensionFromName(content.filename)");
    expect(source).toContain("formatBytes(content.size_bytes)");
  });

  it("un adjunto irresoluble muestra «Archivo no disponible»", () => {
    const source = bubble();
    expect(source).toContain("Archivo no disponible");
    expect(source).toContain("no disponible</span>");
  });

  it("los enlaces son accesibles desde teclado y abren en pestaña nueva", () => {
    const source = bubble();
    expect(source).toContain('target="_blank"');
    expect(source).toContain('rel="noopener noreferrer"');
    expect(source).toContain("aria-label");
    expect(source).toContain("focus-visible:ring");
  });

  it("mantiene los captions", () => {
    expect(bubble()).toContain("{content.caption}");
  });
});

describe("Resiliencia de los webhooks", () => {
  it("los tres canales guardan el mensaje antes de resolver el medio", () => {
    for (const file of [
      "src/lib/whatsapp/webhook.ts",
      "src/lib/smarttalk/meta-webhook.ts",
      "src/app/api/webhook/respond-io/route.ts",
    ]) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      const insert = source.indexOf('.from("messages")');
      // Se busca la LLAMADA, no el import, que está al principio del archivo.
      const resolve = source.indexOf("scheduleAttachmentResolution({");
      expect(insert).toBeGreaterThan(-1);
      expect(resolve).toBeGreaterThan(insert);
    }
  });

  it("un reenvío duplicado de Meta no vuelve a descargar el medio", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/smarttalk/meta-webhook.ts"),
      "utf8",
    );
    expect(source).toContain("!duplicateDelivery && parsed.type !== \"text\"");
  });

  it("la resolución no bloquea: se dispara sin await", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/inbox/media-resolver.ts"),
      "utf8",
    );
    expect(source).toContain("void resolveMessageAttachment(input)");
  });
});
