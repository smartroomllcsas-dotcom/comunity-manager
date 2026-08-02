/**
 * Sprint 23 · RAG-lite skill selector.
 *
 * Calls Claude Haiku with a compact `slug: description` catalog and asks it
 * to pick 1-3 skills relevant to the user's latest message. The chosen skills
 * are then loaded (full markdown body) and injected into the Sonnet system
 * prompt by the caller.
 *
 * Design:
 *  - Cheap model (Haiku) makes the selection.
 *  - Prompt requests JSON-only output. One soft retry on parse failure.
 *  - 5s timeout. On any error we return [] so the chat still works.
 */

import Anthropic from "@anthropic-ai/sdk";
import { SKILLS } from "./data.generated";
import type { SkillEntry } from "./data.generated";

export const HAIKU_MODEL = "claude-haiku-4-5-20251001";

const DEFAULT_MAX_SKILLS = 3;
const SELECTION_TIMEOUT_MS = 5_000;
const HISTORY_TAIL = 3;

interface HistoryMsg {
  role: string;
  content: string;
}

export interface SelectorOptions {
  maxSkills?: number;
  /** Injectable client for tests. */
  client?: Anthropic;
  /** Override timeout (ms). */
  timeoutMs?: number;
}

/**
 * Build the compact catalog: one line per skill, `slug: description`.
 * Truncates individual descriptions to keep the prompt small even with 68+
 * skills. Empty descriptions fall back to the skill name.
 */
function buildCatalog(skills: SkillEntry[]): string {
  return skills
    .map((s) => {
      const desc = (s.description || s.name).replace(/\s+/g, " ").trim();
      const short = desc.length > 240 ? `${desc.slice(0, 237)}...` : desc;
      return `- ${s.slug}: ${short}`;
    })
    .join("\n");
}

function buildRecentContext(history: HistoryMsg[]): string {
  const tail = history.slice(-HISTORY_TAIL);
  if (!tail.length) return "(no prior context)";
  return tail
    .map(
      (m) =>
        `${m.role.toUpperCase()}: ${(m.content || "")
          .replace(/\s+/g, " ")
          .slice(0, 300)}`
    )
    .join("\n");
}

function buildPrompt(
  userMessage: string,
  history: HistoryMsg[],
  maxSkills: number,
  catalog: string
): string {
  return `You are a routing classifier. Pick the ${maxSkills} most relevant skills (or fewer, or none) from the catalog that would help answer the user's latest message.

Recent context:
${buildRecentContext(history)}

User just said:
"""${userMessage.slice(0, 2_000)}"""

Catalog (slug: short description):
${catalog}

Rules:
- Return ONLY a JSON array of skill slugs. Example: ["cold-email","copywriting"]
- Max ${maxSkills} slugs. If nothing fits, return [].
- Do NOT include markdown, prose, or code fences. JSON array only.`;
}

/**
 * Extract the first JSON array of strings from a Haiku response.
 * Tolerates code fences and stray prose the model may sneak in.
 */
function parseSlugArray(raw: string): string[] | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Try direct parse first.
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
      return parsed;
    }
  } catch {
    /* fall through */
  }
  // Strip markdown fences.
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1].trim());
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
        return parsed;
      }
    } catch {
      /* fall through */
    }
  }
  // Grab first [...] substring.
  const bracketMatch = trimmed.match(/\[[\s\S]*?\]/);
  if (bracketMatch) {
    try {
      const parsed = JSON.parse(bracketMatch[0]);
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
        return parsed;
      }
    } catch {
      /* fall through */
    }
  }
  return null;
}

async function callHaiku(
  client: Anthropic,
  prompt: string,
  timeoutMs: number
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await client.messages.create(
      {
        model: HAIKU_MODEL,
        max_tokens: 256,
        messages: [{ role: "user", content: prompt }],
      },
      { signal: controller.signal }
    );
    const block = resp.content[0];
    return block && block.type === "text" ? block.text : "";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Main entrypoint. Never throws — on failure returns [].
 */
export async function selectRelevantSkills(
  userMessage: string,
  conversationHistory: HistoryMsg[] = [],
  opts: SelectorOptions = {}
): Promise<SkillEntry[]> {
  const maxSkills = Math.max(1, opts.maxSkills ?? DEFAULT_MAX_SKILLS);
  const timeoutMs = opts.timeoutMs ?? SELECTION_TIMEOUT_MS;

  if (!userMessage || !userMessage.trim()) return [];
  if (!SKILLS.length) return [];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const client =
    opts.client ??
    (apiKey ? new Anthropic({ apiKey }) : null);
  if (!client) {
    console.warn("[skills:selector] No ANTHROPIC_API_KEY — skipping selection");
    return [];
  }

  const catalog = buildCatalog(SKILLS);
  const prompt = buildPrompt(userMessage, conversationHistory, maxSkills, catalog);

  const validSlugs = new Set(SKILLS.map((s) => s.slug));

  const attemptOnce = async (): Promise<SkillEntry[] | null> => {
    let raw = "";
    try {
      raw = await callHaiku(client, prompt, timeoutMs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[skills:selector] Haiku call failed: ${msg}`);
      return null;
    }
    const slugs = parseSlugArray(raw);
    if (!slugs) return null;
    const seen = new Set<string>();
    const picked: SkillEntry[] = [];
    for (const slug of slugs) {
      if (picked.length >= maxSkills) break;
      if (!validSlugs.has(slug) || seen.has(slug)) continue;
      seen.add(slug);
      const found = SKILLS.find((s) => s.slug === slug);
      if (found) picked.push(found);
    }
    return picked;
  };

  const first = await attemptOnce();
  if (first !== null) {
    if (first.length) {
      console.log(
        `[skills:selector] Selected ${first.length}: ${first
          .map((s) => s.slug)
          .join(",")}`
      );
    }
    return first;
  }

  // Soft retry: one more shot for malformed JSON.
  const retry = await attemptOnce();
  if (retry === null) {
    console.warn("[skills:selector] Haiku returned malformed JSON twice — returning []");
    return [];
  }
  if (retry.length) {
    console.log(
      `[skills:selector] Selected on retry ${retry.length}: ${retry
        .map((s) => s.slug)
        .join(",")}`
    );
  }
  return retry;
}
