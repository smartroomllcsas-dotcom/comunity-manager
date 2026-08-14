// E2E QA · «Conectado» significa operativo.
// ---------------------------------------------------------------------------
// El defecto observado en producción (marca Smartroom LLC SAS, página
// 965702033291260): un mensaje llegó a las 09:27:55, el canal de
// `smarttalk.channels` no existió hasta las 09:28:10 y el webhook lo descartó:
//
//     [meta-webhook] no matching smarttalk channel
//
// Quince segundos en los que la interfaz decía «conectado» y el canal no podía
// recibir nada, porque la fila operativa la creaba `/api/channels/sync-legacy`
// al montar /clients.
//
// Esta suite cubre las dos mitades del problema:
//
//   1. **La ventana temporal.** El canal debe existir al terminar el OAuth, sin
//      abrir /clients, sin `useChannels`, sin sync-legacy y sin cron.
//   2. **La ventana lógica**, que la corrección anterior no cerraba: crear la
//      fila no hace que Meta envíe nada. Si `subscribed_apps` falla, el canal
//      existe, está `active` y sigue sin recibir un solo mensaje. La suscripción
//      tiene que formar parte del éxito.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FakeSupabase } from "./helpers/fake-supabase";
import { createFakeSupabase } from "./helpers/fake-supabase";
import { orgRow, subscriptionRow, entitlementRow } from "./helpers/fixtures";

const ORG = "org-activacion";
const OTHER_ORG = "org-vecina";
const CM_USER = "cm-user-1";
const APP_SECRET = "meta-app-secret-activacion";

vi.hoisted(() => {
  process.env.META_APP_SECRET = "meta-app-secret-activacion";
  process.env.META_WEBHOOK_VERIFY_TOKEN = "verify-token-activacion";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.invalid";
});

/** Diez marcas sintéticas, cada una con sus tres activos distintos. */
const BRANDS = Array.from({ length: 10 }, (_, index) => ({
  id: `brand-${index}`,
  name: `Marca ${index}`,
  pageId: `page-${index}`,
  igId: `ig-${index}`,
  phoneId: `pn-${index}`,
  wabaId: `waba-${index}`,
  pageToken: `TOKEN-PAGINA-${index}`,
}));

type Brand = (typeof BRANDS)[number];

const H = vi.hoisted(() => ({
  current: null as FakeSupabase | null,
  access: null as { clientId: string; cmUserId: string; organizationId: string | null } | null,
  pages: [] as Array<Record<string, unknown>>,
  // Fallos de suscripción inyectables, por activo.
  failPage: null as string | null,
  failInstagram: null as string | null,
  failWaba: null as string | null,
  subscribed: [] as string[],
  // Trabajo diferido por `after()`. La ruta no lo espera —Meta exige responder
  // en menos de 20 s—, así que la prueba tiene que poder vaciarlo a mano.
  afterTasks: [] as Promise<unknown>[],
  instagramProfile: { id: "ig-directo", username: "cuenta_directa" } as {
    id: string;
    username: string;
  },
  /**
   * `config.webhook_subscribed` del canal **en el instante** en que se llama al
   * proveedor.
   *
   * Es la única forma de comprobar el orden: que la marca de «todavía sin
   * suscripción» se escribe ANTES de preguntarle a Meta, y no después. Si se
   * escribiera después, un fallo del guardado final dejaría la fila `active`
   * sin el campo y la pantalla la pintaría verde.
   */
  flagAtSubscribe: [] as Array<{ key: string; flag: unknown }>,
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    NextRequest: class {},
    // `after()` difiere el procesamiento de la cola. Aquí se lanza en el acto y
    // se guarda la promesa para poder esperarla desde la prueba: la ruta no la
    // espera a propósito, y sin esto se aseveraría sobre la cola a medio
    // procesar.
    after: (fn: () => unknown) => {
      const task = Promise.resolve()
        .then(fn)
        .catch(() => {});
      H.afterTasks.push(task);
      return task;
    },
  };
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => H.current!.admin() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => H.current!.server }));
vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: (table: string) => H.current!.admin().from(table),
    schema: () => ({ from: (table: string) => H.current!.admin().from(table) }),
  },
}));
vi.mock("@/lib/cm-client-access", () => ({ getCmClientAccess: async () => H.access }));
vi.mock("@/lib/crypto", () => ({
  encryptToken: (value: string) => `enc:${value}`,
  decryptToken: (value: string) => (value.startsWith("enc:") ? value.slice(4) : ""),
}));
vi.mock("@/lib/auth/token-crypto", () => ({
  encryptToken: (value: string) => `enc:${value}`,
  decryptToken: (value: string) => (value?.startsWith("enc:") ? value.slice(4) : null),
  resolveToken: (cipher: string | null, plain: string | null) =>
    cipher?.startsWith("enc:") ? cipher.slice(4) : plain || null,
}));
vi.mock("@/lib/meta", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/meta")>();
  return {
    ...actual,
    exchangeCodeForToken: async () => ({ access_token: "TOKEN-CORTO" }),
    getLongLivedToken: async () => ({ access_token: "TOKEN-USUARIO-LARGO", expires_in: 5184000 }),
    getUserProfile: async () => ({ id: "meta-user-1" }),
    getUserPermissions: async () => [{ permission: "pages_show_list", status: "granted" }],
    getUserPages: async () => H.pages,
    getUserAdAccounts: async () => [],
    subscribePageToApp: async (pageId: string) => {
      const channelRows = H.current!.store.channels as Array<Record<string, unknown>>;
      const pageChannel = channelRows.find((row) => row.meta_business_id === pageId);
      H.flagAtSubscribe.push({
        key: `page:${pageId}`,
        flag: channelRows
          .filter((row) => row.meta_business_id === pageId)
          .map((row) => ((row.config || {}) as Record<string, unknown>).webhook_subscribed),
      });
      const instagramChannel = channelRows.find(
        (row) => row.brand_id === pageChannel?.brand_id && row.type === "instagram",
      );
      if (instagramChannel) {
        H.flagAtSubscribe.push({
          key: `ig-via-page:${instagramChannel.meta_business_id}`,
          flag: [
            ((instagramChannel.config || {}) as Record<string, unknown>).webhook_subscribed,
          ],
        });
      }
      if (H.failPage === pageId) {
        throw new Error(
          `Meta API: (#200) Requires pages_manage_metadata permission access_token=EAAsecretodepagina1234567890 (code: 200)`,
        );
      }
      H.subscribed.push(`page:${pageId}`);
      return { success: true };
    },
    subscribeInstagramAccountToApp: async (igId: string) => {
      H.flagAtSubscribe.push({
        key: `ig:${igId}`,
        flag: (H.current!.store.channels as Array<Record<string, unknown>>)
          .filter((row) => row.meta_business_id === igId)
          .map((row) => ((row.config || {}) as Record<string, unknown>).webhook_subscribed),
      });
      if (H.failInstagram === igId) throw new Error("Meta API: cuenta no elegible (code: 100)");
      H.subscribed.push(`ig:${igId}`);
      return { success: true };
    },
  };
});
vi.mock("@/lib/whatsapp-cm", () => ({
  exchangeWhatsAppCode: async () => ({ access_token: "TOKEN-WA-LARGO" }),
  getPhoneNumberDetails: async (phoneNumberId: string) => ({
    display_phone_number: `+57 300 000 ${phoneNumberId}`,
    verified_name: `Empresa ${phoneNumberId}`,
  }),
  subscribeWabaToWebhook: async (wabaId: string) => {
    H.flagAtSubscribe.push({
      key: `waba:${wabaId}`,
      flag: (H.current!.store.channels as Array<Record<string, unknown>>)
        .filter((row) => row.whatsapp_business_account_id === wabaId)
        .map((row) => ((row.config || {}) as Record<string, unknown>).webhook_subscribed),
    });
    if (H.failWaba === wabaId) throw new Error(`WA subscribe webhook: (#10) Application does not have permission`);
    H.subscribed.push(`waba:${wabaId}`);
    return { success: true };
  },
}));

vi.mock("@/lib/instagram", () => ({
  exchangeInstagramCode: async () => ({ access_token: "TOKEN-IG-CORTO" }),
  getInstagramLongLivedToken: async () => ({ access_token: "TOKEN-IG-LARGO", expires_in: 5184000 }),
  getInstagramProfile: async () => H.instagramProfile,
}));

import { handleMetaCallback } from "@/lib/meta-oauth-handler";
import { POST as whatsappExchange } from "@/app/auth/whatsapp/exchange/route";
import { GET as instagramCallback } from "@/app/api/auth/instagram/callback/route";
import { POST as retryActivation } from "@/app/api/channels/[id]/retry-activation/route";
import { receiveMetaWebhook } from "@/lib/smarttalk/meta-webhook";
import { GET as listClients } from "@/app/api/cm/clients/route";
import { sanitizeProviderError, wasAssetOperational } from "@/lib/meta/channel-activation";
import {
  isChannelConnected,
  needsActivation,
  type BrandChannelStatus,
} from "@/lib/smarttalk/brand-channel-status";

// ---------------------------------------------------------------------------
// Utilidades de escenario
// ---------------------------------------------------------------------------

function seed(overrides: Record<string, unknown[]> = {}) {
  return createFakeSupabase({
    currentUserId: "auth-user-1",
    tables: {
      cm_oauth_states: [],
      cm_oauth_pending_selections: [],
      cm_clients: BRANDS.map((brand) => ({
        id: brand.id,
        name: brand.name,
        status: "active",
        smarttalk_organization_id: ORG,
        user_id: "u1",
      })),
      cm_social_accounts: [],
      cm_whatsapp_accounts: [],
      cm_activity_log: [],
      channels: [],
      contacts: [],
      conversations: [],
      messages: [],
      webhook_events: [],
      organizations: [{ id: ORG, name: "Agencia" }],
      subscriptions: [],
      plan_entitlements: [],
      billing_decision_events: [],
      ...overrides,
    },
  });
}

function callbackRequest(state: string) {
  return {
    method: "GET",
    headers: new Headers(),
    nextUrl: {
      searchParams: new URLSearchParams({ code: "codigo-oauth", state }),
      origin: "https://app.invalid",
    },
    cookies: { get: () => undefined },
  } as never;
}

function jsonRequest(body: unknown) {
  return {
    method: "POST",
    headers: new Headers({ "content-type": "application/json" }),
    nextUrl: { searchParams: new URLSearchParams(), origin: "https://app.invalid" },
    cookies: { get: () => undefined },
    json: async () => body,
  } as never;
}

function webhookRequest(body: string) {
  const signature = "sha256=" + createHmac("sha256", APP_SECRET).update(body).digest("hex");
  return {
    method: "POST",
    headers: new Headers({ "x-hub-signature-256": signature }),
    text: async () => body,
    json: async () => JSON.parse(body),
    nextUrl: { searchParams: new URLSearchParams() },
  } as never;
}

/**
 * Entrega un webhook firmado y espera a que la cola termine de procesarlo.
 *
 * En producción el procesamiento va en `after()` y ocurre después de responder
 * 200. Aquí hay que esperarlo para poder aseverar sobre el resultado.
 */
async function deliverWebhook(
  body: string,
  channel: "messenger" | "instagram" | "facebook",
): Promise<Response> {
  const response = await receiveMetaWebhook(webhookRequest(body), channel);
  while (H.afterTasks.length > 0) {
    await Promise.all(H.afterTasks.splice(0));
  }
  return response as Response;
}

/** Conecta Messenger + Instagram de una marca a través del callback real. */
async function connectMeta(brand: Brand, options: { flow?: "facebook" | "instagram" } = {}) {
  const state = `state-${brand.id}-${H.current!.store.cm_oauth_states.length}`;
  H.access = { clientId: brand.id, cmUserId: CM_USER, organizationId: ORG };
  H.current!.store.cm_oauth_states.push({ state, client_id: brand.id });
  H.pages = [
    {
      id: brand.pageId,
      name: `Página ${brand.name}`,
      access_token: brand.pageToken,
      instagram_business_account: { id: brand.igId, username: `ig_${brand.id}` },
    },
  ];
  return handleMetaCallback(
    callbackRequest(state),
    options.flow === "facebook" ? "/auth/facebook/callback" : "/api/auth/meta/callback",
  );
}

/**
 * Conecta Instagram por el login directo de Instagram Business.
 *
 * Es la otra puerta de entrada de Instagram: no pasa por una página de
 * Facebook, así que recorre código distinto al del callback de Meta.
 */
async function connectInstagramDirect(brand: Brand, igId = brand.igId) {
  const state = `ig-state-${brand.id}-${H.current!.store.cm_oauth_states.length}`;
  H.access = { clientId: brand.id, cmUserId: CM_USER, organizationId: ORG };
  H.instagramProfile = { id: igId, username: `directo_${brand.id}` };
  H.current!.store.cm_oauth_states.push({
    state,
    client_id: brand.id,
    created_at: new Date().toISOString(),
  });
  return instagramCallback({
    method: "GET",
    headers: new Headers(),
    nextUrl: {
      searchParams: new URLSearchParams({ code: "codigo-ig", state }),
      origin: "https://app.invalid",
    },
    cookies: { get: () => undefined },
  } as never) as Promise<Response>;
}

/** Conecta WhatsApp de una marca a través de la ruta real de Embedded Signup. */
async function connectWhatsApp(brand: Brand) {
  H.access = { clientId: brand.id, cmUserId: CM_USER, organizationId: ORG };
  return whatsappExchange(
    jsonRequest({
      code: `code-${brand.id}`,
      phone_number_id: brand.phoneId,
      waba_id: brand.wabaId,
      client_id: brand.id,
    }),
  );
}

/** Un mensaje entrante de Messenger dirigido a la página indicada. */
function messengerPayload(pageId: string, text: string, mid = `mid-${pageId}-${text}`) {
  return JSON.stringify({
    object: "page",
    entry: [
      {
        id: pageId,
        time: 1_754_000_000,
        messaging: [
          {
            sender: { id: `psid-de-${pageId}` },
            recipient: { id: pageId },
            timestamp: 1_754_000_000,
            message: { mid, text },
          },
        ],
      },
    ],
  });
}

function instagramPayload(igId: string, text: string) {
  return JSON.stringify({
    object: "instagram",
    entry: [
      {
        id: igId,
        time: 1_754_000_000,
        messaging: [
          {
            sender: { id: `igsid-de-${igId}` },
            recipient: { id: igId },
            timestamp: 1_754_000_000,
            message: { mid: `mid-ig-${igId}`, text },
          },
        ],
      },
    ],
  });
}

const channels = () => H.current!.store.channels as Array<Record<string, unknown>>;
const channelOf = (brandId: string, type: string) =>
  channels().find((row) => row.brand_id === brandId && row.type === type);
const location = (response: Response) => decodeURIComponent(response.headers.get("location") || "");

beforeEach(() => {
  process.env.BILLING_ENFORCEMENT_MODE = "off";
  process.env.META_APP_SECRET = APP_SECRET;
  H.current = seed();
  H.access = null;
  H.pages = [];
  H.failPage = null;
  H.failInstagram = null;
  H.failWaba = null;
  H.subscribed = [];
  H.flagAtSubscribe = [];
  // El enriquecimiento del contacto llama a Graph; en QA no hay red. Devolver
  // un fallo hace que el webhook use el nombre del propio payload, que es el
  // camino que interesa aquí.
  vi.stubGlobal("fetch", async () => ({
    ok: false,
    status: 400,
    json: async () => ({ error: { message: "perfil no disponible en QA" } }),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// 1 · Diez marcas, treinta canales, ningún cruce
// ---------------------------------------------------------------------------
describe("1 · Agencia con 10 marcas × Messenger + Instagram + WhatsApp", () => {
  async function connectAll() {
    for (const brand of BRANDS) {
      await connectMeta(brand);
      await connectWhatsApp(brand);
    }
  }

  it("crea exactamente 30 canales: uno por marca y tipo", async () => {
    await connectAll();

    expect(channels()).toHaveLength(30);
    for (const brand of BRANDS) {
      expect(channelOf(brand.id, "facebook_messenger")).toBeTruthy();
      expect(channelOf(brand.id, "instagram")).toBeTruthy();
      expect(channelOf(brand.id, "whatsapp_business_api")).toBeTruthy();
    }
  });

  it("cada canal guarda el identificador del activo que Meta envía en entry.id", async () => {
    await connectAll();

    for (const brand of BRANDS) {
      expect(channelOf(brand.id, "facebook_messenger")!.meta_business_id).toBe(brand.pageId);
      expect(channelOf(brand.id, "instagram")!.meta_business_id).toBe(brand.igId);
      expect(channelOf(brand.id, "whatsapp_business_api")!.whatsapp_phone_number_id).toBe(
        brand.phoneId,
      );
      expect(channelOf(brand.id, "whatsapp_business_api")!.whatsapp_business_account_id).toBe(
        brand.wabaId,
      );
    }
  });

  it("ningún activo aparece en dos marcas", async () => {
    await connectAll();

    const assets = channels().map(
      (row) => `${row.type}:${row.meta_business_id ?? row.whatsapp_phone_number_id}`,
    );
    expect(new Set(assets).size).toBe(assets.length);
  });

  it("los 30 canales quedan en la organización correcta y con brand_id propio", async () => {
    await connectAll();

    for (const row of channels()) {
      expect(row.organization_id).toBe(ORG);
      expect(BRANDS.some((brand) => brand.id === row.brand_id)).toBe(true);
    }
  });

  it("los canales quedaron instalados en Meta (Instagram comparte la Página)", async () => {
    await connectAll();

    for (const brand of BRANDS) {
      expect(H.subscribed).toContain(`page:${brand.pageId}`);
      expect(H.subscribed).not.toContain(`ig:${brand.igId}`);
      expect(H.subscribed).toContain(`waba:${brand.wabaId}`);
    }
  });

  it("un contacto que escribe a dos marcas queda separado por marca", async () => {
    await connectAll();
    // El mismo PSID no existe entre páginas distintas en Meta, pero el
    // aislamiento no puede depender de eso: se fuerza el mismo identificador.
    const payloadA = messengerPayload(BRANDS[0].pageId, "hola A", "mid-compartido-a");
    const payloadB = messengerPayload(BRANDS[1].pageId, "hola B", "mid-compartido-b");
    await deliverWebhook(payloadA, "messenger");
    await deliverWebhook(payloadB, "messenger");

    const contacts = H.current!.store.contacts as Array<Record<string, unknown>>;
    const brandsWithContact = contacts.map((row) => row.brand_id);
    expect(new Set(brandsWithContact)).toEqual(new Set([BRANDS[0].id, BRANDS[1].id]));
  });
});

// ---------------------------------------------------------------------------
// 2 · Webhook inmediato, sin abrir /clients
// ---------------------------------------------------------------------------
describe("2 · Un webhook entregado justo después de conectar encuentra su canal", () => {
  it("Messenger: el mensaje aterriza en la marca del canal receptor", async () => {
    const brand = BRANDS[3];
    await connectMeta(brand);

    // Sin sync-legacy, sin useChannels, sin recargar: el webhook llega ya.
    const response = await deliverWebhook(
      messengerPayload(brand.pageId, "mensaje inmediato"),
      "messenger",
    );
    expect(response.status).toBe(200);

    const messages = H.current!.store.messages as Array<Record<string, unknown>>;
    expect(messages).toHaveLength(1);
    const conversation = (H.current!.store.conversations as Array<Record<string, unknown>>)[0];
    expect(conversation.brand_id).toBe(brand.id);
    expect(conversation.organization_id).toBe(ORG);
  });

  it("Instagram: el mensaje aterriza en la marca del canal receptor", async () => {
    const brand = BRANDS[4];
    await connectMeta(brand);

    await deliverWebhook(instagramPayload(brand.igId, "ig inmediato"), "instagram");

    const conversation = (H.current!.store.conversations as Array<Record<string, unknown>>)[0];
    expect(conversation.brand_id).toBe(brand.id);
    expect(conversation.channel_id).toBe(channelOf(brand.id, "instagram")!.id);
  });

  it("el evento se procesa y la cola queda en 'processed'", async () => {
    const brand = BRANDS[5];
    await connectMeta(brand);
    await deliverWebhook(messengerPayload(brand.pageId, "cola"), "messenger");

    const queue = H.current!.store.webhook_events as Array<Record<string, unknown>>;
    expect(queue).toHaveLength(1);
    expect(queue[0].status).toBe("processed");
  });

  it("no depende de /api/channels/sync-legacy: la ruta no llegó a ejecutarse", async () => {
    const brand = BRANDS[6];
    await connectMeta(brand);

    // El canal existe con `legacy_account_id`, que es lo que sync-legacy habría
    // rellenado después. La conexión ya lo dejó puesto.
    const channel = channelOf(brand.id, "facebook_messenger")!;
    const config = channel.config as Record<string, unknown>;
    expect(config.legacy_account_id).toBeTruthy();
    expect(config.legacy_client_id).toBe(brand.id);
    expect(channel.status).toBe("active");
  });

  it("WhatsApp: el canal queda enrutable por phone_number_id nada más conectar", async () => {
    const brand = BRANDS[7];
    const response = await connectWhatsApp(brand);
    expect(response.status).toBe(200);

    const channel = channelOf(brand.id, "whatsapp_business_api")!;
    expect(channel.status).toBe("active");
    expect(channel.whatsapp_phone_number_id).toBe(brand.phoneId);
    expect(H.subscribed).toContain(`waba:${brand.wabaId}`);
  });

  it("un mensaje a una página NO conectada sigue sin encontrar canal", async () => {
    await connectMeta(BRANDS[0]);

    await deliverWebhook(messengerPayload("page-de-nadie", "huérfano"), "messenger");

    expect(H.current!.store.messages).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3 · La suscripción forma parte del éxito
// ---------------------------------------------------------------------------
describe("3 · Si el proveedor no queda suscrito, no hay «conectado»", () => {
  it("Messenger: la redirección lleva meta_error, nunca meta_success", async () => {
    const brand = BRANDS[0];
    H.failPage = brand.pageId;

    const response = await connectMeta(brand, { flow: "facebook" });
    const url = location(response);

    expect(url).toContain("meta_error");
    expect(url).not.toContain("meta_success");
    expect(url).toContain("Reintentar activación");
  });

  it("Messenger: el canal queda en 'error', no en 'active'", async () => {
    const brand = BRANDS[0];
    H.failPage = brand.pageId;
    await connectMeta(brand, { flow: "facebook" });

    const channel = channelOf(brand.id, "facebook_messenger")!;
    expect(channel.status).toBe("error");
    expect((channel.config as Record<string, unknown>).webhook_subscribed).toBe(false);
    expect((channel.config as Record<string, unknown>).activation_error).toBeTruthy();
  });

  it("Messenger: un canal en 'error' no recibe mensajes, y eso es lo correcto", async () => {
    const brand = BRANDS[0];
    H.failPage = brand.pageId;
    await connectMeta(brand, { flow: "facebook" });

    await deliverWebhook(messengerPayload(brand.pageId, "no debería llegar"), "messenger");
    // Meta no suscribió el activo: no hay mensajes que perder. Lo que importa
    // es que el administrador vio el fallo en vez de un «conectado».
    expect(H.current!.store.messages).toHaveLength(0);
  });

  it("Instagram vía Facebook: si falla instalar la Página, ambos canales nuevos quedan en error", async () => {
    const brand = BRANDS[1];
    H.failPage = brand.pageId;

    const response = await connectMeta(brand);

    expect(location(response)).toContain("meta_error");
    expect(channelOf(brand.id, "facebook_messenger")!.status).toBe("error");
    expect(channelOf(brand.id, "instagram")!.status).toBe("error");
  });

  it("WhatsApp: responde 502 con código explícito y deja el canal en 'error'", async () => {
    const brand = BRANDS[2];
    H.failWaba = brand.wabaId;

    const response = await connectWhatsApp(brand);
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.code).toBe("webhook_subscription_failed");
    expect(body.retryable).toBe(true);
    expect(channelOf(brand.id, "whatsapp_business_api")!.status).toBe("error");
  });

  it("la causa que se muestra no filtra tokens ni la respuesta completa de Meta", async () => {
    const brand = BRANDS[0];
    H.failPage = brand.pageId;

    const response = await connectMeta(brand, { flow: "facebook" });
    const url = location(response);
    const stored = (channelOf(brand.id, "facebook_messenger")!.config as Record<string, unknown>)
      .activation_error as string;

    for (const secreto of ["EAAsecretodepagina1234567890", brand.pageToken, "TOKEN-USUARIO-LARGO"]) {
      expect(url).not.toContain(secreto);
      expect(stored).not.toContain(secreto);
    }
    // Y sí dice qué pasó, en un texto corto.
    expect(stored).toContain("pages_manage_metadata");
    expect(stored.length).toBeLessThanOrEqual(160);
  });

  it("sanitizeProviderError recorta un volcado JSON completo de Meta", () => {
    const clean = sanitizeProviderError(
      new Error(
        `WABA subscription failed: ${JSON.stringify({
          error: {
            message: "Invalid OAuth access token",
            type: "OAuthException",
            code: 190,
            access_token: "EAAG0000000000000000000000000000",
            fbtrace_id: "AbCdEfGhIjK",
          },
        })}`,
      ),
    );

    expect(clean).not.toContain("EAAG0000000000000000000000000000");
    expect(clean).not.toContain("{");
    expect(clean).toContain("Invalid OAuth access token");
  });

  it("la actividad registrada marca el fallo, no un éxito", async () => {
    const brand = BRANDS[0];
    H.failPage = brand.pageId;
    await connectMeta(brand, { flow: "facebook" });

    const log = H.current!.store.cm_activity_log as Array<Record<string, unknown>>;
    expect(log).toHaveLength(1);
    expect(log[0].status).toBe("error");
    expect(String(log[0].action)).toContain("pendiente de activación");
  });

  it("una reconexión sobre un canal YA activo no lo degrada si la suscripción falla", async () => {
    const brand = BRANDS[8];
    await connectMeta(brand, { flow: "facebook" });
    expect(channelOf(brand.id, "facebook_messenger")!.status).toBe("active");

    // Segunda vuelta: Meta rechaza la suscripción. La anterior sigue vigente.
    H.failPage = brand.pageId;
    const response = await connectMeta(brand, { flow: "facebook" });

    // Se informa el fallo…
    expect(location(response)).toContain("meta_error");
    // …pero el canal sigue recibiendo: degradarlo lo sacaría de
    // findMatchingChannel y provocaría la pérdida que se intenta evitar.
    expect(channelOf(brand.id, "facebook_messenger")!.status).toBe("active");

    await deliverWebhook(messengerPayload(brand.pageId, "sigue llegando"), "messenger");
    expect(H.current!.store.messages).toHaveLength(1);
  });

  it("el fallo transitorio se guarda como advertencia, sin tocar el indicador operativo", async () => {
    const brand = BRANDS[8];
    await connectMeta(brand, { flow: "facebook" });
    const config = () =>
      channelOf(brand.id, "facebook_messenger")!.config as Record<string, unknown>;
    expect(config().webhook_subscribed).toBe(true);

    H.failPage = brand.pageId;
    await connectMeta(brand, { flow: "facebook" });

    // El indicador operativo NO se toca: la suscripción anterior sigue vigente
    // y marcarlo `false` haría que /clients pintara «pendiente de activación»
    // sobre un canal que recibe.
    expect(config().webhook_subscribed).toBe(true);
    expect(config().activation_error).toBeFalsy();
    // El fallo queda registrado, pero en su propio campo.
    expect(config().activation_warning).toContain("pages_manage_metadata");
    expect(config().activation_warning_at).toBeTruthy();
  });

  it("una activación posterior correcta borra la advertencia", async () => {
    const brand = BRANDS[8];
    await connectMeta(brand, { flow: "facebook" });
    H.failPage = brand.pageId;
    await connectMeta(brand, { flow: "facebook" });

    H.failPage = null;
    await connectMeta(brand, { flow: "facebook" });

    const config = channelOf(brand.id, "facebook_messenger")!.config as Record<string, unknown>;
    expect(config.activation_warning).toBeNull();
    expect(config.activation_warning_at).toBeNull();
    expect(config.webhook_subscribed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3 bis · Cambiar de activo NO es reconectar
// ---------------------------------------------------------------------------
// El bloqueo que encontró la revisión: `wasActive` miraba sólo el estado del
// canal. Con eso, «canal activo con la Página A» y «canal activo al que ahora
// se le pone la Página B» eran indistinguibles, y un fallo de suscripción sobre
// la Página B se trataba como transitorio: el canal se quedaba `active`
// apuntando a un activo que no tenía ninguna suscripción. «Conectado» sobre un
// canal mudo, colado por la puerta de la reconexión.
describe("3 bis · Conectar un activo distinto sobre un canal activo", () => {
  it("Messenger: Página A activa → Página B falla ⇒ el canal queda en error", async () => {
    const brand = BRANDS[0];
    await connectMeta(brand, { flow: "facebook" });
    expect(channelOf(brand.id, "facebook_messenger")!.status).toBe("active");

    // Mismo canal, página nueva, y Meta rechaza la suscripción de la nueva.
    const paginaB = "page-b-nueva";
    H.failPage = paginaB;
    const response = await connectMeta({ ...brand, pageId: paginaB }, { flow: "facebook" });

    const channel = channelOf(brand.id, "facebook_messenger")!;
    expect(location(response)).toContain("meta_error");
    expect(location(response)).not.toContain("meta_success");
    expect(channel.meta_business_id).toBe(paginaB);
    // No hay suscripción que cubra la Página B: el canal no puede seguir activo.
    expect(channel.status).toBe("error");
    expect((channel.config as Record<string, unknown>).webhook_subscribed).toBe(false);
  });

  /**
   * La cadena completa: conectar, cambiar de activo, fallar, y preguntarle a
   * `/clients` qué ve el usuario. Es la única forma de comprobar que los dos
   * extremos —lo que escribe la activación y lo que lee la pantalla— siguen de
   * acuerdo.
   */
  async function clientsView(brandId: string) {
    H.current!.store.agents = [
      { id: "auth-user-1", organization_id: ORG, role: "admin", member_type: "agency_user" },
    ];
    const response = (await listClients()) as Response;
    const body = await response.json();
    const brand = (body.clients as Array<Record<string, unknown>>).find(
      (row) => row.id === brandId,
    );
    return (brand as { channels: Record<string, BrandChannelStatus> }).channels;
  }

  it("Messenger: /clients NO muestra conectado tras cambiar a un activo que falla", async () => {
    const brand = BRANDS[0];
    await connectMeta(brand, { flow: "facebook" });
    // Antes del cambio la pantalla sí lo daba por conectado.
    expect(isChannelConnected((await clientsView(brand.id)).messenger)).toBe(true);

    const paginaB = "page-b-nueva";
    H.failPage = paginaB;
    await connectMeta({ ...brand, pageId: paginaB }, { flow: "facebook" });

    const channels = await clientsView(brand.id);
    expect(channels.messenger.state).toBe("error");
    expect(isChannelConnected(channels.messenger)).toBe(false);
    expect(needsActivation(channels.messenger)).toBe(true);
    expect(channels.messenger.activationError).toBeTruthy();
  });

  it("Instagram: /clients muestra activación pendiente tras cambiar de cuenta y fallar", async () => {
    const brand = BRANDS[1];
    await connectMeta(brand);
    expect(isChannelConnected((await clientsView(brand.id)).instagram)).toBe(true);

    const cuentaB = "ig-b-nueva";
    H.failPage = brand.pageId;
    await connectMeta({ ...brand, igId: cuentaB });

    const channels = await clientsView(brand.id);
    expect(channels.instagram.state).toBe("error");
    expect(needsActivation(channels.instagram)).toBe(true);
    // Messenger no se contagia: su activo no cambió y su suscripción sigue bien.
    expect(isChannelConnected(channels.messenger)).toBe(true);
  });

  it("WhatsApp: /clients muestra activación pendiente tras cambiar de WABA y fallar", async () => {
    const brand = BRANDS[3];
    await connectWhatsApp(brand);
    expect(isChannelConnected((await clientsView(brand.id)).whatsapp)).toBe(true);

    H.failWaba = "waba-b-nueva";
    await connectWhatsApp({ ...brand, wabaId: "waba-b-nueva" });

    const channels = await clientsView(brand.id);
    expect(channels.whatsapp.state).toBe("error");
    expect(needsActivation(channels.whatsapp)).toBe(true);
  });

  it("reconectar el MISMO activo y fallar deja /clients mostrando conectado", async () => {
    const brand = BRANDS[7];
    await connectMeta(brand, { flow: "facebook" });

    H.failPage = brand.pageId;
    await connectMeta(brand, { flow: "facebook" });

    // La suscripción anterior sigue vigente: el canal recibe y la pantalla debe
    // decirlo. Lo contrario asustaría sobre un canal que funciona.
    const channels = await clientsView(brand.id);
    expect(channels.messenger.state).toBe("active");
    expect(isChannelConnected(channels.messenger)).toBe(true);
  });

  it("Messenger: el activo viejo deja de recibir, y el nuevo tampoco recibe", async () => {
    const brand = BRANDS[0];
    await connectMeta(brand, { flow: "facebook" });
    const paginaB = "page-b-nueva";
    H.failPage = paginaB;
    await connectMeta({ ...brand, pageId: paginaB }, { flow: "facebook" });

    await deliverWebhook(messengerPayload(brand.pageId, "de la vieja"), "messenger");
    await deliverWebhook(messengerPayload(paginaB, "de la nueva"), "messenger");

    // Ninguno entrega: el canal está en error. Es lo correcto — lo que no puede
    // pasar es decir «conectado» mientras no llega nada.
    expect(H.current!.store.messages).toHaveLength(0);
  });

  it("Instagram: cuenta A activa → cuenta B falla ⇒ error y activación pendiente", async () => {
    const brand = BRANDS[1];
    await connectMeta(brand);
    expect(channelOf(brand.id, "instagram")!.status).toBe("active");

    const cuentaB = "ig-b-nueva";
    H.failPage = brand.pageId;
    const response = await connectMeta({ ...brand, igId: cuentaB });

    const channel = channelOf(brand.id, "instagram")!;
    expect(location(response)).toContain("meta_error");
    expect(channel.meta_business_id).toBe(cuentaB);
    expect(channel.status).toBe("error");
    expect((channel.config as Record<string, unknown>).webhook_subscribed).toBe(false);
    expect((channel.config as Record<string, unknown>).activation_error).toBeTruthy();
  });

  it("Instagram directo: cuenta A activa → cuenta B falla ⇒ error", async () => {
    const brand = BRANDS[2];
    await connectInstagramDirect(brand);
    expect(channelOf(brand.id, "instagram")!.status).toBe("active");

    const cuentaB = "ig-directo-b";
    H.failInstagram = cuentaB;
    const response = await connectInstagramDirect(brand, cuentaB);

    const channel = channelOf(brand.id, "instagram")!;
    expect(location(response)).toContain("meta_error");
    expect(channel.meta_business_id).toBe(cuentaB);
    expect(channel.status).toBe("error");
    expect((channel.config as Record<string, unknown>).webhook_subscribed).toBe(false);
  });

  it("WhatsApp: el mismo número con OTRO WABA es un activo nuevo", async () => {
    const brand = BRANDS[3];
    await connectWhatsApp(brand);
    expect(channelOf(brand.id, "whatsapp_business_api")!.status).toBe("active");

    // El número se movió a otra cuenta de WhatsApp Business. La suscripción
    // anterior iba contra el WABA viejo, así que no cubre este.
    const wabaB = "waba-b-nueva";
    H.failWaba = wabaB;
    const response = await connectWhatsApp({ ...brand, wabaId: wabaB });

    const channel = channelOf(brand.id, "whatsapp_business_api")!;
    expect(response.status).toBe(502);
    expect(channel.whatsapp_business_account_id).toBe(wabaB);
    expect(channel.status).toBe("error");
    expect((channel.config as Record<string, unknown>).webhook_subscribed).toBe(false);
  });

  it("WhatsApp: mismo número y mismo WABA sí conserva la operación", async () => {
    const brand = BRANDS[4];
    await connectWhatsApp(brand);

    H.failWaba = brand.wabaId;
    const response = await connectWhatsApp(brand);

    const channel = channelOf(brand.id, "whatsapp_business_api")!;
    expect(response.status).toBe(502);
    // Se informa el fallo, pero el canal sigue recibiendo por la suscripción
    // anterior, que no ha dejado de existir.
    expect(channel.status).toBe("active");
    expect((channel.config as Record<string, unknown>).webhook_subscribed).toBe(true);
    expect((channel.config as Record<string, unknown>).activation_warning).toBeTruthy();
  });

  it("cambiar de activo con éxito sí conecta, y limpia los indicadores viejos", async () => {
    const brand = BRANDS[5];
    await connectMeta(brand, { flow: "facebook" });

    const paginaB = "page-b-buena";
    const response = await connectMeta({ ...brand, pageId: paginaB }, { flow: "facebook" });

    const channel = channelOf(brand.id, "facebook_messenger")!;
    expect(location(response)).toContain("meta_success");
    expect(channel.status).toBe("active");
    expect(channel.meta_business_id).toBe(paginaB);
    expect((channel.config as Record<string, unknown>).webhook_subscribed).toBe(true);
    expect(H.subscribed).toContain(`page:${paginaB}`);
  });

  it("un canal activo pero con webhook_subscribed=false no protege al activo nuevo", async () => {
    const brand = BRANDS[6];
    await connectMeta(brand, { flow: "facebook" });
    // Estado incoherente heredado: activo pero con la suscripción marcada como
    // fallida. No puede contar como «ya operativo».
    (channelOf(brand.id, "facebook_messenger")!.config as Record<string, unknown>).webhook_subscribed =
      false;

    H.failPage = brand.pageId;
    await connectMeta(brand, { flow: "facebook" });

    expect(channelOf(brand.id, "facebook_messenger")!.status).toBe("error");
  });

  it("wasAssetOperational exige estado, indicador e identidad", () => {
    const base = { status: "active", config: {} as Record<string, unknown> };

    expect(wasAssetOperational({ ...base, assetPairs: [["page-a", "page-a"]] })).toBe(true);
    // Activo distinto.
    expect(wasAssetOperational({ ...base, assetPairs: [["page-a", "page-b"]] })).toBe(false);
    // Estado no activo.
    expect(
      wasAssetOperational({ ...base, status: "error", assetPairs: [["page-a", "page-a"]] }),
    ).toBe(false);
    // Suscripción marcada como fallida.
    expect(
      wasAssetOperational({
        ...base,
        config: { webhook_subscribed: false },
        assetPairs: [["page-a", "page-a"]],
      }),
    ).toBe(false);
    // Canal histórico sin el indicador: se le concede el beneficio de la duda.
    expect(
      wasAssetOperational({
        ...base,
        config: { legacy_id: "page-a" },
        assetPairs: [["page-a", "page-a"]],
      }),
    ).toBe(true);
    // Un identificador ausente no demuestra identidad.
    expect(wasAssetOperational({ ...base, assetPairs: [[null, "page-a"]] })).toBe(false);
    expect(wasAssetOperational({ ...base, assetPairs: [["", ""]] })).toBe(false);
    // WhatsApp: los dos identificadores tienen que coincidir.
    expect(
      wasAssetOperational({
        ...base,
        assetPairs: [
          ["pn-1", "pn-1"],
          ["waba-1", "waba-2"],
        ],
      }),
    ).toBe(false);
    expect(
      wasAssetOperational({
        ...base,
        assetPairs: [
          ["pn-1", "pn-1"],
          ["waba-1", "waba-1"],
        ],
      }),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4 · Fallos de escritura: nunca «conectado» a medias
// ---------------------------------------------------------------------------
describe("4 · Fallo al escribir smarttalk.channels", () => {
  it("no muestra éxito y revierte la cuenta legacy recién creada", async () => {
    const brand = BRANDS[0];
    // El INSERT de channels falla; el SELECT previo, no.
    H.current = createFakeSupabase({
      currentUserId: "auth-user-1",
      errorOn: { channels: { insert: { code: "42501", message: "permission denied" } } },
      tables: {
        cm_oauth_states: [],
        cm_clients: [
          { id: brand.id, name: brand.name, status: "active", smarttalk_organization_id: ORG, user_id: "u1" },
        ],
        cm_social_accounts: [],
        cm_activity_log: [],
        channels: [],
        organizations: [{ id: ORG, name: "Agencia" }],
        subscriptions: [],
        plan_entitlements: [],
      },
    });

    const response = await connectMeta(brand, { flow: "facebook" });

    expect(location(response)).toContain("meta_error");
    expect(location(response)).not.toContain("meta_success");
    expect(H.current.store.channels).toHaveLength(0);
    // La compensación: nada de la cuenta legacy sobrevive al fallo.
    expect(H.current.store.cm_social_accounts).toHaveLength(0);
    // Y no se suscribió nada: el activo queda libre.
    expect(H.subscribed).toHaveLength(0);
  });

  it("una cuenta legacy que YA existía vuelve a sus valores previos", async () => {
    const brand = BRANDS[0];
    H.current = createFakeSupabase({
      currentUserId: "auth-user-1",
      errorOn: { channels: { insert: { code: "42501", message: "permission denied" } } },
      tables: {
        cm_oauth_states: [],
        cm_clients: [
          { id: brand.id, name: brand.name, status: "active", smarttalk_organization_id: ORG, user_id: "u1" },
        ],
        cm_social_accounts: [
          {
            id: "social-previo",
            client_id: brand.id,
            page_id: "page-anterior",
            page_name: "Página anterior",
            page_access_token_ciphertext: "enc:TOKEN-ANTERIOR",
          },
        ],
        cm_activity_log: [],
        channels: [],
        organizations: [{ id: ORG, name: "Agencia" }],
        subscriptions: [],
        plan_entitlements: [],
      },
    });

    await connectMeta(brand, { flow: "facebook" });

    const social = H.current.store.cm_social_accounts[0];
    expect(H.current.store.cm_social_accounts).toHaveLength(1);
    expect(social.page_id).toBe("page-anterior");
    expect(social.page_name).toBe("Página anterior");
    expect(social.page_access_token_ciphertext).toBe("enc:TOKEN-ANTERIOR");
  });

  it("si falla justo después de guardar la cuenta legacy, no queda canal huérfano", async () => {
    const brand = BRANDS[0];
    H.current = createFakeSupabase({
      currentUserId: "auth-user-1",
      // El SELECT de channels dentro de ensureMetaChannelsReady falla: el punto
      // exacto entre «cuenta legacy guardada» y «canal creado».
      errorOn: { channels: { select: { code: "57014", message: "statement timeout" } } },
      tables: {
        cm_oauth_states: [],
        cm_clients: [
          { id: brand.id, name: brand.name, status: "active", smarttalk_organization_id: ORG, user_id: "u1" },
        ],
        cm_social_accounts: [],
        cm_activity_log: [],
        channels: [],
        organizations: [{ id: ORG, name: "Agencia" }],
        subscriptions: [],
        plan_entitlements: [],
      },
    });

    const response = await connectMeta(brand, { flow: "facebook" });

    expect(location(response)).toContain("meta_error");
    expect(H.current.store.channels).toHaveLength(0);
    expect(H.current.store.cm_social_accounts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5 · Concurrencia
// ---------------------------------------------------------------------------
describe("5 · Dos solicitudes simultáneas sobre el mismo activo", () => {
  /**
   * El fake emula el índice único de la migración 038, que es lo que cierra la
   * carrera de verdad: `findAssetConflict` es un SELECT seguido de un INSERT y
   * dos peticiones simultáneas leen lo mismo y concluyen lo mismo.
   */
  function seedWithUniqueIndex(columns: string[][]) {
    H.current = createFakeSupabase({
      currentUserId: "auth-user-1",
      uniqueIndexes: { channels: columns },
      tables: {
        cm_oauth_states: [],
        cm_clients: BRANDS.map((brand) => ({
          id: brand.id,
          name: brand.name,
          status: "active",
          smarttalk_organization_id: ORG,
          user_id: "u1",
        })),
        cm_social_accounts: [],
        cm_whatsapp_accounts: [],
        cm_activity_log: [],
        channels: [],
        organizations: [{ id: ORG, name: "Agencia" }],
        subscriptions: [],
        plan_entitlements: [],
      },
    });
  }

  it("dos marcas reclamando la MISMA página: gana exactamente una", async () => {
    seedWithUniqueIndex([["type", "meta_business_id"]]);
    const disputada = { ...BRANDS[0] };

    const [primera, segunda] = await Promise.all([
      connectMeta({ ...BRANDS[0], pageId: disputada.pageId }, { flow: "facebook" }),
      connectMeta({ ...BRANDS[1], pageId: disputada.pageId }, { flow: "facebook" }),
    ]);

    const urls = [location(primera), location(segunda)];
    expect(urls.filter((url) => url.includes("meta_success"))).toHaveLength(1);
    expect(urls.filter((url) => url.includes("meta_error"))).toHaveLength(1);

    const conLaPagina = channels().filter((row) => row.meta_business_id === disputada.pageId);
    expect(conLaPagina).toHaveLength(1);
  });

  it("la perdedora recibe un error explícito y no deja conexión parcial", async () => {
    seedWithUniqueIndex([["type", "meta_business_id"]]);
    const pageId = BRANDS[0].pageId;

    const [primera, segunda] = await Promise.all([
      connectMeta({ ...BRANDS[0], pageId }, { flow: "facebook" }),
      connectMeta({ ...BRANDS[1], pageId }, { flow: "facebook" }),
    ]);

    const perdedora = location(primera).includes("meta_error") ? primera : segunda;
    expect(location(perdedora)).toContain("ya está conectado a otra marca");

    // Una sola cuenta legacy: la de la ganadora. La perdedora se compensó.
    expect(H.current!.store.cm_social_accounts).toHaveLength(1);
  });

  it("dos marcas reclamando la MISMA cuenta de Instagram: gana exactamente una", async () => {
    seedWithUniqueIndex([["type", "meta_business_id"]]);
    const igId = "ig-disputada";

    await Promise.all([
      connectMeta({ ...BRANDS[0], igId }),
      connectMeta({ ...BRANDS[1], igId }),
    ]);

    expect(channels().filter((row) => row.meta_business_id === igId)).toHaveLength(1);
  });

  it("dos marcas reclamando el MISMO número de WhatsApp: gana exactamente una", async () => {
    seedWithUniqueIndex([["whatsapp_phone_number_id"]]);
    const phoneId = "pn-disputado";

    const [primera, segunda] = await Promise.all([
      connectWhatsApp({ ...BRANDS[0], phoneId }),
      connectWhatsApp({ ...BRANDS[1], phoneId }),
    ]);

    const estados = [primera.status, segunda.status].sort();
    expect(estados).toEqual([200, 409]);
    expect(channels().filter((row) => row.whatsapp_phone_number_id === phoneId)).toHaveLength(1);

    const perdedora = primera.status === 409 ? primera : segunda;
    expect((await perdedora.json()).code).toBe("asset_already_connected");
  });

  it("dos conexiones simultáneas sobre la MISMA marca no duplican canales", async () => {
    seedWithUniqueIndex([["type", "meta_business_id"]]);
    const brand = BRANDS[0];

    await Promise.all([
      connectMeta(brand, { flow: "facebook" }),
      connectMeta(brand, { flow: "facebook" }),
    ]);

    expect(channels().filter((row) => row.brand_id === brand.id)).toHaveLength(1);
    expect(H.current!.store.cm_social_accounts).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 6 · Reconexión idempotente
// ---------------------------------------------------------------------------
describe("6 · Reconectar actualiza; nunca duplica ni mueve", () => {
  it("reconectar la misma marca conserva la fila y renueva el token cifrado", async () => {
    const brand = BRANDS[0];
    await connectMeta(brand);
    const antes = channelOf(brand.id, "facebook_messenger")!;
    const idAntes = antes.id;

    // Segunda vuelta con un token distinto.
    H.pages = [];
    await connectMeta({ ...brand, pageToken: "TOKEN-RENOVADO" });

    const despues = channelOf(brand.id, "facebook_messenger")!;
    expect(channels().filter((row) => row.brand_id === brand.id)).toHaveLength(2); // fb + ig
    expect(despues.id).toBe(idAntes);
    expect(despues.access_token_ciphertext).toBe("enc:TOKEN-RENOVADO");
    expect(despues.access_token).toBeNull();
  });

  it("no cambia brand_id ni organization_id", async () => {
    const brand = BRANDS[0];
    await connectMeta(brand);
    await connectMeta(brand);

    const channel = channelOf(brand.id, "facebook_messenger")!;
    expect(channel.brand_id).toBe(brand.id);
    expect(channel.organization_id).toBe(ORG);
  });

  it("conserva contactos, conversaciones y mensajes", async () => {
    const brand = BRANDS[0];
    await connectMeta(brand);
    await deliverWebhook(messengerPayload(brand.pageId, "antes de reconectar"), "messenger");
    expect(H.current!.store.messages).toHaveLength(1);

    await connectMeta(brand);

    expect(H.current!.store.contacts).toHaveLength(1);
    expect(H.current!.store.conversations).toHaveLength(1);
    expect(H.current!.store.messages).toHaveLength(1);
  });

  it("reconectar Facebook no borra el canal de Instagram", async () => {
    const brand = BRANDS[0];
    await connectMeta(brand); // flujo con Instagram
    expect(channelOf(brand.id, "instagram")).toBeTruthy();

    await connectMeta(brand, { flow: "facebook" }); // sólo Facebook

    expect(channelOf(brand.id, "instagram")).toBeTruthy();
    expect(channelOf(brand.id, "instagram")!.meta_business_id).toBe(brand.igId);
  });

  it("reconectar Meta no altera el canal de WhatsApp", async () => {
    const brand = BRANDS[0];
    await connectWhatsApp(brand);
    const waAntes = { ...channelOf(brand.id, "whatsapp_business_api")! };

    await connectMeta(brand);

    const waDespues = channelOf(brand.id, "whatsapp_business_api")!;
    expect(waDespues.id).toBe(waAntes.id);
    expect(waDespues.whatsapp_phone_number_id).toBe(brand.phoneId);
    expect(waDespues.status).toBe("active");
  });

  it("reconectar WhatsApp no altera los canales de Meta", async () => {
    const brand = BRANDS[0];
    await connectMeta(brand);
    const fbAntes = { ...channelOf(brand.id, "facebook_messenger")! };

    await connectWhatsApp(brand);
    await connectWhatsApp(brand);

    expect(channels().filter((row) => row.type === "whatsapp_business_api")).toHaveLength(1);
    expect(channelOf(brand.id, "facebook_messenger")!.id).toBe(fbAntes.id);
    expect(channelOf(brand.id, "facebook_messenger")!.meta_business_id).toBe(brand.pageId);
  });

  it("reconectar WhatsApp no crea una segunda fila legacy", async () => {
    const brand = BRANDS[0];
    await connectWhatsApp(brand);
    await connectWhatsApp(brand);

    expect(H.current!.store.cm_whatsapp_accounts).toHaveLength(1);
    expect(H.current!.store.cm_whatsapp_accounts[0].client_id).toBe(brand.id);
  });

  it("elegir un activo distinto valida primero el conflicto", async () => {
    // La marca 1 ya tiene la página; la marca 0 intenta reconectar con ella.
    await connectMeta(BRANDS[1], { flow: "facebook" });
    const response = await connectMeta(
      { ...BRANDS[0], pageId: BRANDS[1].pageId },
      { flow: "facebook" },
    );

    expect(location(response)).toContain("ya está conectado a la marca");
    expect(location(response)).toContain(BRANDS[1].name);
    // Y no se escribió nada en la marca 0.
    expect(channelOf(BRANDS[0].id, "facebook_messenger")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 7 · Aislamiento entre organizaciones y marcas
// ---------------------------------------------------------------------------
describe("7 · Aislamiento organization_id + brand_id", () => {
  /**
   * Una página conectada en OTRA agencia sí bloquea, y debe bloquear.
   *
   * La versión anterior de esta prueba afirmaba lo contrario —«no bloquea,
   * porque el aislamiento entre agencias es previo»— y contradecía la migración
   * 038, que impone unicidad **global** sobre `(type, meta_business_id)`. La
   * unicidad es global a propósito: Meta enruta los webhooks por el activo, no
   * por la organización, y `findMatchingChannel` no filtra por agencia. Dos
   * agencias con la misma página producirían `ambiguous channel routing` y
   * ninguna de las dos recibiría nada.
   *
   * Lo que sí sigue siendo cierto es que la agencia vecina no se menciona ni se
   * toca: `findAssetConflict` filtra por organización a propósito, para no
   * revelar el nombre de la marca ajena, así que el bloqueo llega de la base.
   */
  function seedVecina(uniqueIndexes = true) {
    H.current = createFakeSupabase({
      currentUserId: "auth-user-1",
      ...(uniqueIndexes
        ? { uniqueIndexes: { channels: [["type", "meta_business_id"]] } }
        : {}),
      tables: {
        cm_oauth_states: [],
        cm_clients: [
          ...BRANDS.map((brand) => ({
            id: brand.id,
            name: brand.name,
            status: "active",
            smarttalk_organization_id: ORG,
            user_id: "u1",
          })),
          {
            id: "brand-vecina",
            name: "Marca Vecina",
            status: "active",
            smarttalk_organization_id: OTHER_ORG,
            user_id: "u2",
          },
        ],
        cm_social_accounts: [],
        cm_whatsapp_accounts: [],
        cm_activity_log: [],
        channels: [
          {
            id: "ch-vecina",
            organization_id: OTHER_ORG,
            brand_id: "brand-vecina",
            type: "facebook_messenger",
            meta_business_id: BRANDS[0].pageId,
            status: "active",
            access_token_ciphertext: "enc:TOKEN-VECINA",
            config: { legacy_id: BRANDS[0].pageId },
          },
        ],
        organizations: [{ id: ORG, name: "Agencia" }],
        subscriptions: [],
        plan_entitlements: [],
        contacts: [],
        conversations: [],
        messages: [],
        webhook_events: [],
      },
    });
  }

  it("la misma página en otra agencia queda bloqueada: sólo una gana", async () => {
    seedVecina();

    const response = await connectMeta(BRANDS[0], { flow: "facebook" });

    expect(location(response)).toContain("meta_error");
    expect(location(response)).not.toContain("meta_success");
    // Un solo canal con esa página en toda la plataforma.
    expect(channels().filter((row) => row.meta_business_id === BRANDS[0].pageId)).toHaveLength(1);
  });

  it("el canal ganador de la otra agencia no se modifica ni se elimina", async () => {
    seedVecina();
    const antes = JSON.stringify(channels().find((row) => row.id === "ch-vecina"));

    await connectMeta(BRANDS[0], { flow: "facebook" });

    const vecina = channels().find((row) => row.id === "ch-vecina");
    expect(vecina).toBeTruthy();
    expect(JSON.stringify(vecina)).toBe(antes);
    expect(vecina!.brand_id).toBe("brand-vecina");
    expect(vecina!.organization_id).toBe(OTHER_ORG);
    expect(vecina!.status).toBe("active");
    expect(vecina!.access_token_ciphertext).toBe("enc:TOKEN-VECINA");
  });

  it("la perdedora no deja conexión parcial ni canal propio", async () => {
    seedVecina();

    await connectMeta(BRANDS[0], { flow: "facebook" });

    expect(channelOf(BRANDS[0].id, "facebook_messenger")).toBeUndefined();
    // La compensación borró la cuenta legacy que se había escrito antes.
    expect(H.current!.store.cm_social_accounts).toHaveLength(0);
    // Y no se suscribió nada: el activo sigue siendo de la agencia vecina.
    expect(H.subscribed).toHaveLength(0);
  });

  it("el bloqueo no revela el nombre de la marca de la otra agencia", async () => {
    seedVecina();

    const response = await connectMeta(BRANDS[0], { flow: "facebook" });

    expect(location(response)).not.toContain("Marca Vecina");
    expect(location(response)).not.toContain("brand-vecina");
  });

  it("el webhook de esa página sigue llegando a la agencia que la tiene", async () => {
    seedVecina();
    await connectMeta(BRANDS[0], { flow: "facebook" });

    await deliverWebhook(messengerPayload(BRANDS[0].pageId, "para la vecina"), "messenger");

    const conversations = H.current!.store.conversations as Array<Record<string, unknown>>;
    expect(conversations).toHaveLength(1);
    expect(conversations[0].brand_id).toBe("brand-vecina");
    expect(conversations[0].organization_id).toBe(OTHER_ORG);
  });

  it("sin el índice 038 la carrera queda abierta: por eso la migración hace falta", async () => {
    // Documenta el riesgo residual que la migración cierra. Sin unicidad en
    // base, la conexión pasa y quedan DOS canales con la misma página —el caso
    // que `findMatchingChannel` rechaza con `ambiguous channel routing`—.
    seedVecina(false);

    await connectMeta(BRANDS[0], { flow: "facebook" });

    expect(channels().filter((row) => row.meta_business_id === BRANDS[0].pageId)).toHaveLength(2);
    await deliverWebhook(messengerPayload(BRANDS[0].pageId, "ambiguo"), "messenger");
    // Prefiere no entregar a entregar a la marca equivocada.
    expect(H.current!.store.messages).toHaveLength(0);
  });

  it("el token de una marca no se copia a otra", async () => {
    await connectMeta(BRANDS[0]);
    await connectMeta(BRANDS[1]);

    expect(channelOf(BRANDS[0].id, "facebook_messenger")!.access_token_ciphertext).toBe(
      `enc:${BRANDS[0].pageToken}`,
    );
    expect(channelOf(BRANDS[1].id, "facebook_messenger")!.access_token_ciphertext).toBe(
      `enc:${BRANDS[1].pageToken}`,
    );
  });

  it("reconectar una marca no modifica los canales de otra", async () => {
    await connectMeta(BRANDS[0]);
    await connectMeta(BRANDS[1]);
    const antes = JSON.stringify(channels().filter((row) => row.brand_id === BRANDS[1].id));

    await connectMeta({ ...BRANDS[0], pageToken: "TOKEN-NUEVO-SOLO-DE-0" });

    expect(JSON.stringify(channels().filter((row) => row.brand_id === BRANDS[1].id))).toBe(antes);
  });

  it("los mensajes de dos marcas no se cruzan", async () => {
    await connectMeta(BRANDS[0]);
    await connectMeta(BRANDS[1]);

    await deliverWebhook(messengerPayload(BRANDS[0].pageId, "para cero"), "messenger");
    await deliverWebhook(messengerPayload(BRANDS[1].pageId, "para uno"), "messenger");

    const conversations = H.current!.store.conversations as Array<Record<string, unknown>>;
    const canalDe0 = channelOf(BRANDS[0].id, "facebook_messenger")!.id;
    const canalDe1 = channelOf(BRANDS[1].id, "facebook_messenger")!.id;
    expect(conversations.find((row) => row.channel_id === canalDe0)!.brand_id).toBe(BRANDS[0].id);
    expect(conversations.find((row) => row.channel_id === canalDe1)!.brand_id).toBe(BRANDS[1].id);
  });

  it("un activo duplicado en dos marcas hace que el webhook rechace el evento, no que elija", async () => {
    await connectMeta(BRANDS[0], { flow: "facebook" });
    // Duplicado forzado, como el que existiría en datos antiguos sin el índice
    // único de la migración 038.
    channels().push({
      id: "ch-duplicado",
      organization_id: ORG,
      brand_id: BRANDS[1].id,
      type: "facebook_messenger",
      meta_business_id: BRANDS[0].pageId,
      status: "active",
      config: {},
    });

    await deliverWebhook(messengerPayload(BRANDS[0].pageId, "ambiguo"), "messenger");

    // Prefiere no entregar a entregar a la marca equivocada.
    expect(H.current!.store.messages).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 8 · Marca pausada
// ---------------------------------------------------------------------------
describe("8 · Pausa y reactivación de marca", () => {
  function pause(brandId: string) {
    const brand = (H.current!.store.cm_clients as Array<Record<string, unknown>>).find(
      (row) => row.id === brandId,
    )!;
    brand.status = "paused";
  }

  function resume(brandId: string) {
    const brand = (H.current!.store.cm_clients as Array<Record<string, unknown>>).find(
      (row) => row.id === brandId,
    )!;
    brand.status = "active";
  }

  it("no se puede conectar Meta a una marca inactiva", async () => {
    const brand = BRANDS[0];
    pause(brand.id);

    const response = await connectMeta(brand, { flow: "facebook" });

    expect(location(response)).toContain("Esta marca está inactiva");
    expect(channels()).toHaveLength(0);
    expect(H.current!.store.cm_social_accounts).toHaveLength(0);
  });

  it("no se puede conectar WhatsApp a una marca inactiva", async () => {
    const brand = BRANDS[0];
    pause(brand.id);

    const response = await connectWhatsApp(brand);

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("inactive_brand");
    expect(H.current!.store.cm_whatsapp_accounts).toHaveLength(0);
    expect(channels()).toHaveLength(0);
  });

  it("una marca pausada no retiene su activo: otra marca puede reclamarlo", async () => {
    await connectMeta(BRANDS[0], { flow: "facebook" });
    pause(BRANDS[0].id);
    // La pausa deja el canal fuera de juego; en producción lo hace el ciclo de
    // vida de la marca. Aquí se reproduce el estado resultante.
    channelOf(BRANDS[0].id, "facebook_messenger")!.status = "disconnected";

    const response = await connectMeta(
      { ...BRANDS[1], pageId: BRANDS[0].pageId },
      { flow: "facebook" },
    );

    expect(location(response)).toContain("meta_success");
  });

  it("reactivar la marca permite volver a conectar", async () => {
    const brand = BRANDS[0];
    pause(brand.id);
    await connectMeta(brand, { flow: "facebook" });
    expect(channels()).toHaveLength(0);

    resume(brand.id);
    const response = await connectMeta(brand, { flow: "facebook" });

    expect(location(response)).toContain("meta_success");
    expect(channelOf(brand.id, "facebook_messenger")!.status).toBe("active");
  });

  it("un webhook para una marca pausada no encuentra canal", async () => {
    const brand = BRANDS[0];
    await connectMeta(brand, { flow: "facebook" });
    pause(brand.id);

    await deliverWebhook(messengerPayload(brand.pageId, "marca pausada"), "messenger");

    expect(H.current!.store.messages).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 9 · Límites del plan
// ---------------------------------------------------------------------------
describe("9 · Cupo de canales", () => {
  function seedPlan(limit: number, existingChannels: Array<Record<string, unknown>> = []) {
    H.current = createFakeSupabase({
      currentUserId: "auth-user-1",
      tables: {
        cm_oauth_states: [],
        cm_clients: BRANDS.map((brand) => ({
          id: brand.id,
          name: brand.name,
          status: "active",
          smarttalk_organization_id: ORG,
          user_id: "u1",
        })),
        cm_social_accounts: [],
        cm_whatsapp_accounts: [],
        cm_activity_log: [],
        channels: existingChannels,
        organizations: [orgRow({ id: ORG })],
        subscriptions: [subscriptionRow({ organization_id: ORG })],
        plan_entitlements: [entitlementRow("channels.active", limit)],
        billing_decision_events: [],
      },
    });
    process.env.BILLING_ENFORCEMENT_MODE = "hard";
  }

  it("con el cupo agotado, conectar se bloquea y no escribe nada", async () => {
    seedPlan(2, [
      { id: "ch-1", organization_id: ORG, brand_id: BRANDS[9].id, type: "instagram", status: "active" },
      { id: "ch-2", organization_id: ORG, brand_id: BRANDS[9].id, type: "whatsapp_business_api", status: "active" },
    ]);

    const response = await connectMeta(BRANDS[0], { flow: "facebook" });

    expect(location(response)).toContain("El plan contratado no permite conectar mas canales");
    expect(channels()).toHaveLength(2);
    expect(H.current!.store.cm_social_accounts).toHaveLength(0);
  });

  it("una reconexión NO consume cupo adicional", async () => {
    seedPlan(1);
    await connectMeta(BRANDS[0], { flow: "facebook" });
    expect(channels()).toHaveLength(1);

    // El cupo es 1 y ya está consumido; reconectar la misma marca debe pasar.
    const response = await connectMeta(BRANDS[0], { flow: "facebook" });

    expect(location(response)).toContain("meta_success");
    expect(channels()).toHaveLength(1);
  });

  it("una conexión bloqueada por cupo no deja reserva ni canal", async () => {
    seedPlan(1, [
      { id: "ch-1", organization_id: ORG, brand_id: BRANDS[9].id, type: "instagram", status: "active" },
    ]);

    await connectMeta(BRANDS[0], { flow: "facebook" });

    expect(channels()).toHaveLength(1);
    expect(channels()[0].id).toBe("ch-1");
    expect(H.subscribed).toHaveLength(0);
  });

  it("un canal desconectado libera cupo", async () => {
    seedPlan(1, [
      {
        id: "ch-1",
        organization_id: ORG,
        brand_id: BRANDS[9].id,
        type: "instagram",
        status: "disconnected",
      },
    ]);

    const response = await connectMeta(BRANDS[0], { flow: "facebook" });
    expect(location(response)).toContain("meta_success");
  });

  it("el superadministrador conserva su bypass", async () => {
    seedPlan(0, [
      { id: "ch-1", organization_id: ORG, brand_id: BRANDS[9].id, type: "instagram", status: "active" },
    ]);
    H.current!.store.agents = [
      { id: "auth-user-1", is_super_admin: true, organization_id: ORG },
    ];

    const response = await connectMeta(BRANDS[0], { flow: "facebook" });
    expect(location(response)).toContain("meta_success");
  });
});

// ---------------------------------------------------------------------------
// 9 bis · Instagram Business Login directo
// ---------------------------------------------------------------------------
describe("9 bis · Instagram por login directo (sin página de Facebook)", () => {
  it("crea el canal operativo antes de declarar el éxito", async () => {
    const brand = BRANDS[0];
    const response = await connectInstagramDirect(brand);

    expect(location(response)).toContain("meta_success");
    const channel = channelOf(brand.id, "instagram")!;
    expect(channel).toBeTruthy();
    expect(channel.status).toBe("active");
    expect(channel.meta_business_id).toBe(brand.igId);
    expect(channel.organization_id).toBe(ORG);
  });

  it("el webhook inmediatamente posterior encuentra su canal", async () => {
    const brand = BRANDS[0];
    await connectInstagramDirect(brand);

    await deliverWebhook(instagramPayload(brand.igId, "directo e inmediato"), "instagram");

    const conversation = (H.current!.store.conversations as Array<Record<string, unknown>>)[0];
    expect(conversation.brand_id).toBe(brand.id);
    expect(conversation.channel_id).toBe(channelOf(brand.id, "instagram")!.id);
  });

  it("si la suscripción falla no dice «conectado» y el canal queda en error", async () => {
    const brand = BRANDS[0];
    H.failInstagram = brand.igId;

    const response = await connectInstagramDirect(brand);

    expect(location(response)).toContain("meta_error");
    expect(location(response)).not.toContain("meta_success");
    expect(channelOf(brand.id, "instagram")!.status).toBe("error");
  });

  it("una cuenta ya conectada en otra marca queda bloqueada", async () => {
    await connectInstagramDirect(BRANDS[1]);
    const response = await connectInstagramDirect(BRANDS[0], BRANDS[1].igId);

    expect(location(response)).toContain("ya está conectado a la marca");
    expect(channelOf(BRANDS[0].id, "instagram")).toBeUndefined();
  });

  it("no se puede conectar a una marca inactiva", async () => {
    const brand = BRANDS[0];
    (H.current!.store.cm_clients as Array<Record<string, unknown>>).find(
      (row) => row.id === brand.id,
    )!.status = "paused";

    const response = await connectInstagramDirect(brand);

    expect(location(response)).toContain("Esta marca está inactiva");
    expect(channels()).toHaveLength(0);
    expect(H.current!.store.cm_social_accounts).toHaveLength(0);
  });

  it("reconectar es idempotente: una sola fila y token renovado", async () => {
    const brand = BRANDS[0];
    await connectInstagramDirect(brand);
    const idAntes = channelOf(brand.id, "instagram")!.id;

    await connectInstagramDirect(brand);

    expect(channels().filter((row) => row.type === "instagram")).toHaveLength(1);
    expect(channelOf(brand.id, "instagram")!.id).toBe(idAntes);
    expect(channelOf(brand.id, "instagram")!.access_token_ciphertext).toBe("enc:TOKEN-IG-LARGO");
    expect(channelOf(brand.id, "instagram")!.access_token).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 9 ter · Reintento de activación
// ---------------------------------------------------------------------------
describe("9 ter · «Reintentar activación» recupera un canal en error", () => {
  /** Administrador de agencia autenticado, con acceso a todas las marcas. */
  function seedAdmin() {
    H.current!.store.agents = [
      {
        id: "auth-user-1",
        organization_id: ORG,
        role: "admin",
        member_type: "agency_user",
        is_super_admin: false,
      },
    ];
  }

  async function retry(channelId: string) {
    return (await retryActivation({} as never, {
      params: Promise.resolve({ id: channelId }),
    })) as Response;
  }

  it("un canal en error vuelve a 'active' sin repetir el OAuth", async () => {
    const brand = BRANDS[0];
    H.failPage = brand.pageId;
    await connectMeta(brand, { flow: "facebook" });
    expect(channelOf(brand.id, "facebook_messenger")!.status).toBe("error");

    seedAdmin();
    H.failPage = null; // Meta ya acepta la suscripción.
    const response = await retry(channelOf(brand.id, "facebook_messenger")!.id as string);

    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);
    expect(channelOf(brand.id, "facebook_messenger")!.status).toBe("active");
    expect(H.subscribed).toContain(`page:${brand.pageId}`);
  });

  it("tras el reintento el canal ya enruta los mensajes entrantes", async () => {
    const brand = BRANDS[0];
    H.failPage = brand.pageId;
    await connectMeta(brand, { flow: "facebook" });
    seedAdmin();
    H.failPage = null;
    await retry(channelOf(brand.id, "facebook_messenger")!.id as string);

    await deliverWebhook(messengerPayload(brand.pageId, "tras el reintento"), "messenger");

    expect(H.current!.store.messages).toHaveLength(1);
  });

  it("si el proveedor vuelve a rechazar, responde 502 y el canal sigue en error", async () => {
    const brand = BRANDS[0];
    H.failPage = brand.pageId;
    await connectMeta(brand, { flow: "facebook" });
    seedAdmin();

    const response = await retry(channelOf(brand.id, "facebook_messenger")!.id as string);
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.code).toBe("webhook_subscription_failed");
    expect(body.retryable).toBe(true);
    expect(channelOf(brand.id, "facebook_messenger")!.status).toBe("error");
  });

  it("no reactiva canales de otra organización", async () => {
    seedAdmin();
    channels().push({
      id: "ch-ajeno",
      organization_id: OTHER_ORG,
      brand_id: "brand-vecina",
      type: "facebook_messenger",
      status: "error",
      meta_business_id: "page-ajena",
      access_token_ciphertext: "enc:TOKEN-AJENO",
      config: {},
    });

    const response = await retry("ch-ajeno");

    expect(response.status).toBe(404);
    expect(channels().find((row) => row.id === "ch-ajeno")!.status).toBe("error");
  });

  it("no reactiva un canal de una marca inactiva", async () => {
    const brand = BRANDS[0];
    H.failPage = brand.pageId;
    await connectMeta(brand, { flow: "facebook" });
    seedAdmin();
    (H.current!.store.cm_clients as Array<Record<string, unknown>>).find(
      (row) => row.id === brand.id,
    )!.status = "paused";

    const response = await retry(channelOf(brand.id, "facebook_messenger")!.id as string);

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("inactive_brand");
  });

  it("un canal desconectado a propósito no se reactiva por aquí", async () => {
    const brand = BRANDS[0];
    await connectMeta(brand, { flow: "facebook" });
    seedAdmin();
    channelOf(brand.id, "facebook_messenger")!.status = "disconnected";

    const response = await retry(channelOf(brand.id, "facebook_messenger")!.id as string);

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("channel_disconnected");
  });

  it("la pantalla de canales ofrece la acción cuando el canal está en error", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/(dashboard)/settings/channels/page.tsx"),
      "utf8",
    );
    expect(source).toContain("channel-retry-activation");
    expect(source).toContain("Reintentar activación");
    expect(source).toContain("/retry-activation");
    expect(source).toContain('channel.status === "error"');
  });
});

// ---------------------------------------------------------------------------
// 10 · Tokens
// ---------------------------------------------------------------------------
describe("10 · Los tokens se guardan cifrados y no se exponen", () => {
  it("ningún canal guarda un token en claro", async () => {
    for (const brand of BRANDS.slice(0, 3)) {
      await connectMeta(brand);
      await connectWhatsApp(brand);
    }

    for (const row of channels()) {
      expect(row.access_token).toBeNull();
      expect(String(row.access_token_ciphertext)).toMatch(/^enc:/);
    }
  });

  it("la redirección de éxito no lleva ningún token", async () => {
    const brand = BRANDS[0];
    const response = await connectMeta(brand);
    const url = location(response);

    for (const secreto of [brand.pageToken, "TOKEN-USUARIO-LARGO", "TOKEN-CORTO"]) {
      expect(url).not.toContain(secreto);
    }
  });

  it("la respuesta de WhatsApp no devuelve el token al navegador", async () => {
    const brand = BRANDS[0];
    const response = await connectWhatsApp(brand);
    const serialized = JSON.stringify(await response.json());

    expect(serialized).not.toContain("TOKEN-WA-LARGO");
    expect(serialized).not.toContain("enc:");
  });

  it("la cuenta legacy tampoco guarda tokens en claro", async () => {
    await connectMeta(BRANDS[0]);

    const social = H.current!.store.cm_social_accounts[0];
    expect(social.access_token).toBeNull();
    expect(social.page_access_token).toBeNull();
    expect(social.access_token_ciphertext).toBe("enc:TOKEN-USUARIO-LARGO");
    expect(social.page_access_token_ciphertext).toBe(`enc:${BRANDS[0].pageToken}`);
  });
});

// ---------------------------------------------------------------------------
// 11 · El canal nace no-conectado
// ---------------------------------------------------------------------------
// El último hueco de la serie: `webhook_subscribed` ausente significa «canal
// histórico, no se sabe», y por compatibilidad el resumen lo muestra
// conectado. Entre crear la fila y guardar el veredicto ese campo no existía,
// así que un fallo del guardado final dejaba la fila `active` SIN el campo y
// /clients la pintaba verde sobre un webhook que nunca se suscribió.
//
// La corrección escribe `webhook_subscribed: false` ANTES de llamar al
// proveedor. Estas pruebas comprueban el ORDEN, que es lo que importa: el
// doble del proveedor registra el valor del campo en el instante mismo de la
// llamada.
describe("11 · webhook_subscribed=false se escribe antes de llamar al proveedor", () => {
  const flagAl = (key: string) => H.flagAtSubscribe.find((entry) => entry.key === key)?.flag;

  it("Messenger: al llamar a Meta el canal ya está marcado como no suscrito", async () => {
    const brand = BRANDS[0];
    await connectMeta(brand, { flow: "facebook" });

    expect(flagAl(`page:${brand.pageId}`)).toEqual([false]);
    // Y al terminar, con la suscripción confirmada, pasa a true.
    expect(
      (channelOf(brand.id, "facebook_messenger")!.config as Record<string, unknown>)
        .webhook_subscribed,
    ).toBe(true);
  });

  it("Instagram desde una página: mismo orden", async () => {
    const brand = BRANDS[1];
    await connectMeta(brand);

    expect(flagAl(`ig-via-page:${brand.igId}`)).toEqual([false]);
    expect(
      (channelOf(brand.id, "instagram")!.config as Record<string, unknown>).webhook_subscribed,
    ).toBe(true);
  });

  it("Instagram Business Login directo: mismo orden", async () => {
    const brand = BRANDS[2];
    await connectInstagramDirect(brand);

    expect(flagAl(`ig:${brand.igId}`)).toEqual([false]);
    expect(
      (channelOf(brand.id, "instagram")!.config as Record<string, unknown>).webhook_subscribed,
    ).toBe(true);
  });

  it("WhatsApp Embedded Signup: mismo orden", async () => {
    const brand = BRANDS[3];
    await connectWhatsApp(brand);

    expect(flagAl(`waba:${brand.wabaId}`)).toEqual([false]);
    expect(
      (channelOf(brand.id, "whatsapp_business_api")!.config as Record<string, unknown>)
        .webhook_subscribed,
    ).toBe(true);
  });

  it("al CAMBIAR de activo el indicador se resetea antes de llamar al proveedor", async () => {
    const brand = BRANDS[4];
    await connectMeta(brand, { flow: "facebook" });
    H.flagAtSubscribe = [];

    const paginaB = "page-b-nueva";
    await connectMeta({ ...brand, pageId: paginaB }, { flow: "facebook" });

    // El canal ya apunta a la Página B y su indicador está en false: heredar el
    // `true` de la Página A habría hecho pasar por operativa una página que
    // todavía no lo es.
    expect(flagAl(`page:${paginaB}`)).toEqual([false]);
  });

  it("al reconectar el MISMO activo operativo el indicador se conserva en true", async () => {
    const brand = BRANDS[5];
    await connectMeta(brand, { flow: "facebook" });
    H.flagAtSubscribe = [];

    await connectMeta(brand, { flow: "facebook" });

    // No se degrada: la suscripción anterior sigue vigente y bajarlo a false
    // pintaría «pendiente de activación» un canal que recibe.
    expect(flagAl(`page:${brand.pageId}`)).toEqual([true]);
  });

  it("una conexión nueva cuya suscripción falla queda en false y en error", async () => {
    const brand = BRANDS[6];
    H.failPage = brand.pageId;
    await connectMeta(brand, { flow: "facebook" });

    const channel = channelOf(brand.id, "facebook_messenger")!;
    expect(flagAl(`page:${brand.pageId}`)).toEqual([false]);
    expect(channel.status).toBe("error");
    expect((channel.config as Record<string, unknown>).webhook_subscribed).toBe(false);
  });
});
