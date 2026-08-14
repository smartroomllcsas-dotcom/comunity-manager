// E2E QA · La tarjeta de marca no puede mentir sobre el estado del canal.
// ---------------------------------------------------------------------------
// El bloqueo que encontró la revisión: `/clients` decidía «conectado» leyendo
// `cm_social_accounts` y `cm_whatsapp_accounts`. Ninguna de las dos lo sabe.
// Son registros **legacy**: guardan lo que Meta autorizó, no lo que la
// plataforma puede recibir. El canal operativo —el que consulta el webhook—
// vive en `smarttalk.channels`.
//
// Con un canal en `error` —autorizado pero sin suscripción al webhook— la
// tarjeta salía verde y la bandeja quedaba vacía sin que nada lo explicara: el
// mismo defecto de la iteración 22, una capa más arriba.
//
// Esta suite ejercita la ruta autenticada real (`GET /api/cm/clients`) y las
// reglas puras que consume la pantalla, para que el contrato entre las dos no
// se pueda romper en silencio.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FakeSupabase } from "./helpers/fake-supabase";
import { createFakeSupabase } from "./helpers/fake-supabase";

const ORG = "org-estado";
const OTHER_ORG = "org-vecina";
const BRAND = "brand-1";
const OTHER_BRAND = "brand-2";
const VECINA = "brand-vecina";

const H = vi.hoisted(() => ({
  current: null as FakeSupabase | null,
  failSubscription: false,
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, NextRequest: class {} };
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => H.current!.admin() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => H.current!.server }));
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
    subscribePageToApp: async () => {
      if (H.failSubscription) throw new Error("Meta API: (#200) permiso ausente (code: 200)");
      return { success: true };
    },
    subscribeInstagramAccountToApp: async () => {
      if (H.failSubscription) throw new Error("Meta API: cuenta no elegible (code: 100)");
      return { success: true };
    },
  };
});
vi.mock("@/lib/whatsapp/token-manager", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/whatsapp/token-manager")>();
  return {
    ...actual,
    subscribeWABAToApp: async () => {
      if (H.failSubscription) throw new Error("WABA subscription failed: sin permiso");
      return undefined;
    },
  };
});

import { GET as listClients } from "@/app/api/cm/clients/route";
import { POST as retryActivation } from "@/app/api/channels/[id]/retry-activation/route";
import { activateChannels } from "@/lib/meta/channel-activation";
import { loadBrandChannelSummaries } from "@/lib/smarttalk/brand-channel-summary";
import {
  canConnect,
  emptyBrandChannels,
  isChannelConnected,
  needsActivation,
  summarizeBrandChannels,
  summarizeChannelsByBrand,
} from "@/lib/smarttalk/brand-channel-status";

// ---------------------------------------------------------------------------

interface ChannelSeed {
  id: string;
  type: string;
  status: string;
  brandId?: string;
  organizationId?: string;
  activationError?: string | null;
  assetId?: string;
  /** `config.webhook_subscribed`. Omitir emula un canal histórico sin el campo. */
  webhookSubscribed?: boolean;
}

function channelRow(seed: ChannelSeed) {
  const isWhatsApp = seed.type.startsWith("whatsapp");
  return {
    id: seed.id,
    organization_id: seed.organizationId || ORG,
    brand_id: seed.brandId || BRAND,
    type: seed.type,
    status: seed.status,
    name: `Canal ${seed.id}`,
    meta_business_id: isWhatsApp ? null : seed.assetId || `asset-${seed.id}`,
    whatsapp_phone_number_id: isWhatsApp ? seed.assetId || `pn-${seed.id}` : null,
    access_token: null,
    access_token_ciphertext: "enc:TOKEN-DEL-CANAL",
    whatsapp_business_account_id: isWhatsApp ? `waba-${seed.id}` : null,
    config: {
      legacy_id: seed.assetId || `asset-${seed.id}`,
      ...(seed.activationError === undefined
        ? {}
        : { activation_error: seed.activationError }),
      ...(seed.webhookSubscribed === undefined
        ? {}
        : { webhook_subscribed: seed.webhookSubscribed }),
    },
  };
}

/**
 * Escenario base: una agencia con dos marcas y un usuario administrador.
 *
 * `cm_social_accounts` y `cm_whatsapp_accounts` vienen SIEMPRE pobladas: son
 * justo las filas que antes bastaban para pintar la tarjeta verde, así que
 * tenerlas presentes es lo que hace significativas las aserciones.
 */
function seed(channels: ChannelSeed[] = [], options: { agentOrg?: string } = {}) {
  return createFakeSupabase({
    currentUserId: "agent-1",
    tables: {
      agents: [
        {
          id: "agent-1",
          organization_id: options.agentOrg || ORG,
          role: "admin",
          member_type: "agency_user",
          is_super_admin: false,
        },
      ],
      cm_clients: [
        { id: BRAND, name: "Marca Uno", status: "active", smarttalk_organization_id: ORG, platforms: ["Facebook", "Instagram", "WhatsApp"] },
        { id: OTHER_BRAND, name: "Marca Dos", status: "active", smarttalk_organization_id: ORG, platforms: ["Facebook"] },
        { id: VECINA, name: "Marca Vecina", status: "active", smarttalk_organization_id: OTHER_ORG, platforms: ["Facebook"] },
      ],
      // Registro legacy presente para las dos marcas de la agencia.
      cm_social_accounts: [
        { id: "social-1", client_id: BRAND, page_id: "page-1", page_name: "Página Uno", instagram_id: "ig-1", instagram_username: "cuenta_uno" },
        { id: "social-2", client_id: OTHER_BRAND, page_id: "page-2", page_name: "Página Dos" },
      ],
      cm_whatsapp_accounts: [
        { id: "wa-1", client_id: BRAND, waba_id: "waba-1", phone_number_id: "pn-1", display_phone_number: "+57 300 000 0000" },
      ],
      channels: channels.map(channelRow),
      brand_advisor_assignments: [],
      brand_channel_pause_state: [],
    },
  });
}

async function fetchClients() {
  const response = (await listClients()) as Response;
  return { status: response.status, body: await response.json() };
}

const brandOf = (body: { clients?: Array<Record<string, unknown>> }, id: string) =>
  (body.clients || []).find((client) => client.id === id) as
    | { channels: ReturnType<typeof emptyBrandChannels> }
    | undefined;

beforeEach(() => {
  H.failSubscription = false;
  H.current = seed();
});

// ---------------------------------------------------------------------------
// 1 · El registro legacy no basta
// ---------------------------------------------------------------------------
describe("1 · Un registro legacy no puede declarar «conectado»", () => {
  it("con canal en error, la marca NO figura como conectada pese al registro legacy", async () => {
    H.current = seed([
      { id: "ch-fb", type: "facebook_messenger", status: "error", activationError: "permiso ausente" },
    ]);

    const { body } = await fetchClients();
    const channels = brandOf(body, BRAND)!.channels;

    // La fila de cm_social_accounts sigue ahí, con su page_id y su page_name.
    expect(H.current!.store.cm_social_accounts[0].page_id).toBe("page-1");
    // Y aun así el canal no está conectado.
    expect(channels.messenger.state).toBe("error");
    expect(isChannelConnected(channels.messenger)).toBe(false);
    expect(needsActivation(channels.messenger)).toBe(true);
  });

  it("sin ninguna fila en smarttalk.channels, el registro legacy tampoco conecta", async () => {
    H.current = seed([]);

    const { body } = await fetchClients();
    const channels = brandOf(body, BRAND)!.channels;

    expect(channels.messenger.state).toBe("missing");
    expect(channels.instagram.state).toBe("missing");
    expect(channels.whatsapp.state).toBe("missing");
    expect(isChannelConnected(channels.messenger)).toBe(false);
    expect(canConnect(channels.messenger)).toBe(true);
  });

  it("un canal desconectado ofrece conectar, no «conectado»", async () => {
    H.current = seed([{ id: "ch-fb", type: "facebook_messenger", status: "disconnected" }]);

    const { body } = await fetchClients();
    const channels = brandOf(body, BRAND)!.channels;

    expect(channels.messenger.state).toBe("disconnected");
    expect(isChannelConnected(channels.messenger)).toBe(false);
    expect(needsActivation(channels.messenger)).toBe(false);
    expect(canConnect(channels.messenger)).toBe(true);
  });

  it("sólo `active` produce «conectado»", async () => {
    H.current = seed([{ id: "ch-fb", type: "facebook_messenger", status: "active" }]);

    const { body } = await fetchClients();
    const channels = brandOf(body, BRAND)!.channels;

    expect(channels.messenger.state).toBe("active");
    expect(isChannelConnected(channels.messenger)).toBe(true);
    expect(needsActivation(channels.messenger)).toBe(false);
    expect(canConnect(channels.messenger)).toBe(false);
  });

  it("`pending` se lee como pendiente de activación, nunca como conectado", () => {
    const summary = summarizeBrandChannels([
      { id: "ch", brand_id: BRAND, type: "facebook_messenger", status: "pending" },
    ]);
    expect(summary.messenger.state).toBe("error");
    expect(isChannelConnected(summary.messenger)).toBe(false);
  });

  it("un estado desconocido tampoco se pinta verde", () => {
    const summary = summarizeBrandChannels([
      { id: "ch", brand_id: BRAND, type: "facebook_messenger", status: "vaya_usted_a_saber" },
    ]);
    expect(summary.messenger.state).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// 1 bis · `active` no basta: manda `webhook_subscribed`
// ---------------------------------------------------------------------------
// Un canal puede quedarse en `active` con la suscripción rechazada —si el
// UPDATE a `error` no llegó a escribirse, por ejemplo—. Ahí la columna miente y
// el indicador explícito pesa más.
describe("1 bis · active + webhook_subscribed=false ⇒ pendiente de activación", () => {
  const KINDS = [
    { kind: "messenger" as const, type: "facebook_messenger" },
    { kind: "instagram" as const, type: "instagram" },
    { kind: "whatsapp" as const, type: "whatsapp_business_api" },
  ];

  it.each(KINDS)("$kind: active con el indicador en false no está conectado", ({ kind, type }) => {
    const summary = summarizeBrandChannels([
      {
        id: "ch",
        brand_id: BRAND,
        type,
        status: "active",
        webhook_subscribed: false,
        activation_error: "el proveedor rechazó la suscripción",
      },
    ]);

    expect(summary[kind].state).toBe("error");
    expect(isChannelConnected(summary[kind])).toBe(false);
    expect(needsActivation(summary[kind])).toBe(true);
    expect(summary[kind].activationError).toBe("el proveedor rechazó la suscripción");
  });

  it.each(KINDS)("$kind: active con el indicador en true sí está conectado", ({ kind, type }) => {
    const summary = summarizeBrandChannels([
      { id: "ch", brand_id: BRAND, type, status: "active", webhook_subscribed: true },
    ]);
    expect(isChannelConnected(summary[kind])).toBe(true);
  });

  it.each(KINDS)("$kind: canal histórico sin el campo se mantiene conectado", ({ kind, type }) => {
    // Compatibilidad: degradar todos los canales anteriores al indicador
    // convertiría una mejora de precisión en una alarma masiva sobre canales
    // que funcionan. Sólo el `false` explícito degrada.
    for (const ausente of [undefined, null]) {
      const summary = summarizeBrandChannels([
        { id: "ch", brand_id: BRAND, type, status: "active", webhook_subscribed: ausente },
      ]);
      expect(isChannelConnected(summary[kind])).toBe(true);
    }
  });

  it("la ruta lee el indicador de config y degrada la vista", async () => {
    H.current = seed([
      { id: "ch-fb", type: "facebook_messenger", status: "active", webhookSubscribed: false, activationError: "sin permiso" },
    ]);

    const { body } = await fetchClients();
    const channel = brandOf(body, BRAND)!.channels.messenger;

    expect(channel.state).toBe("error");
    expect(channel.activationError).toBe("sin permiso");
  });

  it("un valor corrupto en config no degrada: se trata como desconocido", async () => {
    H.current = seed([{ id: "ch-fb", type: "facebook_messenger", status: "active" }]);
    const row = (H.current.store.channels as Array<Record<string, unknown>>)[0];
    (row.config as Record<string, unknown>).webhook_subscribed = "no";

    const { body } = await fetchClients();
    expect(brandOf(body, BRAND)!.channels.messenger.state).toBe("active");
  });

  it("un canal disconnected sigue siendo disconnected aunque el indicador sea true", () => {
    const summary = summarizeBrandChannels([
      {
        id: "ch",
        brand_id: BRAND,
        type: "facebook_messenger",
        status: "disconnected",
        webhook_subscribed: true,
      },
    ]);
    expect(summary.messenger.state).toBe("disconnected");
  });

  it("entre duplicados gana el que sí está suscrito", () => {
    const summary = summarizeBrandChannels([
      { id: "ch-mudo", brand_id: BRAND, type: "facebook_messenger", status: "active", webhook_subscribed: false },
      { id: "ch-bueno", brand_id: BRAND, type: "facebook_messenger", status: "active", webhook_subscribed: true },
    ]);
    expect(summary.messenger.channelId).toBe("ch-bueno");
    expect(summary.messenger.state).toBe("active");
  });
});

// ---------------------------------------------------------------------------
// 2 · Los tres canales, con su causa
// ---------------------------------------------------------------------------
describe("2 · Messenger, Instagram y WhatsApp en error muestran activación pendiente", () => {
  const CASES = [
    { kind: "messenger" as const, type: "facebook_messenger", cause: "permiso pages_manage_metadata ausente" },
    { kind: "instagram" as const, type: "instagram", cause: "cuenta no elegible" },
    { kind: "whatsapp" as const, type: "whatsapp_business_api", cause: "la app no tiene permiso" },
  ];

  it.each(CASES)("$kind en error pide activación y expone la causa", async ({ kind, type, cause }) => {
    H.current = seed([{ id: `ch-${kind}`, type, status: "error", activationError: cause }]);

    const { body } = await fetchClients();
    const channel = brandOf(body, BRAND)!.channels[kind];

    expect(channel.state).toBe("error");
    expect(needsActivation(channel)).toBe(true);
    expect(channel.activationError).toBe(cause);
    // Y el identificador del canal viaja, porque sin él no hay reintento.
    expect(channel.channelId).toBe(`ch-${kind}`);
  });

  it("los tres pueden estar en estados distintos a la vez", async () => {
    H.current = seed([
      { id: "ch-fb", type: "facebook_messenger", status: "active" },
      { id: "ch-ig", type: "instagram", status: "error", activationError: "cuenta no elegible" },
      { id: "ch-wa", type: "whatsapp_business_api", status: "disconnected" },
    ]);

    const { body } = await fetchClients();
    const channels = brandOf(body, BRAND)!.channels;

    expect(channels.messenger.state).toBe("active");
    expect(channels.instagram.state).toBe("error");
    expect(channels.whatsapp.state).toBe("disconnected");
  });

  it("la causa nunca lleva tokens: sale del config saneado, no del token", async () => {
    H.current = seed([
      { id: "ch-fb", type: "facebook_messenger", status: "error", activationError: "permiso ausente" },
    ]);

    const { body } = await fetchClients();
    const serialized = JSON.stringify(body);

    expect(serialized).not.toContain("enc:TOKEN-DEL-CANAL");
    expect(serialized).not.toContain("access_token");
  });

  it("un canal `active` no arrastra la causa de un fallo anterior", async () => {
    H.current = seed([
      { id: "ch-fb", type: "facebook_messenger", status: "active", activationError: "fallo antiguo" },
    ]);

    const { body } = await fetchClients();
    expect(brandOf(body, BRAND)!.channels.messenger.activationError).toBeNull();
  });

  it("con filas duplicadas del mismo tipo gana la más operativa", () => {
    const summary = summarizeBrandChannels([
      { id: "ch-malo", brand_id: BRAND, type: "facebook_messenger", status: "error" },
      { id: "ch-bueno", brand_id: BRAND, type: "facebook_messenger", status: "active" },
    ]);
    expect(summary.messenger.channelId).toBe("ch-bueno");
    expect(summary.messenger.state).toBe("active");
  });
});

// ---------------------------------------------------------------------------
// 3 · Tras el reintento
// ---------------------------------------------------------------------------
describe("3 · Un reintento exitoso deja la marca conectada", () => {
  async function retry(channelId: string) {
    return (await retryActivation({} as never, {
      params: Promise.resolve({ id: channelId }),
    })) as Response;
  }

  it("error → reintento → active, y la tarjeta pasa a «conectado»", async () => {
    H.current = seed([
      { id: "ch-fb", type: "facebook_messenger", status: "error", activationError: "permiso ausente" },
    ]);

    const antes = await fetchClients();
    expect(brandOf(antes.body, BRAND)!.channels.messenger.state).toBe("error");

    const response = await retry("ch-fb");
    expect(response.status).toBe(200);

    const despues = await fetchClients();
    const channel = brandOf(despues.body, BRAND)!.channels.messenger;
    expect(channel.state).toBe("active");
    expect(isChannelConnected(channel)).toBe(true);
    // Y la causa desaparece: ya no hay nada pendiente que explicar.
    expect(channel.activationError).toBeNull();
  });

  it.each([
    ["instagram", "instagram"],
    ["whatsapp", "whatsapp_business_api"],
  ])("%s también se recupera con el reintento", async (kind, type) => {
    H.current = seed([{ id: "ch-x", type, status: "error", activationError: "sin permiso" }]);

    expect((await retry("ch-x")).status).toBe(200);

    const { body } = await fetchClients();
    const channels = brandOf(body, BRAND)!.channels;
    expect(channels[kind as "instagram" | "whatsapp"].state).toBe("active");
  });

  it("si el proveedor vuelve a rechazar, sigue pendiente y no dice conectado", async () => {
    H.current = seed([{ id: "ch-fb", type: "facebook_messenger", status: "error" }]);
    H.failSubscription = true;

    const response = await retry("ch-fb");
    expect(response.status).toBe(502);

    const { body } = await fetchClients();
    const channel = brandOf(body, BRAND)!.channels.messenger;
    expect(channel.state).toBe("error");
    expect(isChannelConnected(channel)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4 · Aislamiento
// ---------------------------------------------------------------------------
describe("4 · Un usuario de otra organización no consulta ni reactiva", () => {
  it("el listado sólo trae las marcas de la organización del usuario", async () => {
    H.current = seed([{ id: "ch-fb", type: "facebook_messenger", status: "active" }]);

    const { body } = await fetchClients();
    const ids = (body.clients as Array<{ id: string }>).map((client) => client.id);

    expect(ids).toContain(BRAND);
    expect(ids).toContain(OTHER_BRAND);
    expect(ids).not.toContain(VECINA);
  });

  it("el resumen no incluye canales de otra organización, ni con la misma marca", async () => {
    H.current = seed([
      { id: "ch-propio", type: "facebook_messenger", status: "error" },
      // Mismo brand_id, otra organización: no debe colarse en el resumen.
      { id: "ch-ajeno", type: "facebook_messenger", status: "active", organizationId: OTHER_ORG },
    ]);

    const { body } = await fetchClients();
    const channels = brandOf(body, BRAND)!.channels;

    // Si el filtro por organización fallara, el canal ajeno (`active`) ganaría
    // por prioridad y la marca aparecería conectada.
    expect(channels.messenger.channelId).toBe("ch-propio");
    expect(channels.messenger.state).toBe("error");
  });

  it("un asesor sólo recibe el estado de sus marcas asignadas", async () => {
    H.current = seed([
      { id: "ch-1", type: "facebook_messenger", status: "active", brandId: BRAND },
      { id: "ch-2", type: "facebook_messenger", status: "active", brandId: OTHER_BRAND },
    ]);
    H.current.store.agents = [
      {
        id: "agent-1",
        organization_id: ORG,
        role: "agent",
        member_type: "brand_advisor",
        is_super_admin: false,
      },
    ];
    H.current.store.brand_advisor_assignments = [
      { id: "asig-1", agent_id: "agent-1", organization_id: ORG, brand_id: BRAND },
    ];

    const { body } = await fetchClients();
    const ids = (body.clients as Array<{ id: string }>).map((client) => client.id);

    expect(ids).toEqual([BRAND]);
    expect(brandOf(body, OTHER_BRAND)).toBeUndefined();
  });

  it("un agente de otra organización no ve el canal ni puede reactivarlo", async () => {
    H.current = seed([{ id: "ch-fb", type: "facebook_messenger", status: "error" }], {
      agentOrg: OTHER_ORG,
    });

    const response = (await retryActivation({} as never, {
      params: Promise.resolve({ id: "ch-fb" }),
    })) as Response;

    expect(response.status).toBe(404);
    // Y el canal sigue exactamente igual.
    expect(
      (H.current.store.channels as Array<Record<string, unknown>>).find((row) => row.id === "ch-fb")!
        .status,
    ).toBe("error");
  });

  it("sin sesión no se lista nada", async () => {
    H.current = seed([{ id: "ch-fb", type: "facebook_messenger", status: "active" }]);
    H.current.server.auth.getUser = async () => ({ data: { user: null } });

    const { status } = await fetchClients();
    expect(status).toBe(401);
  });

  it("summarizeChannelsByBrand no mezcla marcas", () => {
    const result = summarizeChannelsByBrand(
      [
        { id: "a", brand_id: BRAND, type: "facebook_messenger", status: "active" },
        { id: "b", brand_id: OTHER_BRAND, type: "facebook_messenger", status: "error" },
      ],
      [BRAND, OTHER_BRAND],
    );

    expect(result[BRAND].messenger.channelId).toBe("a");
    expect(result[OTHER_BRAND].messenger.channelId).toBe("b");
    expect(result[BRAND].messenger.state).toBe("active");
    expect(result[OTHER_BRAND].messenger.state).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// 5 · Un fallo al persistir nunca devuelve éxito
// ---------------------------------------------------------------------------
describe("5 · La activación no informa éxito si el estado no quedó guardado", () => {
  it("suscripción correcta + UPDATE fallido ⇒ ok:false", async () => {
    H.current = createFakeSupabase({
      errorOn: { channels: { update: { code: "42501", message: "permission denied" } } },
      tables: { channels: [channelRow({ id: "ch-fb", type: "facebook_messenger", status: "active" })] },
    });

    const outcome = await activateChannels([
      {
        channelId: "ch-fb",
        asset: "facebook_page",
        assetId: "page-1",
        wasActive: false,
        subscribe: async () => ({ success: true }),
      },
    ]);

    expect(outcome.ok).toBe(false);
    expect(outcome.failures).toHaveLength(1);
    expect(outcome.failures[0].persisted).toBe(false);
    expect(outcome.failures[0].cause).toContain("no se pudo guardar el estado del canal");
  });

  it("suscripción correcta + SELECT fallido ⇒ ok:false", async () => {
    H.current = createFakeSupabase({
      errorOn: { channels: { select: { code: "57014", message: "statement timeout" } } },
      tables: { channels: [channelRow({ id: "ch-fb", type: "facebook_messenger", status: "active" })] },
    });

    const outcome = await activateChannels([
      {
        channelId: "ch-fb",
        asset: "facebook_page",
        assetId: "page-1",
        wasActive: false,
        subscribe: async () => ({ success: true }),
      },
    ]);

    expect(outcome.ok).toBe(false);
    expect(outcome.failures[0].persisted).toBe(false);
  });

  it("un SELECT fallido no borra la configuración del canal", async () => {
    H.current = createFakeSupabase({
      errorOn: { channels: { select: { code: "57014", message: "statement timeout" } } },
      tables: { channels: [channelRow({ id: "ch-fb", type: "facebook_messenger", status: "active" })] },
    });

    await activateChannels([
      {
        channelId: "ch-fb",
        asset: "facebook_page",
        assetId: "page-1",
        wasActive: false,
        subscribe: async () => {
          throw new Error("rechazado");
        },
      },
    ]);

    const channel = (H.current.store.channels as Array<Record<string, unknown>>)[0];
    // El estado SÍ se degrada —si no, la marca diría que recibe y no recibe—…
    expect(channel.status).toBe("error");
    // …y `legacy_id`, del que depende el enrutamiento, sigue intacto.
    expect((channel.config as Record<string, unknown>).legacy_id).toBe("asset-ch-fb");
  });

  it("suscripción fallida + persistencia fallida acumula las dos causas", async () => {
    H.current = createFakeSupabase({
      errorOn: { channels: { update: { code: "42501", message: "permission denied" } } },
      tables: { channels: [channelRow({ id: "ch-fb", type: "facebook_messenger", status: "active" })] },
    });

    const outcome = await activateChannels([
      {
        channelId: "ch-fb",
        asset: "facebook_page",
        assetId: "page-1",
        wasActive: false,
        subscribe: async () => {
          throw new Error("Meta API: rechazado (code: 200)");
        },
      },
    ]);

    expect(outcome.ok).toBe(false);
    expect(outcome.failures[0].persisted).toBe(false);
    expect(outcome.failures[0].cause).toContain("rechazado");
    expect(outcome.failures[0].cause).toContain("Además");
  });

  it("el camino feliz sigue devolviendo ok:true y persiste el estado", async () => {
    H.current = createFakeSupabase({
      tables: { channels: [channelRow({ id: "ch-fb", type: "facebook_messenger", status: "error" })] },
    });

    const outcome = await activateChannels([
      {
        channelId: "ch-fb",
        asset: "facebook_page",
        assetId: "page-1",
        wasActive: false,
        subscribe: async () => ({ success: true }),
      },
    ]);

    expect(outcome.ok).toBe(true);
    expect(outcome.failures).toHaveLength(0);
    const channel = (H.current.store.channels as Array<Record<string, unknown>>)[0];
    expect(channel.status).toBe("active");
    expect((channel.config as Record<string, unknown>).webhook_subscribed).toBe(true);
  });

  it("si el resumen de canales no se puede leer, el listado falla en vez de mentir", async () => {
    H.current = createFakeSupabase({
      currentUserId: "agent-1",
      errorOn: { channels: { select: { code: "57014", message: "statement timeout" } } },
      tables: {
        agents: [
          { id: "agent-1", organization_id: ORG, role: "admin", member_type: "agency_user" },
        ],
        cm_clients: [
          { id: BRAND, name: "Marca Uno", status: "active", smarttalk_organization_id: ORG },
        ],
        channels: [],
        brand_advisor_assignments: [],
        brand_channel_pause_state: [],
      },
    });

    const { status, body } = await fetchClients();

    // Devolver el listado sin estado pintaría «Conectar» sobre canales que
    // existen, e invitaría a reconectar un activo ya tomado.
    expect(status).toBe(500);
    expect(body.error).toBe("No fue posible cargar el estado de los canales.");
  });
});

// ---------------------------------------------------------------------------
// 6 · El contrato con la pantalla
// ---------------------------------------------------------------------------
// Las reglas de arriba sólo sirven si la pantalla las usa. Estas aserciones
// sobre el fuente evitan que alguien vuelva a derivar el estado del registro
// legacy sin que ninguna prueba se entere.
describe("6 · /clients consume el estado del canal, no el registro legacy", () => {
  const source = readFileSync(
    join(process.cwd(), "src/app/(agency)/clients/page.tsx"),
    "utf8",
  );

  it("deriva «conectado» con isChannelConnected sobre client.channels", () => {
    expect(source).toContain("isChannelConnected(channelState.messenger)");
    expect(source).toContain("isChannelConnected(channelState.instagram)");
    expect(source).toContain("isChannelConnected(channelState.whatsapp)");
    expect(source).toContain("client.channels ?? emptyBrandChannels()");
  });

  it("ya no deriva el estado de cm_social_accounts ni de metaTrace", () => {
    expect(source).not.toContain("social?.page_id ||");
    expect(source).not.toContain("social?.instagram_id ||");
    expect(source).not.toMatch(/facebookConnected = Boolean\(/);
    expect(source).not.toMatch(/instagramConnected = Boolean\(/);
  });

  it("ofrece la activación pendiente en los tres canales", () => {
    expect(source).toContain("needsActivation(channelState.messenger)");
    expect(source).toContain("needsActivation(channelState.instagram)");
    expect(source).toContain("needsActivation(channelState.whatsapp)");
    expect(source).toContain("PendingActivationCard");
    expect(source).toContain("channel-retry-activation");
    expect(source).toContain("/retry-activation");
  });

  it("la tarjeta pendiente muestra la causa", () => {
    expect(source).toContain("channel-pending-cause");
    expect(source).toContain("ACTIVATION_PENDING_LABEL");
    expect(source).toContain("ACTIVATION_PENDING_HINT");
  });

  it("la tarjeta de WhatsApp ya no depende de la fila legacy para existir", () => {
    // `whatsapp?.verified_name`, no `whatsapp.verified_name`: la fila legacy
    // puede faltar y el canal estar activo igualmente.
    expect(source).toContain("whatsapp?.verified_name");
    expect(source).toContain("whatsapp?.display_phone_number");
  });
});

// ---------------------------------------------------------------------------
// 7 · El canal nace no-conectado
// ---------------------------------------------------------------------------
// El último hueco: `webhook_subscribed` ausente significa «canal histórico, no
// se sabe», y por compatibilidad el resumen lo muestra conectado. Entre que se
// crea la fila y que se guarda el veredicto, el campo no existía. Si el
// guardado final fallaba —permission denied, timeout— la fila se quedaba
// `active` SIN el campo y la pantalla la pintaba verde sobre un webhook que
// nunca se suscribió.
//
// Escribir `webhook_subscribed: false` ANTES de llamar al proveedor invierte la
// carga de la prueba: el canal nace no-conectado y sólo una suscripción
// confirmada lo asciende. Si algo se rompe por el camino, lo que queda es el
// estado prudente.
//
// Estas pruebas consultan el MISMO resumen que usa GET /api/cm/clients, que es
// donde tiene que notarse.
describe("7 · Un guardado final fallido nunca deja el canal como conectado", () => {
  const CANALES = [
    { kind: "messenger" as const, type: "facebook_messenger", asset: "facebook_page" as const },
    { kind: "instagram" as const, type: "instagram", asset: "instagram_account" as const },
    { kind: "whatsapp" as const, type: "whatsapp_business_api", asset: "whatsapp_phone" as const },
  ];

  /**
   * Canal recién escrito por la capa de conexión: `active` para poder enrutar
   * de inmediato, y ya marcado como no-suscrito porque Meta todavía no ha
   * dicho nada.
   */
  function reciénCreado(type: string, id = "ch-nuevo") {
    return {
      ...channelRow({ id, type, status: "active" }),
      config: { legacy_id: `asset-${id}`, webhook_subscribed: false, webhook_subscribed_at: null },
    };
  }

  async function resumen() {
    const byBrand = await loadBrandChannelSummaries(ORG, [BRAND]);
    return byBrand[BRAND];
  }

  it.each(CANALES)(
    "$kind · canal nuevo + proveedor rechaza + falla el UPDATE final",
    async ({ kind, type, asset }) => {
      H.current = createFakeSupabase({
        errorOn: { channels: { update: { code: "42501", message: "permission denied" } } },
        tables: { channels: [reciénCreado(type)] },
      });

      const outcome = await activateChannels([
        {
          channelId: "ch-nuevo",
          asset,
          assetId: "asset-ch-nuevo",
          wasActive: false,
          subscribe: async () => {
            throw new Error("Meta API: rechazado (code: 200)");
          },
        },
      ]);

      expect(outcome.ok).toBe(false);
      expect(outcome.failures[0].persisted).toBe(false);

      // El UPDATE no llegó: la fila sigue diciendo `active`. Lo que salva la
      // situación es el `webhook_subscribed: false` escrito de antemano.
      const row = (H.current.store.channels as Array<Record<string, unknown>>)[0];
      expect(row.status).toBe("active");
      expect((row.config as Record<string, unknown>).webhook_subscribed).toBe(false);

      const channels = await resumen();
      expect(channels[kind].state).not.toBe("active");
      expect(isChannelConnected(channels[kind])).toBe(false);
      expect(needsActivation(channels[kind])).toBe(true);
    },
  );

  it.each(CANALES)(
    "$kind · activo cambiado + proveedor rechaza + falla el UPDATE final",
    async ({ kind, type, asset }) => {
      // La capa de conexión ya reescribió el canal para el activo nuevo y, al
      // haber cambiado, reseteó el indicador. La suscripción vieja no cubre
      // este activo.
      H.current = createFakeSupabase({
        errorOn: { channels: { update: { code: "42501", message: "permission denied" } } },
        tables: {
          channels: [
            {
              ...channelRow({ id: "ch-cambiado", type, status: "active", assetId: "asset-nuevo" }),
              config: { legacy_id: "asset-nuevo", webhook_subscribed: false },
            },
          ],
        },
      });

      const outcome = await activateChannels([
        {
          channelId: "ch-cambiado",
          asset,
          assetId: "asset-nuevo",
          wasActive: false,
          subscribe: async () => {
            throw new Error("Meta API: rechazado (code: 200)");
          },
        },
      ]);

      expect(outcome.ok).toBe(false);
      const channels = await resumen();
      expect(channels[kind].state).not.toBe("active");
      expect(isChannelConnected(channels[kind])).toBe(false);
    },
  );

  it.each(CANALES)(
    "$kind · proveedor confirma + falla el guardado final",
    async ({ kind, type, asset }) => {
      H.current = createFakeSupabase({
        errorOn: { channels: { update: { code: "42501", message: "permission denied" } } },
        tables: { channels: [reciénCreado(type)] },
      });

      const outcome = await activateChannels([
        {
          channelId: "ch-nuevo",
          asset,
          assetId: "asset-ch-nuevo",
          wasActive: false,
          subscribe: async () => ({ success: true }),
        },
      ]);

      // La suscripción sí existe en Meta, pero no se pudo dejar constancia. No
      // se puede afirmar «conectado» sobre algo que no se pudo comprobar.
      expect(outcome.ok).toBe(false);
      expect(outcome.failures[0].persisted).toBe(false);
      expect(outcome.failures[0].cause).toContain("La suscripción se completó pero");

      const channels = await resumen();
      expect(channels[kind].state).not.toBe("active");
      expect(isChannelConnected(channels[kind])).toBe(false);
    },
  );

  it.each(CANALES)(
    "$kind · mismo activo ya operativo + reintento fallido conserva la operación",
    async ({ kind, type, asset }) => {
      H.current = createFakeSupabase({
        tables: {
          channels: [
            {
              ...channelRow({ id: "ch-operativo", type, status: "active" }),
              config: { legacy_id: "asset-ch-operativo", webhook_subscribed: true },
            },
          ],
        },
      });

      const outcome = await activateChannels([
        {
          channelId: "ch-operativo",
          asset,
          assetId: "asset-ch-operativo",
          wasActive: true,
          subscribe: async () => {
            throw new Error("Meta API: límite de solicitudes excedido");
          },
        },
      ]);

      expect(outcome.ok).toBe(false);
      expect(outcome.failures[0].degraded).toBe(false);

      const row = (H.current.store.channels as Array<Record<string, unknown>>)[0];
      const config = row.config as Record<string, unknown>;
      // El canal sigue recibiendo por la suscripción anterior: no se desactiva
      // ni se marca como no-suscrito.
      expect(row.status).toBe("active");
      expect(config.webhook_subscribed).toBe(true);
      expect(config.activation_warning).toContain("límite de solicitudes");

      const channels = await resumen();
      expect(channels[kind].state).toBe("active");
      expect(isChannelConnected(channels[kind])).toBe(true);
    },
  );

  it("un canal nuevo con suscripción correcta sí queda conectado", async () => {
    H.current = createFakeSupabase({
      tables: { channels: [reciénCreado("facebook_messenger")] },
    });

    const outcome = await activateChannels([
      {
        channelId: "ch-nuevo",
        asset: "facebook_page",
        assetId: "asset-ch-nuevo",
        wasActive: false,
        subscribe: async () => ({ success: true }),
      },
    ]);

    expect(outcome.ok).toBe(true);
    const channels = await resumen();
    expect(channels.messenger.state).toBe("active");
    expect(isChannelConnected(channels.messenger)).toBe(true);
  });
});
