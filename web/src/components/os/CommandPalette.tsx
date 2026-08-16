'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getDefaultActions, type CommandAction } from './command-actions';
import { useVoiceInput } from '@/hooks/useVoiceInput';

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const actions = useMemo(() => getDefaultActions(), []);

  const voice = useVoiceInput();

  // Sync voice transcript → query field
  useEffect(() => {
    if (voice.transcript) {
      setQuery(voice.transcript);
      setSelectedIdx(0);
    }
  }, [voice.transcript]);

  // When voice stops (onend), simulate Enter to run if there's a match
  const prevListening = useRef(false);
  useEffect(() => {
    if (prevListening.current && !voice.listening && voice.transcript) {
      // small tick to let filtered list update
      setTimeout(() => {
        setSelectedIdx(idx => {
          // trigger via ref so we don't capture stale filtered
          return idx;
        });
        // We dispatch a synthetic Enter on the input
        inputRef.current?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      }, 80);
    }
    prevListening.current = voice.listening;
  }, [voice.listening, voice.transcript]);

  const handleMicClick = useCallback(() => {
    if (voice.listening) {
      voice.stop();
    } else {
      voice.reset();
      setQuery('');
      // Detect browser locale for lang
      const lang = navigator.language?.startsWith('es') ? 'es-ES' : 'en-US';
      voice.start({ lang });
    }
  }, [voice]);

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
        <div className="flex items-center border-b border-zinc-800">
          <input
            ref={inputRef}
            value={voice.listening ? (voice.interimTranscript || query) : query}
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
            className="flex-1 rounded-t-lg bg-transparent px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none"
          />
          {voice.supported && (
            <button
              type="button"
              onClick={handleMicClick}
              title={voice.listening ? 'Detener dictado' : 'Dictar comando (voz)'}
              aria-label={voice.listening ? 'Detener reconocimiento de voz' : 'Iniciar reconocimiento de voz'}
              className={`mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${
                voice.listening
                  ? 'animate-pulse bg-red-500/20 text-red-400 hover:bg-red-500/30'
                  : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
              }`}
            >
              {/* Mic SVG icon — no external dep */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="2" width="6" height="11" rx="3" />
                <path d="M5 10a7 7 0 0 0 14 0" />
                <line x1="12" y1="19" x2="12" y2="22" />
                <line x1="8" y1="22" x2="16" y2="22" />
              </svg>
            </button>
          )}
        </div>
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
        {voice.error && (
          <div className="border-t border-zinc-800 px-4 py-1.5 text-xs text-red-400">
            Voz: {voice.error}
          </div>
        )}
        <div className="flex items-center gap-3 border-t border-zinc-800 px-4 py-2 text-xs text-zinc-500">
          <span><kbd className="rounded bg-zinc-800 px-1.5 py-0.5">↑↓</kbd> navegar</span>
          <span><kbd className="rounded bg-zinc-800 px-1.5 py-0.5">↵</kbd> ejecutar</span>
          <span><kbd className="rounded bg-zinc-800 px-1.5 py-0.5">Esc</kbd> cerrar</span>
          {voice.supported && (
            <span className="ml-auto">
              <kbd className="rounded bg-zinc-800 px-1.5 py-0.5">🎤</kbd> voz
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
