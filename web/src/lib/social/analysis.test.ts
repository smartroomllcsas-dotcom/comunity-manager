import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
import { parseAnalysis, needsHumanReason } from "./analysis";

const HOLD = { holdNegative: true, urgencyThreshold: 70 };

describe("parseAnalysis", () => {
  it("lee el JSON aunque venga envuelto en ``` o con texto antes", () => {
    const a = parseAnalysis('Claro:\n```json\n{"sentiment":"negativo","sentiment_score":-0.8,"intent":"queja","urgency":85}\n```');
    expect(a).toEqual({ sentiment: "negativo", sentiment_score: -0.8, intent: "queja", urgency: 85 });
  });

  it("recorta los valores fuera de rango", () => {
    const a = parseAnalysis('{"sentiment":"positivo","sentiment_score":7,"intent":"compra","urgency":900}');
    expect(a?.sentiment_score).toBe(1);
    expect(a?.urgency).toBe(100);
  });

  it("cae a 'otro' cuando la intención no es una de las nuestras", () => {
    expect(parseAnalysis('{"sentiment":"neutral","intent":"inventada"}')?.intent).toBe("otro");
  });

  it("devuelve null si no hay JSON o el sentimiento no sirve", () => {
    expect(parseAnalysis("no pude clasificarlo")).toBeNull();
    expect(parseAnalysis('{"sentiment":"raro"}')).toBeNull();
    expect(parseAnalysis("")).toBeNull();
  });
});

describe("¿lo tiene que ver una persona?", () => {
  it("retiene un reclamo", () => {
    const a = parseAnalysis('{"sentiment":"neutral","intent":"queja","urgency":10}');
    expect(needsHumanReason(a, HOLD)).toContain("reclamo");
  });

  it("retiene lo negativo y lo urgente", () => {
    expect(needsHumanReason(parseAnalysis('{"sentiment":"negativo","intent":"otro"}'), HOLD)).toBeTruthy();
    expect(needsHumanReason(parseAnalysis('{"sentiment":"neutral","intent":"otro","urgency":90}'), HOLD)).toBeTruthy();
  });

  it("deja pasar una pregunta normal de precio", () => {
    const a = parseAnalysis('{"sentiment":"neutral","sentiment_score":0.1,"intent":"compra","urgency":20}');
    expect(needsHumanReason(a, HOLD)).toBeNull();
  });

  it("no retiene nada si la empresa apagó esa opción, ni sin análisis", () => {
    const a = parseAnalysis('{"sentiment":"negativo","intent":"queja","urgency":95}');
    expect(needsHumanReason(a, { holdNegative: false, urgencyThreshold: 70 })).toBeNull();
    expect(needsHumanReason(null, HOLD)).toBeNull();
  });
});
