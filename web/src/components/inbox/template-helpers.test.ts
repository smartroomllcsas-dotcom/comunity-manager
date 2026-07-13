import { describe, expect, it } from "vitest";
import type { MessageTemplate } from "@/types/database";
import {
  buildTemplateComponents,
  extractButtons,
  extractHeaderInfo,
  extractTemplateVariableIndices,
  getTemplateBodyPreview,
  renderTemplatePreview,
  templateHasVariables,
  urlButtonHasVariable,
  type InboxTemplate,
} from "./TemplateBanner";

function makeTemplate(overrides: Partial<MessageTemplate> & { components?: unknown[] } = {}): InboxTemplate {
  return {
    id: "tpl_1",
    organization_id: "org_1",
    wa_template_id: null,
    name: "sample",
    language: "es_MX",
    category: "utility",
    components: [],
    status: "approved",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as InboxTemplate;
}

describe("extractTemplateVariableIndices", () => {
  it("extrae variables únicas ordenadas", () => {
    const t = makeTemplate({ components: [{ type: "BODY", text: "Hola {{2}}, tu código {{1}} vence {{2}}" }] });
    expect(extractTemplateVariableIndices(t)).toEqual([1, 2]);
  });

  it("devuelve array vacío si no hay variables", () => {
    const t = makeTemplate({ components: [{ type: "BODY", text: "Sin variables" }] });
    expect(extractTemplateVariableIndices(t)).toEqual([]);
  });

  it("ignora índices no numéricos o cero", () => {
    const t = makeTemplate({ components: [{ type: "BODY", text: "Hola {{0}} y {{abc}}" }] });
    expect(extractTemplateVariableIndices(t)).toEqual([]);
  });
});

describe("templateHasVariables", () => {
  it("true si hay al menos una", () => {
    const t = makeTemplate({ components: [{ type: "BODY", text: "Hola {{1}}" }] });
    expect(templateHasVariables(t)).toBe(true);
  });
  it("false si no hay", () => {
    const t = makeTemplate({ components: [{ type: "BODY", text: "Fijo" }] });
    expect(templateHasVariables(t)).toBe(false);
  });
});

describe("getTemplateBodyPreview", () => {
  it("busca componente BODY (case insensitive)", () => {
    const t = makeTemplate({ components: [{ type: "body", text: "cuerpo" }] });
    expect(getTemplateBodyPreview(t)).toBe("cuerpo");
  });
  it("fallback si no hay body", () => {
    const t = makeTemplate({ components: [] });
    expect(getTemplateBodyPreview(t)).toContain("Plantilla");
  });
});

describe("renderTemplatePreview", () => {
  it("reemplaza variables llenas", () => {
    const t = makeTemplate({ components: [{ type: "BODY", text: "Hola {{1}}, código {{2}}" }] });
    expect(renderTemplatePreview(t, { 1: "Ana", 2: "AB123" })).toBe("Hola Ana, código AB123");
  });
  it("deja placeholders si el valor está vacío", () => {
    const t = makeTemplate({ components: [{ type: "BODY", text: "Hola {{1}}" }] });
    expect(renderTemplatePreview(t, { 1: "" })).toBe("Hola {{1}}");
    expect(renderTemplatePreview(t, {})).toBe("Hola {{1}}");
  });
});

describe("extractHeaderInfo", () => {
  it("HEADER TEXT con variables", () => {
    const t = makeTemplate({
      components: [
        { type: "HEADER", format: "TEXT", text: "Hola {{1}}" },
        { type: "BODY", text: "cuerpo" },
      ],
    });
    const info = extractHeaderInfo(t);
    expect(info.present).toBe(true);
    expect(info.format).toBe("TEXT");
    expect(info.variableIndices).toEqual([1]);
  });
  it("HEADER IMAGE sin variables", () => {
    const t = makeTemplate({
      components: [{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "x" }],
    });
    const info = extractHeaderInfo(t);
    expect(info.format).toBe("IMAGE");
    expect(info.variableIndices).toEqual([]);
  });
  it("sin HEADER devuelve present:false", () => {
    const t = makeTemplate({ components: [{ type: "BODY", text: "x" }] });
    expect(extractHeaderInfo(t).present).toBe(false);
  });
});

describe("extractButtons", () => {
  it("normaliza tipo a upper", () => {
    const t = makeTemplate({
      components: [
        {
          type: "BUTTONS",
          buttons: [
            { type: "quick_reply", text: "Sí" },
            { type: "URL", text: "Web", url: "https://x.com/{{1}}" },
            { type: "PHONE_NUMBER", text: "Llamar", phone_number: "+57" },
          ],
        },
      ],
    });
    const buttons = extractButtons(t);
    expect(buttons).toHaveLength(3);
    expect(buttons[0].type).toBe("QUICK_REPLY");
    expect(buttons[1].type).toBe("URL");
    expect(buttons[2].type).toBe("PHONE_NUMBER");
  });
  it("array vacío si no hay BUTTONS", () => {
    const t = makeTemplate({ components: [{ type: "BODY", text: "x" }] });
    expect(extractButtons(t)).toEqual([]);
  });
});

describe("urlButtonHasVariable", () => {
  it("true si URL tiene {{N}}", () => {
    expect(urlButtonHasVariable({ type: "URL", text: "x", url: "https://x/{{1}}" })).toBe(true);
  });
  it("false si URL sin var", () => {
    expect(urlButtonHasVariable({ type: "URL", text: "x", url: "https://x" })).toBe(false);
  });
  it("false si tipo no es URL", () => {
    expect(urlButtonHasVariable({ type: "QUICK_REPLY", text: "x", url: "https://x/{{1}}" })).toBe(false);
  });
});

describe("buildTemplateComponents", () => {
  it("solo body con variables", () => {
    const out = buildTemplateComponents({ bodyIndices: [1, 2], bodyValues: { 1: "A", 2: "B" } });
    expect(out).toEqual([
      { type: "body", parameters: [{ type: "text", text: "A" }, { type: "text", text: "B" }] },
    ]);
  });

  it("body vacío devuelve array vacío si no hay header ni buttons", () => {
    expect(buildTemplateComponents({ bodyIndices: [], bodyValues: {} })).toEqual([]);
  });

  it("header TEXT con variable", () => {
    const out = buildTemplateComponents({
      bodyIndices: [],
      bodyValues: {},
      header: { present: true, format: "TEXT", text: "Hola {{1}}", variableIndices: [1] },
      headerTextValues: { 1: "Ana" },
    });
    expect(out).toEqual([{ type: "header", parameters: [{ type: "text", text: "Ana" }] }]);
  });

  it("header IMAGE con url", () => {
    const out = buildTemplateComponents({
      bodyIndices: [],
      bodyValues: {},
      header: { present: true, format: "IMAGE", text: "", variableIndices: [] },
      headerMediaUrl: "https://cdn/img.jpg",
    });
    expect(out).toEqual([{ type: "header", parameters: [{ type: "image", image: { link: "https://cdn/img.jpg" } }] }]);
  });

  it("header DOCUMENT con filename opcional", () => {
    const out = buildTemplateComponents({
      bodyIndices: [],
      bodyValues: {},
      header: { present: true, format: "DOCUMENT", text: "", variableIndices: [] },
      headerMediaUrl: "https://cdn/doc.pdf",
      headerMediaFilename: "factura.pdf",
    });
    expect(out).toMatchObject([
      { type: "header", parameters: [{ type: "document", document: { link: "https://cdn/doc.pdf", filename: "factura.pdf" } }] },
    ]);
  });

  it("header LOCATION con name+address", () => {
    const out = buildTemplateComponents({
      bodyIndices: [],
      bodyValues: {},
      header: { present: true, format: "LOCATION", text: "", variableIndices: [] },
      headerLocation: { latitude: 4.7, longitude: -74.07, name: "Tienda", address: "Cra 7" },
    });
    expect(out).toEqual([
      {
        type: "header",
        parameters: [
          {
            type: "location",
            location: { latitude: 4.7, longitude: -74.07, name: "Tienda", address: "Cra 7" },
          },
        ],
      },
    ]);
  });

  it("header LOCATION descartado si lat/lng no son números", () => {
    const out = buildTemplateComponents({
      bodyIndices: [],
      bodyValues: {},
      header: { present: true, format: "LOCATION", text: "", variableIndices: [] },
      headerLocation: { latitude: "abc" as unknown as string, longitude: 0 },
    });
    expect(out).toEqual([]);
  });

  it("BUTTONS quick_reply", () => {
    const out = buildTemplateComponents({
      bodyIndices: [],
      bodyValues: {},
      buttons: [
        { type: "QUICK_REPLY", text: "Sí" },
        { type: "QUICK_REPLY", text: "No" },
      ],
      buttonPayloads: { 0: "YES_PAYLOAD", 1: "NO_PAYLOAD" },
    });
    expect(out).toEqual([
      { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: "YES_PAYLOAD" }] },
      { type: "button", sub_type: "quick_reply", index: "1", parameters: [{ type: "payload", payload: "NO_PAYLOAD" }] },
    ]);
  });

  it("BUTTONS quick_reply usa text como default si no hay payload custom", () => {
    const out = buildTemplateComponents({
      bodyIndices: [],
      bodyValues: {},
      buttons: [{ type: "QUICK_REPLY", text: "Sí" }],
      buttonPayloads: {},
    });
    expect(out).toEqual([
      { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: "Sí" }] },
    ]);
  });

  it("BUTTONS URL con var incluye el valor", () => {
    const out = buildTemplateComponents({
      bodyIndices: [],
      bodyValues: {},
      buttons: [{ type: "URL", text: "Ver", url: "https://x/{{1}}" }],
      buttonPayloads: { 0: "abc-123" },
    });
    expect(out).toEqual([
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "abc-123" }] },
    ]);
  });

  it("BUTTONS URL sin var no se incluye en el payload de send", () => {
    const out = buildTemplateComponents({
      bodyIndices: [],
      bodyValues: {},
      buttons: [{ type: "URL", text: "Ver", url: "https://x" }],
    });
    expect(out).toEqual([]);
  });

  it("BUTTONS PHONE_NUMBER se ignora en payload de send", () => {
    const out = buildTemplateComponents({
      bodyIndices: [],
      bodyValues: {},
      buttons: [{ type: "PHONE_NUMBER", text: "Llamar", phone_number: "+57" }],
    });
    expect(out).toEqual([]);
  });

  it("header + body + buttons combinados en el orden correcto", () => {
    const out = buildTemplateComponents({
      bodyIndices: [1],
      bodyValues: { 1: "Ana" },
      header: { present: true, format: "IMAGE", text: "", variableIndices: [] },
      headerMediaUrl: "https://cdn/img.jpg",
      buttons: [{ type: "QUICK_REPLY", text: "OK" }],
      buttonPayloads: {},
    });
    expect(out.map((c) => (c as { type: string }).type)).toEqual(["header", "body", "button"]);
  });
});
