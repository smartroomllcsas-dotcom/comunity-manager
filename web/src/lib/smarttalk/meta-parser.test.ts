import { describe, expect, it } from "vitest";
import {
  buildDisplayName,
  extractContactId,
  extractContactName,
  getMessageDirection,
  looksLikeAudio,
  normalizeId,
  parseMetaMessage,
  pickChannelCandidates,
  type MetaMessagePayload,
  type MetaMessagingEvent,
  type MetaWebhookChangeValue,
  type MetaWebhookEntry,
} from "./meta-parser";

describe("normalizeId", () => {
  it("trims whitespace y devuelve string vacío para null/undefined", () => {
    expect(normalizeId(" 123 ")).toBe("123");
    expect(normalizeId(null)).toBe("");
    expect(normalizeId(undefined)).toBe("");
  });
});

describe("looksLikeAudio", () => {
  it("detecta mime types audio", () => {
    expect(looksLikeAudio("audio/webm")).toBe(true);
    expect(looksLikeAudio("audio/mp4")).toBe(true);
    expect(looksLikeAudio("image/png")).toBe(false);
  });

  it("detecta extensiones típicas de audio en filenames y URLs", () => {
    expect(looksLikeAudio("voice.opus")).toBe(true);
    expect(looksLikeAudio("clip.m4a?token=123")).toBe(true);
    expect(looksLikeAudio("video.mp4")).toBe(false);
  });

  it("es case-insensitive", () => {
    expect(looksLikeAudio("VOICE.OGG")).toBe(true);
  });
});

describe("buildDisplayName", () => {
  it("compone nombre completo", () => {
    expect(buildDisplayName("Ana", "Pérez")).toBe("Ana Pérez");
  });

  it("filtra vacíos y devuelve null si ambos son vacíos", () => {
    expect(buildDisplayName("", "Pérez")).toBe("Pérez");
    expect(buildDisplayName(undefined, undefined)).toBe(null);
    expect(buildDisplayName("", "")).toBe(null);
  });
});

describe("pickChannelCandidates", () => {
  it("recolecta ids únicos del entry y value.metadata", () => {
    const entry: MetaWebhookEntry = { id: "page-1" };
    const value: MetaWebhookChangeValue = {
      metadata: {
        page_id: "page-1",
        account_id: "biz-9",
        phone_number_id: "phone-5",
      },
    };
    expect(pickChannelCandidates(entry, value).sort()).toEqual(["biz-9", "page-1", "phone-5"].sort());
  });

  it("funciona sin value", () => {
    expect(pickChannelCandidates({ id: "x" })).toEqual(["x"]);
  });
});

describe("extractContactId", () => {
  it("para inbound usa sender.id", () => {
    const event: MetaMessagingEvent = { sender: { id: "user-1" }, recipient: { id: "page-1" } };
    expect(extractContactId(event)).toBe("user-1");
  });

  it("para echo usa recipient.id", () => {
    const event: MetaMessagingEvent = {
      sender: { id: "page-1" },
      recipient: { id: "user-1" },
      is_echo: true,
    };
    expect(extractContactId(event)).toBe("user-1");
  });

  it("para message.is_echo también invierte", () => {
    const event: MetaMessagingEvent = {
      sender: { id: "page-1" },
      recipient: { id: "user-1" },
      message: { is_echo: true },
    };
    expect(extractContactId(event)).toBe("user-1");
  });

  it("fallback a WhatsApp contacts wa_id", () => {
    const event: MetaMessagingEvent = {};
    const value: MetaWebhookChangeValue = {
      contacts: [{ wa_id: "573001112233" }],
    };
    expect(extractContactId(event, value)).toBe("573001112233");
  });

  it("último recurso: unknown", () => {
    expect(extractContactId({})).toBe("unknown");
  });
});

describe("getMessageDirection", () => {
  it("inbound por defecto", () => {
    expect(getMessageDirection({}, {})).toBe("inbound");
  });
  it("outbound si event.is_echo", () => {
    expect(getMessageDirection({ is_echo: true }, {})).toBe("outbound");
  });
  it("outbound si message.is_echo", () => {
    expect(getMessageDirection({}, { is_echo: true })).toBe("outbound");
  });
});

describe("extractContactName", () => {
  it("toma profile.name del primer contacto", () => {
    const value: MetaWebhookChangeValue = {
      contacts: [{ profile: { name: "Ana" } }],
    };
    expect(extractContactName({}, value)).toBe("Ana");
  });
  it("null si no hay contactos", () => {
    expect(extractContactName({})).toBe(null);
  });
});

describe("parseMetaMessage", () => {
  it("texto plano vía text: string", () => {
    const parsed = parseMetaMessage({ text: "hola" });
    expect(parsed.type).toBe("text");
    expect(parsed.content).toEqual({ type: "text", text: "hola" });
  });

  it("texto vía text.body (WhatsApp shape)", () => {
    const parsed = parseMetaMessage({ text: { body: "hola" } } as MetaMessagePayload);
    expect(parsed.type).toBe("text");
    expect(parsed.content).toEqual({ type: "text", text: "hola" });
  });

  it("quick_reply payload cuenta como texto", () => {
    const parsed = parseMetaMessage({ quick_reply: { payload: "OPT_A" } } as MetaMessagePayload);
    expect(parsed.content).toEqual({ type: "text", text: "OPT_A" });
  });

  it("imagen con caption", () => {
    const parsed = parseMetaMessage({
      attachment: { type: "image", payload: { url: "https://cdn/x.jpg" } },
      image: { caption: "mira" },
    });
    expect(parsed.type).toBe("image");
    expect(parsed.content).toEqual({ type: "image", url: "https://cdn/x.jpg", caption: "mira" });
  });

  it("video con caption desde attachments[0]", () => {
    const parsed = parseMetaMessage({
      attachments: [{ type: "video", payload: { url: "https://cdn/v.mp4" } }],
      video: { caption: "clip" },
    });
    expect(parsed.type).toBe("video");
    expect(parsed.content).toEqual({ type: "video", url: "https://cdn/v.mp4", caption: "clip" });
  });

  it("audio detectado por type explícito", () => {
    const parsed = parseMetaMessage({
      attachment: { type: "audio", payload: { url: "https://cdn/a.mp3" } },
    });
    expect(parsed.type).toBe("audio");
    expect(parsed.content).toEqual({ type: "audio", url: "https://cdn/a.mp3" });
  });

  it("audio detectado por mime type aunque el type sea genérico", () => {
    const parsed = parseMetaMessage({
      attachment: { type: "file", payload: { url: "https://cdn/v.webm" }, mime_type: "audio/webm" },
    });
    expect(parsed.type).toBe("audio");
  });

  it("sticker", () => {
    const parsed = parseMetaMessage({
      attachment: { type: "sticker", payload: { url: "https://cdn/s.png" } },
    });
    expect(parsed.type).toBe("sticker");
    expect(parsed.content).toEqual({ type: "sticker", url: "https://cdn/s.png" });
  });

  it("document fallback cuando no reconoce el tipo", () => {
    const parsed = parseMetaMessage({
      attachment: { type: "file", payload: { url: "https://cdn/doc.pdf" }, name: "doc.pdf" },
    });
    expect(parsed.type).toBe("document");
    expect(parsed.content).toMatchObject({
      type: "document",
      url: "https://cdn/doc.pdf",
    });
  });

  it("payload sin nada produce document con url vacío", () => {
    const parsed = parseMetaMessage({});
    expect(parsed.type).toBe("document");
    expect(parsed.content).toMatchObject({ type: "document", url: "", filename: "archivo" });
  });
});

describe("integración: postback simulado (persistMessengerLikeWebhook lo convierte a mensaje)", () => {
  it("mid + postback → shape que parseMetaMessage puede consumir vía message wrap", () => {
    // El caller (meta-webhook.persistMessengerLikeWebhook) construye:
    //   { mid: randomUUID(), from: sender.id, postback: event.postback }
    // Aquí probamos que parseMetaMessage no crashea y devuelve document (sin text/attachment).
    const parsed = parseMetaMessage({
      mid: "wamid-1",
      from: "user-1",
      postback: { title: "Opción A", payload: "OPT_A" },
    });
    // Sin text/attachment/quick_reply, cae a document con url = mid.
    expect(parsed.type).toBe("document");
    expect(parsed.content).toMatchObject({ type: "document", url: "wamid-1" });
  });
});
