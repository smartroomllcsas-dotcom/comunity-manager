import { describe, it, expect } from "vitest";
import { isRealPhone, renderText, renderVariables } from "./audience";

describe("isRealPhone", () => {
  it("accepts real phones and rejects @lid ids", () => {
    expect(isRealPhone("573163028683")).toBe(true);
    expect(isRealPhone("51966808780")).toBe(true);
    expect(isRealPhone("13054648416")).toBe(true);
    expect(isRealPhone("58309163884760")).toBe(false); // lid
    expect(isRealPhone("237065333661894")).toBe(false); // lid
    expect(isRealPhone("123")).toBe(false);
  });
});

describe("renderText / renderVariables", () => {
  const contact = { name: "Juan Jaramillo", phone: "573163028683", customFields: { company_name: "Smart", ciudad: "Cali" } };
  it("replaces contact tokens", () => {
    expect(renderText("Hola {{contacto.nombre}} de {{contacto.empresa}} ({{contacto.ciudad}})", contact)).toBe("Hola Juan de Smart (Cali)");
  });
  it("keeps fixed text and fills unknown tokens with empty", () => {
    expect(renderVariables({ nombre: "{{contacto.nombre}}", tema: "Promo", x: "{{contacto.nada}}" }, contact)).toEqual({ nombre: "Juan", tema: "Promo", x: "" });
  });
});
