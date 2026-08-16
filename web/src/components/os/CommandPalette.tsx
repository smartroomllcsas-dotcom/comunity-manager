'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getDefaultActions, type CommandAction } from './command-actions';

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const actions = useMemo(() => getDefaultActions(), []);

  const filtered = useMemo(() => {
    if (!query.trim()) return actions;
    const q = query.toLowerCase();
    return actions.filter(a =>
      a.label.toLowerCase().includes(q) ||
      a.keywords?.some(k => k.toLowerCase().includes(q))
    );
  }, [actions, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setSelectedIdx(0);
  }, []);

  const runAction = useCallback((a: CommandAction) => {
    close();
    if (a.href) router.push(a.href as string);
    else a.onRun?.();
  }, [router, close]);

  // Focus input when opened
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // ⌘K / Ctrl+K to toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(v => !v);
        setQuery('');
        setSelectedIdx(0);
      } else if (e.key === 'Escape') {
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-24 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="w-full max-w-xl rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setSelectedIdx(0); }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSelectedIdx(i => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSelectedIdx(i => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const a = filtered[selectedIdx];
              if (a) runAction(a);
            }
          }}
          placeholder="Buscar comando… (⌘K)"
          className="w-full rounded-t-lg border-b border-zinc-800 bg-transparent px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none"
        />
        <ul className="max-h-96 overflow-y-auto p-2" role="listbox">
          {filtered.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-zinc-500">
              Sin resultados
            </li>
          )}
          {filtered.map((a, i) => (
            <li
              key={a.id}
              role="option"
              aria-selected={i === selectedIdx}
              onMouseEnter={() => setSelectedIdx(i)}
              onClick={() => runAction(a)}
              className={`flex cursor-pointer items-center justify-between rounded px-3 py-2 text-sm ${
                i === selectedIdx ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300'
              }`}
            >
              <span>{a.label}</span>
              {a.hint && <span className="text-xs text-zinc-500">{a.hint}</span>}
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3 border-t border-zinc-800 px-4 py-2 text-xs text-zinc-500">
          <span><kbd className="rounded bg-zinc-800 px-1.5 py-0.5">↑↓</kbd> navegar</span>
          <span><kbd className="rounded bg-zinc-800 px-1.5 py-0.5">↵</kbd> ejecutar</span>
          <span><kbd className="rounded bg-zinc-800 px-1.5 py-0.5">Esc</kbd> cerrar</span>
        </div>
      </div>
    </div>
  );
}
