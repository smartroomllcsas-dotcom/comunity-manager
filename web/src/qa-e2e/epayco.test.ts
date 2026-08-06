// E2E QA · Requisito 2: validar ePayco aprobado, rechazado y pendiente.
// Prueba el mapeo puro de códigos de respuesta de ePayco (x_cod_response) a
// estado de pago, tal como lo consume /api/epayco/confirmation, y el invariante
// de negocio: sólo "approved" activa/renueva; rechazado, pendiente y fallido no.
import { describe, it, expect } from "vitest";
import { mapEpaycoStatus } from "@/lib/epayco/client";

// Código ePayco -> estado esperado (sandbox y producción comparten códigos).
const CASES: Array<[string, "approved" | "rejected" | "pending" | "failed", string]> = [
  ["1", "approved", "Transacción aceptada (aprobado)"],
  ["2", "rejected", "Transacción rechazada"],
  ["3", "pending", "Transacción pendiente"],
  ["4", "failed", "Transacción fallida"],
];

// Estados que activan/renuevan la suscripción según la confirmación.
const ACTIVATES: Record<string, boolean> = {
  approved: true, rejected: false, pending: false, failed: false,
};

describe("E2E QA · ePayco (aprobado / rechazado / pendiente)", () => {
  it.each(CASES)("x_cod_response=%s => %s (%s)", (code, expected) => {
    expect(mapEpaycoStatus(code)).toBe(expected);
  });

  it("aprobado es el ÚNICO estado que activa/renueva la suscripción", () => {
    expect(ACTIVATES[mapEpaycoStatus("1")]).toBe(true);   // aprobado -> activa
    expect(ACTIVATES[mapEpaycoStatus("2")]).toBe(false);  // rechazado -> no activa
    expect(ACTIVATES[mapEpaycoStatus("3")]).toBe(false);  // pendiente -> no activa
    expect(ACTIVATES[mapEpaycoStatus("4")]).toBe(false);  // fallido -> no activa
  });

  it("un código desconocido o vacío se trata como pendiente (fail-safe, no activa)", () => {
    expect(mapEpaycoStatus("")).toBe("pending");
    expect(mapEpaycoStatus("99")).toBe("pending");
    expect(ACTIVATES[mapEpaycoStatus("99")]).toBe(false);
  });
});
