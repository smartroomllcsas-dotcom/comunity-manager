// E2E QA · Aislamiento visual por marca en el Inbox.
// ---------------------------------------------------------------------------
// Cubre las pruebas obligatorias del requisito:
//
//   1. `agency_user` ve todas las marcas de su organización.
//   2. `brand_admin` sólo ve la suya.
//   3. `brand_advisor` sólo ve sus `brand_advisor_assignments`.
//   4. Un miembro con alcance por marca y sin asignaciones ve cero leads.
//   5. Un `brandId` no autorizado devuelve 403.
//   6. El nombre de marca llega a la tarjeta de canal, a la conversación y al
//      encabezado del chat abierto.
//
// Las cinco primeras se ejecutan contra las **rutas reales**, porque ahí vive
// la autorización. La sexta se verifica sobre la lógica de presentación
// (`brand-display`) y sobre el árbol de componentes: el proyecto no tiene jsdom
// ni testing-library, así que no se monta DOM — se comprueba que los tres
// componentes reciben `brand_id` y lo resuelven con `BrandTag`, no con el
// nombre del canal.
import { describe, it, expect, vi } from "vitest";
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
// El sync de Instagram es un efecto lateral de /api/inbox/conversations que no
// interviene en el alcance por marca; se silencia para no tocar red.
vi.mock("@/lib/smarttalk/instagram-sync", () => ({
  syncInstagramInboxForOrganization: async () => ({ errors: [] }),
}));

import { GET as getBrands } from "@/app/api/inbox/brands/route";
import { GET as getConversations } from "@/app/api/inbox/conversations/route";
import { GET as getChannels } from "@/app/api/inbox/channels/route";
import {
  BRAND_UNAVAILABLE_LABEL,
  BRAND_UNASSIGNED_LABEL,
  brandFilterOptions,
  brandLabel,
  indexBrands,
  isBrandFallback,
  shortBrandId,
} from "@/lib/inbox/brand-display";

const ORG = "org-inbox-qa";
const OTHER_ORG = "org-ajena";

const BRAND_A = "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BRAND_B = "22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BRAND_SIN_NOMBRE = "33333333-cccc-4ccc-8ccc-cccccccccccc";
const BRAND_AJENA = "99999999-9999-4999-8999-999999999999";

const AGENCY_USER = "agent-agency";
const BRAND_ADMIN_A = "agent-admin-a";
const ADVISOR_B_Y_SIN_NOMBRE = "agent-advisor-b";
const ADVISOR_SIN_ASIGNACION = "agent-advisor-huerfano";

function seed(currentUserId: string) {
  return createFakeSupabase({
    currentUserId,
    tables: {
      agents: [
        { id: AGENCY_USER, organization_id: ORG, member_type: "agency_user", is_super_admin: false },
        { id: BRAND_ADMIN_A, organization_id: ORG, member_type: "brand_admin", is_super_admin: false },
        { id: ADVISOR_B_Y_SIN_NOMBRE, organization_id: ORG, member_type: "brand_advisor", is_super_admin: false },
        { id: ADVISOR_SIN_ASIGNACION, organization_id: ORG, member_type: "brand_advisor", is_super_admin: false },
      ],
      brand_advisor_assignments: [
        { organization_id: ORG, agent_id: BRAND_ADMIN_A, brand_id: BRAND_A },
        { organization_id: ORG, agent_id: ADVISOR_B_Y_SIN_NOMBRE, brand_id: BRAND_B },
        { organization_id: ORG, agent_id: ADVISOR_B_Y_SIN_NOMBRE, brand_id: BRAND_SIN_NOMBRE },
        // Asignación de otra organización: no debe filtrarse a este org.
        { organization_id: OTHER_ORG, agent_id: ADVISOR_SIN_ASIGNACION, brand_id: BRAND_AJENA },
      ],
      cm_clients: [
        { id: BRAND_A, name: "Marca A", smarttalk_organization_id: ORG },
        { id: BRAND_B, name: "Marca B", smarttalk_organization_id: ORG },
        { id: BRAND_SIN_NOMBRE, name: null, smarttalk_organization_id: ORG },
        { id: BRAND_AJENA, name: "Marca Ajena", smarttalk_organization_id: OTHER_ORG },
      ],
      channels: [
        { id: "ch-a", organization_id: ORG, brand_id: BRAND_A, type: "whatsapp", name: "WhatsApp Ventas", status: "connected", created_at: "2026-01-02" },
        { id: "ch-b", organization_id: ORG, brand_id: BRAND_B, type: "whatsapp", name: "WhatsApp Ventas", status: "connected", created_at: "2026-01-01" },
      ],
      conversations: [
        {
          id: "conv-a", organization_id: ORG, brand_id: BRAND_A, channel_id: "ch-a",
          status: "open", updated_at: "2026-01-03T00:00:00Z", last_message_preview: "hola A",
          assigned_agent_id: null, metadata: null,
          contact: { name: "Contacto A", visibility_status: "active" },
          channel: { id: "ch-a", brand_id: BRAND_A, type: "whatsapp", name: "WhatsApp Ventas" },
        },
        {
          id: "conv-b", organization_id: ORG, brand_id: BRAND_B, channel_id: "ch-b",
          status: "open", updated_at: "2026-01-02T00:00:00Z", last_message_preview: "hola B",
          assigned_agent_id: null, metadata: null,
          contact: { name: "Contacto B", visibility_status: "active" },
          channel: { id: "ch-b", brand_id: BRAND_B, type: "whatsapp", name: "WhatsApp Ventas" },
        },
        {
          id: "conv-sin-nombre", organization_id: ORG, brand_id: BRAND_SIN_NOMBRE, channel_id: "ch-b",
          status: "open", updated_at: "2026-01-01T00:00:00Z", last_message_preview: "hola C",
          assigned_agent_id: null, metadata: null,
          contact: { name: "Contacto C", visibility_status: "active" },
          channel: { id: "ch-b", brand_id: BRAND_SIN_NOMBRE, type: "whatsapp", name: "WhatsApp Ventas" },
        },
      ],
      inbox_sync_state: [
        { organization_id: ORG, resource: "instagram_inbox", last_synced_at: "2999-01-01T00:00:00Z" },
      ],
    },
  });
}

function conversationsRequest(params: Record<string, string> = {}) {
  return {
    method: "GET",
    headers: new Headers(),
    nextUrl: { searchParams: new URLSearchParams(params) },
  } as never;
}

async function brandIdsFor(userId: string) {
  H.current = seed(userId);
  const body = (await (await getBrands()).json()) as { brands: { id: string; name: string | null }[] };
  return body.brands.map((brand) => brand.id).sort();
}

async function conversationsFor(userId: string, params: Record<string, string> = {}) {
  H.current = seed(userId);
  const response = await getConversations(conversationsRequest(params));
  return { status: response.status, body: await response.json() };
}

describe("Inbox · marcas visibles según el rol", () => {
  it("agency_user ve todas las marcas de su organización y ninguna ajena", async () => {
    expect(await brandIdsFor(AGENCY_USER)).toEqual([BRAND_A, BRAND_B, BRAND_SIN_NOMBRE].sort());
  });

  it("brand_admin sólo ve su marca", async () => {
    expect(await brandIdsFor(BRAND_ADMIN_A)).toEqual([BRAND_A]);
  });

  it("brand_advisor sólo ve las marcas de sus asignaciones", async () => {
    expect(await brandIdsFor(ADVISOR_B_Y_SIN_NOMBRE)).toEqual([BRAND_B, BRAND_SIN_NOMBRE].sort());
  });

  it("un asesor sin asignaciones en su organización no ve ninguna marca", async () => {
    // Tiene una asignación, pero en OTHER_ORG: no debe contar.
    expect(await brandIdsFor(ADVISOR_SIN_ASIGNACION)).toEqual([]);
  });

  it("la lista de marcas nunca incluye columnas ajenas al nombre", async () => {
    H.current = seed(AGENCY_USER);
    const { brands } = (await (await getBrands()).json()) as { brands: Record<string, unknown>[] };
    const source = readFileSync(join(process.cwd(), "src/app/api/inbox/brands/route.ts"), "utf8");
    // El fake no proyecta columnas; la garantía real es el select de la ruta.
    expect(source).toContain('.select("id, name")');
    expect(brands.length).toBeGreaterThan(0);
  });
});

describe("Inbox · conversaciones acotadas por marca", () => {
  it("agency_user recibe las conversaciones de todas sus marcas", async () => {
    const { status, body } = await conversationsFor(AGENCY_USER);
    expect(status).toBe(200);
    expect((body.conversations as { id: string }[]).map((c) => c.id).sort()).toEqual(
      ["conv-a", "conv-b", "conv-sin-nombre"],
    );
  });

  it("brand_admin sólo recibe las conversaciones de su marca", async () => {
    const { body } = await conversationsFor(BRAND_ADMIN_A);
    expect((body.conversations as { brand_id: string }[]).map((c) => c.brand_id)).toEqual([BRAND_A]);
  });

  it("brand_advisor sólo recibe las conversaciones de sus asignaciones", async () => {
    const { body } = await conversationsFor(ADVISOR_B_Y_SIN_NOMBRE);
    expect((body.conversations as { brand_id: string }[]).map((c) => c.brand_id).sort()).toEqual(
      [BRAND_B, BRAND_SIN_NOMBRE].sort(),
    );
  });

  it("sin asignación devuelve cero conversaciones", async () => {
    const { status, body } = await conversationsFor(ADVISOR_SIN_ASIGNACION);
    expect(status).toBe(200);
    expect(body).toEqual({ conversations: [], nextCursor: null });
  });

  it("filtrar por una marca propia acota el resultado a esa marca", async () => {
    const { status, body } = await conversationsFor(ADVISOR_B_Y_SIN_NOMBRE, { brandId: BRAND_B });
    expect(status).toBe(200);
    expect((body.conversations as { id: string }[]).map((c) => c.id)).toEqual(["conv-b"]);
  });

  it("un brandId no autorizado devuelve 403 aunque exista en la organización", async () => {
    const { status, body } = await conversationsFor(ADVISOR_B_Y_SIN_NOMBRE, { brandId: BRAND_A });
    expect(status).toBe(403);
    expect(body).toEqual({ error: "No autorizado para esta marca" });
  });

  it("un brandId de otra organización no devuelve datos", async () => {
    // agency_user no tiene restricción por marca, pero la consulta sigue
    // acotada a su organización: la marca ajena no trae filas.
    const { status, body } = await conversationsFor(AGENCY_USER, { brandId: BRAND_AJENA });
    expect(status).toBe(200);
    expect(body.conversations).toEqual([]);
  });

  it("sin parámetro limit la página es la del contrato, no una sola fila", async () => {
    // Regresión: Number(null) es 0, y el clamp anterior lo convertía en 1.
    const { body } = await conversationsFor(AGENCY_USER);
    expect((body.conversations as unknown[]).length).toBe(3);
    expect(body.nextCursor).toBeNull();
  });

  it("un limit inválido o negativo cae al valor por defecto", async () => {
    for (const limit of ["0", "-5", "abc"]) {
      const { body } = await conversationsFor(AGENCY_USER, { limit });
      expect((body.conversations as unknown[]).length).toBe(3);
    }
  });

  it("la búsqueda no amplía el alcance: sigue acotada a las marcas del asesor", async () => {
    const { body } = await conversationsFor(ADVISOR_B_Y_SIN_NOMBRE, { search: "Contacto" });
    expect((body.conversations as { brand_id: string }[]).every((c) => c.brand_id !== BRAND_A)).toBe(true);
  });
});

describe("Inbox · canales acotados por marca", () => {
  it("cada canal viaja con su brand_id y el asesor sólo recibe los suyos", async () => {
    H.current = seed(ADVISOR_B_Y_SIN_NOMBRE);
    const { channels } = (await (await getChannels()).json()) as {
      channels: { id: string; brand_id: string }[];
    };
    expect(channels.map((channel) => channel.id)).toEqual(["ch-b"]);
    expect(channels[0].brand_id).toBe(BRAND_B);
  });

  it("la whitelist de columnas de canal no expone tokens", () => {
    const source = readFileSync(join(process.cwd(), "src/app/api/inbox/channels/route.ts"), "utf8");
    const whitelist = source.match(/CHANNEL_PUBLIC_COLUMNS\s*=\s*\n?\s*"([^"]+)"/)?.[1] ?? "";
    expect(whitelist).toContain("brand_id");
    for (const secret of ["access_token", "page_access_token", "webhook_verify_token", "app_secret"]) {
      expect(whitelist).not.toContain(secret);
    }
  });
});

describe("Inbox · etiqueta de marca", () => {
  const brandsById = indexBrands([
    { id: BRAND_A, name: "Marca A" },
    { id: BRAND_SIN_NOMBRE, name: null },
    { id: BRAND_B, name: "   " },
  ]);

  it("muestra el nombre real cuando existe", () => {
    expect(brandLabel(BRAND_A, brandsById)).toBe("Marca A");
    expect(isBrandFallback(BRAND_A, brandsById)).toBe(false);
  });

  it("sin nombre muestra el aviso y el ID corto", () => {
    expect(brandLabel(BRAND_SIN_NOMBRE, brandsById)).toBe(
      `${BRAND_UNAVAILABLE_LABEL} · ${shortBrandId(BRAND_SIN_NOMBRE)}`,
    );
    expect(shortBrandId(BRAND_SIN_NOMBRE)).toHaveLength(8);
    expect(isBrandFallback(BRAND_SIN_NOMBRE, brandsById)).toBe(true);
  });

  it("un nombre en blanco se trata como ausente", () => {
    expect(brandLabel(BRAND_B, brandsById)).toContain(BRAND_UNAVAILABLE_LABEL);
  });

  it("una marca que la API no devolvió cae al aviso, no al nombre de otra", () => {
    expect(brandLabel(BRAND_AJENA, brandsById)).toBe(
      `${BRAND_UNAVAILABLE_LABEL} · ${shortBrandId(BRAND_AJENA)}`,
    );
  });

  it("una fila sin brand_id se marca como sin marca", () => {
    expect(brandLabel(null, brandsById)).toBe(BRAND_UNASSIGNED_LABEL);
    expect(brandLabel(undefined, brandsById)).toBe(BRAND_UNASSIGNED_LABEL);
  });

  it("el selector sólo ofrece las marcas que devolvió la API, ordenadas", () => {
    const options = brandFilterOptions([
      { id: BRAND_B, name: "Zeta" },
      { id: BRAND_A, name: "Alfa" },
    ]);
    expect(options.map((option) => option.label)).toEqual(["Alfa", "Zeta"]);
    expect(options.map((option) => option.value)).toEqual([BRAND_A, BRAND_B]);
    expect(brandFilterOptions([])).toEqual([]);
    expect(brandFilterOptions(null)).toEqual([]);
  });
});

// Verificación estructural: sin jsdom no se puede montar el árbol, así que se
// comprueba sobre el código que los tres puntos de la interfaz reciben la marca
// por `brand_id` y la resuelven con el mismo componente.
describe("Inbox · la marca aparece en canal, conversación y chat abierto", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  const puntos: [string, string, string][] = [
    ["tarjeta de canal", "src/components/inbox/InboxChannelsBar.tsx", "channel.brand_id"],
    ["conversación", "src/components/inbox/ConversationItem.tsx", "conversation.brand_id"],
    ["chat abierto", "src/components/inbox/ChatWindow.tsx", "conversation.brand_id"],
  ];

  for (const [nombre, path, expresion] of puntos) {
    it(`${nombre} renderiza BrandTag con ${expresion}`, () => {
      const source = read(path);
      expect(source).toContain("<BrandTag");
      expect(source).toContain(`brandId={${expresion}}`);
      expect(source).toContain("useInboxBrands");
    });
  }

  it("BrandTag pinta la etiqueta resuelta por brandLabel y expone el brand_id", () => {
    const source = read("src/components/inbox/BrandTag.tsx");
    expect(source).toContain("brandLabel(");
    expect(source).toContain('data-testid="brand-tag"');
    expect(source).toContain("data-brand-id");
  });

  it("ningún punto de la interfaz deduce la marca del nombre del canal", () => {
    for (const [, path] of puntos) {
      const source = read(path);
      // Señales de inferencia: mapear el nombre/tipo del canal a una marca.
      expect(source).not.toMatch(/brandLabel\(\s*(channel|conversation)\.(name|type)/);
      expect(source).not.toMatch(/brandId=\{[^}]*\.(name|type)\b/);
    }
  });

  it("el filtro de marca vive en los filtros siempre visibles del Inbox", () => {
    const source = read("src/components/inbox/ConversationFilters.tsx");
    expect(source).toContain('data-testid="brand-filter"');
    expect(source).toContain("brandFilterOptions");
    // No se construyen opciones locales: sólo lo que devolvió la API.
    expect(source).toContain("useInboxBrands");
  });

  it("cambiar de marca suelta la conversación abierta", () => {
    const source = read("src/stores/inbox.ts");
    expect(source).toMatch(/setBrandFilter:\s*\(brandFilter\)\s*=>\s*set\(\{\s*brandFilter,\s*selectedConversationId:\s*null/);
  });

  it("el filtro viaja al backend como brandId", () => {
    const source = read("src/hooks/useConversations.ts");
    expect(source).toContain('params.set("brandId", brandFilter)');
    expect(source).toContain("brandFilter");
  });
});
