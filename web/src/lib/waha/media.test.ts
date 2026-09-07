import { describe, expect, it } from "vitest";
import { attachmentTypeFromMime, resolveWahaMediaUrl } from "./media";

describe("resolveWahaMediaUrl", () => {
  it("reemplaza host, protocolo Y puerto de la URL interna de WAHA", () => {
    // Regresión: al asignar sólo `host` quedaba el :3000 y la descarga moría
    // por timeout contra Cloudflare.
    expect(
      resolveWahaMediaUrl(
        "http://localhost:3000/api/files/brand_x/ABC.jpeg",
        "https://waha.smartgenapp.com",
      ),
    ).toBe("https://waha.smartgenapp.com/api/files/brand_x/ABC.jpeg");
  });

  it("respeta un puerto explícito del WAHA_BASE_URL", () => {
    expect(resolveWahaMediaUrl("http://localhost:3000/api/files/a.ogg", "http://10.0.0.5:3011")).toBe(
      "http://10.0.0.5:3011/api/files/a.ogg",
    );
  });

  it("sin WAHA_BASE_URL devuelve la URL tal cual", () => {
    expect(resolveWahaMediaUrl("http://localhost:3000/x", "")).toBe("http://localhost:3000/x");
  });
});

describe("attachmentTypeFromMime", () => {
  it("clasifica por mimetype (WAHA no manda type)", () => {
    expect(attachmentTypeFromMime("image/jpeg")).toBe("image");
    expect(attachmentTypeFromMime("image/webp")).toBe("sticker");
    expect(attachmentTypeFromMime("audio/ogg; codecs=opus")).toBe("audio");
    expect(attachmentTypeFromMime("video/mp4")).toBe("video");
    expect(attachmentTypeFromMime("application/pdf")).toBe("document");
    expect(attachmentTypeFromMime(null)).toBe("document");
  });
});
