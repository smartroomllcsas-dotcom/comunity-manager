import { describe, it, expect } from "vitest";
import { bogotaDayKey, formatBogotaTime, bogotaDayLabel, formatListTimestamp } from "./time";

describe("inbox time (Bogotá)", () => {
  it("converts UTC to Colombia time", () => {
    // 2026-09-10T15:24:00Z = 10:24 a. m. en Bogotá
    expect(formatBogotaTime("2026-09-10T15:24:00Z")).toMatch(/10:24 a\. m\./);
    expect(bogotaDayKey("2026-09-10T03:30:00Z")).toBe("2026-09-09"); // 10:30 p. m. del día anterior en Bogotá
  });
  it("labels days relative to Bogotá", () => {
    const now = new Date("2026-09-10T20:00:00Z");
    expect(bogotaDayLabel("2026-09-10T15:24:00Z", now)).toBe("Hoy");
    expect(bogotaDayLabel("2026-09-09T15:24:00Z", now)).toBe("Ayer");
    expect(bogotaDayLabel("2026-09-01T15:24:00Z", now)).toMatch(/1 de septiembre de 2026/);
    expect(formatListTimestamp("2026-09-01T15:24:00Z", now)).toBe("01/09");
  });
});
