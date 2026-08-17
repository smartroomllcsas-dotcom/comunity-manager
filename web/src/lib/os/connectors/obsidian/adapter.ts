/**
 * Obsidian vault reader connector.
 *
 * Ported from FounderOS-DEMO/lib/connectors/obsidian.ts, adapted to the CM
 * `ConnectorAdapter` contract and made Vercel-safe with 3 modes:
 *
 *   OBSIDIAN_SOURCE=local     — filesystem walk (default in NODE_ENV=development)
 *   OBSIDIAN_SOURCE=snapshot  — reads web/public/obsidian-index.json (build-time)
 *   OBSIDIAN_SOURCE=disabled  — returns not_configured (default in production)
 *
 * Also exports `obsidianNotesList()` and `obsidianReadNote(relativePath)`
 * helpers used by the Brain graph / knowledge ops agents.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ConnectorAdapter, ProbeResult } from '../base';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WALK_CAP = 10_000;
const NOTE_CONTENT_CAP = 20_000;
const SNAPSHOT_REL = 'public/obsidian-index.json';

type ObsidianSource = 'local' | 'snapshot' | 'disabled';

function resolveSource(): ObsidianSource {
  const raw = process.env.OBSIDIAN_SOURCE?.toLowerCase();
  if (raw === 'local' || raw === 'snapshot' || raw === 'disabled') return raw;
  return process.env.NODE_ENV === 'development' ? 'local' : 'disabled';
}

function resolveVaultPath(): string {
  return (
    process.env.OBSIDIAN_VAULT_PATH ??
    process.env.OBSIDIAN_VAULT ??
    path.join(os.homedir(), 'vault')
  );
}

function resolveSnapshotPath(): string {
  // web/src/lib/os/connectors/obsidian/adapter.ts → 5 levels up = web/
  return path.resolve(__dirname, '..', '..', '..', '..', '..', SNAPSHOT_REL);
}

// ---------------------------------------------------------------------------
// Local filesystem walker
// ---------------------------------------------------------------------------

interface WalkState {
  files: number;
  visited: number;
  paths: string[];
}

function isSkippedDir(name: string): boolean {
  if (name.startsWith('.bak-')) return true;
  if (name.startsWith('.')) return true; // .obsidian, .trash, etc.
  if (name === 'node_modules') return true;
  return false;
}

function walkVault(dir: string, state: WalkState, collectPaths: boolean, rootLen: number): void {
  if (state.visited > WALK_CAP) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (state.visited > WALK_CAP) return;
    state.visited++;
    if (isSkippedDir(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkVault(full, state, collectPaths, rootLen);
    } else if (entry.name.endsWith('.md')) {
      state.files++;
      if (collectPaths) {
        state.paths.push(full.slice(rootLen + 1).replace(/\\/g, '/'));
      }
    }
  }
}

function countMarkdownLocal(vaultPath: string): number {
  const state: WalkState = { files: 0, visited: 0, paths: [] };
  walkVault(vaultPath, state, false, vaultPath.length);
  return state.files;
}

// ---------------------------------------------------------------------------
// Snapshot mode
// ---------------------------------------------------------------------------

interface ObsidianSnapshot {
  notes: Array<{ path: string; excerpt?: string }>;
  count: number;
  generatedAt: string;
  vaultPath?: string;
}

let cachedSnapshot: ObsidianSnapshot | null = null;

async function readSnapshot(): Promise<ObsidianSnapshot | null> {
  if (cachedSnapshot) return cachedSnapshot;
  try {
    const raw = await fsp.readFile(resolveSnapshotPath(), 'utf8');
    const parsed = JSON.parse(raw) as ObsidianSnapshot;
    cachedSnapshot = parsed;
    return parsed;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public helpers (used by Brain graph / agents)
// ---------------------------------------------------------------------------

export interface ObsidianNoteRef {
  path: string; // vault-relative, forward-slash
}

export interface ObsidianNote {
  path: string;
  content: string;
}

/** List note paths (relative to vault root). Honors OBSIDIAN_SOURCE. */
export async function obsidianNotesList(): Promise<ObsidianNoteRef[]> {
  const source = resolveSource();
  if (source === 'disabled') return [];
  if (source === 'snapshot') {
    const snap = await readSnapshot();
    return snap ? snap.notes.map((n) => ({ path: n.path })) : [];
  }
  const vaultPath = resolveVaultPath();
  if (!fs.existsSync(vaultPath)) return [];
  const state: WalkState = { files: 0, visited: 0, paths: [] };
  walkVault(vaultPath, state, true, vaultPath.length);
  return state.paths.map((p) => ({ path: p }));
}

/**
 * Read a single note by vault-relative path.
 * Content is capped at NOTE_CONTENT_CAP bytes. Never throws — missing note
 * returns `null` so callers can degrade gracefully.
 */
export async function obsidianReadNote(relativePath: string): Promise<ObsidianNote | null> {
  const source = resolveSource();
  if (source === 'disabled') return null;
  // Prevent path traversal
  const normalized = relativePath.replace(/\\/g, '/');
  if (normalized.includes('..') || normalized.startsWith('/')) return null;
  if (source === 'snapshot') {
    const snap = await readSnapshot();
    if (!snap) return null;
    const hit = snap.notes.find((n) => n.path === normalized);
    if (!hit) return null;
    return { path: normalized, content: (hit.excerpt ?? '').slice(0, NOTE_CONTENT_CAP) };
  }
  const vaultPath = resolveVaultPath();
  const full = path.join(vaultPath, normalized);
  if (!full.startsWith(vaultPath)) return null; // second traversal guard
  try {
    const raw = await fsp.readFile(full, 'utf8');
    return { path: normalized, content: raw.slice(0, NOTE_CONTENT_CAP) };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// ConnectorAdapter
// ---------------------------------------------------------------------------

export const obsidianAdapter: ConnectorAdapter = {
  id: 'obsidian',
  label: 'Obsidian Vault',
  kind: 'apikey', // no OAuth — local resource or snapshot; closest kind
  provider: 'obsidian',

  async probe(_orgId: string): Promise<ProbeResult> {
    try {
      const source = resolveSource();

      if (source === 'disabled') {
        return {
          status: 'not_configured',
          meta: { source, note: 'OBSIDIAN_SOURCE=disabled' },
        };
      }

      if (source === 'snapshot') {
        const snap = await readSnapshot();
        if (!snap) {
          return {
            status: 'error',
            error: `Snapshot not found at ${SNAPSHOT_REL}`,
            meta: { source, note: 'run tools/obsidian-snapshot.mjs' },
          };
        }
        return {
          status: 'live',
          meta: {
            source,
            noteCount: snap.count,
            generatedAt: snap.generatedAt,
            vaultPath: snap.vaultPath ?? null,
          },
        };
      }

      // source === 'local'
      const vaultPath = resolveVaultPath();
      if (!fs.existsSync(vaultPath)) {
        return {
          status: 'error',
          error: `Vault not found: ${vaultPath}`,
          meta: { source, vaultPath },
        };
      }
      const noteCount = countMarkdownLocal(vaultPath);
      return {
        status: 'live',
        meta: { source, noteCount, vaultPath },
      };
    } catch (e: unknown) {
      return {
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
};
