import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/whatsapp/cloud/business-account", () => ({ getWabaClientForClient: vi.fn() }));
import { isMarketingRestrictedError, phoneNeedsUtility } from "./first-touch-utility";

describe("¿Meta bloqueó el marketing?", () => {
  it("reconoce los códigos que obligan a usar una Utility", () => {
    // El caso real: Meta acepta el envío y avisa por webhook con 131049.
    expect(isMarketingRestrictedError("131049")).toBe(true);
    expect(isMarketingRestrictedError("131050")).toBe(true);
    expect(isMarketingRestrictedError("130472")).toBe(true);
    expect(isMarketingRestrictedError("Meta limitó los mensajes de marketing (código 131049)")).toBe(true);
  });

  it("no confunde otros fallos, que sí merecen aviso al asesor", () => {
    // 131026 es "no tiene WhatsApp": reintentar con Utility no arregla nada.
    expect(isMarketingRestrictedError("131026")).toBe(false);
    expect(isMarketingRestrictedError("131047")).toBe(false);
    expect(isMarketingRestrictedError(undefined)).toBe(false);
    expect(isMarketingRestrictedError("")).toBe(false);
  });
});

describe("prefijos de país", () => {
  it("detecta los números que siempre entran por Utility", () => {
    expect(phoneNeedsUtility("13055551234", ["1"])).toBe(true);
    expect(phoneNeedsUtility("573163028683", ["1"])).toBe(false);
  });
});
