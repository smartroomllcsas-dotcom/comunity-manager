import { describe, it, expect } from "vitest";
import { presetToDates, AD_DATE_PRESETS } from "@/lib/meta";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

describe("periodos para la API de páginas, que no entiende date_preset", () => {
  it("traduce todos los periodos a fechas válidas y en orden", () => {
    for (const preset of AD_DATE_PRESETS) {
      const { since, until } = presetToDates(preset);
      expect(since, preset).toMatch(YMD);
      expect(until, preset).toMatch(YMD);
      expect(since <= until, `${preset}: ${since} > ${until}`).toBe(true);
    }
  });

  it("«mes pasado» termina el último día del mes anterior, no hoy", () => {
    const { since, until } = presetToDates("last_month");
    expect(since.slice(-2)).toBe("01");
    const hoy = new Date().toISOString().slice(0, 10);
    expect(until < hoy).toBe(true);
    expect(since.slice(0, 7)).toBe(until.slice(0, 7));
  });

  it("«hoy» es un solo día", () => {
    const { since, until } = presetToDates("today");
    expect(since).toBe(until);
  });
});
