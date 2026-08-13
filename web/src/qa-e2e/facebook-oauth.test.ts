// E2E QA · Flujo OAuth exclusivo de Facebook (Facebook Login for Business).
// ---------------------------------------------------------------------------
// El flujo de /auth/facebook sólo es válido a través de la configuración
// aprobada de Facebook Login for Business. Lo que se protege aquí es que:
//
//   1. El identificador se lea SIEMPRE de `META_FACEBOOK_CONFIG_ID`, nunca
//      escrito en el código.
//   2. La URL lleve `config_id`, `override_default_response_type=true` y
//      `response_type=code`, y **no** lleve `scope`.
//   3. Si la variable falta o está mal, el flujo **se detenga**: antes caía en
//      silencio al OAuth clásico y el usuario concedía permisos distintos a los
//      de la configuración aprobada sin que nada avisara.
//   4. Instagram, WhatsApp y el flujo combinado sigan intactos.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const H = vi.hoisted(() => ({
  states: [] as { state: string; client_id: string }[],
  access: { organizationId: "org-1" } as { organizationId: string } | null,
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, NextRequest: class {} };
});
vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: () => ({
      insert: async (row: { state: string; client_id: string }) => {
        H.states.push(row);
        return { error: null };
      },
      select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
  },
}));
vi.mock("@/lib/cm-client-access", () => ({
  getCmClientAccess: async () => H.access,
}));

import { initiateMetaOAuth } from "@/lib/meta-oauth-handler";
import { getOAuthUrl, readFacebookConfigId, FACEBOOK_CONFIG_ID_ENV } from "@/lib/meta";

// Identificador ficticio con el mismo formato que uno real. El de producción
// vive únicamente en la variable de entorno.
const CONFIG_ID = "10000000000000001";

function request(callbackPath: string) {
  return {
    method: "GET",
    headers: new Headers(),
    nextUrl: {
      searchParams: new URLSearchParams({ clientId: "brand-1" }),
      origin: "https://app.invalid",
    },
    cookies: { get: () => undefined },
  } as never;
}

const original = { ...process.env };

beforeEach(() => {
  H.states = [];
  H.access = { organizationId: "org-1" };
  process.env.META_APP_ID = "1491695645279792";
  process.env.META_APP_SECRET = "secreto-de-prueba";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.invalid";
  process.env[FACEBOOK_CONFIG_ID_ENV] = CONFIG_ID;
});

afterEach(() => {
  process.env = { ...original };
});

async function facebookAuthUrl() {
  const response = await initiateMetaOAuth(request("/auth/facebook/callback"), "/auth/facebook/callback");
  return { response, location: response.headers.get("location") || "" };
}

// ---------------------------------------------------------------------------
describe("1 · El identificador se lee de la variable de entorno", () => {
  it("/auth/facebook delega en initiateMetaOAuth con su propio callback", () => {
    const source = readFileSync(join(process.cwd(), "src/app/auth/facebook/route.ts"), "utf8");
    expect(source).toContain("initiateMetaOAuth");
    expect(source).toContain("/auth/facebook/callback");
  });

  it("el identificador NO está escrito en el código", () => {
    // Cualquier número de configuración incrustado sería un valor que deja de
    // poder rotarse sin desplegar.
    for (const file of [
      "src/lib/meta.ts",
      "src/lib/meta-oauth-handler.ts",
      "src/app/auth/facebook/route.ts",
    ]) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source).not.toMatch(/\b\d{15,25}\b/);
    }
  });

  it("la URL usa el valor de la variable, no otro", async () => {
    const { location } = await facebookAuthUrl();
    expect(new URL(location).searchParams.get("config_id")).toBe(CONFIG_ID);

    process.env[FACEBOOK_CONFIG_ID_ENV] = "20000000000000002";
    const otra = await facebookAuthUrl();
    expect(new URL(otra.location).searchParams.get("config_id")).toBe("20000000000000002");
  });
});

describe("2 · Parámetros del diálogo de Facebook", () => {
  it("incluye config_id, override_default_response_type y response_type=code", async () => {
    const { location } = await facebookAuthUrl();
    const params = new URL(location).searchParams;

    expect(params.get("config_id")).toBe(CONFIG_ID);
    expect(params.get("override_default_response_type")).toBe("true");
    expect(params.get("response_type")).toBe("code");
  });

  it("NO incluye scope cuando hay config_id", async () => {
    const { location } = await facebookAuthUrl();
    // Meta rechaza el diálogo si llegan los dos: la configuración es la dueña
    // de los permisos.
    expect(new URL(location).searchParams.has("scope")).toBe(false);
  });

  it("apunta al diálogo de Facebook con el redirect_uri correcto", async () => {
    const { location } = await facebookAuthUrl();
    const url = new URL(location);
    expect(url.origin + url.pathname).toBe("https://www.facebook.com/v21.0/dialog/oauth");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.invalid/auth/facebook/callback",
    );
  });
});

describe("3 · La variable ausente o inválida detiene el flujo", () => {
  it("sin la variable responde 500 y NO redirige a Facebook", async () => {
    delete process.env[FACEBOOK_CONFIG_ID_ENV];
    const response = await initiateMetaOAuth(
      request("/auth/facebook/callback"),
      "/auth/facebook/callback",
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("location")).toBeNull();
    const body = await response.json();
    expect(body.code).toBe("facebook_config_id_missing");
    expect(body.error).toContain(FACEBOOK_CONFIG_ID_ENV);
  });

  it("NO retrocede al OAuth clásico: la respuesta no lleva scope ni URL de Meta", async () => {
    delete process.env[FACEBOOK_CONFIG_ID_ENV];
    const response = await initiateMetaOAuth(
      request("/auth/facebook/callback"),
      "/auth/facebook/callback",
    );
    const serialized = JSON.stringify(await response.json());

    expect(serialized).not.toContain("facebook.com/v21.0/dialog/oauth");
    expect(serialized).not.toContain("pages_show_list");
  });

  it("un valor con formato inválido también detiene el flujo", async () => {
    for (const invalido of ["", "   ", "no-numerico", "123", "10000000000000001abc"]) {
      process.env[FACEBOOK_CONFIG_ID_ENV] = invalido;
      const response = await initiateMetaOAuth(
        request("/auth/facebook/callback"),
        "/auth/facebook/callback",
      );
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(["facebook_config_id_missing", "facebook_config_id_invalid"]).toContain(body.code);
    }
  });

  it("tolera comillas alrededor del valor, que algunos gestores conservan", () => {
    process.env[FACEBOOK_CONFIG_ID_ENV] = `"${CONFIG_ID}"`;
    const result = readFacebookConfigId();
    expect(result).toEqual({ ok: true, configId: CONFIG_ID });
  });

  it("se detiene ANTES de crear el state, para no dejar basura en la base", async () => {
    delete process.env[FACEBOOK_CONFIG_ID_ENV];
    await initiateMetaOAuth(request("/auth/facebook/callback"), "/auth/facebook/callback");
    expect(H.states).toHaveLength(0);
  });

  it("se detiene en todos los entornos, no sólo en producción", async () => {
    // Un desarrollo que funcionara por el camino clásico ocultaría el problema
    // hasta el despliegue.
    for (const entorno of ["development", "test", "production"]) {
      vi.stubEnv("NODE_ENV", entorno);
      delete process.env[FACEBOOK_CONFIG_ID_ENV];
      const response = await initiateMetaOAuth(
        request("/auth/facebook/callback"),
        "/auth/facebook/callback",
      );
      expect(response.status).toBe(500);
      vi.unstubAllEnvs();
    }
  });

  it("el mensaje de error no filtra el valor configurado", async () => {
    process.env[FACEBOOK_CONFIG_ID_ENV] = "valor-mal-puesto-99999";
    const response = await initiateMetaOAuth(
      request("/auth/facebook/callback"),
      "/auth/facebook/callback",
    );
    const serialized = JSON.stringify(await response.json());
    expect(serialized).not.toContain("valor-mal-puesto-99999");
  });
});

describe("4 · Los demás flujos no cambian", () => {
  it("el flujo combinado /api/auth/meta sigue usando scope y sin config_id", async () => {
    const response = await initiateMetaOAuth(
      request("/api/auth/meta/callback"),
      "/api/auth/meta/callback",
    );
    const params = new URL(response.headers.get("location") || "").searchParams;

    expect(params.has("config_id")).toBe(false);
    const scope = params.get("scope") || "";
    expect(scope).toContain("instagram_manage_messages");
    expect(scope).toContain("ads_read");
  });

  it("el flujo combinado NO se bloquea aunque falte la variable de Facebook", async () => {
    delete process.env[FACEBOOK_CONFIG_ID_ENV];
    const response = await initiateMetaOAuth(
      request("/api/auth/meta/callback"),
      "/api/auth/meta/callback",
    );
    // La guarda es exclusiva del flujo de Facebook.
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("facebook.com");
  });

  it("Instagram conserva su propia ruta y sus propios permisos", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/api/auth/instagram/connect/route.ts"),
      "utf8",
    );
    // No pasa por initiateMetaOAuth ni por la configuración de Facebook.
    expect(source).not.toContain("initiateMetaOAuth");
    expect(source).not.toContain(FACEBOOK_CONFIG_ID_ENV);
    expect(source).toContain("scope");
  });

  it("WhatsApp usa su propia configuración, distinta de la de Facebook", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/WhatsAppConnectButton.tsx"),
      "utf8",
    );
    expect(source).toContain("NEXT_PUBLIC_META_CONFIG_ID");
    expect(source).not.toContain(FACEBOOK_CONFIG_ID_ENV);
  });

  it("getOAuthUrl sigue produciendo el OAuth clásico cuando no se le pasa configId", () => {
    // La función de bajo nivel no cambia: la exigencia vive en el iniciador,
    // porque el flujo combinado sí necesita esta rama.
    const url = getOAuthUrl("https://app.invalid/api/auth/meta/callback", "s", {});
    const params = new URL(url).searchParams;
    expect(params.has("config_id")).toBe(false);
    expect(params.get("scope")).toContain("pages_show_list");
  });
});

describe("5 · Callback y state sin cambios", () => {
  it("el state conserva su formato clientId:aleatorio", async () => {
    await facebookAuthUrl();
    expect(H.states).toHaveLength(1);
    expect(H.states[0].client_id).toBe("brand-1");
    expect(H.states[0].state).toMatch(/^brand-1:[0-9a-f]{32}$/);
  });

  it("el state viaja en la URL del diálogo", async () => {
    const { location } = await facebookAuthUrl();
    expect(new URL(location).searchParams.get("state")).toBe(H.states[0].state);
  });

  it("el callback de Facebook no se tocó", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/auth/facebook/callback/route.ts"),
      "utf8",
    );
    expect(source).toContain("handleMetaCallback");
    // La guarda es del iniciador; el callback no necesita la configuración.
    expect(source).not.toContain(FACEBOOK_CONFIG_ID_ENV);
  });

  it("sigue exigiendo clientId y autorización antes que nada", async () => {
    H.access = null;
    const response = await initiateMetaOAuth(
      request("/auth/facebook/callback"),
      "/auth/facebook/callback",
    );
    expect(response.status).toBe(403);
  });
});
