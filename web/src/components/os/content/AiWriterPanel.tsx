'use client';

/**
 * AiWriterPanel
 * Streams from /api/os/content/ai-generate (SSE, action=hook|cta|rewrite|expand).
 */
import { useState } from 'react';
import { Sparkles, Zap, RefreshCcw, Maximize2, Loader2 } from 'lucide-react';

type Action = 'hook' | 'cta' | 'rewrite' | 'expand';

const BUTTONS: { id: Action; label: string; icon: typeof Sparkles }[] = [
  { id: 'hook',    label: 'Generar hooks',      icon: Sparkles },
  { id: 'cta',     label: 'Generar CTAs',       icon: Zap },
  { id: 'rewrite', label: 'Reescribir en voz',  icon: RefreshCcw },
  { id: 'expand',  label: 'Expandir idea',      icon: Maximize2 },
];

export function AiWriterPanel({
  input,
  brandVoice,
  platform,
  onInsert,
  onReplace,
}: {
  input: string;
  brandVoice?: string;
  platform?: string;
  onInsert: (text: string) => void;
  onReplace: (text: string) => void;
}) {
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState<Action | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(action: Action) {
    if (!input.trim()) { setErr('Escribe algo primero (será el prompt)'); return; }
    setBusy(action);
    setErr(null);
    setOutput('');
    try {
      const res = await fetch('/api/os/content/ai-generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, input, brandVoice, platform }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({} as any));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let acc = '';
      // Parse SSE frames
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          const line = frame.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;
          try {
            const payload = JSON.parse(line.slice(5).trim());
            if (payload.type === 'delta' && typeof payload.text === 'string') {
              acc += payload.text;
              setOutput(acc);
            } else if (payload.type === 'error') {
              throw new Error(payload.error ?? 'ai_error');
            }
          } catch { /* ignore frame parse issues */ }
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <aside
      className="rounded-xl border p-3"
      style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4" style={{ color: 'var(--os-warn)' }} />
        <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-1)' }}>
          AI Writer
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {BUTTONS.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => run(b.id)}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] hover:bg-white/5 disabled:opacity-50"
            style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
          >
            {busy === b.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <b.icon className="h-3 w-3" />}
            {b.label}
          </button>
        ))}
      </div>

      <div
        className="mt-3 min-h-[160px] rounded-md border p-2 text-[12px] whitespace-pre-wrap"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-1)' }}
      >
        {output || <span style={{ color: 'var(--text-2)' }}>El output del AI aparecerá aquí…</span>}
      </div>

      {err ? (
        <div className="mt-2 text-[11px]" style={{ color: 'var(--os-err)' }}>
          {err}
        </div>
      ) : null}

      {output ? (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => onInsert(output)}
            className="flex-1 rounded-md border px-2 py-1.5 text-[11px] hover:bg-white/5"
            style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
          >
            Añadir al post
          </button>
          <button
            type="button"
            onClick={() => onReplace(output)}
            className="flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold"
            style={{ background: 'var(--os-accent)', color: 'white' }}
          >
            Reemplazar post
          </button>
        </div>
      ) : null}
    </aside>
  );
}
