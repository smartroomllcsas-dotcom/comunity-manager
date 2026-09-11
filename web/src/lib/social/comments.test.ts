import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/meta", () => ({ replyToComment: vi.fn(), sendPrivateReplyToComment: vi.fn() }));
import { parseCommentChange } from "./comments";
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
