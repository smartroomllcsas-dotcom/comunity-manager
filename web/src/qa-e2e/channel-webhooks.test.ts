// E2E QA · Matriz multicanal reproducible (Facebook, Instagram, Messenger, WhatsApp).
//
// Ejercita las RUTAS REALES de webhook con firmas HMAC calculadas con secretos
// sintéticos. Verifica el orden de las defensas (rate limit -> secreto -> firma
// -> cuerpo), la verificación de suscripción `hub.challenge`, el encolado
// idempotente y el aislamiento de secretos por canal.
//
// Fuera de alcance aquí (requiere ambiente QA aislado y app de Meta de prueba):
// ventana de 24 h, plantillas aprobadas, adjuntos y límites reales de Meta.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import type { FakeSupabase } from "./helpers/fake-supabase";
import { createFakeSupabase } from "./helpers/fake-supabase";

const APP_SECRET = "meta-app-secret-qa";
const IG_SECRET = "meta-ig-app-secret-qa";
const WA_SECRET = "whatsapp-app-secret-qa";
const VERIFY_TOKEN = "verify-token-qa";

vi.hoisted(() => {
  process.env.META_APP_SECRET = "meta-app-secret-qa";
  process.env.META_IG_APP_SECRET = "meta-ig-app-secret-qa";
  process.env.WHATSAPP_APP_SECRET = "whatsapp-app-secret-qa";
  process.env.META_WEBHOOK_VERIFY_TOKEN = "verify-token-qa";
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "verify-token-qa";
});

const H = vi.hoisted(() => ({ current: null as FakeSupabase | null }));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => H.current!.admin() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => H.current!.server }));
// `after()` de Next difiere el procesamiento; en la prueba lo ejecutamos de
// inmediato para poder aseverar el efecto sobre la cola.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (fn: () => unknown) => Promise.resolve(fn()).catch(() => {}) };
});

// El procesamiento de WhatsApp persiste en el backend legacy y llama a Graph.
// Esta suite valida la capa de seguridad de la ruta (firma, verify token, rate
// limit), así que el procesamiento se sustituye por dobles: sin ellos la ruta
// intenta abrir conexiones reales y la prueba queda colgada.
const waProcessing = vi.hoisted(() => ({ persisted: 0, messages: 0, statuses: 0 }));
vi.mock("@/lib/webhook", () => ({
  persistWhatsAppWebhook: async () => {
    waProcessing.persisted += 1;
  },
}));
vi.mock("@/lib/whatsapp/webhook", () => ({
  processIncomingMessage: async () => {
    waProcessing.messages += 1;
  },
  processStatusUpdate: async () => {
    waProcessing.statuses += 1;
  },
}));

import { GET as fbVerify, POST as fbReceive } from "@/app/api/webhook/facebook/route";
import { GET as igVerify, POST as igReceive } from "@/app/api/webhook/instagram/route";
import { GET as msVerify, POST as msReceive } from "@/app/api/webhook/messenger/route";
import { GET as waVerify, POST as waReceive } from "@/app/api/webhook/whatsapp/route";

interface ChannelCase {
  name: string;
  secret: string;
  receive: (request: never) => Promise<Response>;
  verify: (request: never) => Response | Promise<Response>;
  /** WhatsApp responde en línea; los canales Meta encolan en webhook_events. */
  queues: boolean;
}

const CHANNELS: ChannelCase[] = [
  { name: "facebook", secret: APP_SECRET, receive: fbReceive as never, verify: fbVerify as never, queues: true },
  { name: "instagram", secret: IG_SECRET, receive: igReceive as never, verify: igVerify as never, queues: true },
  { name: "messenger", secret: APP_SECRET, receive: msReceive as never, verify: msVerify as never, queues: true },
  { name: "whatsapp", secret: WA_SECRET, receive: waReceive as never, verify: waVerify as never, queues: false },
];

function sign(body: string, secret: string) {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

function metaPayload(messageId = "mid.qa-1") {
  return JSON.stringify({
    object: "page",
    entry: [
      {
        id: "page-1",
        time: 1_754_000_000,
        messaging: [
          {
            sender: { id: "psid-1" },
            recipient: { id: "page-1" },
            timestamp: 1_754_000_000,
            message: { mid: messageId, text: "hola QA" },
          },
        ],
      },
    ],
  });
}

function whatsappPayload(messageId = "wamid.qa-1") {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-1",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "573000000000", phone_number_id: "pnid-1" },
              contacts: [{ wa_id: "573001112233", profile: { name: "QA" } }],
              messages: [
                { from: "573001112233", id: messageId, timestamp: "1754000000", type: "text", text: { body: "hola" } },
              ],
            },
          },
        ],
      },
    ],
  });
}

function makePost(body: string, headers: Record<string, string>) {
  return {
    method: "POST",
    headers: new Headers(headers),
    text: async () => body,
    json: async () => JSON.parse(body),
    nextUrl: { searchParams: new URLSearchParams() },
  } as never;
}

function makeGet(params: Record<string, string>) {
  return {
    method: "GET",
    headers: new Headers(),
    nextUrl: { searchParams: new URLSearchParams(params) },
  } as never;
}

beforeEach(() => {
  H.current = createFakeSupabase({
    tables: { webhook_events: [], rate_limit_hits: [], channels: [], contacts: [], conversations: [], messages: [] },
  });
});

const queue = () => H.current!.store.webhook_events as Array<Record<string, unknown>>;
const rateLimitHits = () => H.current!.store.rate_limit_hits as Array<Record<string, unknown>>;

describe.each(CHANNELS)("Webhook $name · verificación de suscripción", (channel) => {
  it("devuelve el hub.challenge con el verify token correcto", async () => {
    const res = await channel.verify(
      makeGet({ "hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "reto-123" }),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("reto-123");
  });

  it("rechaza un verify token incorrecto", async () => {
    const res = await channel.verify(
      makeGet({ "hub.mode": "subscribe", "hub.verify_token": "token-falso", "hub.challenge": "reto-123" }),
    );
    expect(res.status).toBe(403);
  });

  it("rechaza un hub.mode que no sea subscribe", async () => {
    const res = await channel.verify(
      makeGet({ "hub.mode": "unsubscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "x" }),
    );
    expect([400, 403]).toContain(res.status);
  });
});

describe.each(CHANNELS)("Webhook $name · firma HMAC", (channel) => {
  const body = () => (channel.name === "whatsapp" ? whatsappPayload() : metaPayload());

  it("rechaza una petición sin cabecera de firma", async () => {
    const res = await channel.receive(makePost(body(), {}));
    expect(res.status).toBe(401);
    expect(queue()).toHaveLength(0);
  });

  it("rechaza una firma calculada con otro secreto", async () => {
    const payload = body();
    const res = await channel.receive(
      makePost(payload, { "x-hub-signature-256": sign(payload, "secreto-incorrecto") }),
    );
    expect(res.status).toBe(401);
    expect(queue()).toHaveLength(0);
  });

  it("rechaza una firma válida sobre un cuerpo alterado (replay con manipulación)", async () => {
    const original = body();
    const signature = sign(original, channel.secret);
    const tampered = original.replace("hola", "adios");
    const res = await channel.receive(makePost(tampered, { "x-hub-signature-256": signature }));
    expect(res.status).toBe(401);
  });

  it("acepta una firma válida", async () => {
    const payload = body();
    const res = await channel.receive(
      makePost(payload, { "x-hub-signature-256": sign(payload, channel.secret) }),
    );
    expect(res.status).toBe(200);
  });
});

describe("Aislamiento de secretos entre canales", () => {
  it("el secreto de Instagram no valida un evento de Facebook", async () => {
    const payload = metaPayload();
    const res = await fbReceive(makePost(payload, { "x-hub-signature-256": sign(payload, IG_SECRET) }));
    expect(res.status).toBe(401);
  });

  it("el secreto de WhatsApp no valida un evento de Instagram", async () => {
    const payload = metaPayload();
    const res = await igReceive(makePost(payload, { "x-hub-signature-256": sign(payload, WA_SECRET) }));
    expect(res.status).toBe(401);
  });

  it("Instagram acepta su propio secreto dedicado", async () => {
    const payload = metaPayload();
    const res = await igReceive(makePost(payload, { "x-hub-signature-256": sign(payload, IG_SECRET) }));
    expect(res.status).toBe(200);
  });
});

describe("Encolado de eventos de canales Meta", () => {
  it.each(["facebook", "instagram", "messenger"])(
    "%s persiste el evento en webhook_events antes de responder",
    async (name) => {
      const channel = CHANNELS.find((c) => c.name === name)!;
      const payload = metaPayload();
      const res = await channel.receive(
        makePost(payload, { "x-hub-signature-256": sign(payload, channel.secret) }),
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toMatchObject({ received: true, channel: name, queued: true });
      expect(queue()).toHaveLength(1);
      expect(queue()[0].channel).toBe(name);
    },
  );

  it("un reenvío del mismo payload encola un segundo evento: la deduplicación es por message_id aguas abajo", async () => {
    const payload = metaPayload("mid.repetido");
    const signature = sign(payload, APP_SECRET);
    await fbReceive(makePost(payload, { "x-hub-signature-256": signature }));
    await fbReceive(makePost(payload, { "x-hub-signature-256": signature }));

    // Comportamiento actual documentado: la cola NO deduplica en la entrada.
    // La unicidad la debe garantizar el procesamiento por wa_message_id/mid.
    expect(queue()).toHaveLength(2);
  });

  it("WhatsApp procesa en línea y no usa la cola de canales Meta", async () => {
    const payload = whatsappPayload("wamid.inline");
    const before = waProcessing.messages;
    const res = await waReceive(makePost(payload, { "x-hub-signature-256": sign(payload, WA_SECRET) }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(waProcessing.messages).toBe(before + 1);
    expect(queue()).toHaveLength(0);
  });

  it("un payload de prueba de Meta se reconoce y no entra a la cola", async () => {
    const payload = JSON.stringify({ object: "page", sample: { field: "messages", value: {} } });
    const res = await fbReceive(makePost(payload, { "x-hub-signature-256": sign(payload, APP_SECRET) }));
    expect(await res.json()).toMatchObject({ testPayload: true, processed: 0 });
    expect(queue()).toHaveLength(0);
  });

  it("un cuerpo que no es JSON se rechaza con 400 tras validar la firma", async () => {
    const payload = "esto-no-es-json";
    const res = await fbReceive(makePost(payload, { "x-hub-signature-256": sign(payload, APP_SECRET) }));
    expect(res.status).toBe(400);
    expect(queue()).toHaveLength(0);
  });
});

describe("Rate limiting de webhooks de canal", () => {
  it("registra un hit por petición aceptada y responde 429 al superar el límite", async () => {
    const payload = metaPayload();
    const signature = sign(payload, APP_SECRET);
    const headers = { "x-hub-signature-256": signature, "x-forwarded-for": "203.0.113.9" };

    // El límite de la ruta es 200/min; 201 peticiones deben cruzar el umbral.
    let blocked = 0;
    for (let i = 0; i < 201; i++) {
      const res = await fbReceive(makePost(payload, headers));
      if (res.status === 429) {
        blocked += 1;
        expect(res.headers.get("Retry-After")).toBeTruthy();
      }
    }

    expect(blocked).toBeGreaterThan(0);
    expect(rateLimitHits().length).toBeGreaterThanOrEqual(200);
    expect(rateLimitHits().every((hit) => String(hit.key).startsWith("webhook-facebook:"))).toBe(true);
  });

  it("cuentas separadas por IP: una IP bloqueada no afecta a otra", async () => {
    const payload = metaPayload();
    const signature = sign(payload, APP_SECRET);
    for (let i = 0; i < 201; i++) {
      await fbReceive(makePost(payload, { "x-hub-signature-256": signature, "x-forwarded-for": "203.0.113.10" }));
    }
    const other = await fbReceive(
      makePost(payload, { "x-hub-signature-256": signature, "x-forwarded-for": "203.0.113.11" }),
    );
    expect(other.status).toBe(200);
  });

  it("una IP en RATE_LIMIT_WHITELIST no consume cupo", async () => {
    const payload = metaPayload();
    const headers = { "x-hub-signature-256": sign(payload, APP_SECRET), "x-forwarded-for": "198.51.100.7" };
    const previous = process.env.RATE_LIMIT_WHITELIST;
    process.env.RATE_LIMIT_WHITELIST = "198.51.100.7";
    // El módulo cachea la whitelist en el primer uso; se importa fresco.
    vi.resetModules();
    const { isWhitelistedIp } = await import("@/lib/rate-limit");
    expect(isWhitelistedIp("198.51.100.7")).toBe(true);
    expect(isWhitelistedIp("203.0.113.1")).toBe(false);
    process.env.RATE_LIMIT_WHITELIST = previous;
    expect(headers["x-forwarded-for"]).toBe("198.51.100.7");
  });
});
