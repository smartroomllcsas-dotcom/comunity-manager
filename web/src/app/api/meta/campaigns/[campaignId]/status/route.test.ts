import { describe, it, expect } from "vitest";

/**
 * Es la única escritura de la plataforma sobre la pauta: cambia lo que un
 * cliente gasta. Las tres comprobaciones que la protegen se verifican aquí
 * para que nadie las quite sin darse cuenta.
 */
describe("candados para pausar una campaña", () => {
  const ruta = "src/app/api/meta/campaigns/[campaignId]/status/route.ts";

  it("exige acceso a la empresa y valida el id", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(ruta, "utf8");
    expect(src).toContain("getCmClientAccess");
    expect(src).toContain("/^\\d+$/.test(campaignId)");
  });

  it("no deja que un asesor acotado a una marca mueva presupuesto", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(ruta, "utf8");
    expect(src).toContain("isBrandScopedMember");
    expect(src).toContain("no pausarla");
  });

  it("comprueba que la campaña sea de la cuenta publicitaria de esa marca", async () => {
    // El token ve las 25 cuentas del portfolio: sin esto se podría pausar la
    // pauta de otro cliente cambiando el id de la petición.
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(ruta, "utf8");
    expect(src).toContain("cuentaCampana !== source.adAccountId.replace(/^act_/, \"\")");
    expect(src).toContain("La campaña no pertenece a esta marca");
  });

  it("deja registro de quién lo hizo", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(ruta, "utf8");
    expect(src).toContain("cm_activity_log");
  });

  it("no se fía del éxito de Meta: relee el estado efectivo", async () => {
    // Meta acepta ACTIVE aunque la cuenta no tenga método de pago.
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(ruta, "utf8");
    expect(src).toContain("effective_status");
    expect(src).toContain("aviso");
  });
});
