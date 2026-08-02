/**
 * Sprint 23 · selector unit tests.
 *
 * Uses a hand-rolled fake Anthropic client (no external mocking needed) so we
 * avoid hitting the real API and stay deterministic.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { selectRelevantSkills } from "../selector";
import { SKILLS } from "../data.generated";

interface FakeCallOpts {
  signal?: AbortSignal;
}

/**
 * Build a fake `Anthropic`-shaped object that returns whatever `text` we want.
 * Also lets us script a sequence of responses to exercise the retry path.
 */
function makeFakeClient(responses: string[]) {
  let call = 0;
  const client = {
    messages: {
      async create(_body: unknown, _opts?: FakeCallOpts) {
        const idx = Math.min(call, responses.length - 1);
        call += 1;
        return {
          content: [{ type: "text", text: responses[idx] }],
        };
      },
    },
    _callCount: () => call,
  };
  // The selector types `client` as `Anthropic`; cast for the test.
  return client as unknown as import("@anthropic-ai/sdk").default & {
    _callCount: () => number;
  };
}

beforeAll(() => {
  // Guard: ensure the generated dataset actually has content before we assert
  // slug validation behavior. If the generator hasn't run, skip meaningfully.
  if (!SKILLS.length) {
    throw new Error(
      "SKILLS dataset is empty — run `npm run skills:index` before tests"
    );
  }
});

describe("selectRelevantSkills", () => {
  it("returns the skills Haiku picks when they are valid slugs", async () => {
    // Prefer real slugs from the dataset so validation passes.
    const emailSlug =
      SKILLS.find((s) => s.slug === "cold-email")?.slug ||
      SKILLS.find((s) => s.slug === "email-sequence")?.slug ||
      SKILLS[0].slug;
    const client = makeFakeClient([JSON.stringify([emailSlug])]);

    const picked = await selectRelevantSkills(
      "Help me write a cold email to a CTO at a fintech.",
      [],
      { client, maxSkills: 3 }
    );

    expect(picked.length).toBeGreaterThanOrEqual(1);
    expect(picked.map((s) => s.slug)).toContain(emailSlug);
  });

  it("returns [] when Haiku says nothing fits", async () => {
    const client = makeFakeClient(["[]"]);
    const picked = await selectRelevantSkills(
      "What's the weather in Tokyo today?",
      [],
      { client }
    );
    expect(picked).toEqual([]);
  });

  it("recovers from malformed JSON by retrying, then falls back to [] on double failure", async () => {
    const client = makeFakeClient(["not json at all", "still garbage"]);
    const picked = await selectRelevantSkills("anything", [], { client });
    expect(picked).toEqual([]);
    // Confirm both attempts happened.
    expect(client._callCount()).toBe(2);
  });

  it("recovers from malformed JSON on first attempt and succeeds on retry", async () => {
    const slug = SKILLS[0].slug;
    const client = makeFakeClient([
      "sure, here you go: ", // no JSON
      JSON.stringify([slug]),
    ]);
    const picked = await selectRelevantSkills("some prompt", [], { client });
    expect(picked.map((s) => s.slug)).toEqual([slug]);
  });

  it("filters out unknown slugs Haiku may hallucinate", async () => {
    const validSlug = SKILLS[0].slug;
    const client = makeFakeClient([
      JSON.stringify(["totally-fake-slug", validSlug, "another-fake"]),
    ]);
    const picked = await selectRelevantSkills("prompt", [], { client });
    expect(picked.map((s) => s.slug)).toEqual([validSlug]);
  });

  it("caps results at maxSkills", async () => {
    const many = SKILLS.slice(0, 5).map((s) => s.slug);
    const client = makeFakeClient([JSON.stringify(many)]);
    const picked = await selectRelevantSkills("prompt", [], {
      client,
      maxSkills: 2,
    });
    expect(picked).toHaveLength(2);
  });

  it("tolerates fenced JSON output (```json ... ```)", async () => {
    const slug = SKILLS[0].slug;
    const client = makeFakeClient([
      "```json\n" + JSON.stringify([slug]) + "\n```",
    ]);
    const picked = await selectRelevantSkills("prompt", [], { client });
    expect(picked.map((s) => s.slug)).toEqual([slug]);
  });

  it("returns [] for empty user message without calling Haiku", async () => {
    const client = makeFakeClient(["should-not-be-used"]);
    const picked = await selectRelevantSkills("   ", [], { client });
    expect(picked).toEqual([]);
    expect(client._callCount()).toBe(0);
  });
});
