import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import yaml from 'js-yaml';
import { requireOrgIdFromRequest } from '@/lib/os/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SkillEntry = {
  name: string;
  description: string;
  category: string;
  source: 'local' | 'snapshot';
};

type CacheValue = {
  data: { skills: SkillEntry[]; count: number; cachedAt: string; source: string };
  expiresAt: number;
};

const CACHE = new Map<string, CacheValue>();
const TTL_MS = 5 * 60 * 1000;
const CHUNK = 100;

function resolveMode(): 'local' | 'snapshot' | 'disabled' {
  const env = (process.env.SKILLS_SOURCE || '').toLowerCase();
  if (env === 'local' || env === 'snapshot' || env === 'disabled') return env;
  return process.env.NODE_ENV === 'development' ? 'local' : 'snapshot';
}

function skillsDir(): string {
  return path.join(os.homedir(), '.claude', 'skills');
}

function categorize(name: string, description: string): string {
  const n = name.toLowerCase();
  if (n.startsWith('azure-') || n.startsWith('aws-') || n.startsWith('gcp-') || n.startsWith('cloudflare-') || n.startsWith('vercel')) return 'Cloud';
  if (n.startsWith('ads-') || n.startsWith('hainrixz-ads')) return 'Marketing';
  if (n.startsWith('seo-') || n.startsWith('sickn33-seo')) return 'SEO';
  if (n.startsWith('affaan-m-')) return 'AI/Engineering';
  if (n.startsWith('superpowers:') || n.startsWith('everything-claude-code:') || n.startsWith('claude-')) return 'Meta';
  if (n.startsWith('django-') || n.startsWith('laravel-') || n.startsWith('nextjs-') || n.startsWith('react-') || n.startsWith('vue-') || n.startsWith('svelte') || n.startsWith('angular')) return 'Frontend/Backend';
  if (n.startsWith('python-') || n.startsWith('golang-') || n.startsWith('rust-') || n.startsWith('kotlin-') || n.startsWith('swift') || n.startsWith('java-')) return 'Languages';
  if (n.startsWith('brand-') || n.startsWith('design-') || n.startsWith('ui-') || n.startsWith('ux-')) return 'Design';
  if (n.startsWith('content-') || n.startsWith('copywriting') || n.startsWith('social-') || n.startsWith('email-')) return 'Content';
  if (n.startsWith('security-') || n.startsWith('pentest-') || n.startsWith('sast-')) return 'Security';
  if (n.startsWith('agent-') || n.startsWith('agentic-')) return 'Agents';
  if (n.startsWith('video-') || n.startsWith('audio-') || n.startsWith('image-')) return 'Media';
  const first = (description || '').split(/\s+/)[0]?.toLowerCase() || '';
  if (['test', 'testing', 'tests'].includes(first)) return 'Testing';
  if (['debug', 'debugger', 'diagnose'].includes(first)) return 'Debug';
  if (['build', 'builds', 'compile'].includes(first)) return 'Build';
  return 'General';
}

function parseFrontmatter(raw: string): { name?: string; description?: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  try {
    const doc = yaml.load(m[1]);
    if (doc && typeof doc === 'object') {
      const d = doc as Record<string, unknown>;
      const name = typeof d.name === 'string' ? d.name : undefined;
      const description = typeof d.description === 'string' ? d.description : undefined;
      return { name, description };
    }
  } catch {
    // manual fallback
    const nameM = m[1].match(/^name:\s*["']?(.+?)["']?\s*$/m);
    const descM = m[1].match(/^description:\s*["']?([\s\S]+?)["']?\s*(?:\n[a-z_]+:|$)/m);
    return {
      name: nameM?.[1]?.trim(),
      description: descM?.[1]?.trim(),
    };
  }
  return {};
}

async function readOne(dir: string, entry: string): Promise<SkillEntry | null> {
  try {
    const skillDir = path.join(dir, entry);
    const stat = await fs.stat(skillDir);
    if (!stat.isDirectory()) return null;
    const mdPath = path.join(skillDir, 'SKILL.md');
    let raw: string;
    try {
      raw = await fs.readFile(mdPath, 'utf8');
    } catch {
      return null;
    }
    // read only first 4KB for frontmatter perf
    const head = raw.length > 4096 ? raw.slice(0, 4096) : raw;
    const fm = parseFrontmatter(head);
    const name = fm.name || entry;
    const description = (fm.description || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    return {
      name,
      description,
      category: categorize(name, description),
      source: 'local',
    };
  } catch {
    return null;
  }
}

async function readAllLocal(): Promise<SkillEntry[]> {
  const dir = skillsDir();
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const results: SkillEntry[] = [];
  for (let i = 0; i < entries.length; i += CHUNK) {
    const slice = entries.slice(i, i + CHUNK);
    const chunkRes = await Promise.all(slice.map((e) => readOne(dir, e)));
    for (const r of chunkRes) if (r) results.push(r);
  }
  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}

async function readSnapshot(): Promise<SkillEntry[]> {
  try {
    const p = path.join(process.cwd(), 'public', 'skills-index.json');
    const raw = await fs.readFile(p, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.skills)) {
      return parsed.skills.map((s: any) => ({
        name: String(s.name),
        description: String(s.description || ''),
        category: String(s.category || categorize(String(s.name), String(s.description || ''))),
        source: 'snapshot' as const,
      }));
    }
  } catch {}
  return [];
}

export async function GET() {
  try {
    await requireOrgIdFromRequest();
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'unauthorized' }, { status: 401 });
  }

  const mode = resolveMode();
  if (mode === 'disabled') {
    return NextResponse.json({
      skills: [],
      count: 0,
      cachedAt: new Date().toISOString(),
      source: 'disabled',
      message: 'Skills index is disabled. Set SKILLS_SOURCE=local (dev) or SKILLS_SOURCE=snapshot (prod).',
    });
  }

  const cacheKey = mode;
  const now = Date.now();
  const cached = CACHE.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return NextResponse.json({ ...cached.data, fromCache: true });
  }

  const t0 = Date.now();
  const skills = mode === 'local' ? await readAllLocal() : await readSnapshot();
  const ms = Date.now() - t0;

  const payload = {
    skills,
    count: skills.length,
    cachedAt: new Date().toISOString(),
    source: mode,
    coldReadMs: ms,
  };
  CACHE.set(cacheKey, { data: payload, expiresAt: now + TTL_MS });
  return NextResponse.json(payload);
}
