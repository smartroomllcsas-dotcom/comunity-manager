import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/meta", () => ({ replyToComment: vi.fn(), sendPrivateReplyToComment: vi.fn() }));
import { parseCommentChange, checkPrivateReplyAllowed, pickVariant } from "./comments";
import { renderCommentText, commentMatchesRules, DEFAULT_COMMENT_RULES } from "./comment-rules";

const PAGE = "1004299339426464";

describe("parseCommentChange · Facebook", () => {
  const value = {
    item: "comment",
    verb: "add",
    comment_id: "123_456",
    post_id: `${PAGE}_999`,
    created_time: 1757600000,
    from: { id: "555", name: "Juan Jaramillo" },
    message: "¿cuánto cuesta?",
  };
  it("reads a new comment", () => {
    const c = parseCommentChange("facebook", "feed", value, [PAGE]);
    expect(c?.commentId).toBe("123_456");
    expect(c?.authorName).toBe("Juan Jaramillo");
    expect(c?.message).toBe("¿cuánto cuesta?");
  });
  it("ignores our own comments, likes, edits and other fields", () => {
    expect(parseCommentChange("facebook", "feed", { ...value, from: { id: PAGE } }, [PAGE])).toBeNull();
    expect(parseCommentChange("facebook", "feed", { ...value, item: "like" }, [PAGE])).toBeNull();
    expect(parseCommentChange("facebook", "feed", { ...value, verb: "remove" }, [PAGE])).toBeNull();
    expect(parseCommentChange("facebook", "leadgen", value, [PAGE])).toBeNull();
  });
});

describe("parseCommentChange · Instagram", () => {
  it("reads the comment and detects ads", () => {
    const c = parseCommentChange(
      "instagram",
      "comments",
      { id: "17999", text: "precio?", from: { id: "888", username: "juanjt" }, media: { id: "17111", ad_id: "AD1" } },
      ["17841480058112035"]
    );
    expect(c?.commentId).toBe("17999");
    expect(c?.authorName).toBe("juanjt");
    expect(c?.adId).toBe("AD1");
  });
});

describe("textos y reglas", () => {
  it("fills the author's first name and the brand", () => {
    expect(renderCommentText("¡Hola {{nombre}}! Somos {{empresa}}", { authorName: "Juan Jaramillo", brandName: "Moda Style" }))
      .toBe("¡Hola Juan! Somos Moda Style");
  });
  it("does not leave a dangling greeting when there is no name", () => {
    expect(renderCommentText("¡Hola {{nombre}}! ¿Te ayudo?", { authorName: null, brandName: null })).toBe("¡Hola! ¿Te ayudo?");
  });
  it("respects ignore and only keywords", () => {
    const rules = { ...DEFAULT_COMMENT_RULES, ignore_keywords: ["spam"], only_keywords: ["precio"] };
    expect(commentMatchesRules("cuál es el precio", rules)).toBe(true);
    expect(commentMatchesRules("hola", rules)).toBe(false);
    expect(commentMatchesRules("precio spam", rules)).toBe(false);
  });
});

describe("límite de Meta para el mensaje al interno", () => {
  const hoy = new Date().toISOString();
  const hace10dias = new Date(Date.now() - 10 * 86400_000).toISOString();
  it("permite si el comentario es reciente y no se ha enviado", () => {
    expect(checkPrivateReplyAllowed({ commented_at: hoy, dm_sent_at: null }).allowed).toBe(true);
  });
  it("bloquea si ya se envió uno", () => {
    const r = checkPrivateReplyAllowed({ commented_at: hoy, dm_sent_at: hoy });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/sólo uno/i);
  });
  it("bloquea pasados los 7 días", () => {
    const r = checkPrivateReplyAllowed({ commented_at: hace10dias, dm_sent_at: null });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/7 días/i);
  });
});

describe("anti-spam: no repetir el texto anterior", () => {
  it("evita el último usado cuando hay alternativas", () => {
    expect(pickVariant(["A", "B"], "A")).toBe("B");
  });
  it("si sólo hay uno, lo usa igual", () => {
    expect(pickVariant(["A"], "A")).toBe("A");
  });
  it("sin textos devuelve vacío", () => {
    expect(pickVariant([], null)).toBe("");
  });
});
