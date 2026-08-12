// E2E QA · Desactivación y reactivación reversible de marcas.
// ---------------------------------------------------------------------------
// Cubre los bloques obligatorios A–E del requisito:
//
//   A. Permisos      · quién puede desactivar y quién recibe 403/404.
//   B. Datos         · nada se borra; el canal baja y vuelve.
//   C. Idempotencia  · desactivar y reactivar dos veces.
//   D. Cupos         · una marca pausada libera su cupo.
//   E. Webhooks      · WhatsApp, Meta y Respond.io ignoran a una marca inactiva.
//
// Todo se ejecuta contra las **rutas y funciones reales** con el Supabase en
// memoria de QA. El bloque F (interfaz) se verifica en `brand-lifecycle-ui`
// más abajo: el proyecto no tiene jsdom, así que se comprueba sobre el código.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FakeSupabase } from "./helpers/fake-supabase";
import { createFakeSupabase } from "./helpers/fake-supabase";

const H = vi.hoisted(() => ({ current: null as FakeSupabase | null }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, NextRequest: class {} };
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => H.current!.admin() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => H.current!.server }));
vi.mock("@/lib/smarttalk/instagram-sync", () => ({
  syncInstagramInboxForOrganization: async () => ({ errors: [] }),
}));

import { POST as lifecycle } from "@/app/api/cm/clients/[id]/lifecycle/route";
import { GET as getInboxBrands } from "@/app/api/inbox/brands/route";
import { GET as getCmClients } from "@/app/api/cm/clients/route";
import { checkBillingFeature } from "@/lib/billing/service";
import { evaluateChannelIntake, evaluateWhatsAppIntake } from "@/lib/smarttalk/intake-guard";
import { isBrandPaused } from "@/lib/smarttalk/brand-lifecycle";
import { BILLING_FEATURES } from "@/lib/billing/features";
import { orgRow, subscriptionRow, entitlementRow } from "./helpers/fixtures";

const ORG = "org-pausa";
const OTHER_ORG = "org-ajena";

const BRAND_A = "brand-a";
const BRAND_B = "brand-b";
const BRAND_AJENA = "brand-ajena";

const ADMIN = "agent-admin";
const SUPER = "agent-super";
const BRAND_ADMIN = "agent-brand-admin";
const ADVISOR = "agent-advisor";

function seed(currentUserId: string) {
  return createFakeSupabase({
    currentUserId,
    // Refleja el índice único de la migración 036.
    uniqueIndexes: { brand_channel_pause_state: [["channel_id"]] },
    tables: {
      agents: [
        { id: ADMIN, organization_id: ORG, role: "admin", member_type: "agency_user", is_super_admin: false, email: "admin@example.invalid" },
        { id: SUPER, organization_id: ORG, role: "agent", member_type: "brand_advisor", is_super_admin: true, email: "super@example.invalid" },
        { id: BRAND_ADMIN, organization_id: ORG, role: "supervisor", member_type: "brand_admin", is_super_admin: false, email: "ba@example.invalid" },
        { id: ADVISOR, organization_id: ORG, role: "agent", member_type: "brand_advisor", is_super_admin: false, email: "adv@example.invalid" },
      ],
      brand_advisor_assignments: [
        { organization_id: ORG, agent_id: BRAND_ADMIN, brand_id: BRAND_A },
        { organization_id: ORG, agent_id: ADVISOR, brand_id: BRAND_A },
      ],
      cm_clients: [
        { id: BRAND_A, name: "Marca A", status: "active", smarttalk_organization_id: ORG },
        { id: BRAND_B, name: "Marca B", status: "onboarding", smarttalk_organization_id: ORG },
        { id: BRAND_AJENA, name: "Marca Ajena", status: "active", smarttalk_organization_id: OTHER_ORG },
      ],
      channels: [
        {
          id: "ch-a1", organization_id: ORG, brand_id: BRAND_A, type: "whatsapp_cloud_api",
          name: "WhatsApp A", status: "active", whatsapp_phone_number_id: "PN-A",
          token_expires_at: null, access_token: "no-tocar", access_token_ciphertext: "v1:cifrado",
        },
        {
          // Ya estaba caído ANTES de la pausa: la reactivación no debe revivirlo.
          id: "ch-a2", organization_id: ORG, brand_id: BRAND_A, type: "instagram",
          name: "Instagram A", status: "disconnected", token_expires_at: null,
        },
        {
          id: "ch-b1", organization_id: ORG, brand_id: BRAND_B, type: "respond_io",
          name: "Respond B", status: "active", respond_io_channel_id: "RIO-B",
          token_expires_at: null, config: {},
        },
      ],
      contacts: [
        { id: "contact-1", organization_id: ORG, brand_id: BRAND_A, wa_id: "573001112233", name: "Contacto histórico" },
      ],
      conversations: [
        { id: "conv-1", organization_id: ORG, brand_id: BRAND_A, channel_id: "ch-a1", status: "open", unread_count: 3 },
      ],
      messages: [
        { id: "msg-1", conversation_id: "conv-1", organization_id: ORG, direction: "inbound", content: "hola" },
      ],
      cm_social_accounts: [
        { id: "social-1", client_id: BRAND_A, access_token: "no-tocar", page_id: "PG-1" },
      ],
      brand_channel_pause_state: [],
      brand_lifecycle_events: [],
      // Plan con UN único cupo de marca: es el escenario del bloque D.
      organizations: [orgRow({ id: ORG })],
      subscriptions: [subscriptionRow({ organization_id: ORG })],
      plan_entitlements: [entitlementRow(BILLING_FEATURES.BRANDS_TOTAL, 1)],
      billing_decision_events: [],
    },
  });
}

function request(action: unknown) {
  return {
    method: "POST",
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => ({ action }),
  } as never;
}

async function call(userId: string, brandId: string, action: string) {
  H.current = seed(userId);
  const response = await lifecycle(request(action), { params: Promise.resolve({ id: brandId }) });
  return { status: response.status, body: await response.json(), fake: H.current };
}

/** Ejecuta varias acciones sobre el MISMO almacén, para probar secuencias. */
async function sequence(userId: string, steps: { brandId: string; action: string }[]) {
  H.current = seed(userId);
  const results = [];
  for (const step of steps) {
    const response = await lifecycle(request(step.action), {
      params: Promise.resolve({ id: step.brandId }),
    });
    results.push({ status: response.status, body: await response.json() });
  }
  return { results, store: H.current.store };
}

beforeEach(() => {
  process.env.BILLING_ENFORCEMENT_MODE = "hard";
  H.current = seed(ADMIN);
});

// ---------------------------------------------------------------- A. Permisos
describe("A · Permisos sobre el ciclo de vida de una marca", () => {
  it("el admin de la organización puede desactivar", async () => {
    const { status, body } = await call(ADMIN, BRAND_A, "deactivate");
    expect(status).toBe(200);
    expect(body.brand.status).toBe("paused");
    expect(body.brand.label).toBe("Inactiva");
  });

  it("el super admin puede desactivar", async () => {
    const { status, body } = await call(SUPER, BRAND_A, "deactivate");
    expect(status).toBe(200);
    expect(body.changed).toBe(true);
  });

  it("un brand_admin recibe 403 aunque la marca sea suya", async () => {
    const { status } = await call(BRAND_ADMIN, BRAND_A, "deactivate");
    expect(status).toBe(403);
  });

  it("un brand_advisor recibe 403", async () => {
    const { status } = await call(ADVISOR, BRAND_A, "deactivate");
    expect(status).toBe(403);
  });

  it("una marca de otra organización responde 404 sin revelar que existe", async () => {
    const { status, body } = await call(ADMIN, BRAND_AJENA, "deactivate");
    expect(status).toBe(404);
    // El mensaje es el mismo que para un id inexistente.
    const inexistente = await call(ADMIN, "no-existe", "deactivate");
    expect(inexistente.status).toBe(404);
    expect(body.error).toBe(inexistente.body.error);
  });

  it("una acción desconocida se rechaza antes de tocar nada", async () => {
    const { status, fake } = await call(ADMIN, BRAND_A, "delete");
    expect(status).toBe(400);
    expect(fake.store.cm_clients.find((row) => row.id === BRAND_A)?.status).toBe("active");
  });
});

// -------------------------------------------------------------------- B. Datos
describe("B · Desactivar no borra nada y la reactivación restaura", () => {
  it("conserva contactos, conversaciones, mensajes, sociales y asignaciones", async () => {
    const { store } = await sequence(ADMIN, [{ brandId: BRAND_A, action: "deactivate" }]);

    expect(store.cm_clients.find((row) => row.id === BRAND_A)).toBeTruthy();
    expect(store.contacts).toHaveLength(1);
    expect(store.conversations).toHaveLength(1);
    expect(store.messages).toHaveLength(1);
    expect(store.cm_social_accounts).toHaveLength(1);
    // Las asignaciones de asesores permanecen: el equipo vuelve tal cual.
    expect(store.brand_advisor_assignments).toHaveLength(2);
    // Ni el unread_count ni los tokens se tocan.
    expect(store.conversations[0].unread_count).toBe(3);
    expect(store.channels.find((row) => row.id === "ch-a1")?.access_token).toBe("no-tocar");
    expect(store.channels.find((row) => row.id === "ch-a1")?.access_token_ciphertext).toBe("v1:cifrado");
  });

  it("baja a disconnected sólo los canales que estaban operativos", async () => {
    const { store } = await sequence(ADMIN, [{ brandId: BRAND_A, action: "deactivate" }]);
    expect(store.channels.find((row) => row.id === "ch-a1")?.status).toBe("disconnected");
    expect(store.channels.find((row) => row.id === "ch-a2")?.status).toBe("disconnected");
    // El que ya estaba caído no genera fila de estado previo: no hay nada que restaurar.
    expect(store.brand_channel_pause_state.map((row) => row.channel_id)).toEqual(["ch-a1"]);
    expect(store.brand_channel_pause_state[0].previous_status).toBe("active");
    // Otra marca no se ve afectada.
    expect(store.channels.find((row) => row.id === "ch-b1")?.status).toBe("active");
  });

  it("reactivar devuelve el canal que estaba activo y no revive el que no lo estaba", async () => {
    const { results, store } = await sequence(ADMIN, [
      { brandId: BRAND_A, action: "deactivate" },
      { brandId: BRAND_A, action: "reactivate" },
    ]);

    expect(results[1].status).toBe(200);
    expect(store.channels.find((row) => row.id === "ch-a1")?.status).toBe("active");
    expect(store.channels.find((row) => row.id === "ch-a2")?.status).toBe("disconnected");
    expect(store.cm_clients.find((row) => row.id === BRAND_A)?.status).toBe("active");
    // La fila de pausa queda sellada, no borrada.
    expect(store.brand_channel_pause_state[0].reactivated_at).toBeTruthy();
  });

  it("una marca en onboarding vuelve a onboarding, no a active", async () => {
    const { store } = await sequence(ADMIN, [
      { brandId: BRAND_B, action: "deactivate" },
      { brandId: BRAND_B, action: "reactivate" },
    ]);
    expect(store.cm_clients.find((row) => row.id === BRAND_B)?.status).toBe("onboarding");
  });

  it("registra quién y cuándo, incluso para una marca sin canales operativos", async () => {
    const { store } = await sequence(ADMIN, [{ brandId: BRAND_A, action: "deactivate" }]);
    const event = store.brand_lifecycle_events.find((row) => row.action === "deactivate");
    expect(event).toBeTruthy();
    expect(event?.actor_agent_id).toBe(ADMIN);
    expect(event?.actor_email).toBe("admin@example.invalid");
    expect(event?.previous_brand_status).toBe("active");
    expect(event?.new_brand_status).toBe("paused");
    expect(event?.channels_affected).toBe(1);
  });

  it("un token vencido deja el canal pidiendo reconexión, no en active", async () => {
    H.current = seed(ADMIN);
    const channel = H.current.store.channels.find((row) => row.id === "ch-a1")!;
    channel.token_expires_at = "2020-01-01T00:00:00Z";

    await lifecycle(request("deactivate"), { params: Promise.resolve({ id: BRAND_A }) });
    const response = await lifecycle(request("reactivate"), {
      params: Promise.resolve({ id: BRAND_A }),
    });
    const body = await response.json();

    expect(H.current.store.channels.find((row) => row.id === "ch-a1")?.status).toBe("pending");
    expect(body.needsReconnection).toHaveLength(1);
    expect(body.needsReconnection[0].note).toBe("token_expired");
  });
});

// ------------------------------------------------------------- C. Idempotencia
describe("C · Idempotencia", () => {
  it("desactivar dos veces no duplica filas ni falla", async () => {
    const { results, store } = await sequence(ADMIN, [
      { brandId: BRAND_A, action: "deactivate" },
      { brandId: BRAND_A, action: "deactivate" },
    ]);

    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(results[0].body.changed).toBe(true);
    expect(results[1].body.changed).toBe(false);
    expect(store.brand_channel_pause_state).toHaveLength(1);
    expect(store.cm_clients.find((row) => row.id === BRAND_A)?.status).toBe("paused");
    // El segundo intento queda registrado como no-op, no se pierde.
    expect(store.brand_lifecycle_events.filter((row) => row.was_noop === true)).toHaveLength(1);
  });

  it("reactivar dos veces no duplica ni falla", async () => {
    const { results, store } = await sequence(ADMIN, [
      { brandId: BRAND_A, action: "deactivate" },
      { brandId: BRAND_A, action: "reactivate" },
      { brandId: BRAND_A, action: "reactivate" },
    ]);

    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(results[2].body.changed).toBe(false);
    expect(store.brand_channel_pause_state).toHaveLength(1);
    expect(store.channels.find((row) => row.id === "ch-a1")?.status).toBe("active");
  });

  it("un ciclo completo repetido reutiliza la misma fila de estado", async () => {
    const { store } = await sequence(ADMIN, [
      { brandId: BRAND_A, action: "deactivate" },
      { brandId: BRAND_A, action: "reactivate" },
      { brandId: BRAND_A, action: "deactivate" },
    ]);
    expect(store.brand_channel_pause_state).toHaveLength(1);
    // La segunda pausa reabre la fila: vuelve a estar vigente.
    expect(store.brand_channel_pause_state[0].reactivated_at).toBeNull();
  });
});

// -------------------------------------------------------------------- D. Cupos
describe("D · Una marca pausada libera su cupo", () => {
  const brandsCheck = () =>
    checkBillingFeature({
      organizationId: ORG,
      featureCode: BILLING_FEATURES.BRANDS_TOTAL,
      requestedUnits: 1,
      source: "qa/brand-lifecycle",
    });

  it("con el plan lleno no se puede crear otra marca", async () => {
    H.current = seed(ADMIN);
    // El plan admite 1; hay 2 marcas operativas (A y B) en la organización.
    const decision = await brandsCheck();
    expect(decision.allowed).toBe(false);
    expect(decision.currentUsage).toBe(2);
    expect(decision.limitValue).toBe(1);
  });

  it("al desactivar una marca el cupo se libera y se puede crear otra", async () => {
    H.current = seed(ADMIN);
    // Se deja una sola marca operativa para que el límite de 1 sea alcanzable.
    H.current.store.cm_clients = H.current.store.cm_clients.filter((row) => row.id !== BRAND_B);

    expect((await brandsCheck()).allowed).toBe(false);

    await lifecycle(request("deactivate"), { params: Promise.resolve({ id: BRAND_A }) });

    const despues = await brandsCheck();
    expect(despues.allowed).toBe(true);
    expect(despues.currentUsage).toBe(0);
  });

  it("creada la marca B, una tercera vuelve a estar bloqueada", async () => {
    H.current = seed(ADMIN);
    H.current.store.cm_clients = H.current.store.cm_clients.filter((row) => row.id !== BRAND_B);
    await lifecycle(request("deactivate"), { params: Promise.resolve({ id: BRAND_A }) });

    // Marca B ocupa ahora el único cupo.
    H.current.store.cm_clients.push({
      id: "brand-nueva",
      name: "Marca B",
      status: "active",
      smarttalk_organization_id: ORG,
    });

    const tercera = await brandsCheck();
    expect(tercera.allowed).toBe(false);
    expect(tercera.currentUsage).toBe(1);
  });

  it("una marca con status nulo sigue contando", async () => {
    H.current = seed(ADMIN);
    H.current.store.cm_clients.find((row) => row.id === BRAND_B)!.status = null;
    // `neq` a secas descartaría los nulos; el filtro real reproduce la
    // semántica de IS DISTINCT FROM, igual que la función SQL.
    expect((await brandsCheck()).currentUsage).toBe(2);
  });

  it("el contador visual del Inbox deja de ofrecer la marca pausada", async () => {
    H.current = seed(ADMIN);
    const antes = (await (await getInboxBrands()).json()) as { brands: { id: string }[] };
    expect(antes.brands.map((brand) => brand.id).sort()).toEqual([BRAND_A, BRAND_B]);

    await lifecycle(request("deactivate"), { params: Promise.resolve({ id: BRAND_A }) });

    const despues = (await (await getInboxBrands()).json()) as { brands: { id: string }[] };
    expect(despues.brands.map((brand) => brand.id)).toEqual([BRAND_B]);
  });
});

// ----------------------------------------------------------------- E. Webhooks
describe("E · La recepción se detiene para una marca inactiva", () => {
  it("WhatsApp: el mismo phone_number_id pasa de admitido a ignorado", async () => {
    H.current = seed(ADMIN);
    expect(await evaluateWhatsAppIntake("PN-A")).toEqual({ blocked: false, reason: null });

    await lifecycle(request("deactivate"), { params: Promise.resolve({ id: BRAND_A }) });

    expect(await evaluateWhatsAppIntake("PN-A")).toEqual({
      blocked: true,
      reason: "inactive_brand",
    });
  });

  it("Respond.io: un canal de marca pausada se ignora aunque siguiera activo", async () => {
    H.current = seed(ADMIN);
    const channel = { id: "ch-b1", status: "active", brand_id: BRAND_B };
    expect(await evaluateChannelIntake(channel)).toEqual({ blocked: false, reason: null });

    await lifecycle(request("deactivate"), { params: Promise.resolve({ id: BRAND_B }) });

    // El canal se pasa tal como estaba antes: la marca manda sobre el canal.
    expect(await evaluateChannelIntake(channel)).toEqual({
      blocked: true,
      reason: "inactive_brand",
    });
  });

  it("Meta: un evento pendiente de antes de la pausa ya no encuentra destino", async () => {
    H.current = seed(ADMIN);
    await lifecycle(request("deactivate"), { params: Promise.resolve({ id: BRAND_A }) });
    // El canal quedó disconnected: el emparejamiento de meta-webhook filtra por
    // status active, y además excluye marcas pausadas.
    expect(H.current.store.channels.find((row) => row.id === "ch-a1")?.status).toBe("disconnected");
    expect(await isBrandPaused(BRAND_A)).toBe(true);
  });

  it("un canal inexistente no se confunde con una marca inactiva", async () => {
    H.current = seed(ADMIN);
    expect(await evaluateWhatsAppIntake("PN-DESCONOCIDO")).toEqual({
      blocked: true,
      reason: "channel_not_found",
    });
  });

  it("la respuesta al proveedor es 200: no debe provocar reintentos", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/smarttalk/brand-status.ts"),
      "utf8",
    );
    expect(source).toContain('ignored: "inactive_brand"');
    expect(source).toContain("ok: true");
  });
});

// ------------------------------------------------- G. Aviso de reconexión
describe("G · El aviso de reconexión sobrevive a la reactivación y a la recarga", () => {
  /** Deja el canal de la Marca A con el token vencido y ejecuta el ciclo. */
  async function ciclarConTokenVencido() {
    H.current = seed(ADMIN);
    H.current.store.channels.find((row) => row.id === "ch-a1")!.token_expires_at =
      "2020-01-01T00:00:00Z";
    await lifecycle(request("deactivate"), { params: Promise.resolve({ id: BRAND_A }) });
    const response = await lifecycle(request("reactivate"), {
      params: Promise.resolve({ id: BRAND_A }),
    });
    return response.json();
  }

  async function listarMarcas() {
    const response = await getCmClients();
    const body = (await response.json()) as {
      clients: { id: string; status: string; needs_reconnection: { channelId: string; note: string }[] }[];
    };
    return body.clients;
  }

  it("el POST de reactivación reporta el canal que no volvió", async () => {
    const body = await ciclarConTokenVencido();
    expect(body.needsReconnection).toHaveLength(1);
    expect(body.needsReconnection[0].note).toBe("token_expired");
  });

  it("GET /api/cm/clients lo sigue reportando cuando la marca YA está activa", async () => {
    await ciclarConTokenVencido();

    const clients = await listarMarcas();
    const marcaA = clients.find((client) => client.id === BRAND_A)!;
    // La marca volvió a estar activa: sin este dato en el listado, una recarga
    // borraría el aviso y nadie sabría que un canal se quedó fuera.
    expect(marcaA.status).toBe("active");
    expect(marcaA.needs_reconnection).toHaveLength(1);
    expect(marcaA.needs_reconnection[0].channelId).toBe("ch-a1");
    expect(marcaA.needs_reconnection[0].note).toBe("token_expired");
  });

  it("el aviso se apaga solo cuando el canal se reconecta", async () => {
    await ciclarConTokenVencido();
    expect((await listarMarcas()).find((client) => client.id === BRAND_A)!.needs_reconnection)
      .toHaveLength(1);

    // El operador reconecta: el canal vuelve a 'active'.
    H.current!.store.channels.find((row) => row.id === "ch-a1")!.status = "active";

    const despues = await listarMarcas();
    expect(despues.find((client) => client.id === BRAND_A)!.needs_reconnection).toEqual([]);
  });

  it("un canal desaparecido durante la pausa también se reporta", async () => {
    H.current = seed(ADMIN);
    await lifecycle(request("deactivate"), { params: Promise.resolve({ id: BRAND_A }) });
    // El canal se borra mientras la marca está pausada.
    H.current.store.channels = H.current.store.channels.filter((row) => row.id !== "ch-a1");
    await lifecycle(request("reactivate"), { params: Promise.resolve({ id: BRAND_A }) });

    const marcaA = (await listarMarcas()).find((client) => client.id === BRAND_A)!;
    expect(marcaA.needs_reconnection).toHaveLength(1);
    expect(marcaA.needs_reconnection[0].note).toBe("channel_missing");
  });

  it("un canal que ya estaba caído antes de la pausa NO pide reconexión", async () => {
    H.current = seed(ADMIN);
    await lifecycle(request("deactivate"), { params: Promise.resolve({ id: BRAND_A }) });
    await lifecycle(request("reactivate"), { params: Promise.resolve({ id: BRAND_A }) });

    // ch-a2 estaba disconnected desde antes: no es algo que la pausa rompiera.
    const marcaA = (await listarMarcas()).find((client) => client.id === BRAND_A)!;
    expect(marcaA.needs_reconnection).toEqual([]);
  });

  it("una reactivación limpia no deja aviso en ninguna marca", async () => {
    H.current = seed(ADMIN);
    await lifecycle(request("deactivate"), { params: Promise.resolve({ id: BRAND_B }) });
    await lifecycle(request("reactivate"), { params: Promise.resolve({ id: BRAND_B }) });

    for (const client of await listarMarcas()) {
      expect(client.needs_reconnection).toEqual([]);
    }
  });

  it("el aviso no se filtra a marcas de otra organización", async () => {
    await ciclarConTokenVencido();
    const clients = await listarMarcas();
    expect(clients.map((client) => client.id).sort()).toEqual([BRAND_A, BRAND_B]);
  });

  it("la interfaz renderiza el aviso FUERA de la rama isPaused", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/(agency)/clients/page.tsx"),
      "utf8",
    );
    const aviso = source.indexOf("brand-reconnect-notice");
    const condicional = source.indexOf("{isPaused ? (");

    expect(aviso).toBeGreaterThan(-1);
    // Si estuviera dentro de la rama pausada, aparecería después del `{isPaused ? (`.
    expect(aviso).toBeLessThan(condicional);
    // Y la rama pausada ya no lo contiene.
    expect(source.slice(condicional)).not.toContain("brand-reconnect-notice");
  });

  it("la interfaz prefiere el dato del servidor y no lo tapa con un vacío local", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/(agency)/clients/page.tsx"),
      "utf8",
    );
    expect(source).toContain("client.needs_reconnection");
    // El estado local sólo gana cuando tiene contenido.
    expect(source).toContain("localReconnect && localReconnect.length > 0");
  });
});

// ------------------------------------------------------- F. Interfaz (estático)
describe("F · Interfaz de /clients", () => {
  const page = () =>
    readFileSync(join(process.cwd(), "src/app/(agency)/clients/page.tsx"), "utf8");

  it("hay modal de confirmación con el texto acordado", () => {
    expect(page()).toContain('data-testid="brand-deactivate-modal"');
    expect(page()).toContain("BRAND_DEACTIVATE_CONFIRMATION");

    const status = readFileSync(
      join(process.cwd(), "src/lib/smarttalk/brand-status.ts"),
      "utf8",
    );
    for (const fragment of [
      "dejará de recibir nuevos leads, mensajes y eventos",
      "no serán eliminados",
      "Podrás reactivarla después",
      "liberará su cupo para crear otra marca",
    ]) {
      expect(status).toContain(fragment);
    }
  });

  it("la marca inactiva muestra badge, aviso y botón Reactivar", () => {
    const source = page();
    // Se busca el identificador, no la comilla: esta página usa comillas
    // simples y el resto del proyecto dobles.
    expect(source).toContain("brand-inactive-badge");
    expect(source).toContain("BRAND_INACTIVE_LABEL");
    expect(source).toContain("brand-inactive-notice");
    expect(source).toContain("brand-reactivate-button");
    expect(source).toContain("brand-deactivate-button");
  });

  it("los botones de conexión no se renderizan para una marca inactiva", () => {
    const source = page();
    // El aviso de marca inactiva abre la rama `isPaused ?`; los botones de
    // conexión viven en la rama contraria. Se comprueba por posición relativa
    // en vez de recortar el JSX, que es frágil ante cualquier reformateo.
    const condicional = source.indexOf("{isPaused ? (");
    const aviso = source.indexOf("brand-inactive-notice");
    const separador = source.indexOf(") : (", aviso);
    const facebook = source.indexOf("Conectar Facebook");
    const instagram = source.indexOf("Conectar Instagram");
    const whatsapp = source.indexOf("WhatsAppConnectButton", separador);

    expect(condicional).toBeGreaterThan(-1);
    expect(aviso).toBeGreaterThan(condicional);
    expect(separador).toBeGreaterThan(aviso);
    // Los tres conectores quedan DESPUÉS del `) : (`, es decir, en la rama que
    // sólo se renderiza cuando la marca no está pausada.
    expect(facebook).toBeGreaterThan(separador);
    expect(instagram).toBeGreaterThan(separador);
    expect(whatsapp).toBeGreaterThan(separador);
  });

  it("el histórico sigue visible: la tarjeta no oculta datos de la marca", () => {
    const source = page();
    // Nombre, industria, plataformas y antigüedad quedan fuera de la rama
    // condicional: se ven igual con la marca activa o inactiva.
    expect(source).toContain("Agregado hace {timeAgo(client.created_at)}");
    expect(source).toContain("{client.posts_this_month} posts/mes");
  });
});
