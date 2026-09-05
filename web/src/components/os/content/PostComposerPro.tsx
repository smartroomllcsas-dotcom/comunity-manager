'use client';

/**
 * PostComposerPro
 * Multi-platform post composer ported from FounderOS-DEMO + extended:
 *   - platform toggle (7 platforms)
 *   - live per-platform preview with character limits
 *   - multi-account picker (cm_social_accounts)
 *   - AI writer side panel (hook / CTA / rewrite / expand) with SSE stream
 *   - Save Draft · Schedule · Publish Now
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera, Users, MessageSquare, Briefcase, Play, Music2, Hash,
  Send, Clock, Save, Wand2, Paperclip,
} from 'lucide-react';
import { AiWriterPanel } from './AiWriterPanel';

type PlatformId = 'instagram' | 'facebook' | 'twitter' | 'linkedin' | 'youtube' | 'tiktok' | 'threads';

const PLATFORMS: { id: PlatformId; label: string; icon: typeof Camera; limit: number }[] = [
  { id: 'instagram', label: 'Instagram',   icon: Camera,        limit: 2200 },
  { id: 'facebook',  label: 'Facebook',    icon: Users,         limit: 63206 },
  { id: 'twitter',   label: 'Twitter / X', icon: MessageSquare, limit: 280 },
  { id: 'linkedin',  label: 'LinkedIn',    icon: Briefcase,     limit: 3000 },
  { id: 'youtube',   label: 'YouTube',     icon: Play,          limit: 5000 },
  { id: 'tiktok',    label: 'TikTok',      icon: Music2,        limit: 2200 },
  { id: 'threads',   label: 'Threads',     icon: Hash,          limit: 500 },
];

type Account = {
  id: string;
  client_id: string;
  page_name?: string | null;
  instagram_username?: string | null;
  platform?: string | null;
};

type Draft = {
  id: string;
  title: string;
  body: string;
  platforms: string[];
  media_urls?: string[];
};

export function PostComposerPro({
  initialDraft,
  onSaved,
}: {
  initialDraft?: Draft | null;
  onSaved?: (draft: Draft) => void;
}) {
  const [caption, setCaption] = useState(initialDraft?.body ?? '');
  const [title, setTitle] = useState(initialDraft?.title ?? '');
  const [selected, setSelected] = useState<Set<PlatformId>>(
    new Set((initialDraft?.platforms as PlatformId[] | undefined) ?? ['instagram', 'tiktok']),
  );
  const [mediaUrls, setMediaUrls] = useState<string[]>(initialDraft?.media_urls ?? []);
  const [mediaInput, setMediaInput] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [draftId, setDraftId] = useState<string | null>(initialDraft?.id ?? null);
  const [busy, setBusy] = useState<'idle' | 'saving' | 'scheduling' | 'publishing'>('idle');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [showAi, setShowAi] = useState(false);
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load social accounts once
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/os/social/accounts').catch(() => null);
        if (res?.ok) {
          const j = await res.json();
          setAccounts((j.accounts ?? j.data ?? []) as Account[]);
        }
      } catch { /* noop */ }
    })();
  }, []);

  function togglePlatform(id: PlatformId) {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleAccount(id: string) {
    setSelectedAccounts((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function addMedia() {
    const url = mediaInput.trim();
    if (!url) return;
    try {
      new URL(url);
      setMediaUrls((prev) => (prev.includes(url) ? prev : [...prev, url]));
      setMediaInput('');
    } catch {
      setMsg({ tone: 'err', text: 'URL de media inválida' });
    }
  }

  const platformList = useMemo(() => [...selected], [selected]);

  // Autosave (draft only) — every 3s while user types
  const scheduleAutosave = useCallback(() => {
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(async () => {
      // Only autosave if there's content
      if (!caption.trim() && !title.trim()) return;
      try {
        if (draftId) {
          await fetch(`/api/os/content/drafts/${draftId}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              title, body: caption, platforms: platformList, mediaUrls,
            }),
          });
        } else {
          const res = await fetch('/api/os/content/drafts', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              title, body: caption, platforms: platformList, mediaUrls,
            }),
          });
          if (res.ok) {
            const j = await res.json();
            if (j.draft?.id) setDraftId(j.draft.id as string);
          }
        }
      } catch { /* silent autosave */ }
    }, 3000);
  }, [caption, title, platformList, mediaUrls, draftId]);

  useEffect(() => {
    scheduleAutosave();
    return () => { if (autosaveRef.current) clearTimeout(autosaveRef.current); };
  }, [scheduleAutosave]);

  async function saveDraft() {
    setBusy('saving');
    setMsg(null);
    try {
      const path = draftId ? `/api/os/content/drafts/${draftId}` : '/api/os/content/drafts';
      const method = draftId ? 'PATCH' : 'POST';
      const res = await fetch(path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, body: caption, platforms: platformList, mediaUrls }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      if (j.draft?.id) {
        setDraftId(j.draft.id as string);
        onSaved?.(j.draft as Draft);
      }
      setMsg({ tone: 'ok', text: 'Draft guardado' });
    } catch (e) {
      setMsg({ tone: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy('idle');
    }
  }

  async function schedule() {
    if (!scheduledFor) { setMsg({ tone: 'err', text: 'Elige fecha y hora' }); return; }
    if (!platformList.length) { setMsg({ tone: 'err', text: 'Selecciona al menos una plataforma' }); return; }
    setBusy('scheduling');
    setMsg(null);
    try {
      const res = await fetch('/api/os/content/schedule', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          draftId: draftId ?? undefined,
          caption,
          platforms: platformList,
          mediaUrls,
          scheduledFor: new Date(scheduledFor).toISOString(),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as any));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setMsg({ tone: 'ok', text: 'Programado' });
      setCaption(''); setTitle(''); setDraftId(null); setMediaUrls([]);
    } catch (e) {
      setMsg({ tone: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy('idle');
    }
  }

  async function publishNow() {
    if (!platformList.length) { setMsg({ tone: 'err', text: 'Selecciona al menos una plataforma' }); return; }
    setBusy('publishing');
    setMsg(null);
    try {
      const res = await fetch('/api/os/posts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          caption,
          platforms: platformList,
          mediaUrl: mediaUrls[0] ?? null,
          scheduledFor: null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as any));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setMsg({ tone: 'ok', text: 'Publicado' });
      setCaption(''); setTitle(''); setDraftId(null); setMediaUrls([]);
    } catch (e) {
      setMsg({ tone: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy('idle');
    }
  }

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Nuevo post</h2>
        <button
          type="button"
          onClick={() => setShowAi((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium hover:bg-white/5"
          style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
        >
          <Wand2 className="h-3.5 w-3.5" />
          {showAi ? 'Cerrar AI writer' : 'Abrir AI writer'}
        </button>
      </div>

      <div className={`grid gap-3 ${showAi ? 'lg:grid-cols-[1fr_320px]' : ''}`}>
        <div
          className="rounded-xl border p-4"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título interno (opcional)"
            className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm mb-2"
            style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
          />
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="¿Qué vas a publicar?"
            rows={6}
            className="w-full resize-y rounded-lg border bg-transparent px-3 py-2 text-sm outline-none"
            style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
          />

          {/* Platform toggles */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {PLATFORMS.map((p) => {
              const on = selected.has(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePlatform(p.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors"
                  style={{
                    borderColor: on ? 'oklch(70% 0.14 250)' : 'var(--border)',
                    background: on ? 'oklch(70% 0.14 250 / 0.15)' : 'transparent',
                    color: on ? 'oklch(80% 0.14 250)' : 'var(--text-2)',
                  }}
                >
                  <p.icon className="h-3 w-3" />
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Accounts (from cm_social_accounts) */}
          {accounts.length > 0 ? (
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-2)' }}>
                Cuentas ({selectedAccounts.size}/{accounts.length})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {accounts.map((a) => {
                  const on = selectedAccounts.has(a.id);
                  const label = a.instagram_username ?? a.page_name ?? a.platform ?? a.id.slice(0, 8);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => toggleAccount(a.id)}
                      className="rounded-md border px-2 py-0.5 text-[10.5px]"
                      style={{
                        borderColor: on ? 'oklch(70% 0.16 145)' : 'var(--border)',
                        background: on ? 'oklch(70% 0.16 145 / 0.12)' : 'transparent',
                        color: on ? 'oklch(80% 0.16 145)' : 'var(--text-2)',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Media */}
          <div className="mt-3">
            <div className="flex gap-2">
              <input
                value={mediaInput}
                onChange={(e) => setMediaInput(e.target.value)}
                placeholder="URL de media (imagen/video)"
                className="flex-1 rounded-lg border bg-transparent px-3 py-1.5 text-[12px]"
                style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
              />
              <button
                type="button"
                onClick={addMedia}
                className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[12px] hover:bg-white/5"
                style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
              >
                <Paperclip className="h-3 w-3" /> Añadir
              </button>
            </div>
            {mediaUrls.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {mediaUrls.map((u) => (
                  <div
                    key={u}
                    className="max-w-[240px] truncate rounded-md border px-2 py-0.5 text-[10.5px]"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
                    title={u}
                  >
                    {u.split('/').pop()}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* Schedule + actions */}
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <div className="flex flex-col">
              <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-2)' }}>
                Programar para
              </label>
              <input
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                className="rounded-lg border bg-transparent px-2 py-1.5 text-[12px]"
                style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
              />
            </div>
            <div className="flex-1" />
            <button
              type="button"
              onClick={saveDraft}
              disabled={busy !== 'idle'}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] hover:bg-white/5 disabled:opacity-50"
              style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
            >
              <Save className="h-3.5 w-3.5" /> {busy === 'saving' ? 'Guardando…' : 'Save Draft'}
            </button>
            <button
              type="button"
              onClick={schedule}
              disabled={busy !== 'idle'}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] hover:bg-white/5 disabled:opacity-50"
              style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
            >
              <Clock className="h-3.5 w-3.5" /> {busy === 'scheduling' ? 'Programando…' : 'Schedule'}
            </button>
            <button
              type="button"
              onClick={publishNow}
              disabled={busy !== 'idle'}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
              style={{ background: 'oklch(70% 0.14 250)', color: 'white' }}
            >
              <Send className="h-3.5 w-3.5" /> {busy === 'publishing' ? 'Publicando…' : 'Publish Now'}
            </button>
          </div>

          {msg ? (
            <div
              className="mt-2 text-[11px]"
              style={{ color: msg.tone === 'ok' ? 'oklch(70% 0.16 145)' : 'oklch(70% 0.18 20)' }}
            >
              {msg.text}
            </div>
          ) : null}
        </div>

        {showAi ? (
          <AiWriterPanel
            input={caption}
            onInsert={(text) => setCaption((prev) => (prev ? `${prev}\n${text}` : text))}
            onReplace={(text) => setCaption(text)}
          />
        ) : null}
      </div>

      {/* Live preview per platform */}
      {platformList.length > 0 ? (
        <section className="mt-4">
          <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-2)' }}>
            Preview live
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {platformList.map((pid) => {
              const p = PLATFORMS.find((x) => x.id === pid)!;
              const len = caption.length;
              const over = len > p.limit;
              return (
                <div
                  key={pid}
                  className="rounded-xl border p-3"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: 'var(--text-1)' }}>
                      <p.icon className="h-3.5 w-3.5" /> {p.label}
                    </div>
                    <div className="text-[10px]" style={{ color: over ? 'oklch(70% 0.18 20)' : 'var(--text-2)' }}>
                      {len} / {p.limit}
                    </div>
                  </div>
                  {mediaUrls[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={mediaUrls[0]}
                      alt=""
                      className="mb-2 max-h-40 w-full rounded-md object-cover"
                    />
                  ) : (
                    <div
                      className="mb-2 flex h-40 items-center justify-center rounded-md border text-[10px]"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
                    >
                      sin media
                    </div>
                  )}
                  <div className="whitespace-pre-wrap text-[12.5px] leading-relaxed line-clamp-6" style={{ color: 'var(--text-1)' }}>
                    {caption || 'Empieza a escribir tu post…'}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </section>
  );
}
