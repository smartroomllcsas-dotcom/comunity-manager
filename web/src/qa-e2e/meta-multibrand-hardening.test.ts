// E2E QA · Correcciones de revisión de la iteración 19.
// ---------------------------------------------------------------------------
// Cuatro defectos que la revisión encontró en la primera versión del
// multimarcas. Los cuatro comparten una forma: la protección existía, pero
// llegaba tarde o no cubría el camino de error.
//
//   1. WhatsApp validaba el conflicto **después** de escribir en
//      `cm_whatsapp_accounts`: un 409 dejaba la cuenta legacy ya reasignada.
//   2. Reconectar Facebook ponía en null `instagram_id`, `instagram_username`
//      y los campos de Ads, borrando lo que había conectado el otro flujo.
//   3. `asset-conflicts` no miraba el `error` de las lecturas. Supabase lo
//      devuelve en el resultado, así que un fallo de base se leía como «no hay
//      conflicto» y **permitía** la escritura.
//   4. `consumePendingSelection` devolvía void: dos POST simultáneos podían
//      conectar dos páginas distintas con la misma autorización.
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { FakeSupabase } from "./helpers/fake-supabase";
import { createFakeSupabase } from "./helpers/fake-supabase";

const ORG = "org-h";
const BRAND_A = "brand-a";
const BRAND_B = "brand-b";
const CM_USER = "cm-user-1";
const PHONE = "PN-COMPARTIDO";

const PAGE_1 = { id: "page-111", name: "Página Uno", access_token: "TOKEN-PAGINA-1" };
const PAGE_2 = { id: "page-222", name: "Página Dos", access_token: "TOKEN-PAGINA-2" };
const PAGE_IG = {
  id: "page-ig",
  name: "Página con IG",
  access_token: "TOKEN-IG",
  instagram_business_account: { id: "ig-999", username: "cuenta_ig" },
};

const H = vi.hoisted(() => ({
  current: null as FakeSupabase | null,
  access: { clientId: "brand-a", cmUserId: "cm-user-1", organizationId: "org-h" } as {
    clientId: string;
    cmUserId: string;
    organizationId: string | null;
  } | null,
  pages: [] as Array<Record<string, unknown>>,
}));

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
vi.mock("@/lib/cm-client-access", () => ({ getCmClientAccess: async () => H.access }));
vi.mock("@/lib/crypto", () => ({
  encryptToken: (value: string) => `enc:${value}`,
  decryptToken: (value: string) => (value.startsWith("enc:") ? value.slice(4) : ""),
}));
vi.mock("@/lib/auth/token-crypto", () => ({
  encryptToken: (value: string) => `enc:${value}`,
  resolveToken: (cipher: string | null, plain: string | null) =>
    cipher?.startsWith("enc:") ? cipher.slice(4) : plain || "",
}));
vi.mock("@/lib/whatsapp-cm", () => ({
  exchangeWhatsAppCode: async () => ({ access_token: "TOKEN-WA" }),
  getPhoneNumberDetails: async () => ({
    display_phone_number: "+57 300 000 0000",
    verified_name: "Empresa QA",
  }),
}));
vi.mock("@/lib/meta", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/meta")>();
  return {
    ...actual,
    exchangeCodeForToken: async () => ({ access_token: "TOKEN-CORTO" }),
    getLongLivedToken: async () => ({ access_token: "TOKEN-USUARIO", expires_in: 5184000 }),
    getUserProfile: async () => ({ id: "meta-user-1" }),
    getUserPermissions: async () => [{ permission: "pages_show_list", status: "granted" }],
    getUserPages: async () => H.pages,
    getUserAdAccounts: async () => [],
    subscribePageToApp: async () => undefined,
    subscribeInstagramAccountToApp: async () => undefined,
  };
});

import { POST as whatsappExchange } from "@/app/auth/whatsapp/exchange/route";
import { POST as selectPage } from "@/app/api/auth/meta/select-page/route";
import { handleMetaCallback } from "@/lib/meta-oauth-handler";
import { findAssetConflict } from "@/lib/meta/asset-conflicts";
import { consumePendingSelection } from "@/lib/meta/page-selection";

function seed(overrides: Record<string, unknown[]> = {}) {
  return createFakeSupabase({
    currentUserId: "auth-user-1",
    tables: {
      cm_oauth_states: [{ state: "state-1", client_id: BRAND_A }],
      cm_oauth_pending_selections: [],
      cm_clients: [
        { id: BRAND_A, name: "Marca A", status: "active", smarttalk_organization_id: ORG, user_id: "u1" },
        { id: BRAND_B, name: "Marca B", status: "active", smarttalk_organization_id: ORG, user_id: "u1" },
      ],
      cm_social_accounts: [],
      cm_whatsapp_accounts: [],
      cm_activity_log: [],
      channels: [],
      organizations: [{ id: ORG, name: "Agencia" }],
      subscriptions: [],
      plan_entitlements: [],
      ...overrides,
    },
  });
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

function callbackRequest() {
  return {
    method: "GET",
    headers: new Headers(),
    nextUrl: {
      searchParams: new URLSearchParams({ code: "codigo", state: "state-1" }),
      origin: "https://app.invalid",
    },
    cookies: { get: () => undefined },
  } as never;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://app.invalid";
  H.current = seed();
  H.access = { clientId: BRAND_A, cmUserId: CM_USER, organizationId: ORG };
  H.pages = [PAGE_1, PAGE_2];
});

// ---------------------------------------------------------------------------
// 1. WhatsApp: ninguna escritura antes de validar
// ---------------------------------------------------------------------------
describe("1 · WhatsApp valida el conflicto antes de escribir", () => {
  function seedConflict() {
    H.current = seed({
      channels: [
        {
          id: "ch-b",
          organization_id: ORG,
          brand_id: BRAND_B,
          whatsapp_phone_number_id: PHONE,
          status: "active",
        },
      ],
    });
  }

  it("responde 409 con el mensaje que nombra la marca ocupante", async () => {
    seedConflict();
    const response = await whatsappExchange(
      jsonRequest({ code: "c", phone_number_id: PHONE, waba_id: "W1", client_id: BRAND_A }),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("Marca B");
  });

  it("cm_whatsapp_accounts queda COMPLETAMENTE intacta", async () => {
    seedConflict();
    const antes = JSON.stringify(H.current!.store.cm_whatsapp_accounts);

    await whatsappExchange(
      jsonRequest({ code: "c", phone_number_id: PHONE, waba_id: "W1", client_id: BRAND_A }),
    );

    // Ni una fila nueva, ni un client_id reasignado.
    expect(JSON.stringify(H.current!.store.cm_whatsapp_accounts)).toBe(antes);
    expect(H.current!.store.cm_whatsapp_accounts).toHaveLength(0);
  });

  it("una cuenta legacy existente no cambia de marca al bloquearse", async () => {
    H.current = seed({
      cm_whatsapp_accounts: [
        { id: "wa-1", client_id: BRAND_B, phone_number_id: PHONE, waba_id: "W1" },
      ],
      channels: [
        {
          id: "ch-b",
          organization_id: ORG,
          brand_id: BRAND_B,
          whatsapp_phone_number_id: PHONE,
          status: "active",
        },
      ],
    });

    await whatsappExchange(
      jsonRequest({ code: "c", phone_number_id: PHONE, waba_id: "W1", client_id: BRAND_A }),
    );

    // Éste es el daño concreto de la versión anterior: el UPSERT corría antes
    // del bloqueo y dejaba `client_id` apuntando ya a la marca nueva.
    const cuenta = H.current!.store.cm_whatsapp_accounts[0];
    expect(cuenta.client_id).toBe(BRAND_B);
    expect(H.current!.store.cm_whatsapp_accounts).toHaveLength(1);
  });

  it("smarttalk.channels queda COMPLETAMENTE intacta", async () => {
    seedConflict();
    const antes = JSON.stringify(H.current!.store.channels);

    await whatsappExchange(
      jsonRequest({ code: "c", phone_number_id: PHONE, waba_id: "W1", client_id: BRAND_A }),
    );

    expect(JSON.stringify(H.current!.store.channels)).toBe(antes);
    expect(H.current!.store.channels).toHaveLength(1);
    expect(H.current!.store.channels[0].brand_id).toBe(BRAND_B);
  });

  it("sin conflicto sí escribe: la corrección no rompió el camino feliz", async () => {
    H.current = seed();
    const response = await whatsappExchange(
      jsonRequest({ code: "c", phone_number_id: "PN-LIBRE", waba_id: "W1", client_id: BRAND_A }),
    );

    expect(response.status).toBe(200);
    expect(H.current!.store.cm_whatsapp_accounts).toHaveLength(1);
    expect(H.current!.store.cm_whatsapp_accounts[0].client_id).toBe(BRAND_A);
    expect(H.current!.store.channels).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 2. Reconectar Facebook no borra Instagram
// ---------------------------------------------------------------------------
describe("2 · El flujo de Facebook no pisa los campos de Instagram", () => {
  async function conectarInstagram() {
    H.pages = [PAGE_IG];
    await handleMetaCallback(callbackRequest(), "/api/auth/meta/callback");
  }

  it("conectar Instagram y luego reconectar Facebook conserva Instagram", async () => {
    await conectarInstagram();
    const tras_ig = H.current!.store.cm_social_accounts[0];
    expect(tras_ig.instagram_id).toBe("ig-999");
    expect(tras_ig.instagram_username).toBe("cuenta_ig");

    // Ahora una reconexión SÓLO de Facebook, con otra página.
    H.current!.store.cm_oauth_states.push({ state: "state-1", client_id: BRAND_A });
    H.pages = [PAGE_1];
    await handleMetaCallback(callbackRequest(), "/auth/facebook/callback");

    const tras_fb = H.current!.store.cm_social_accounts[0];
    // La página sí se actualiza…
    expect(tras_fb.page_id).toBe(PAGE_1.id);
    expect(tras_fb.page_name).toBe("Página Uno");
    // …y la cuenta de Instagram sigue exactamente donde estaba.
    expect(tras_fb.instagram_id).toBe("ig-999");
    expect(tras_fb.instagram_username).toBe("cuenta_ig");
  });

  it("el flujo de Facebook ni siquiera envía los campos de Instagram y Ads", async () => {
    H.current!.store.cm_social_accounts.push({
      id: "social-1",
      client_id: BRAND_A,
      instagram_id: "ig-previo",
      instagram_username: "previo",
      ad_account_id: "act-previo",
      ad_account_name: "Ads previo",
      business_id: "biz-previo",
    });
    H.pages = [PAGE_1];
    await handleMetaCallback(callbackRequest(), "/auth/facebook/callback");

    const social = H.current!.store.cm_social_accounts[0];
    for (const [campo, valor] of [
      ["instagram_id", "ig-previo"],
      ["instagram_username", "previo"],
      ["ad_account_id", "act-previo"],
      ["ad_account_name", "Ads previo"],
      ["business_id", "biz-previo"],
    ] as const) {
      expect(social[campo]).toBe(valor);
    }
  });

  it("el flujo de Instagram sí actualiza sus propios campos", async () => {
    H.current!.store.cm_social_accounts.push({
      id: "social-1",
      client_id: BRAND_A,
      instagram_id: "ig-viejo",
      instagram_username: "viejo",
    });
    await conectarInstagram();

    const social = H.current!.store.cm_social_accounts[0];
    expect(social.instagram_id).toBe("ig-999");
    expect(social.instagram_username).toBe("cuenta_ig");
  });

  it("una primera conexión sólo de Facebook no inventa datos de Instagram", async () => {
    H.pages = [PAGE_1];
    await handleMetaCallback(callbackRequest(), "/auth/facebook/callback");

    const social = H.current!.store.cm_social_accounts[0];
    expect(social.page_id).toBe(PAGE_1.id);
    expect(social.instagram_id).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. Un error de lectura bloquea
// ---------------------------------------------------------------------------
describe("3 · Un error de lectura bloquea y no escribe nada", () => {
  const tablas = [
    { tabla: "channels", kind: "facebook_page" as const },
    { tabla: "cm_social_accounts", kind: "facebook_page" as const },
    { tabla: "cm_whatsapp_accounts", kind: "whatsapp_phone" as const },
    { tabla: "cm_clients", kind: "facebook_page" as const },
  ];

  for (const { tabla, kind } of tablas) {
    it(`un error en ${tabla} produce bloqueo, no vía libre`, async () => {
      H.current = createFakeSupabase({
        currentUserId: "auth-user-1",
        errorOn: { [tabla]: { select: { code: "57014", message: "statement timeout" } } },
        tables: {
          // Hay un ocupante real, para que `cm_clients` llegue a consultarse.
          channels: [
            {
              id: "ch-b",
              organization_id: ORG,
              brand_id: BRAND_B,
              meta_business_id: PAGE_1.id,
              whatsapp_phone_number_id: PHONE,
              status: "active",
            },
          ],
          cm_social_accounts: [],
          cm_whatsapp_accounts: [],
          cm_clients: [
            { id: BRAND_B, name: "Marca B", status: "active", smarttalk_organization_id: ORG },
          ],
        },
      });

      const conflict = await findAssetConflict({
        kind,
        assetId: kind === "whatsapp_phone" ? PHONE : PAGE_1.id,
        organizationId: ORG,
        brandId: BRAND_A,
      });

      // Bloquea: si no se puede comprobar, no se conecta.
      expect(conflict).not.toBeNull();
      expect(conflict!.message).toContain("No se pudo verificar");
    });
  }

  it("el callback bloqueado por error de lectura no escribe nada", async () => {
    H.current = createFakeSupabase({
      currentUserId: "auth-user-1",
      errorOn: { cm_social_accounts: { select: { code: "57014", message: "statement timeout" } } },
      tables: {
        cm_oauth_states: [{ state: "state-1", client_id: BRAND_A }],
        cm_clients: [
          { id: BRAND_A, name: "Marca A", status: "active", smarttalk_organization_id: ORG, user_id: "u1" },
        ],
        cm_social_accounts: [],
        cm_activity_log: [],
        channels: [],
        organizations: [{ id: ORG, name: "Agencia" }],
        subscriptions: [],
        plan_entitlements: [],
      },
    });
    H.pages = [PAGE_1];

    const response = await handleMetaCallback(callbackRequest(), "/auth/facebook/callback");

    expect(decodeURIComponent(response.headers.get("location") || "")).toContain("meta_error");
    expect(H.current.store.cm_social_accounts).toHaveLength(0);
    expect(H.current.store.channels).toHaveLength(0);
  });

  it("el mensaje de bloqueo por error no filtra detalles internos", async () => {
    H.current = createFakeSupabase({
      currentUserId: "auth-user-1",
      errorOn: { channels: { select: { code: "42501", message: "permission denied for relation channels" } } },
      tables: { channels: [], cm_social_accounts: [], cm_clients: [] },
    });

    const conflict = await findAssetConflict({
      kind: "facebook_page",
      assetId: PAGE_1.id,
      organizationId: ORG,
      brandId: BRAND_A,
    });
    expect(conflict!.message).not.toContain("permission denied");
  });
});

// ---------------------------------------------------------------------------
// 4. Consumo atómico de la selección
// ---------------------------------------------------------------------------
describe("4 · La selección se consume una sola vez, de verdad", () => {
  async function prepararSeleccion() {
    H.pages = [PAGE_1, PAGE_2];
    await handleMetaCallback(callbackRequest(), "/auth/facebook/callback");
    return H.current!.store.cm_oauth_pending_selections[0].id as string;
  }

  it("consumePendingSelection informa de quién ganó", async () => {
    const selectionId = await prepararSeleccion();

    expect(await consumePendingSelection(selectionId)).toBe(true);
    // La segunda ya no encuentra `consumed_at IS NULL`.
    expect(await consumePendingSelection(selectionId)).toBe(false);
  });

  it("dos POST simultáneos: exactamente uno conecta", async () => {
    const selectionId = await prepararSeleccion();

    const [primera, segunda] = await Promise.all([
      selectPage(jsonRequest({ selection: selectionId, pageId: PAGE_1.id })),
      selectPage(jsonRequest({ selection: selectionId, pageId: PAGE_2.id })),
    ]);

    const estados = [primera.status, segunda.status].sort();
    expect(estados).toEqual([200, 409]);

    // Y sobre todo: una sola conexión guardada.
    expect(H.current!.store.cm_social_accounts).toHaveLength(1);
  });

  it("el que pierde recibe 409 y un código explícito", async () => {
    const selectionId = await prepararSeleccion();

    const [primera, segunda] = await Promise.all([
      selectPage(jsonRequest({ selection: selectionId, pageId: PAGE_1.id })),
      selectPage(jsonRequest({ selection: selectionId, pageId: PAGE_2.id })),
    ]);

    const perdedora = primera.status === 409 ? primera : segunda;
    expect(perdedora.status).toBe(409);
    expect((await perdedora.json()).code).toBe("already_consumed");
  });

  it("diez POST simultáneos siguen produciendo una sola conexión", async () => {
    const selectionId = await prepararSeleccion();

    const respuestas = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        selectPage(
          jsonRequest({ selection: selectionId, pageId: index % 2 === 0 ? PAGE_1.id : PAGE_2.id }),
        ),
      ),
    );

    expect(respuestas.filter((response) => response.status === 200)).toHaveLength(1);
    expect(H.current!.store.cm_social_accounts).toHaveLength(1);
  });
});
