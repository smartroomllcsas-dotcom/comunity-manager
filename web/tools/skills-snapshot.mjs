#!/usr/bin/env node
// Generates web/public/skills-index.json + web/public/skills-md/{name}.md
// for Vercel prod deploys where the .claude/skills folder is not present.
// Usage: node tools/skills-snapshot.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import yaml from 'js-yaml';

const SKILLS_DIR = path.join(os.homedir(), '.claude', 'skills');
const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const OUT_JSON = path.join(ROOT, 'public', 'skills-index.json');
const OUT_MD_DIR = path.join(ROOT, 'public', 'skills-md');

function categorize(name, description) {
  const n = name.toLowerCase();
  if (n.startsWith('azure-') || n.startsWith('aws-') || n.startsWith('gcp-') || n.startsWith('vercel')) return 'Cloud';
  if (n.startsWith('ads-')) return 'Marketing';
  if (n.startsWith('seo-')) return 'SEO';
  if (n.startsWith('affaan-m-')) return 'AI/Engineering';
  if (n.startsWith('superpowers:') || n.startsWith('everything-claude-code:')) return 'Meta';
  return 'General';
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  try {
    const doc = yaml.load(m[1]);
    if (doc && typeof doc === 'object') return doc;
  } catch {}
  return {};
}

async function main() {
  const entries = await fs.readdir(SKILLS_DIR);
  await fs.mkdir(OUT_MD_DIR, { recursive: true });
  const skills = [];
  let ok = 0;
  for (const entry of entries) {
    const dir = path.join(SKILLS_DIR, entry);
    let stat;
    try {
      stat = await fs.stat(dir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    const mdPath = path.join(dir, 'SKILL.md');
    let raw;
    try {
      raw = await fs.readFile(mdPath, 'utf8');
    } catch {
      continue;
    }
    const fm = parseFrontmatter(raw.slice(0, 4096));
    const name = fm.name || entry;
    const description = (fm.description || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    skills.push({ name, description, category: categorize(name, description), source: 'snapshot' });
    // safe filename
    if (/^[a-zA-Z0-9_:.-]+$/.test(name)) {
      await fs.writeFile(path.join(OUT_MD_DIR, `${name}.md`), raw, 'utf8');
      ok++;
    }
  }
  skills.sort((a, b) => a.name.localeCompare(b.name));
  await fs.writeFile(
    OUT_JSON,
    JSON.stringify({ skills, count: skills.length, generatedAt: new Date().toISOString() }, null, 2)
  );
  console.log(`Wrote ${skills.length} skills to ${OUT_JSON} (+ ${ok} .md files)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
