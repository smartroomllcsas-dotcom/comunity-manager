import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { extractOfficeText, inboundContentToText } from "./media-understanding";

function zip(files: Record<string, string>): Buffer {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) entries[name] = strToU8(content);
  return Buffer.from(zipSync(entries));
}

describe("extractOfficeText", () => {
  it("saca párrafos de un .docx", () => {
    const docx = zip({
      "word/document.xml":
        '<w:document><w:body><w:p><w:r><w:t>Cotización web</w:t></w:r></w:p>' +
        "<w:p><w:r><w:t>Presupuesto: 5.000 &amp; algo</w:t></w:r></w:p></w:body></w:document>",
    });
    expect(extractOfficeText(docx, "docx")).toBe("Cotización web\nPresupuesto: 5.000 & algo");
  });

  it("saca celdas de un .xlsx usando sharedStrings", () => {
    const xlsx = zip({
      "xl/sharedStrings.xml":
        '<sst><si><t>Producto</t></si><si><t>Precio</t></si><si><t>Página web</t></si></sst>',
      "xl/worksheets/sheet1.xml":
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>1500</v></c></row></sheetData></worksheet>',
    });
    expect(extractOfficeText(xlsx, "xlsx")).toBe(
      "--- Hoja 1 ---\nProducto\tPrecio\nPágina web\t1500",
    );
  });

  it("saca las diapositivas en orden de un .pptx", () => {
    const pptx = zip({
      "ppt/slides/slide2.xml": "<p:sld><a:p><a:r><a:t>Segunda</a:t></a:r></a:p></p:sld>",
      "ppt/slides/slide1.xml": "<p:sld><a:p><a:r><a:t>Primera</a:t></a:r></a:p></p:sld>",
    });
    expect(extractOfficeText(pptx, "pptx")).toBe(
      "--- Diapositiva 1 ---\nPrimera\n\n--- Diapositiva 2 ---\nSegunda",
    );
  });
});

describe("inboundContentToText", () => {
  it("devuelve el texto tal cual", () => {
    expect(inboundContentToText({ type: "text", text: "Hola" })).toBe("Hola");
  });

  it("usa la transcripción guardada en ai_text", () => {
    expect(
      inboundContentToText({ type: "audio", url: "", ai_text: "quiero una página web" }),
    ).toBe("[Audio de voz enviado por el cliente. Contenido: quiero una página web]");
  });

  it("pide al cliente que escriba cuando el adjunto no pudo interpretarse", () => {
    const text = inboundContentToText({ type: "video", url: "", ai_text_error: "sin_gemini_api_key" });
    expect(text).toContain("Video recibido pero no se pudo interpretar");
    expect(text).toContain("escriba en texto");
  });

  it("incluye el caption de una imagen", () => {
    expect(
      inboundContentToText({ type: "image", url: "", ai_text: "logo azul", caption: "mi logo" }),
    ).toBe("[Imagen enviado por el cliente. Contenido: logo azul] Texto que lo acompaña: «mi logo»");
  });
});
