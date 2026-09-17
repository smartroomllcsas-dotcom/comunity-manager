import { describe, it, expect } from "vitest";

/**
 * El detalle de una campaña se pide con el token de la marca activa, y ese
 * token suele dar acceso a decenas de cuentas publicitarias (el portfolio de
 * Smart Send tiene 25). Sin la comprobación de dueño, cambiando el id en la
 * URL se vería la pauta de otro cliente desde la marca equivocada.
 */
describe("aislamiento del detalle de campaña", () => {
  const route = "src/app/api/meta/campaigns/[campaignId]/route.ts";

  it("valida el id, la empresa y que la campaña sea de esa cuenta", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(route, "utf8");

    expect(src, "debe validar acceso a la empresa").toContain("getCmClientAccess");
    expect(src, "el id de campaña tiene que ser numérico").toContain("/^\\d+$/.test(campaignId)");
    expect(src, "debe comparar la cuenta de la campaña con la de la marca").toContain(
      "normalizedCampaignAccountId !== normalizedSourceAccountId"
    );
    expect(src, "y negarse cuando no coinciden").toContain("La campaña no pertenece a esta marca");
  });

  it("no pide los anuncios uno por conjunto", async () => {
    // Con la app en acceso limitado (60 puntos), una llamada por conjunto
    // agotaba el cupo con una sola campaña grande.
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/lib/meta.ts", "utf8");
    expect(src).toContain("adsByAdSet");
    expect(src).not.toContain("/ads?${new URLSearchParams({\n        fields: adFields");
  });
});
