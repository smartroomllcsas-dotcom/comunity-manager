import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
import { toModelHistory } from "./ai";

const t = (text: string) => ({ type: "text", text });

describe("toModelHistory", () => {
  it("ends with the current user message when the last stored message is outbound", () => {
    const rows = [
      { direction: "outbound", content: t("Gracias por escribirnos") },
      { direction: "inbound", content: t("Hola") },
    ]; // newest first, as queried
    const h = toModelHistory(rows, "Hola");
    expect(h[h.length - 1]).toEqual({ role: "user", content: "Hola" });
    expect(h[0].role).toBe("user");
  });
  it("drops leading assistant turns and merges consecutive same-role turns", () => {
    const rows = [
      { direction: "inbound", content: t("No") },
      { direction: "inbound", content: t("No tengo nada") },
      { direction: "outbound", content: t("¿Tienes marca?") },
      { direction: "outbound", content: t("Bienvenido") },
    ];
    const h = toModelHistory(rows, "No");
    expect(h).toEqual([{ role: "user", content: "No tengo nada\nNo" }]);
  });
  it("never returns an empty list", () => {
    expect(toModelHistory([], "")).toEqual([{ role: "user", content: "Hola" }]);
  });
});
