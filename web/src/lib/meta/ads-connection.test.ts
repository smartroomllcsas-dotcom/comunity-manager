import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
import { ADS_SCOPES } from "./ads-connection";
import { getOAuthUrl } from "@/lib/meta";

describe("la conexión de anuncios está separada de la del chat", () => {
  it("no pide ni un solo permiso de mensajería", () => {
    // Si alguno de estos entra aquí, un rechazo de Meta dejaría de ser un
    // problema de este botón y volvería a tumbar el chat de todas las marcas.
    const mensajeria = [
      "pages_messaging",
      "instagram_manage_messages",
      "pages_manage_metadata",
      "pages_manage_engagement",
      "instagram_manage_comments",
      "leads_retrieval",
    ];
    for (const scope of mensajeria) {
      expect(ADS_SCOPES).not.toContain(scope);
    }
  });

  it("pide lo necesario para publicar y para pautar", () => {
    expect(ADS_SCOPES).toContain("ads_management");
    expect(ADS_SCOPES).toContain("ads_read");
    expect(ADS_SCOPES).toContain("pages_manage_posts");
    expect(ADS_SCOPES).toContain("instagram_content_publish");
  });

  it("el diálogo del chat sigue sin pedir permisos de publicación", () => {
    // pages_manage_posts ya está activo en Meta, pero añadirlo al diálogo del
    // chat volvería a poner los tres canales de todas las marcas en juego.
    process.env.META_APP_ID = "test";
    const url = getOAuthUrl("https://app.invalid/cb", "s", { includeInstagramMessaging: true });
    const scope = new URL(url).searchParams.get("scope") || "";
    expect(scope).not.toContain("pages_manage_posts");
    expect(scope).not.toContain("ads_management");
  });
});
