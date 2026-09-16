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

describe("elegir cuenta publicitaria en un portfolio de agencia", () => {
  // Las 25 cuentas reales del portfolio, resumidas a lo que importa.
  const accounts = [
    { id: "act_803331059401378", account_id: "803331059401378", name: "SMART Sends (Read-Only)", business_name: "smartsends", account_status: 1 },
    { id: "act_1286117346310116", account_id: "1286117346310116", name: "SmartDigitalMedia (Read-Only)", business_name: "Sdm", account_status: 1 },
    { id: "act_2293373308727611", account_id: "2293373308727611", name: "Smart Digital Media (Read-Only)", business_name: "Sdm", account_status: 1 },
    { id: "act_906619128401592", account_id: "906619128401592", name: "cg moda", business_name: "CgStyle", account_status: 3 },
    { id: "act_1226419828960158", account_id: "1226419828960158", name: "SDM", business_name: "Sdm", account_status: 3 },
  ];

  it("propone una cuenta que se llama como la marca, no la primera de la lista", async () => {
    const { suggestAccountFor } = await import("./ads-connection");
    // La primera que devuelve Meta es SMART Sends: fue la que se eligió sola en
    // la primera prueba y era la equivocada. Hay dos cuentas de Smart Digital
    // con el mismo nombre a efectos prácticos ("SmartDigitalMedia" y "Smart
    // Digital Media"), así que vale cualquiera de las dos — lo que no vale es
    // proponer la de otra marca.
    const sdm = ["1286117346310116", "2293373308727611"];
    expect(sdm).toContain(suggestAccountFor("Smart Digital Media 5.0", accounts));
    expect(suggestAccountFor("Moda Style Cg", accounts)).toBe("906619128401592");
  });

  it("no propone nada cuando ninguna se parece", async () => {
    const { suggestAccountFor } = await import("./ads-connection");
    expect(suggestAccountFor("Panadería Doña Rosa", accounts)).toBeNull();
    expect(suggestAccountFor(null, accounts)).toBeNull();
  });

  it("distingue las que sirven para crear campañas", async () => {
    const { isUsableAccount, isReadOnly } = await import("./ads-connection");
    expect(isUsableAccount(accounts[0])).toBe(true);
    expect(isUsableAccount(accounts[3])).toBe(false); // sin método de pago
    expect(isReadOnly(accounts[0])).toBe(true);
    expect(isReadOnly(accounts[3])).toBe(false);
  });
});
