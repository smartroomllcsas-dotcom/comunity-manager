'use client';

import { useEffect, useState, useTransition } from 'react';
import type { KnowledgeKind, NewKnowledgeKind } from '@/lib/os/schemas/knowledge-kind';

// ─── helpers ─────────────────────────────────────────────────────────────────

async function fetchKinds(): Promise<KnowledgeKind[]> {
  const res = await fetch('/api/os/brain/kinds');
  if (!res.ok) throw new Error('Failed to load kinds');
  return res.json();
}

async function saveKind(kind: NewKnowledgeKind): Promise<void> {
  const res = await fetch('/api/os/brain/kinds', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(kind),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Failed to save kind');
  }
}

async function deleteKind(id: string): Promise<void> {
  const res = await fetch(`/api/os/brain/kinds/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Failed to delete kind');
  }
}

// ─── default form state ───────────────────────────────────────────────────────

const EMPTY_FORM: NewKnowledgeKind = {
  id: '',
  label: '',
  color: '#5ec9f8',
  icon: '',
  description: '',
  system: false,
};

// ─── component ────────────────────────────────────────────────────────────────

export default function BrainKindsPage() {
  const [kinds, setKinds]             = useState<KnowledgeKind[]>([]);
  const [error, setError]             = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);
  const [isPending, startTransition]  = useTransition();

  // Modal state
  const [showModal, setShowModal]     = useState(false);
  const [form, setForm]               = useState<NewKnowledgeKind>(EMPTY_FORM);
  const [formError, setFormError]     = useState<string | null>(null);

  // Inline editing
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [editForm, setEditForm]       = useState<Partial<NewKnowledgeKind>>({});

  useEffect(() => {
    fetchKinds()
      .then(setKinds)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function reload() {
    setLoading(true);
    fetchKinds()
      .then(setKinds)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  // ── modal submit ────────────────────────────────────────────────────────────

  function handleModalSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.id.trim() || !form.label.trim()) {
      setFormError('ID and Label are required.');
      return;
    }
    startTransition(async () => {
      try {
        await saveKind(form);
        setShowModal(false);
        setForm(EMPTY_FORM);
        reload();
      } catch (err) {
        setFormError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  // ── inline save ─────────────────────────────────────────────────────────────

  function handleInlineSave(kind: KnowledgeKind) {
    startTransition(async () => {
      try {
        await saveKind({
          id:          kind.id,
          label:       editForm.label   ?? kind.label,
          color:       editForm.color   ?? kind.color,
          icon:        editForm.icon    !== undefined ? editForm.icon : kind.icon,
          description: editForm.description ?? kind.description,
          system:      kind.system,
        });
        setEditingId(null);
        setEditForm({});
        reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  // ── delete ──────────────────────────────────────────────────────────────────

  function handleDelete(id: string) {
    if (!confirm(`Delete kind "${id}"? Existing nodes with this kind will lose their color.`)) return;
    startTransition(async () => {
      try {
        await deleteKind(id);
        reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">Knowledge Kinds</h1>
          <p className="page-sub">Manage node kinds — colors, icons and labels per org.</p>
        </div>
        <button
          className="btn btn-primary ml-auto"
          onClick={() => { setShowModal(true); setFormError(null); setForm(EMPTY_FORM); }}
        >
          + New custom kind
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded bg-red-900/40 px-3 py-2 text-sm text-red-300">{error}</p>
      )}

      {loading ? (
        <p className="mt-8 text-sm text-zinc-400">Loading…</p>
      ) : (
        <div className="panel mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                <th className="py-2 pr-4">ID</th>
                <th className="py-2 pr-4">Label</th>
                <th className="py-2 pr-4">Color</th>
                <th className="py-2 pr-4">Icon</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {kinds.map(kind => {
                const isEditing = editingId === kind.id;
                return (
                  <tr
                    key={kind.id}
                    className="border-b border-zinc-800/50 hover:bg-zinc-900/30"
                  >
                    {/* ID */}
                    <td className="py-2 pr-4 font-mono text-zinc-300">{kind.id}</td>

                    {/* Label */}
                    <td className="py-2 pr-4">
                      {isEditing ? (
                        <input
                          className="w-32 rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-sm"
                          value={editForm.label ?? kind.label}
                          onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))}
                        />
                      ) : (
                        <span className="text-zinc-200">{kind.label}</span>
                      )}
                    </td>

                    {/* Color */}
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-4 w-4 flex-shrink-0 rounded-full border border-zinc-700"
                          style={{ background: isEditing ? (editForm.color ?? kind.color) : kind.color }}
                        />
                        {isEditing ? (
                          <input
                            type="color"
                            className="h-6 w-10 cursor-pointer rounded border border-zinc-700 bg-transparent"
                            value={editForm.color ?? kind.color}
                            onChange={e => setEditForm(f => ({ ...f, color: e.target.value }))}
                          />
                        ) : (
                          <code className="text-xs text-zinc-400">{kind.color}</code>
                        )}
                      </div>
                    </td>

                    {/* Icon */}
                    <td className="py-2 pr-4">
                      {isEditing ? (
                        <input
                          className="w-28 rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-sm"
                          placeholder="icon-name"
                          value={editForm.icon ?? kind.icon ?? ''}
                          onChange={e => setEditForm(f => ({ ...f, icon: e.target.value || null }))}
                        />
                      ) : (
                        <code className="text-xs text-zinc-400">{kind.icon ?? '—'}</code>
                      )}
                    </td>

                    {/* Badge */}
                    <td className="py-2 pr-4">
                      {kind.system ? (
                        <span className="rounded bg-zinc-700 px-2 py-0.5 text-xs text-zinc-300">system</span>
                      ) : (
                        <span className="rounded bg-indigo-900/50 px-2 py-0.5 text-xs text-indigo-300">custom</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-2 text-right">
                      {kind.system ? null : isEditing ? (
                        <span className="flex justify-end gap-2">
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => handleInlineSave(kind)}
                            disabled={isPending}
                          >
                            Save
                          </button>
                          <button
                            className="btn btn-sm"
                            onClick={() => { setEditingId(null); setEditForm({}); }}
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <span className="flex justify-end gap-2">
                          <button
                            className="btn btn-sm"
                            onClick={() => { setEditingId(kind.id); setEditForm({}); }}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-sm text-red-400 hover:text-red-300"
                            onClick={() => handleDelete(kind.id)}
                            disabled={isPending}
                          >
                            Delete
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {kinds.length === 0 && (
            <p className="py-8 text-center text-sm text-zinc-500">No kinds yet. Create one above.</p>
          )}
        </div>
      )}

      {/* ── New Kind Modal ──────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
            <h2 className="mb-4 text-base font-semibold text-zinc-100">New custom kind</h2>
            <form onSubmit={handleModalSubmit} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-zinc-400">ID <span className="text-zinc-500">(slug, e.g. product)</span></label>
                <input
                  className="input w-full"
                  placeholder="product"
                  value={form.id}
                  onChange={e => setForm(f => ({ ...f, id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') }))}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Label</label>
                <input
                  className="input w-full"
                  placeholder="Product"
                  value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  required
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-zinc-400">Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      className="h-8 w-12 cursor-pointer rounded border border-zinc-700 bg-transparent"
                      value={form.color ?? '#5ec9f8'}
                      onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                    />
                    <input
                      className="input flex-1"
                      value={form.color ?? '#5ec9f8'}
                      onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-zinc-400">Icon <span className="text-zinc-600">(optional)</span></label>
                  <input
                    className="input w-full"
                    placeholder="circle"
                    value={form.icon ?? ''}
                    onChange={e => setForm(f => ({ ...f, icon: e.target.value || null }))}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Description <span className="text-zinc-600">(optional)</span></label>
                <input
                  className="input w-full"
                  placeholder="Short description"
                  value={form.description ?? ''}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>

              {formError && (
                <p className="rounded bg-red-900/40 px-3 py-2 text-xs text-red-300">{formError}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isPending}>
                  {isPending ? 'Saving…' : 'Create kind'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
