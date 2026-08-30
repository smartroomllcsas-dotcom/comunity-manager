'use client';

/**
 * DraftManager
 * List drafts, search, click to edit inline (mounts PostComposerPro).
 */
import { useEffect, useMemo, useState } from 'react';
import { Search, FileText, Trash2 } from 'lucide-react';
import { PostComposerPro } from './PostComposerPro';

type Draft = {
  id: string;
  title: string;
  body: string;
  platforms: string[];
  media_urls?: string[];
  updated_at: string;
};

export function DraftManager() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);

  async function reload(search?: string) {
    setLoading(true);
    try {
      const url = new URL('/api/os/content/drafts', window.location.origin);
      if (search) url.searchParams.set('q', search);
      const res = await fetch(url.toString());
      if (res.ok) {
        const j = await res.json();
        setDrafts((j.drafts ?? []) as Draft[]);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => reload(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const filtered = useMemo(() => drafts, [drafts]);

  async function remove(id: string) {
    if (!confirm('¿Archivar draft?')) return;
    await fetch(`/api/os/content/drafts/${id}`, { method: 'DELETE' });
    reload(q.trim());
    if (editing?.id === id) setEditing(null);
  }

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Drafts</h2>
        <div className="inline-flex items-center gap-1 rounded-md border px-2 py-1" style={{ borderColor: 'var(--border)' }}>
          <Search className="h-3 w-3" style={{ color: 'var(--text-2)' }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar drafts"
            className="bg-transparent text-[12px] outline-none w-40"
            style={{ color: 'var(--text-1)' }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-3">
        <div
          className="rounded-xl border p-2 max-h-[520px] overflow-auto"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
        >
          {loading ? (
            <div className="text-[11px] p-3" style={{ color: 'var(--text-2)' }}>Cargando…</div>
          ) : filtered.length === 0 ? (
            <div className="text-[11px] p-3" style={{ color: 'var(--text-2)' }}>Sin drafts</div>
          ) : (
            filtered.map((d) => {
              const active = editing?.id === d.id;
              return (
                <div
                  key={d.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setEditing(d)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditing(d); } }}
                  className="w-full text-left rounded-md border p-2 mb-1.5 cursor-pointer"
                  style={{
                    borderColor: active ? 'var(--os-accent)' : 'var(--border)',
                    background: active ? 'color-mix(in oklch, var(--os-accent) 10%, transparent)' : 'var(--surface-1)',
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <FileText className="h-3 w-3 flex-none" style={{ color: 'var(--text-2)' }} />
                      <div className="text-[12px] font-medium truncate" style={{ color: 'var(--text-1)' }}>
                        {d.title || d.body.slice(0, 40) || '(sin título)'}
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label="Eliminar draft"
                      onClick={(e) => { e.stopPropagation(); remove(d.id); }}
                      className="flex-none"
                      style={{ color: 'var(--text-2)' }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="text-[10px] mt-1 line-clamp-2" style={{ color: 'var(--text-2)' }}>
                    {d.body || '(sin contenido)'}
                  </div>
                  <div className="text-[10px] mt-1" style={{ color: 'var(--text-2)' }}>
                    {new Date(d.updated_at).toLocaleString('es', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div>
          {editing ? (
            <PostComposerPro
              key={editing.id}
              initialDraft={editing}
              onSaved={() => reload(q.trim())}
            />
          ) : (
            <div
              className="rounded-xl border p-8 text-center text-[12px]"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)' }}
            >
              Selecciona un draft de la lista para editarlo, o abre el composer arriba para crear uno nuevo.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
