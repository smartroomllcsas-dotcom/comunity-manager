/**
 * Sprint 23 · Skills Registry — read-only accessors over the generated dataset.
 *
 * The underlying data is inlined at build time (see
 * `web/scripts/generate-skills-index.mjs`) so Next/Vercel serverless
 * functions have zero filesystem dependency at runtime.
 */

import { SKILLS } from "./data.generated";
import type { SkillEntry } from "./data.generated";

export type { SkillEntry } from "./data.generated";

export function getAllSkills(): SkillEntry[] {
  return SKILLS;
}

const BY_SLUG = new Map<string, SkillEntry>(SKILLS.map((s) => [s.slug, s]));

export function getSkill(slug: string): SkillEntry | undefined {
  return BY_SLUG.get(slug);
}

export function getSkillsByCategory(cat: string): SkillEntry[] {
  const needle = cat.toLowerCase();
  return SKILLS.filter((s) => s.category.toLowerCase() === needle);
}

export interface SkillsSummary {
  total: number;
  byCategory: Record<string, number>;
}

export function skillsSummary(): SkillsSummary {
  const byCategory: Record<string, number> = {};
  for (const s of SKILLS) {
    byCategory[s.category] = (byCategory[s.category] || 0) + 1;
  }
  return { total: SKILLS.length, byCategory };
}
