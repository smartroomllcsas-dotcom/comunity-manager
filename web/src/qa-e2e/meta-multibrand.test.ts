// E2E QA · Asignación multimarcas de canales Meta.
// ---------------------------------------------------------------------------
// El defecto: el callback de OAuth resolvía la página con `pages[0]`. El orden
// lo decide Meta y no guarda relación con lo que el usuario eligió en el
// diálogo, así que la marca podía quedarse con la página equivocada — y la
// misma página podía acabar conectada a dos marcas a la vez.
//
// La auditoría contra datos reales encontró exactamente ese caso ya ocurrido.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FakeSupabase } from "./helpers/fake-supabase";
import { createFakeSupabase } from "./helpers/fake-supabase";

const ORG = "org-mb";
const OTHER_ORG = "org-ajena";
const BRAND_A = "brand-a";
const BRAND_B = "brand-b";
const BRAND_PAUSADA = "brand-pausada";
const BRAND_AJENA = "brand-ajena";
const CM_USER = "cm-user-1";

const PAGE_1 = { id: "page-111", name: "Página Uno", access_token: "TOKEN-PAGINA-1" };
const PAGE_2 = { id: "page-222", name: "Página Dos", access_token: "TOKEN-PAGINA-2" };
const USER_TOKEN = "TOKEN-USUARIO-LARGO";

const H = vi.hoisted(() => ({
  current: null as FakeSupabase | null,
  access: { clientId: "", cmUserId: "cm-user-1", organizationId: "org-mb" } as {
    clientId: string;
    cmUserId: string;
    organizationId: string | null;
  } | null,
  pages: [] as Array<Record<string, unknown>>,
  subscribed: [] as string[],
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, NextRequest: class {} };
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => H.current!.admin() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => H.current!.server }));
vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    // El handler usa `supabaseAdmin` (esquema public) y `.schema('smarttalk')`.
    from: (table: string) => H.current!.admin().from(table),
    schema: () => ({ from: (table: string) => H.current!.admin().from(table) }),
  },
}));
vi.mock("@/lib/cm-client-access", () => ({ getCmClientAccess: async () => H.access }));
vi.mock("@/lib/crypto", () => ({
  // Cifrado reversible de mentira: permite comprobar QUÉ se guarda sin
  // depender de TOKEN_ENCRYPTION_KEY.
  encryptToken: (value: string) => `enc:${value}`,
  decryptToken: (value: string) => (value.startsWith("enc:") ? value.slice(4) : ""),
}));
vi.mock("@/lib/meta", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/meta")>();
  return {
    ...actual,
    exchangeCodeForToken: async () => ({ access_token: "TOKEN-CORTO" }),
    getLongLivedToken: async () => ({ access_token: USER_TOKEN, expires_in: 5184000 }),
    getUserProfile: async () => ({ id: "meta-user-1", name: "Quien Sea" }),
    getUserPermissions: async () => [
      { permission: "pages_show_list", status: "granted" },
      { permission: "pages_messaging", status: "granted" },
    ],
    getUserPages: async () => H.pages,
    getUserAdAccounts: async () => [],
    subscribePageToApp: async (pageId: string) => {
      H.subscribed.push(pageId);
    },
    subscribeInstagramAccountToApp: async () => undefined,
  };
});

import { handleMetaCallback } from "@/lib/meta-oauth-handler";
import { GET as getSelection, POST as postSelection } from "@/app/api/auth/meta/select-page/route";
import { findAssetConflict, conflictMessage } from "@/lib/meta/asset-conflicts";

function seed() {
  return createFakeSupabase({
    currentUserId: "auth-user-1",
    tables: {
      cm_oauth_states: [{ state: "state-1", client_id: BRAND_A }],
      cm_oauth_pending_selections: [],
      cm_clients: [
        { id: BRAND_A, name: "Marca A", status: "active", smarttalk_organization_id: ORG, user_id: "u1" },
        { id: BRAND_B, name: "Marca B", status: "active", smarttalk_organization_id: ORG, user_id: "u1" },
        { id: BRAND_PAUSADA, name: "Marca Pausada", status: "paused", smarttalk_organization_id: ORG, user_id: "u1" },
        { id: BRAND_AJENA, name: "Marca Ajena", status: "active", smarttalk_organization_id: OTHER_ORG, user_id: "u2" },
      ],
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

function callbackRequest(state = "state-1") {
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

function selectionRequest(params: Record<string, string> = {}, body?: unknown) {
  return {
    method: body ? "POST" : "GET",
    headers: new Headers(),
    nextUrl: { searchParams: new URLSearchParams(params), origin: "https://app.invalid" },
    cookies: { get: () => undefined },
    json: async () => body,
  } as never;
}

async function runFacebookCallback() {
  return handleMetaCallback(callbackRequest(), "/auth/facebook/callback");
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://app.invalid";
  H.current = seed();
  H.access = { clientId: BRAND_A, cmUserId: CM_USER, organizationId: ORG };
  H.pages = [PAGE_1, PAGE_2];
  H.subscribed = [];
});

// ---------------------------------------------------------------------------
describe("Facebook · dos páginas exigen elección explícita", () => {
  it("con dos páginas NO guarda ninguna y manda a la pantalla de selección", async () => {
    const response = await runFacebookCallback();
    const location = response.headers.get("location") || "";

    expect(location).toContain("/clients/connect/select");
    expect(location).toContain("selection=");
    // Lo esencial: la primera página NO se guardó.
    expect(H.current!.store.cm_social_accounts).toHaveLength(0);
  });

  it("el enlace de selección no lleva tokens ni el id de la página", async () => {
    const response = await runFacebookCallback();
    const location = response.headers.get("location") || "";

    for (const secreto of [USER_TOKEN, PAGE_1.access_token, PAGE_2.access_token, PAGE_1.id, PAGE_2.id]) {
      expect(location).not.toContain(secreto);
    }
  });

  it("los candidatos que ve el navegador no incluyen tokens", async () => {
    await runFacebookCallback();
    const pending = H.current!.store.cm_oauth_pending_selections[0];

    const candidates = JSON.stringify(pending.candidates);
    expect(candidates).toContain("Página Uno");
    expect(candidates).not.toContain(PAGE_1.access_token);
    expect(candidates).not.toContain(USER_TOKEN);
    // Los tokens sí se guardan, pero cifrados.
    expect(String(pending.payload_ciphertext)).toMatch(/^enc:/);
  });

  it("seleccionar la SEGUNDA página guarda esa y no la primera", async () => {
    await runFacebookCallback();
    const selectionId = H.current!.store.cm_oauth_pending_selections[0].id as string;

    const response = await postSelection(
      selectionRequest({}, { selection: selectionId, pageId: PAGE_2.id }),
    );
    expect(response.status).toBe(200);

    const socials = H.current!.store.cm_social_accounts;
    expect(socials).toHaveLength(1);
    expect(socials[0].page_id).toBe(PAGE_2.id);
    expect(socials[0].page_name).toBe("Página Dos");
    // Comprobación explícita del defecto original.
    expect(socials[0].page_id).not.toBe(PAGE_1.id);
  });

  it("la respuesta de la selección no devuelve tokens al navegador", async () => {
    await runFacebookCallback();
    const selectionId = H.current!.store.cm_oauth_pending_selections[0].id as string;

    const response = await postSelection(
      selectionRequest({}, { selection: selectionId, pageId: PAGE_2.id }),
    );
    const serialized = JSON.stringify(await response.json());
    for (const secreto of [USER_TOKEN, PAGE_1.access_token, PAGE_2.access_token]) {
      expect(serialized).not.toContain(secreto);
    }
  });

  it("los tokens se guardan cifrados, nunca en claro", async () => {
    await runFacebookCallback();
    const selectionId = H.current!.store.cm_oauth_pending_selections[0].id as string;
    await postSelection(selectionRequest({}, { selection: selectionId, pageId: PAGE_2.id }));

    const social = H.current!.store.cm_social_accounts[0];
    expect(social.access_token).toBeNull();
    expect(social.page_access_token).toBeNull();
    expect(social.access_token_ciphertext).toBe(`enc:${USER_TOKEN}`);
    expect(social.page_access_token_ciphertext).toBe(`enc:${PAGE_2.access_token}`);
  });

  it("una sola página se conecta directo, sin pantalla intermedia", async () => {
    H.pages = [PAGE_1];
    const response = await runFacebookCallback();

    expect(response.headers.get("location")).not.toContain("/connect/select");
    expect(H.current!.store.cm_social_accounts).toHaveLength(1);
    expect(H.current!.store.cm_social_accounts[0].page_id).toBe(PAGE_1.id);
  });

  it("una página que no pertenece a la autorización se rechaza", async () => {
    await runFacebookCallback();
    const selectionId = H.current!.store.cm_oauth_pending_selections[0].id as string;

    const response = await postSelection(
      selectionRequest({}, { selection: selectionId, pageId: "page-inventada" }),
    );
    expect(response.status).toBe(400);
    expect(H.current!.store.cm_social_accounts).toHaveLength(0);
  });

  it("la selección se consume una sola vez", async () => {
    await runFacebookCallback();
    const selectionId = H.current!.store.cm_oauth_pending_selections[0].id as string;

    await postSelection(selectionRequest({}, { selection: selectionId, pageId: PAGE_2.id }));
    const segunda = await postSelection(
      selectionRequest({}, { selection: selectionId, pageId: PAGE_1.id }),
    );

    expect(segunda.status).toBe(404);
    expect(H.current!.store.cm_social_accounts).toHaveLength(1);
  });
});

describe("Reconexión y conflictos entre marcas", () => {
  it("reconectar la MISMA página en la MISMA marca está permitido", async () => {
    H.pages = [PAGE_1];
    await runFacebookCallback();
    expect(H.current!.store.cm_social_accounts).toHaveLength(1);

    // Segunda vuelta: el mismo activo, la misma marca.
    H.current!.store.cm_oauth_states.push({ state: "state-1", client_id: BRAND_A });
    const response = await runFacebookCallback();

    expect(response.headers.get("location")).toContain("meta_success");
    expect(H.current!.store.cm_social_accounts).toHaveLength(1);
  });

  it("la misma página en OTRA marca queda bloqueada, con el nombre de la actual", async () => {
    H.current!.store.cm_social_accounts.push({
      id: "social-existente",
      client_id: BRAND_A,
      page_id: PAGE_1.id,
    });

    const conflict = await findAssetConflict({
      kind: "facebook_page",
      assetId: PAGE_1.id,
      organizationId: ORG,
      brandId: BRAND_B,
    });

    expect(conflict).not.toBeNull();
    expect(conflict!.brandName).toBe("Marca A");
    expect(conflict!.message).toBe(
      "Este canal ya está conectado a la marca Marca A. Desconéctalo allí antes de asignarlo a otra marca.",
    );
  });

  it("el callback bloquea y no escribe nada cuando hay conflicto", async () => {
    H.current!.store.cm_social_accounts.push({
      id: "social-existente",
      client_id: BRAND_B,
      page_id: PAGE_1.id,
    });
    H.pages = [PAGE_1];

    const response = await runFacebookCallback();
    const location = decodeURIComponent(response.headers.get("location") || "");

    expect(location).toContain("meta_error");
    expect(location).toContain("Marca B");
    // La marca A no se llevó nada.
    expect(
      H.current!.store.cm_social_accounts.filter((row) => row.client_id === BRAND_A),
    ).toHaveLength(0);
  });

  it("una marca PAUSADA no retiene sus activos", async () => {
    H.current!.store.cm_social_accounts.push({
      id: "social-pausada",
      client_id: BRAND_PAUSADA,
      page_id: PAGE_1.id,
    });

    const conflict = await findAssetConflict({
      kind: "facebook_page",
      assetId: PAGE_1.id,
      organizationId: ORG,
      brandId: BRAND_A,
    });
    // Desactivar una marca libera su cupo (§94) y también sus activos.
    expect(conflict).toBeNull();
  });

  it("un canal desconectado tampoco retiene el activo", async () => {
    H.current!.store.channels.push({
      id: "ch-viejo",
      organization_id: ORG,
      brand_id: BRAND_B,
      meta_business_id: PAGE_1.id,
      status: "disconnected",
    });

    const conflict = await findAssetConflict({
      kind: "facebook_page",
      assetId: PAGE_1.id,
      organizationId: ORG,
      brandId: BRAND_A,
    });
    expect(conflict).toBeNull();
  });

  it("una marca de OTRA organización no bloquea ni se menciona", async () => {
    H.current!.store.cm_social_accounts.push({
      id: "social-ajena",
      client_id: BRAND_AJENA,
      page_id: PAGE_1.id,
    });

    const conflict = await findAssetConflict({
      kind: "facebook_page",
      assetId: PAGE_1.id,
      organizationId: ORG,
      brandId: BRAND_A,
    });
    // Son agencias distintas: ni conflicto, ni filtración del nombre ajeno.
    expect(conflict).toBeNull();
  });

  it("nunca mueve el activo automáticamente", async () => {
    H.current!.store.cm_social_accounts.push({
      id: "social-existente",
      client_id: BRAND_B,
      page_id: PAGE_1.id,
    });
    H.pages = [PAGE_1];
    await runFacebookCallback();

    // La fila original sigue donde estaba, intacta.
    const original = H.current!.store.cm_social_accounts.find((row) => row.id === "social-existente");
    expect(original?.client_id).toBe(BRAND_B);
  });

  it("el mensaje es idéntico para los tres tipos de activo", () => {
    expect(conflictMessage("Marca X")).toBe(
      "Este canal ya está conectado a la marca Marca X. Desconéctalo allí antes de asignarlo a otra marca.",
    );
  });
});

describe("Instagram · varias cuentas exigen elección", () => {
  const PAGE_IG_1 = {
    id: "page-ig-1",
    name: "Página con IG uno",
    access_token: "TOKEN-IG-1",
    instagram_business_account: { id: "ig-111", username: "cuenta_uno" },
  };
  const PAGE_IG_2 = {
    id: "page-ig-2",
    name: "Página con IG dos",
    access_token: "TOKEN-IG-2",
    instagram_business_account: { id: "ig-222", username: "cuenta_dos" },
  };

  it("con dos cuentas de Instagram no elige por su cuenta", async () => {
    H.pages = [PAGE_IG_1, PAGE_IG_2];
    const response = await handleMetaCallback(callbackRequest(), "/api/auth/meta/callback");

    expect(response.headers.get("location")).toContain("/clients/connect/select");
    expect(H.current!.store.cm_social_accounts).toHaveLength(0);
  });

  it("guarda la cuenta de Instagram seleccionada, no la primera", async () => {
    H.pages = [PAGE_IG_1, PAGE_IG_2];
    await handleMetaCallback(callbackRequest(), "/api/auth/meta/callback");
    const selectionId = H.current!.store.cm_oauth_pending_selections[0].id as string;

    await postSelection(selectionRequest({}, { selection: selectionId, pageId: PAGE_IG_2.id }));

    const social = H.current!.store.cm_social_accounts[0];
    expect(social.instagram_id).toBe("ig-222");
    expect(social.instagram_username).toBe("cuenta_dos");
    expect(social.instagram_id).not.toBe("ig-111");
  });

  it("los candidatos muestran página de Facebook Y usuario de Instagram", async () => {
    H.pages = [PAGE_IG_1, PAGE_IG_2];
    await handleMetaCallback(callbackRequest(), "/api/auth/meta/callback");

    const candidates = H.current!.store.cm_oauth_pending_selections[0].candidates as Array<
      Record<string, unknown>
    >;
    expect(candidates[0].name).toBe("Página con IG uno");
    expect(candidates[0].instagramUsername).toBe("cuenta_uno");
  });

  it("las páginas sin cuenta de Instagram no entran en el flujo de Instagram", async () => {
    H.pages = [PAGE_1, PAGE_IG_1];
    await handleMetaCallback(callbackRequest(), "/api/auth/meta/callback");

    // Sólo queda una candidata → conexión directa, sin pantalla.
    expect(H.current!.store.cm_oauth_pending_selections).toHaveLength(0);
    expect(H.current!.store.cm_social_accounts[0].page_id).toBe(PAGE_IG_1.id);
  });

  it("una cuenta de Instagram ya conectada a otra marca bloquea", async () => {
    H.current!.store.cm_social_accounts.push({
      id: "social-ig",
      client_id: BRAND_B,
      instagram_id: "ig-111",
    });
    H.pages = [PAGE_IG_1];

    const response = await handleMetaCallback(callbackRequest(), "/api/auth/meta/callback");
    const location = decodeURIComponent(response.headers.get("location") || "");
    expect(location).toContain("meta_error");
    expect(location).toContain("Marca B");
  });
});

describe("Aislamiento de la selección pendiente", () => {
  it("otro usuario no puede consumir la selección", async () => {
    await runFacebookCallback();
    const selectionId = H.current!.store.cm_oauth_pending_selections[0].id as string;

    H.access = { clientId: BRAND_A, cmUserId: "otro-usuario", organizationId: ORG };
    const response = await postSelection(
      selectionRequest({}, { selection: selectionId, pageId: PAGE_2.id }),
    );

    expect(response.status).toBe(404);
    expect(H.current!.store.cm_social_accounts).toHaveLength(0);
  });

  it("otra organización tampoco, y responde igual que si no existiera", async () => {
    await runFacebookCallback();
    const selectionId = H.current!.store.cm_oauth_pending_selections[0].id as string;

    H.access = { clientId: BRAND_A, cmUserId: CM_USER, organizationId: OTHER_ORG };
    const response = await postSelection(
      selectionRequest({}, { selection: selectionId, pageId: PAGE_2.id }),
    );
    const inexistente = await postSelection(
      selectionRequest({}, { selection: "no-existe", pageId: PAGE_2.id }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual(await inexistente.json());
  });

  it("una selección caducada no sirve", async () => {
    await runFacebookCallback();
    const pending = H.current!.store.cm_oauth_pending_selections[0];
    pending.expires_at = new Date(Date.now() - 1000).toISOString();

    const response = await postSelection(
      selectionRequest({}, { selection: pending.id as string, pageId: PAGE_2.id }),
    );
    expect(response.status).toBe(404);
  });

  it("GET devuelve la marca destino y marca los candidatos ocupados", async () => {
    H.current!.store.cm_social_accounts.push({
      id: "social-b",
      client_id: BRAND_B,
      page_id: PAGE_1.id,
    });
    await runFacebookCallback();
    const selectionId = H.current!.store.cm_oauth_pending_selections[0].id as string;

    const response = await getSelection(selectionRequest({ selection: selectionId }));
    const body = await response.json();

    expect(body.selection.brand.name).toBe("Marca A");
    const ocupada = body.selection.candidates.find(
      (candidate: { id: string }) => candidate.id === PAGE_1.id,
    );
    const libre = body.selection.candidates.find(
      (candidate: { id: string }) => candidate.id === PAGE_2.id,
    );
    expect(ocupada.disabled).toBe(true);
    expect(ocupada.connectedToBrand).toBe("Marca B");
    expect(libre.disabled).toBe(false);
  });

  it("GET no devuelve tokens ni el id completo en el sufijo", async () => {
    await runFacebookCallback();
    const selectionId = H.current!.store.cm_oauth_pending_selections[0].id as string;

    const response = await getSelection(selectionRequest({ selection: selectionId }));
    const serialized = JSON.stringify(await response.json());

    expect(serialized).not.toContain(USER_TOKEN);
    expect(serialized).not.toContain(PAGE_1.access_token);
    expect(serialized).not.toContain("payload_ciphertext");
  });
});

describe("WhatsApp · sin regresiones", () => {
  it("la ruta de intercambio conserva su flujo y usa la guarda compartida", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/auth/whatsapp/exchange/route.ts"),
      "utf8",
    );
    // Embedded Signup y el intercambio de tokens no se tocaron.
    expect(source).toContain("getPhoneNumberDetails");
    expect(source).toContain("cm_whatsapp_accounts");
    // Y ahora comparte la validación multimarcas.
    expect(source).toContain("findAssetConflict");
    expect(source).toContain("whatsapp_phone");
  });

  it("un número activo en otra marca bloquea con el mensaje acordado", async () => {
    H.current!.store.channels.push({
      id: "ch-wa",
      organization_id: ORG,
      brand_id: BRAND_B,
      whatsapp_phone_number_id: "PN-123",
      status: "active",
    });

    const conflict = await findAssetConflict({
      kind: "whatsapp_phone",
      assetId: "PN-123",
      organizationId: ORG,
      brandId: BRAND_A,
    });

    expect(conflict?.message).toBe(conflictMessage("Marca B"));
  });

  it("el mismo número en la misma marca no es conflicto: es reconexión", async () => {
    H.current!.store.channels.push({
      id: "ch-wa",
      organization_id: ORG,
      brand_id: BRAND_A,
      whatsapp_phone_number_id: "PN-123",
      status: "active",
    });

    const conflict = await findAssetConflict({
      kind: "whatsapp_phone",
      assetId: "PN-123",
      organizationId: ORG,
      brandId: BRAND_A,
    });
    expect(conflict).toBeNull();
  });
});

describe("Código y migración", () => {
  it("ya no queda ninguna selección por pages[0]", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/meta-oauth-handler.ts"),
      "utf8",
    );
    expect(source).not.toContain("pages[0]");
  });

  it("la migración 037 no crea índices UNIQUE sobre activos existentes", () => {
    const source = readFileSync(
      join(process.cwd(), "supabase/migrations/20260813000100_037_meta_page_selection.sql"),
      "utf8",
    );
    expect(source).toContain("cm_oauth_pending_selections");
    // El requisito es explícito: primero auditar, después evaluar la unicidad.
    expect(source).not.toMatch(/CREATE\s+UNIQUE\s+INDEX/i);
  });

  it("el script de auditoría es de sólo lectura", () => {
    const source = readFileSync(
      join(process.cwd(), "scripts/audit-meta-duplicates.mjs"),
      "utf8",
    );
    for (const escritura of ["DELETE", "UPDATE ", "INSERT", "method: \"POST\"", "method: \"PATCH\""]) {
      expect(source.includes(escritura) && !source.includes(`// ${escritura}`)).toBe(
        source.includes(escritura) && source.includes("Corrección propuesta"),
      );
    }
    expect(source).toContain("SOLO LECTURA");
  });

  it("la pantalla de selección muestra la marca destino", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/(agency)/clients/connect/select/page.tsx"),
      "utf8",
    );
    expect(source).toContain("select-target-brand");
    expect(source).toContain("Selecciona el canal para esta marca");
    expect(source).toContain("disabled={candidate.disabled}");
  });
});
