import { describe, expect, it, beforeEach } from "vitest";
import { getOAuthUrl } from "@/lib/meta";

describe("Meta OAuth", () => {
  beforeEach(() => {
    process.env.META_APP_ID = "1491695645279792";
  });

  it("Facebook Login for Business usa config_id sin enviar scope", () => {
    const url = getOAuthUrl(
      "https://www.comunitymanager.io/auth/facebook/callback",
      "client:state",
      { configId: "1345028407804200" },
    );
    const params = new URL(url).searchParams;

    expect(params.get("config_id")).toBe("1345028407804200");
    expect(params.get("override_default_response_type")).toBe("true");
    expect(params.has("scope")).toBe(false);
  });

  it("el flujo sin configuración conserva los permisos OAuth", () => {
    const url = getOAuthUrl(
      "https://www.comunitymanager.io/auth/instagram/callback",
      "client:state",
      { includeInstagramMessaging: true },
    );
    const scope = new URL(url).searchParams.get("scope") || "";

    expect(scope).toContain("pages_show_list");
    expect(scope).toContain("instagram_manage_messages");
  });

  it("el OAuth clásico de Facebook/Messenger conserva sus permisos", () => {
    const url = getOAuthUrl(
      "https://www.comunitymanager.io/auth/facebook/callback",
      "client:state",
    );
    const params = new URL(url).searchParams;

    expect(params.has("config_id")).toBe(false);
    expect(params.get("scope")).toBe(
      "pages_manage_metadata,pages_show_list,pages_messaging",
    );
  });
});
