import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import yaml from 'js-yaml';
import { requireOrgIdFromRequest } from '@/lib/os/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NAME_RX = /^[a-zA-Z0-9_:.-]+$/;
const TTL_MS = 60 * 60 * 1000;

type MdCache = {
  data: { markdown: string; frontmatter: Record<string, unknown>; path: string };
  expiresAt: number;
};

const CACHE = new Map<string, MdCache>();

function skillsDir(): string {
  return path.join(os.homedir(), '.claude', 'skills');
}

function parseFrontmatter(raw: string): Record<string, unknown> {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  try {
    const doc = yaml.load(m[1]);
    if (doc && typeof doc === 'object') return doc as Record<string, unknown>;
  } catch {}
  return {};
}

function resolveMode(): 'local' | 'snapshot' | 'disabled' {
  const env = (process.env.SKILLS_SOURCE || '').toLowerCase();
  if (env === 'local' || env === 'snapshot' || env === 'disabled') return env;
  return process.env.NODE_ENV === 'development' ? 'local' : 'snapshot';
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ name: string }> }
) {
  try {
    await requireOrgIdFromRequest();
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'unauthorized' }, { status: 401 });
  }

  const { name } = await ctx.params;
  if (!name || !NAME_RX.test(name)) {
    return NextResponse.json({ error: 'invalid_name' }, { status: 400 });
  }

  const mode = resolveMode();
  if (mode === 'disabled') {
    return NextResponse.json({ error: 'skills_disabled' }, { status: 404 });
  }

  const cacheKey = `${mode}:${name}`;
  const now = Date.now();
  const cached = CACHE.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return NextResponse.json({ ...cached.data, fromCache: true });
  }

  let markdown = '';
  let filePath = '';
  try {
    if (mode === 'snapshot') {
      filePath = path.join(process.cwd(), 'public', 'skills-md', `${name}.md`);
      markdown = await fs.readFile(filePath, 'utf8');
    } else {
      // Handle namespaced skills like `superpowers:foo` — try folder as-is first.
      const dir = skillsDir();
      const candidates = [
        path.join(dir, name, 'SKILL.md'),
      ];
      // If name has `:`, also try replacing with `/` (plugins split)
      if (name.includes(':')) {
        const [ns, sub] = name.split(':');
        candidates.push(path.join(dir, ns, sub, 'SKILL.md'));
      }
      let found = '';
      for (const c of candidates) {
        try {
          markdown = await fs.readFile(c, 'utf8');
          found = c;
          break;
        } catch {}
      }
      if (!found) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
      }
      filePath = found;
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'read_failed' }, { status: 500 });
  }

  const frontmatter = parseFrontmatter(markdown);
  const data = { markdown, frontmatter, path: filePath };
  CACHE.set(cacheKey, { data, expiresAt: now + TTL_MS });
  return NextResponse.json(data);
}
