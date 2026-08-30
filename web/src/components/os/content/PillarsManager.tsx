'use client';

/**
 * PillarsManager — CRUD UI for cm_content_pillars.
 */
import { useEffect, useState } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';

type Pillar = {
  id: string;
  client_id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  target_percentage?: number | null;
};

export function PillarsManager() {
  const [pillars, setPillars] = useState<Pillar[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; description: string; color: string; target_percentage: number }>({
    name: '', description: '', color: 'oklch(70% 0.14 250)', target_percentage: 25,
  });
  const [creating, setCreating] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const res = await fetch('/api/os/content/pillars');
      if (res.ok) {
        const j = await res.json();
        setPillars((j.pillars ?? []) as Pillar[]);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  async function create() {
    if (!draft.name.trim()) return;
    setCreating(true);
    setErr(null);
    try {
      const res = await fetch('/api/os/content/pillars', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDraft({ name: '', description: '', color: 'oklch(70% 0.14 250)', target_percentage: 25 });
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function updatePillar(id: string, patch: Partial<Pillar>) {
    try {
      await fetch(`/api/os/content/pillars/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
    } catch { /* silent */ }
  }

  async function remove(id: string) {
    if (!confirm('¿Eliminar pilar?')) return;
    try {
      await fetch(`/api/os/content/pillars/${id}`, { method: 'DELETE' });
      await reload();
    } catch { /* noop */ }
  }

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Pilares de contenido</h2>
        {loading ? <span className="text-[11px]" style={{ color: 'var(--text-2)' }}>Cargando…</span> : null}
      </div>
      {err ? <div className="mb-2 text-[11px]" style={{ color: 'var(--os-err)' }}>Error: {err}</div> : null}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {pillars.map((p) => (
          <article
            key={p.id}
            className="rounded-xl border p-3"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="h-2 w-2 rounded-full" style={{ background: p.color ?? 'var(--os-accent)' }} />
              <input
                defaultValue={p.name}
                onBlur={(e) => e.target.value !== p.name && updatePillar(p.id, { name: e.target.value })}
                className="flex-1 bg-transparent text-sm font-semibold outline-none"
                style={{ color: 'var(--text-1)' }}
              />
              <button onClick={() => remove(p.id)} className="text-[11px]" style={{ color: 'var(--text-2)' }}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <textarea
              defaultValue={p.description ?? ''}
              onBlur={(e) => e.target.value !== (p.description ?? '') && updatePillar(p.id, { description: e.target.value })}
              rows={2}
              className="w-full resize-none rounded-md border bg-transparent px-2 py-1 text-[12px]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
              placeholder="Descripción"
            />
            <div className="mt-2 flex items-center gap-2">
              <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-2)' }}>uso</label>
              <input
                type="number"
                min={0}
                max={100}
                defaultValue={p.target_percentage ?? 25}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isNaN(v) && v !== p.target_percentage) updatePillar(p.id, { target_percentage: v });
                }}
                className="w-16 rounded-md border bg-transparent px-1.5 py-0.5 text-[11px]"
                style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
              />
              <span className="text-[11px]" style={{ color: 'var(--text-2)' }}>%</span>
            </div>
          </article>
        ))}

        {/* Creator card */}
        <article
          className="rounded-xl border p-3 border-dashed"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}
        >
          <div className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-2)' }}>
            Nuevo pilar
          </div>
          <input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Nombre"
            className="w-full rounded-md border bg-transparent px-2 py-1 text-sm mb-1.5"
            style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
          />
          <textarea
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            placeholder="Descripción (opcional)"
            rows={2}
            className="w-full resize-none rounded-md border bg-transparent px-2 py-1 text-[12px] mb-1.5"
            style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
          />
          <div className="flex items-center gap-2 mb-2">
            <input
              value={draft.color}
              onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
              className="flex-1 rounded-md border bg-transparent px-2 py-0.5 text-[11px]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
              placeholder="oklch(...)"
            />
            <input
              type="number"
              min={0}
              max={100}
              value={draft.target_percentage}
              onChange={(e) => setDraft((d) => ({ ...d, target_percentage: Number(e.target.value) }))}
              className="w-16 rounded-md border bg-transparent px-1.5 py-0.5 text-[11px]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
            />
            <span className="text-[11px]" style={{ color: 'var(--text-2)' }}>%</span>
          </div>
          <button
            onClick={create}
            disabled={creating || !draft.name.trim()}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50"
            style={{ background: 'var(--os-accent)', color: 'white' }}
          >
            <Plus className="h-3 w-3" /> {creating ? 'Creando…' : 'Crear'}
          </button>
        </article>
      </div>
    </section>
  );
}
