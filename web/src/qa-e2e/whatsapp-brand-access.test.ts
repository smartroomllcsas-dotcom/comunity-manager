// E2E QA · Aislamiento de WhatsApp por organización, marca y asesor.
// ---------------------------------------------------------------------------
// El defecto: las **escrituras** de WhatsApp (`subscribe`, `register`,
// `test-message`, `exchange`) ya autorizaban con `getCmClientAccess()`, pero
// dos **lecturas** se habían quedado en el modelo anterior a las agencias:
//
//   1. `GET /api/whatsapp/accounts` autorizaba con la cookie `cm_user_id` y
//      filtraba `cm_clients` por `user_id`. Sólo el propietario histórico de la
//      marca veía su cuenta.
//   2. La pantalla `/clients/[clientId]/whatsapp` consultaba `cm_clients` desde
//      el navegador y comparaba `user_id !== user.id`, expulsando a `/clients` a
//      todo el que no fuera ese propietario.
//
// Consecuencia: un administrador de agencia o un asesor con la marca asignada
// —autorizados para conectar, suscribir y enviar— no podían ni ver la cuenta.
// La autorización de escritura y la de lectura no coincidían.
//
// Esta suite ejercita las rutas reales con los cuatro perfiles del encargo.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FakeSupabase } from "./helpers/fake-supabase";
import { createFakeSupabase } from "./helpers/fake-supabase";

const ORG = "org-wa";
const OTHER_ORG = "org-wa-vecina";
const BRAND = "brand-wa-1";
const SIBLING_BRAND = "brand-wa-2";
const FOREIGN_BRAND = "brand-wa-vecina";
/** Propietario histórico de la marca: `cm_clients.user_id` apunta aquí. */
const OWNER_CM_USER = "cm-user-propietario";
const WA_TOKEN = "EAAtokendewhatsappquenodebesalir0123456789";

type Perfil =
  | "admin"
  | "asesor_asignado"
  | "asesor_sin_asignar"
  | "otra_organizacion"
  | "superadmin"
  | "propietario";

const H = vi.hoisted(() => ({ current: null as FakeSupabase | null }));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, NextRequest: class {} };
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => H.current!.admin() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => H.current!.server }));
vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: (table: string) => H.current!.admin().from(table),
    schema: () => ({ from: (table: string) => H.current!.admin().from(table) }),
  },
}));
vi.mock("@/lib/auth/token-crypto", () => ({
  encryptToken: (value: string) => `enc:${value}`,
  decryptToken: (value: string) => (value?.startsWith("enc:") ? value.slice(4) : null),
  resolveToken: (cipher: string | null, plain: string | null) =>
    cipher?.startsWith("enc:") ? cipher.slice(4) : plain || null,
}));
// Las acciones POST llaman a Meta; aquí sólo interesa quién puede invocarlas.
vi.mock("@/lib/whatsapp-cm", () => ({
  subscribeWabaToWebhook: async () => ({ success: true }),
  registerWhatsAppNumber: async () => ({ success: true }),
  sendWhatsAppTextMessage: async () => ({ messages: [{ id: "wamid.test" }] }),
}));

import { GET as getAccounts } from "@/app/api/whatsapp/accounts/route";
import { GET as getHistory } from "@/app/api/whatsapp/history/route";
import { POST as postSubscribe } from "@/app/api/whatsapp/subscribe/route";
import { POST as postRegister } from "@/app/api/whatsapp/register/route";

// ---------------------------------------------------------------------------

const PERFILES: Record<Perfil, { authId: string; email: string }> = {
  admin: { authId: "auth-admin", email: "admin@agencia.test" },
  asesor_asignado: { authId: "auth-asesor-ok", email: "asesor.ok@agencia.test" },
  asesor_sin_asignar: { authId: "auth-asesor-no", email: "asesor.no@agencia.test" },
  otra_organizacion: { authId: "auth-vecina", email: "alguien@vecina.test" },
  superadmin: { authId: "auth-super", email: "super@agencia.test" },
  propietario: { authId: "auth-propietario", email: "propietario@agencia.test" },
};

/**
 * Escenario base.
 *
 * **Sólo el propietario histórico tiene fila en `public.cm_users`.** Es lo que
 * ocurre de verdad: un usuario aceptado por invitación se crea en
 * `smarttalk.agents` y en `brand_advisor_assignments`, pero `cm_users` pertenece
 * al modelo anterior a las agencias y no se rellena.
 *
 * La primera versión de esta suite creaba una fila para cada perfil, y eso
 * ocultaba el bloqueo que encontró la revisión: `getCmClientAccess` denegaba en
 * cuanto faltaba `cm_users`, así que los invitados —administradores y asesores
 * autorizados— se quedaban fuera y ninguna prueba lo veía.
 *
 * `withCmUser: true` reproduce el caso contrario (usuario que sí la tiene) para
 * comprobar que la corrección no rompe el camino antiguo.
 */
function seed(perfil: Perfil, options: { withCmUser?: boolean } = {}) {
  const identidad = PERFILES[perfil];
  const invitado = perfil !== "propietario" && !options.withCmUser;

  const fake = createFakeSupabase({
    currentUserId: identidad.authId,
    tables: {
      cm_users: [
        // El propietario histórico: `cm_clients.user_id` apunta aquí.
        { id: OWNER_CM_USER, email: PERFILES.propietario.email },
        ...(invitado ? [] : [{ id: `cm-user-${perfil}`, email: identidad.email }]),
      ],
      agents: [
        {
          id: "auth-admin",
          organization_id: ORG,
          role: "admin",
          member_type: "agency_user",
          is_super_admin: false,
        },
        {
          id: "auth-asesor-ok",
          organization_id: ORG,
          role: "agent",
          member_type: "brand_advisor",
          is_super_admin: false,
        },
        {
          id: "auth-asesor-no",
          organization_id: ORG,
          role: "agent",
          member_type: "brand_advisor",
          is_super_admin: false,
        },
        {
          id: "auth-vecina",
          organization_id: OTHER_ORG,
          role: "admin",
          member_type: "agency_user",
          is_super_admin: false,
        },
        {
          id: "auth-super",
          organization_id: ORG,
          role: "admin",
          member_type: "agency_user",
          is_super_admin: true,
        },
        {
          id: "auth-propietario",
          organization_id: ORG,
          role: "admin",
          member_type: "agency_user",
          is_super_admin: false,
        },
      ],
      // Sólo el asesor «ok» tiene la marca asignada.
      brand_advisor_assignments: [
        { id: "asig-1", agent_id: "auth-asesor-ok", organization_id: ORG, brand_id: BRAND },
      ],
      cm_clients: [
        // `user_id` apunta al propietario histórico: ni el admin ni el asesor
        // lo son, y ese es justamente el escenario que fallaba.
        { id: BRAND, name: "Marca Uno", industry: "Retail", user_id: OWNER_CM_USER, smarttalk_organization_id: ORG },
        { id: SIBLING_BRAND, name: "Marca Dos", industry: null, user_id: OWNER_CM_USER, smarttalk_organization_id: ORG },
        { id: FOREIGN_BRAND, name: "Marca Vecina", industry: null, user_id: "cm-user-ajeno", smarttalk_organization_id: OTHER_ORG },
      ],
      cm_whatsapp_accounts: [
        {
          id: "wa-1",
          client_id: BRAND,
          waba_id: "WABA-1",
          phone_number_id: "PN-1",
          display_phone_number: "+57 300 111 1111",
          verified_name: "Marca Uno SAS",
          connected_at: "2026-08-01T10:00:00.000Z",
          access_token: null,
          access_token_ciphertext: `enc:${WA_TOKEN}`,
        },
        {
          id: "wa-2",
          client_id: SIBLING_BRAND,
          waba_id: "WABA-2",
          phone_number_id: "PN-2",
          display_phone_number: "+57 300 222 2222",
          verified_name: "Marca Dos SAS",
          connected_at: "2026-08-01T10:00:00.000Z",
          access_token: null,
          access_token_ciphertext: `enc:${WA_TOKEN}`,
        },
        {
          id: "wa-vecina",
          client_id: FOREIGN_BRAND,
          waba_id: "WABA-VECINA",
          phone_number_id: "PN-VECINA",
          display_phone_number: "+57 300 999 9999",
          verified_name: "Vecina SAS",
          connected_at: "2026-08-01T10:00:00.000Z",
          access_token: null,
          access_token_ciphertext: `enc:${WA_TOKEN}`,
        },
      ],
      cm_chat_history: [
        { id: "h-1", role: "assistant", content: "hola de la marca uno", client_context: `whatsapp:${BRAND}`, created_at: "2026-08-10T10:00:00.000Z" },
        { id: "h-2", role: "user", content: "respuesta de la marca uno", client_context: `whatsapp:${BRAND}`, created_at: "2026-08-10T11:00:00.000Z" },
        { id: "h-hermana", role: "assistant", content: "SECRETO de la marca dos", client_context: `whatsapp:${SIBLING_BRAND}`, created_at: "2026-08-10T12:00:00.000Z" },
        { id: "h-vecina", role: "assistant", content: "SECRETO de la vecina", client_context: `whatsapp:${FOREIGN_BRAND}`, created_at: "2026-08-10T13:00:00.000Z" },
        { id: "h-otro-contexto", role: "assistant", content: "de otro módulo", client_context: `campanas:${BRAND}`, created_at: "2026-08-10T14:00:00.000Z" },
      ],
      channels: [
        { id: "ch-1", organization_id: ORG, brand_id: BRAND, type: "whatsapp_business_api", status: "active", whatsapp_phone_number_id: "PN-1", whatsapp_business_account_id: "WABA-1" },
        { id: "ch-2", organization_id: ORG, brand_id: SIBLING_BRAND, type: "whatsapp_business_api", status: "active", whatsapp_phone_number_id: "PN-2", whatsapp_business_account_id: "WABA-2" },
      ],
    },
  });

  // `getCmClientAccess` resuelve el usuario por correo; el doble por defecto
  // sólo devuelve el id.
  fake.server.auth.getUser = async () => ({
    data: { user: { id: identidad.authId, email: identidad.email } },
  }) as never;

  return fake;
}

function getRequest(params: Record<string, string> = {}) {
  return {
    method: "GET",
    headers: new Headers(),
    nextUrl: { searchParams: new URLSearchParams(params), origin: "https://app.invalid" },
    cookies: { get: () => undefined },
  } as never;
}

function postRequest(body: unknown) {
  return {
    method: "POST",
    headers: new Headers({ "content-type": "application/json" }),
    nextUrl: { searchParams: new URLSearchParams(), origin: "https://app.invalid" },
    cookies: { get: () => undefined },
    json: async () => body,
  } as never;
}

async function accountsFor(perfil: Perfil, clientId?: string) {
  H.current = seed(perfil);
  const response = (await getAccounts(
    getRequest(clientId ? { clientId } : {}),
  )) as Response;
  return { status: response.status, body: await response.json() };
}

async function historyFor(perfil: Perfil, params: Record<string, string>) {
  H.current = seed(perfil);
  const response = (await getHistory(getRequest(params))) as Response;
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  H.current = seed("admin");
});

// ---------------------------------------------------------------------------
// 1 · Quién puede leer la cuenta
// ---------------------------------------------------------------------------
describe("1 · GET /api/whatsapp/accounts · alcance por organización y marca", () => {
  it("el administrador de agencia accede aunque NO sea el user_id propietario", async () => {
    const { status, body } = await accountsFor("admin", BRAND);

    expect(status).toBe(200);
    expect(body.accounts).toHaveLength(1);
    expect(body.accounts[0].client_id).toBe(BRAND);
    // El propietario histórico es otro: exactamente el caso que fallaba.
    const marca = (H.current!.store.cm_clients as Array<Record<string, unknown>>).find(
      (row) => row.id === BRAND,
    )!;
    expect(marca.user_id).toBe(OWNER_CM_USER);
  });

  it("el asesor con la marca asignada accede", async () => {
    const { status, body } = await accountsFor("asesor_asignado", BRAND);

    expect(status).toBe(200);
    expect(body.accounts[0].client_id).toBe(BRAND);
  });

  it("el asesor SIN la marca asignada recibe 403", async () => {
    const { status, body } = await accountsFor("asesor_sin_asignar", BRAND);

    expect(status).toBe(403);
    expect(body.accounts).toEqual([]);
  });

  it("un usuario de otra organización recibe 403", async () => {
    const { status, body } = await accountsFor("otra_organizacion", BRAND);

    expect(status).toBe(403);
    expect(body.accounts).toEqual([]);
  });

  it("el superadministrador conserva su alcance", async () => {
    const { status, body } = await accountsFor("superadmin", BRAND);

    expect(status).toBe(200);
    expect(body.accounts[0].client_id).toBe(BRAND);
  });

  it("el propietario histórico sigue accediendo", async () => {
    const { status, body } = await accountsFor("propietario", BRAND);

    expect(status).toBe(200);
    expect(body.accounts[0].client_id).toBe(BRAND);
  });

  it("cambiar el clientId a mano no expone otra marca", async () => {
    // El asesor está asignado a BRAND; prueba con la hermana y con la ajena.
    for (const ajena of [SIBLING_BRAND, FOREIGN_BRAND]) {
      const { status, body } = await accountsFor("asesor_asignado", ajena);
      expect(status).toBe(403);
      expect(JSON.stringify(body)).not.toContain("PN-2");
      expect(JSON.stringify(body)).not.toContain("PN-VECINA");
    }
  });

  it("un usuario de otra organización no ve la cuenta ajena ni por el listado", async () => {
    const { status, body } = await accountsFor("otra_organizacion");

    expect(status).toBe(200);
    const ids = (body.accounts as Array<{ client_id: string }>).map((a) => a.client_id);
    expect(ids).toEqual([FOREIGN_BRAND]);
    expect(JSON.stringify(body)).not.toContain("WABA-1");
  });

  it("la cuenta devuelta siempre corresponde al clientId solicitado", async () => {
    for (const perfil of ["admin", "superadmin", "propietario"] as Perfil[]) {
      const { body } = await accountsFor(perfil, SIBLING_BRAND);
      for (const account of body.accounts as Array<{ client_id: string }>) {
        expect(account.client_id).toBe(SIBLING_BRAND);
      }
    }
  });

  it("el listado del asesor sólo trae sus marcas asignadas", async () => {
    const { status, body } = await accountsFor("asesor_asignado");

    expect(status).toBe(200);
    const ids = (body.accounts as Array<{ client_id: string }>).map((a) => a.client_id);
    expect(ids).toEqual([BRAND]);
  });

  it("el listado del asesor sin asignaciones va vacío", async () => {
    const { status, body } = await accountsFor("asesor_sin_asignar");

    expect(status).toBe(200);
    expect(body.accounts).toEqual([]);
  });

  it("el listado del administrador trae las marcas de su organización, no las ajenas", async () => {
    const { body } = await accountsFor("admin");

    const ids = (body.accounts as Array<{ client_id: string }>).map((a) => a.client_id).sort();
    expect(ids).toEqual([BRAND, SIBLING_BRAND].sort());
    expect(ids).not.toContain(FOREIGN_BRAND);
  });

  it("sin sesión responde 401", async () => {
    H.current = seed("admin");
    H.current.server.auth.getUser = async () => ({ data: { user: null } });

    const response = (await getAccounts(getRequest())) as Response;
    expect(response.status).toBe(401);
  });

  it("nunca devuelve tokens", async () => {
    for (const perfil of ["admin", "asesor_asignado", "superadmin", "propietario"] as Perfil[]) {
      const conMarca = await accountsFor(perfil, BRAND);
      const listado = await accountsFor(perfil);
      for (const payload of [conMarca.body, listado.body]) {
        const serializado = JSON.stringify(payload);
        expect(serializado).not.toContain(WA_TOKEN);
        expect(serializado).not.toContain("access_token");
        expect(serializado).not.toContain("enc:");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 1 bis · Usuarios invitados, sin fila en cm_users
// ---------------------------------------------------------------------------
// El bloqueo que encontró la revisión. `getCmClientAccess` y
// `listAccessibleCmClientIds` denegaban en cuanto faltaba `cm_users`, y esa
// fila no existe para quien entra por invitación: el alta crea `agents` y
// `brand_advisor_assignments`, no `cm_users`.
//
// Estas pruebas afirman lo mismo que las de arriba, pero dejando explícito que
// el perfil NO tiene fila en `cm_users`. Si alguien vuelve a exigirla, fallan.
describe("1 bis · Un usuario invitado no tiene cm_users y debe acceder igual", () => {
  /** Comprueba en el propio almacén que la fila no existe. */
  function sinCmUser(perfil: Perfil) {
    const filas = H.current!.store.cm_users as Array<Record<string, unknown>>;
    expect(filas.some((row) => row.email === PERFILES[perfil].email)).toBe(false);
    // Y la marca sigue perteneciendo al propietario histórico.
    const marca = (H.current!.store.cm_clients as Array<Record<string, unknown>>).find(
      (row) => row.id === BRAND,
    )!;
    expect(marca.user_id).toBe(OWNER_CM_USER);
  }

  it("administrador invitado: accede a la cuenta", async () => {
    const { status, body } = await accountsFor("admin", BRAND);

    sinCmUser("admin");
    expect(status).toBe(200);
    expect(body.accounts[0].client_id).toBe(BRAND);
  });

  it("administrador invitado: accede al historial", async () => {
    const { status, body } = await historyFor("admin", { clientId: BRAND });

    sinCmUser("admin");
    expect(status).toBe(200);
    expect(body.entries).toHaveLength(2);
  });

  it("administrador invitado: el listado trae las marcas de su organización", async () => {
    const { status, body } = await accountsFor("admin");

    sinCmUser("admin");
    expect(status).toBe(200);
    const ids = (body.accounts as Array<{ client_id: string }>).map((a) => a.client_id).sort();
    expect(ids).toEqual([BRAND, SIBLING_BRAND].sort());
  });

  it("asesor asignado invitado: accede a la cuenta y al historial", async () => {
    const cuenta = await accountsFor("asesor_asignado", BRAND);
    sinCmUser("asesor_asignado");
    expect(cuenta.status).toBe(200);
    expect(cuenta.body.accounts[0].client_id).toBe(BRAND);

    const historial = await historyFor("asesor_asignado", { clientId: BRAND });
    expect(historial.status).toBe(200);
    expect(historial.body.entries).toHaveLength(2);
  });

  it("asesor asignado invitado: el listado sigue acotado a su marca", async () => {
    const { body } = await accountsFor("asesor_asignado");

    const ids = (body.accounts as Array<{ client_id: string }>).map((a) => a.client_id);
    expect(ids).toEqual([BRAND]);
  });

  it("asesor NO asignado invitado: 403 en cuenta e historial", async () => {
    const cuenta = await accountsFor("asesor_sin_asignar", BRAND);
    sinCmUser("asesor_sin_asignar");
    expect(cuenta.status).toBe(403);

    const historial = await historyFor("asesor_sin_asignar", { clientId: BRAND });
    expect(historial.status).toBe(403);
  });

  it("otra organización invitada: 403 en cuenta e historial", async () => {
    const cuenta = await accountsFor("otra_organizacion", BRAND);
    sinCmUser("otra_organizacion");
    expect(cuenta.status).toBe(403);

    const historial = await historyFor("otra_organizacion", { clientId: BRAND });
    expect(historial.status).toBe(403);
    expect(JSON.stringify(historial.body)).not.toContain("marca uno");
  });

  it("invitado: las acciones POST siguen funcionando", async () => {
    H.current = seed("admin");
    const suscribe = (await postSubscribe(postRequest({ clientId: BRAND }))) as Response;
    expect(suscribe.status).toBe(200);

    H.current = seed("asesor_asignado");
    const registra = (await postRegister(
      postRequest({ clientId: BRAND, pin: "000000" }),
    )) as Response;
    expect(registra.status).toBe(200);

    H.current = seed("asesor_sin_asignar");
    const bloqueado = (await postSubscribe(postRequest({ clientId: BRAND }))) as Response;
    expect(bloqueado.status).toBe(403);
  });

  it("invitado: ninguna respuesta expone credenciales", async () => {
    for (const perfil of ["admin", "asesor_asignado"] as Perfil[]) {
      const cuenta = await accountsFor(perfil, BRAND);
      const listado = await accountsFor(perfil);
      const historial = await historyFor(perfil, { clientId: BRAND });
      for (const payload of [cuenta.body, listado.body, historial.body]) {
        const serializado = JSON.stringify(payload);
        expect(serializado).not.toContain("access_token");
        expect(serializado).not.toContain("access_token_ciphertext");
        expect(serializado).not.toContain(WA_TOKEN);
      }
    }
  });

  it("sin cm_users se opera con el propietario histórico de la marca", async () => {
    // La escritura que consume `cmUserId` —el alta de WhatsApp— necesita un
    // identificador válido. Al no haber `cm_users` propio se usa
    // `cm_clients.user_id`, que es `NOT NULL REFERENCES cm_users(id)`, así que
    // la integridad referencial se conserva y no se inventa ningún usuario.
    H.current = seed("admin");
    const { getCmClientAccess } = await import("@/lib/cm-client-access");
    const access = await getCmClientAccess(getRequest(), BRAND);

    expect(access).not.toBeNull();
    expect(access!.cmUserId).toBe(OWNER_CM_USER);
    expect(access!.organizationId).toBe(ORG);
  });

  it("con cm_users propio se usa ese identificador, no el del propietario", async () => {
    H.current = seed("admin", { withCmUser: true });
    const { getCmClientAccess } = await import("@/lib/cm-client-access");
    const access = await getCmClientAccess(getRequest(), BRAND);

    expect(access!.cmUserId).toBe("cm-user-admin");
  });

  it("con cm_users propio el acceso sigue funcionando igual", async () => {
    for (const perfil of ["admin", "asesor_asignado"] as Perfil[]) {
      H.current = seed(perfil, { withCmUser: true });
      const response = (await getAccounts(getRequest({ clientId: BRAND }))) as Response;
      expect(response.status).toBe(200);
    }

    for (const perfil of ["asesor_sin_asignar", "otra_organizacion"] as Perfil[]) {
      H.current = seed(perfil, { withCmUser: true });
      const response = (await getAccounts(getRequest({ clientId: BRAND }))) as Response;
      expect(response.status).toBe(403);
    }
  });

  it("sin agente y sin cm_users no hay acceso", async () => {
    H.current = seed("admin");
    H.current.store.agents = [];

    const cuenta = (await getAccounts(getRequest({ clientId: BRAND }))) as Response;
    expect(cuenta.status).toBe(403);

    const listado = (await getAccounts(getRequest())) as Response;
    expect(listado.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 2 · Historial
// ---------------------------------------------------------------------------
describe("2 · GET /api/whatsapp/history · autorización en el servidor", () => {
  it("el asesor asignado ve el historial de su marca", async () => {
    const { status, body } = await historyFor("asesor_asignado", { clientId: BRAND });

    expect(status).toBe(200);
    expect(body.entries).toHaveLength(2);
    for (const entry of body.entries as Array<{ client_context: string }>) {
      expect(entry.client_context).toBe(`whatsapp:${BRAND}`);
    }
  });

  it("el administrador de agencia también, sin ser el propietario", async () => {
    const { status, body } = await historyFor("admin", { clientId: BRAND });

    expect(status).toBe(200);
    expect(body.entries).toHaveLength(2);
  });

  it("el asesor sin asignar recibe 403", async () => {
    const { status, body } = await historyFor("asesor_sin_asignar", { clientId: BRAND });

    expect(status).toBe(403);
    expect(body.entries).toEqual([]);
  });

  it("un usuario de otra organización recibe 403", async () => {
    const { status, body } = await historyFor("otra_organizacion", { clientId: BRAND });

    expect(status).toBe(403);
    expect(JSON.stringify(body)).not.toContain("marca uno");
  });

  it("cambiar el clientId a mano no filtra el historial de otra marca", async () => {
    const hermana = await historyFor("asesor_asignado", { clientId: SIBLING_BRAND });
    expect(hermana.status).toBe(403);
    expect(JSON.stringify(hermana.body)).not.toContain("SECRETO");

    const vecina = await historyFor("asesor_asignado", { clientId: FOREIGN_BRAND });
    expect(vecina.status).toBe(403);
    expect(JSON.stringify(vecina.body)).not.toContain("SECRETO");
  });

  it("el contexto lo compone el servidor: un client_context enviado se ignora", async () => {
    // Aunque el navegador intente imponer el contexto de otra marca, la ruta
    // sólo usa `whatsapp:${clientId}` de la marca ya validada.
    const { status, body } = await historyFor("admin", {
      clientId: BRAND,
      client_context: `whatsapp:${SIBLING_BRAND}`,
    });

    expect(status).toBe(200);
    for (const entry of body.entries as Array<{ client_context: string }>) {
      expect(entry.client_context).toBe(`whatsapp:${BRAND}`);
    }
    expect(JSON.stringify(body)).not.toContain("SECRETO");
  });

  it("no mezcla otros módulos que compartan la marca", async () => {
    const { body } = await historyFor("admin", { clientId: BRAND });

    // `campanas:BRAND` existe en la tabla y no debe aparecer.
    expect(JSON.stringify(body)).not.toContain("de otro módulo");
  });

  it("ordena por created_at descendente y respeta el límite", async () => {
    const { body } = await historyFor("admin", { clientId: BRAND, limit: "1" });

    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].id).toBe("h-2");
  });

  it("sin clientId responde 400", async () => {
    const { status } = await historyFor("admin", {});
    expect(status).toBe(400);
  });

  it("nunca devuelve tokens", async () => {
    const { body } = await historyFor("admin", { clientId: BRAND });
    const serializado = JSON.stringify(body);
    expect(serializado).not.toContain(WA_TOKEN);
    expect(serializado).not.toContain("access_token");
  });
});

// ---------------------------------------------------------------------------
// 3 · Las acciones POST siguen funcionando
// ---------------------------------------------------------------------------
describe("3 · Las acciones existentes conservan su autorización", () => {
  it("subscribe: el administrador de agencia puede, el asesor sin asignar no", async () => {
    H.current = seed("admin");
    const permitido = (await postSubscribe(postRequest({ clientId: BRAND }))) as Response;
    expect(permitido.status).toBe(200);

    H.current = seed("asesor_sin_asignar");
    const bloqueado = (await postSubscribe(postRequest({ clientId: BRAND }))) as Response;
    expect(bloqueado.status).toBe(403);
  });

  it("register: mismo criterio", async () => {
    H.current = seed("asesor_asignado");
    const permitido = (await postRegister(postRequest({ clientId: BRAND, pin: "000000" }))) as Response;
    expect(permitido.status).toBe(200);

    H.current = seed("otra_organizacion");
    const bloqueado = (await postRegister(postRequest({ clientId: BRAND, pin: "000000" }))) as Response;
    expect(bloqueado.status).toBe(403);
  });

  it("las cuatro rutas de acción siguen autorizando con getCmClientAccess", () => {
    const rutas = [
      "src/app/api/whatsapp/subscribe/route.ts",
      "src/app/api/whatsapp/register/route.ts",
      "src/app/api/whatsapp/test-message/route.ts",
      "src/app/auth/whatsapp/exchange/route.ts",
    ];
    for (const ruta of rutas) {
      expect(readFileSync(join(process.cwd(), ruta), "utf8")).toContain("getCmClientAccess");
    }
  });

  it("las tres acciones sobre una cuenta existente filtran por client_id exacto", () => {
    // `exchange` queda fuera a propósito: no lee una cuenta existente por
    // marca, la localiza por `waba_id` + `phone_number_id` para el alta.
    for (const ruta of [
      "src/app/api/whatsapp/subscribe/route.ts",
      "src/app/api/whatsapp/register/route.ts",
      "src/app/api/whatsapp/test-message/route.ts",
    ]) {
      const source = readFileSync(join(process.cwd(), ruta), "utf8");
      expect(source).toContain(".eq('client_id', clientId)");
    }
  });
});

// ---------------------------------------------------------------------------
// 4 · Contrato de la pantalla y regresiones
// ---------------------------------------------------------------------------
describe("4 · La pantalla ya no autoriza por su cuenta", () => {
  const pagina = () =>
    readFileSync(
      join(process.cwd(), "src/app/(agency)/clients/[clientId]/whatsapp/page.tsx"),
      "utf8",
    );

  it("REGRESIÓN: no compara cm_clients.user_id con el usuario de sesión", () => {
    const source = pagina();
    expect(source).not.toContain("clientRes.data.user_id !== user.id");
    expect(source).not.toMatch(/user_id\s*!==\s*user\.id/);
  });

  it("REGRESIÓN: no consulta cm_clients ni cm_chat_history desde el navegador", () => {
    const source = pagina();
    expect(source).not.toContain("from('cm_clients')");
    expect(source).not.toContain("from('cm_chat_history')");
    // Y ya no importa el cliente de navegador de Supabase.
    expect(source).not.toContain("from '@/lib/supabase'");
  });

  it("usa los endpoints autenticados", () => {
    const source = pagina();
    expect(source).toContain("/api/cm/clients");
    expect(source).toContain("/api/whatsapp/accounts?clientId=");
    expect(source).toContain("/api/whatsapp/history?clientId=");
  });

  it("un 403 del servidor muestra «No autorizado» en vez de expulsar en silencio", () => {
    const source = pagina();
    expect(source).toContain("whatsapp-forbidden");
    expect(source).toContain("No autorizado");
    expect(source).toContain("status === 403");
  });

  it("REGRESIÓN: la ruta de cuentas ya no autoriza por la cookie de sesión", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/api/whatsapp/accounts/route.ts"),
      "utf8",
    );
    // Se comprueba el código, no la prosa: los comentarios sí nombran la cookie
    // para explicar qué se corrigió.
    expect(source).not.toContain("cookies.get(");
    expect(source).not.toContain("SESSION_KEY");
    expect(source).toContain("getCmClientAccess");
    expect(source).toContain("listAccessibleCmClientIds");
    // Lista blanca de columnas y proyección explícita: nunca `select('*')`.
    expect(source).not.toContain("select('*')");
    expect(source).toContain("toPublicAccount");
  });

  it("REGRESIÓN: el historial compone el contexto en el servidor", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/api/whatsapp/history/route.ts"),
      "utf8",
    );
    expect(source).toContain("whatsappHistoryContext(access.clientId)");
    // El contexto no se lee de la petición.
    expect(source).not.toMatch(/searchParams\.get\(["']client_context["']\)/);
  });
});

// ---------------------------------------------------------------------------
// 5 · Un número, una marca
// ---------------------------------------------------------------------------
describe("5 · Un Phone Number ID sigue perteneciendo a un solo canal y marca", () => {
  it("cada número aparece en un único canal", () => {
    H.current = seed("admin");
    const canales = H.current.store.channels as Array<Record<string, unknown>>;
    const numeros = canales.map((row) => row.whatsapp_phone_number_id);

    expect(new Set(numeros).size).toBe(numeros.length);
    for (const numero of numeros) {
      expect(canales.filter((row) => row.whatsapp_phone_number_id === numero)).toHaveLength(1);
    }
  });

  it("cada cuenta legacy apunta a una sola marca", () => {
    H.current = seed("admin");
    const cuentas = H.current.store.cm_whatsapp_accounts as Array<Record<string, unknown>>;
    const porNumero = new Map<string, Set<string>>();
    for (const cuenta of cuentas) {
      const numero = String(cuenta.phone_number_id);
      porNumero.set(
        numero,
        (porNumero.get(numero) || new Set()).add(String(cuenta.client_id)),
      );
    }
    for (const marcas of porNumero.values()) {
      expect(marcas.size).toBe(1);
    }
  });

  it("la unicidad global del número sigue impuesta por la migración 013", () => {
    const source = readFileSync(
      join(process.cwd(), "supabase/migrations/20260730000300_013_brand_channel_lead_isolation.sql"),
      "utf8",
    );
    expect(source).toContain("uq_channels_whatsapp_phone");
    expect(source).toContain("ON smarttalk.channels(whatsapp_phone_number_id)");
  });
});
