#!/usr/bin/env node
/**
 * Sprint 23 · Skills Registry generator
 *
 * Reads all `<repo>/skills/<slug>/SKILL.md` files (relative to `web/`),
 * parses the YAML frontmatter, and emits `web/src/lib/skills/data.generated.ts`
 * with the full inlined content so it ships in the Vercel serverless bundle.
 *
 * Run manually:   npm run skills:index
 * Runs on build:  via `prebuild` in package.json
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// web/scripts/ → web/ → repo root → skills/
const WEB_ROOT = resolve(__dirname, "..");
const REPO_ROOT = resolve(WEB_ROOT, "..");
const SKILLS_ROOT = resolve(REPO_ROOT, "skills");
const OUT_FILE = resolve(WEB_ROOT, "src/lib/skills/data.generated.ts");

/**
 * Split a SKILL.md into frontmatter object + body.
 * Frontmatter delimiters are `---` on their own line at start of file.
 * Falls back gracefully if no frontmatter is present.
 */
function parseFrontmatter(raw) {
  if (!raw.startsWith("---")) {
    return { data: {}, content: raw };
  }
  // Find closing delimiter after the opening one.
  const endMatch = raw.slice(3).match(/\r?\n---\s*(\r?\n|$)/);
  if (!endMatch) {
    return { data: {}, content: raw };
  }
  const endIdx = 3 + endMatch.index + endMatch[0].length;
  const fmRaw = raw.slice(3, 3 + endMatch.index).replace(/^\r?\n/, "");
  const body = raw.slice(endIdx);
  let data = {};
  try {
    data = yaml.load(fmRaw) || {};
  } catch (err) {
    console.warn(`[skills:index] YAML parse warning: ${err.message}`);
    data = {};
  }
  return { data, content: body };
}

/**
 * Rough token estimate: 4 chars ≈ 1 token (English/markdown heuristic).
 */
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * Infer a category when frontmatter doesn't provide one:
 *   1. metadata.category if present
 *   2. metadata.tags[0]
 *   3. best-guess from slug keywords
 *   4. "general"
 */
function inferCategory(slug, data) {
  if (data?.metadata?.category) return String(data.metadata.category);
  if (Array.isArray(data?.metadata?.tags) && data.metadata.tags[0]) {
    return String(data.metadata.tags[0]);
  }
  const s = slug.toLowerCase();
  if (/(seo|schema|site|programmatic)/.test(s)) return "seo";
  if (/(email|newsletter|churn|outreach)/.test(s)) return "email";
  if (/(ads?|campaign|paid|creative)/.test(s)) return "ads";
  if (/(cro|form|popup|paywall|signup|onboarding)/.test(s)) return "cro";
  if (/(analytic|reddit|competitor|social-media-analyzer|meeting)/.test(s))
    return "analytics";
  if (/(brand|voice|positioning|marketing-context|marketing-principles)/.test(s))
    return "brand";
  if (/(community|social-content|linkedin|social-card|tweet)/.test(s))
    return "community";
  if (/(content|copy|blog|humanizer|de-ai|video|youtube|podcast|case-study)/.test(s))
    return "content";
  if (/(revops|sales|launch|referral|lead|free-tool)/.test(s)) return "growth";
  if (/(plan-my-day|daily|go-mode|vault|prompt-engineer)/.test(s))
    return "productivity";
  return "general";
}

function safeString(v, fallback = "") {
  if (v === undefined || v === null) return fallback;
  return String(v);
}

function listSkillDirs(root) {
  let entries = [];
  try {
    entries = readdirSync(root);
  } catch (err) {
    throw new Error(`Cannot read skills root ${root}: ${err.message}`);
  }
  return entries
    .filter((name) => {
      const p = join(root, name);
      try {
        return statSync(p).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();
}

function serializeSkills(skills) {
  const entries = skills.map((s) => {
    return `  {
    slug: ${JSON.stringify(s.slug)},
    name: ${JSON.stringify(s.name)},
    description: ${JSON.stringify(s.description)},
    category: ${JSON.stringify(s.category)},
    tokenCount: ${s.tokenCount},
    content: ${JSON.stringify(s.content)},
  }`;
  });
  return `// AUTO-GENERATED — do not edit. Run \`npm run skills:index\`.
// Source: <repo>/skills/*/SKILL.md
// Generated: ${new Date().toISOString()}

export interface SkillEntry {
  slug: string;
  name: string;
  description: string;
  category: string;
  /** Full markdown body (post-frontmatter). */
  content: string;
  /** Rough token estimate: content.length / 4. */
  tokenCount: number;
}

export const SKILLS: SkillEntry[] = [
${entries.join(",\n")}
];
`;
}

function main() {
  const dirs = listSkillDirs(SKILLS_ROOT);
  const skills = [];
  const skipped = [];

  for (const slug of dirs) {
    const skillMdPath = join(SKILLS_ROOT, slug, "SKILL.md");
    let raw;
    try {
      raw = readFileSync(skillMdPath, "utf8");
    } catch {
      skipped.push({ slug, reason: "SKILL.md missing" });
      continue;
    }
    const { data, content } = parseFrontmatter(raw);
    const name = safeString(data.name, slug);
    const description = safeString(data.description, "").trim();
    const category = inferCategory(slug, data);
    const trimmedContent = content.replace(/^\s+/, "").replace(/\s+$/, "");
    skills.push({
      slug,
      name,
      description,
      category,
      content: trimmedContent,
      tokenCount: estimateTokens(trimmedContent),
    });
  }

  const source = serializeSkills(skills);
  writeFileSync(OUT_FILE, source, "utf8");

  const bytes = Buffer.byteLength(source, "utf8");
  const kb = (bytes / 1024).toFixed(1);
  const byCat = skills.reduce((acc, s) => {
    acc[s.category] = (acc[s.category] || 0) + 1;
    return acc;
  }, {});
  const catSummary = Object.entries(byCat)
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `${c}=${n}`)
    .join(", ");

  console.log(`[skills:index] Indexed ${skills.length} skills → ${OUT_FILE}`);
  console.log(`[skills:index] Bundle size: ${kb} KB`);
  console.log(`[skills:index] Categories: ${catSummary}`);
  if (skipped.length) {
    console.log(
      `[skills:index] Skipped ${skipped.length}: ${skipped
        .map((s) => `${s.slug} (${s.reason})`)
        .join(", ")}`
    );
  }
}

main();
