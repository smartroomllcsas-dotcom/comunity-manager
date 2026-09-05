'use client';

import { useEffect, useState } from 'react';
import { Key, Eye, EyeOff, RotateCw } from 'lucide-react';

interface ApiKey {
  id: string;
  label: string;
  provider: string;
  masked: string;
  createdAt?: string;
}

/**
 * ApiKeys — reveal / rotate management surface.
 * NOTE (Sprint 2 placeholder): rotate action calls the endpoint but expects
 * `501 Not Implemented` and shows a friendly toast-like inline message.
 */
export function ApiKeys() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [rotating, setRotating] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/os/integrations/keys')
      .then((r) => r.json())
      .then((d) => setKeys(d.keys ?? []))
      .catch(() => setKeys([]))
      .finally(() => setLoading(false));
  }, []);

  async function reveal(id: string) {
    if (revealed[id]) {
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    // In a real impl, this would require re-auth. For now, echo masked.
    const k = keys.find((k) => k.id === id);
    setRevealed((prev) => ({ ...prev, [id]: k?.masked ?? '••••' }));
  }

  async function rotate(id: string) {
    setRotating(id);
    setMsg(null);
    try {
      const res = await fetch('/api/os/integrations/keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'rotate', id }),
      });
      if (res.status === 501) {
        setMsg('Rotation ships in Sprint 2 — endpoint reserved.');
      } else if (!res.ok) {
        setMsg(`Rotate failed (${res.status})`);
      } else {
        setMsg('Key rotated.');
      }
    } catch (e: any) {
      setMsg(`Rotate error: ${e?.message ?? 'unknown'}`);
    } finally {
      setRotating(null);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-100">API Keys</h2>
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
            {keys.length}
          </span>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-zinc-600">
          Manage credentials
        </span>
      </div>

      {loading ? (
        <p className="text-xs text-zinc-500">Loading…</p>
      ) : keys.length === 0 ? (
        <p className="text-xs text-zinc-500">
          No API keys registered yet. Configure a connector first — its keys will show up here.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-800/60">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-zinc-100">{k.label}</p>
                <p className="text-[11px] text-zinc-500">
                  <span className="capitalize">{k.provider}</span>
                  {k.createdAt && ` · added ${k.createdAt}`}
                </p>
              </div>
              <code className="rounded bg-zinc-950 px-2 py-1 text-[11px] font-mono text-zinc-300 ring-1 ring-zinc-800">
                {revealed[k.id] ?? k.masked}
              </code>
              <button
                type="button"
                onClick={() => reveal(k.id)}
                className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                aria-label={revealed[k.id] ? 'Hide key' : 'Reveal key'}
                title={revealed[k.id] ? 'Hide' : 'Reveal (re-auth required)'}
              >
                {revealed[k.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => rotate(k.id)}
                disabled={rotating === k.id}
                className="inline-flex items-center gap-1 rounded-md bg-zinc-800/80 px-2 py-1 text-[11px] text-zinc-300 ring-1 ring-zinc-700 hover:bg-zinc-700 disabled:opacity-50"
              >
                <RotateCw className={`h-3 w-3 ${rotating === k.id ? 'animate-spin' : ''}`} />
                Rotate
              </button>
            </li>
          ))}
        </ul>
      )}

      {msg && (
        <p className="mt-3 rounded-md bg-blue-500/10 px-3 py-2 text-[11px] text-blue-300 ring-1 ring-blue-500/20">
          {msg}
        </p>
      )}
    </section>
  );
}
