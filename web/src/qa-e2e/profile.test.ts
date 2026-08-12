// E2E QA · Perfil del usuario y cierre de sesión.
// ---------------------------------------------------------------------------
// El perfil vive repartido en tres tablas de dos esquemas (`smarttalk.agents`,
// `smarttalk.organizations`, `public.cm_users`), así que casi todo lo que puede
// salir mal está en la costura: leer de donde no toca, escribir sólo en una
// mitad, o dejar pasar un campo que el usuario no debería poder cambiar.
//
// La API se ejercita contra la ruta real. El Sidebar y la página se comprueban
// sobre el código: el proyecto no tiene jsdom ni testing-library.
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

import { GET as getProfile, PATCH as patchProfile } from "@/app/api/profile/route";

const ORG = "org-perfil";
const USER = "agent-yo";
const EMAIL = "yo@example.invalid";

function seed(currentUserId: string = USER) {
  return createFakeSupabase({
    currentUserId,
    tables: {
      agents: [
        {
          id: USER,
          organization_id: ORG,
          name: "Ana Pérez",
          email: EMAIL,
          role: "admin",
          member_type: "agency_user",
          status: "online",
          created_at: "2026-02-10T12:00:00Z",
          is_super_admin: false,
        },
      ],
      organizations: [
        {
          id: ORG,
          name: "Agencia Demo",
          billing_phone: "+57 300 111 2233",
          plan_id: "plan-1",
          // Secretos que jamás deben salir en la respuesta.
          access_token: "SECRETO-ORG",
          webhook_verify_token: "VERIFY-SECRETO",
        },
      ],
      cm_users: [
        {
          id: "cm-1",
          email: EMAIL,
          name: "Ana Pérez",
          avatar_url: null,
          password_hash: "$2b$10$hash-que-no-debe-salir",
          role: "owner",
          plan: "pro",
        },
      ],
    },
  });
}

function patchRequest(body: unknown) {
  return {
    method: "PATCH",
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
  } as never;
}

async function get() {
  const response = await getProfile();
  return { status: response.status, body: await response.json() };
}

async function patch(body: unknown) {
  const response = await patchProfile(patchRequest(body));
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  H.current = seed();
});

describe("GET /api/profile", () => {
  it("un usuario no autenticado recibe 401", async () => {
    // `currentUserId` inexistente no basta: el fake debe no devolver usuario.
    H.current = createFakeSupabase({ tables: { agents: [] } });
    H.current.server.auth.getUser = async () => ({ data: { user: null } });

    const { status, body } = await get();
    expect(status).toBe(401);
    expect(body.profile).toBeUndefined();
  });

  it("devuelve los datos del agente, la organización y el legacy", async () => {
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.profile).toMatchObject({
      name: "Ana Pérez",
      email: EMAIL,
      billingPhone: "+57 300 111 2233",
      organizationName: "Agencia Demo",
      status: "online",
      createdAt: "2026-02-10T12:00:00Z",
      emailEditable: false,
    });
  });

  it("el rol se muestra legible, no como código interno", async () => {
    const { body } = await get();
    expect(body.profile.role).toBe("Usuario de agencia · Administrador");
  });

  it("un super admin se identifica como tal por encima de su rol nominal", async () => {
    H.current = seed();
    H.current.store.agents[0].is_super_admin = true;
    const { body } = await get();
    expect(body.profile.role).toBe("Super administrador");
  });

  it("nunca devuelve contraseñas, tokens ni secretos", async () => {
    const { body } = await get();
    const serialized = JSON.stringify(body);
    for (const secreto of [
      "password_hash",
      "$2b$10$hash-que-no-debe-salir",
      "SECRETO-ORG",
      "VERIFY-SECRETO",
      "access_token",
      "webhook_verify_token",
    ]) {
      expect(serialized).not.toContain(secreto);
    }
  });

  it("no expone plan_id, organization_id ni is_super_admin", async () => {
    const { body } = await get();
    expect(Object.keys(body.profile).sort()).toEqual([
      "billingPhone",
      "createdAt",
      "email",
      "emailEditable",
      "name",
      "organizationName",
      "role",
      "status",
    ]);
  });

  it("si el agente no tiene nombre, cae al del usuario legacy", async () => {
    H.current = seed();
    H.current.store.agents[0].name = null;
    H.current.store.cm_users[0].name = "Ana desde CM";
    const { body } = await get();
    expect(body.profile.name).toBe("Ana desde CM");
  });

  it("funciona aunque no exista usuario legacy con ese correo", async () => {
    H.current = seed();
    H.current.store.cm_users = [];
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.profile.name).toBe("Ana Pérez");
  });
});

describe("PATCH /api/profile", () => {
  it("un usuario no autenticado recibe 401", async () => {
    H.current = createFakeSupabase({ tables: { agents: [] } });
    H.current.server.auth.getUser = async () => ({ data: { user: null } });

    const { status } = await patch({ name: "Quien sea" });
    expect(status).toBe(401);
  });

  it("actualiza nombre, teléfono y nombre de la organización", async () => {
    const { status, body } = await patch({
      name: "Ana María Pérez",
      billingPhone: "+57 301 999 8877",
      organizationName: "Agencia Renovada",
    });

    expect(status).toBe(200);
    expect(body.profile).toMatchObject({
      name: "Ana María Pérez",
      billingPhone: "+57 301 999 8877",
      organizationName: "Agencia Renovada",
    });

    const store = H.current!.store;
    expect(store.agents[0].name).toBe("Ana María Pérez");
    expect(store.organizations[0].name).toBe("Agencia Renovada");
    expect(store.organizations[0].billing_phone).toBe("+57 301 999 8877");
  });

  it("el nombre se escribe también en el usuario legacy", async () => {
    await patch({ name: "Ana María Pérez" });
    // Si sólo se escribiera en `agents`, el usuario tendría dos nombres
    // distintos según por dónde entrara a la plataforma.
    expect(H.current!.store.cm_users[0].name).toBe("Ana María Pérez");
  });

  it("rechaza cambiar el rol", async () => {
    const { status, body } = await patch({ name: "Ana", role: "admin" });
    expect(status).toBe(400);
    expect(body.fields).toContain("role");
    expect(H.current!.store.agents[0].role).toBe("admin");
  });

  it("rechaza cambiar organización, plan y super admin", async () => {
    for (const campo of ["organization_id", "plan_id", "is_super_admin", "member_type"]) {
      const { status, body } = await patch({ [campo]: "lo-que-sea" });
      expect(status).toBe(400);
      expect(body.fields).toContain(campo);
    }
    const store = H.current!.store;
    expect(store.agents[0].organization_id).toBe(ORG);
    expect(store.agents[0].is_super_admin).toBe(false);
  });

  it("rechaza cambiar contraseñas y tokens", async () => {
    for (const campo of ["password_hash", "password", "access_token"]) {
      const { status, body } = await patch({ [campo]: "nuevo" });
      expect(status).toBe(400);
      expect(body.fields).toContain(campo);
    }
    expect(H.current!.store.cm_users[0].password_hash).toBe("$2b$10$hash-que-no-debe-salir");
  });

  it("rechaza cambiar el correo: exige confirmación en Supabase Auth", async () => {
    const { status, body } = await patch({ email: "otro@example.invalid" });
    expect(status).toBe(400);
    expect(body.fields).toContain("email");
    expect(H.current!.store.agents[0].email).toBe(EMAIL);
  });

  it("un campo prohibido invalida toda la petición, no sólo ese campo", async () => {
    // Si se ignorara en silencio, el usuario vería un 200 y creería que su
    // intento de subirse el rol funcionó.
    const { status } = await patch({ name: "Nombre nuevo", is_super_admin: true });
    expect(status).toBe(400);
    expect(H.current!.store.agents[0].name).toBe("Ana Pérez");
  });

  it("no permite dejar el nombre vacío", async () => {
    const { status } = await patch({ name: "   " });
    expect(status).toBe(400);
    expect(H.current!.store.agents[0].name).toBe("Ana Pérez");
  });

  it("no permite dejar el nombre de la agencia vacío", async () => {
    const { status } = await patch({ organizationName: "  " });
    expect(status).toBe(400);
    expect(H.current!.store.organizations[0].name).toBe("Agencia Demo");
  });

  it("permite borrar el teléfono, que sí es opcional", async () => {
    const { status, body } = await patch({ billingPhone: "" });
    expect(status).toBe(200);
    expect(body.profile.billingPhone).toBeNull();
    expect(H.current!.store.organizations[0].billing_phone).toBeNull();
  });

  it("una petición sin campos editables se rechaza", async () => {
    const { status, body } = await patch({});
    expect(status).toBe(400);
    expect(body.editable).toEqual(["name", "billingPhone", "organizationName"]);
  });

  it("si falla la sincronización legacy el perfil se guarda igual y se avisa", async () => {
    H.current = createFakeSupabase({
      currentUserId: USER,
      errorOn: { cm_users: { update: { code: "42501", message: "permission denied" } } },
      tables: seed().store,
    });

    const { status, body } = await patch({ name: "Ana Actualizada" });
    expect(status).toBe(200);
    expect(H.current.store.agents[0].name).toBe("Ana Actualizada");
    expect(body.warnings?.[0]).toContain("legacy");
  });

  it("la respuesta del PATCH tampoco filtra secretos", async () => {
    const { body } = await patch({ name: "Ana Nueva" });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("$2b$10$");
    expect(serialized).not.toContain("SECRETO-ORG");
  });
});

describe("Sidebar · menú de usuario y cierre de sesión", () => {
  const sidebar = () =>
    readFileSync(join(process.cwd(), "src/components/layout/Sidebar.tsx"), "utf8");

  it("el avatar es un botón accesible, no un div sin onClick", () => {
    const source = sidebar();
    expect(source).toContain("DropdownMenuTrigger");
    expect(source).toContain("sidebar-user-menu");
    expect(source).toContain("aria-label");
    // El div inerte que había antes ya no existe.
    expect(source).not.toContain('<div\n                  className={cn(\n                    "flex h-10 items-center rounded-lg cursor-pointer');
  });

  it("el menú ofrece Ver perfil y Cerrar sesión", () => {
    const source = sidebar();
    expect(source).toContain("Ver perfil");
    expect(source).toContain("Cerrar sesión");
    expect(source).toContain("sidebar-view-profile");
    expect(source).toContain("sidebar-logout");
  });

  it("Ver perfil navega a /settings/profile", () => {
    expect(sidebar()).toContain('router.push("/settings/profile")');
  });

  it("Cerrar sesión usa useAuth().logout, no un signOut suelto", () => {
    const source = sidebar();
    expect(source).toContain("useAuth");
    expect(source).toContain("logout()");
    // `signOut()` a secas dejaría viva la cookie cm_user_id del CM legacy.
    expect(source).not.toContain("auth.signOut()");
  });

  it("logout limpia sesión y cookie y redirige a /login", () => {
    // La limpieza real vive en AuthProvider; el Sidebar sólo la invoca.
    const provider = readFileSync(
      join(process.cwd(), "src/components/AuthProvider.tsx"),
      "utf8",
    );
    expect(provider).toContain("auth.signOut()");
    expect(provider).toContain("cm_user_id=; Path=/; Max-Age=0");
    expect(provider).toContain("router.push('/login')");
  });

  it("el menú funciona con la barra expandida y contraída", () => {
    const source = sidebar();
    // El único efecto de `expanded` sobre el disparador es el ancho y la
    // etiqueta; el menú se monta igual en ambos casos.
    expect(source).toContain('expanded ? "w-full justify-start px-3" : "w-10 justify-center"');
    expect(source).toContain("{expanded && (");
  });
});

describe("Página /settings/profile", () => {
  const page = () =>
    readFileSync(
      join(process.cwd(), "src/app/(dashboard)/settings/profile/page.tsx"),
      "utf8",
    );

  it("existe y muestra todos los campos pedidos", () => {
    const source = page();
    for (const campo of [
      "Nombre completo",
      "Correo de acceso y facturación",
      "Teléfono / WhatsApp",
      "Nombre de la agencia o empresa",
      "Rol",
      "Estado de conexión",
      "Miembro desde",
      "Guardar cambios",
    ]) {
      expect(source).toContain(campo);
    }
  });

  it("tiene estados de carga, guardado y error", () => {
    const source = page();
    expect(source).toContain("profile-loading");
    expect(source).toContain("profile-saved");
    expect(source).toContain("profile-save-error");
    expect(source).toContain("profile-error");
  });

  it("no queda en blanco si el perfil no carga", () => {
    const source = page();
    // La rama `!profile` renderiza una explicación y una salida, no `null`.
    expect(source).toContain("No fue posible cargar tu perfil");
    expect(source).toContain("Volver a Configuración");
    expect(source).not.toMatch(/if \(!profile\) return null/);
  });

  it("el correo es de sólo lectura y lo explica", () => {
    const source = page();
    expect(source).toContain("readOnly");
    expect(source).toContain("requiere confirmación por correo");
  });

  it("invalida current-agent tras guardar para refrescar el avatar", () => {
    expect(page()).toContain('queryKey: ["current-agent"]');
  });

  it("/settings enlaza Mi perfil", () => {
    const settings = readFileSync(
      join(process.cwd(), "src/app/(dashboard)/settings/page.tsx"),
      "utf8",
    );
    expect(settings).toContain('href: "/settings/profile"');
    expect(settings).toContain("Mi perfil");
  });
});
