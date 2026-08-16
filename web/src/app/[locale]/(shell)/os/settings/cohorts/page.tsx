'use client';

import { useCallback, useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Cohort {
  id: string;
  label: string;
  description: string;
  full_rollout: boolean;
  emails: string[];
  org_ids: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}
function isValidUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim());
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span
      style={{
        fontSize: 'var(--os-text-xs)',
        padding: '2px 8px',
        borderRadius: 'var(--os-r-sm)',
        background: ok ? 'var(--os-ok-tint)' : 'var(--os-err-tint)',
        color: ok ? 'var(--os-ok)' : 'var(--os-err)',
        fontFamily: 'var(--os-font-mono)',
        fontWeight: 500,
      }}
    >
      {ok ? 'full rollout' : 'targeted'}
    </span>
  );
}

function TagList({
  items,
  onRemove,
}: {
  items: string[];
  onRemove: (v: string) => void;
}) {
  if (!items.length) {
    return <span style={{ color: 'var(--os-ink-4)', fontSize: 'var(--os-text-sm)' }}>—</span>;
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--os-s-1)' }}>
      {items.map((v) => (
        <span
          key={v}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--os-s-1)',
            background: 'var(--os-paper-3)',
            border: '1px solid var(--os-line)',
            borderRadius: 'var(--os-r-sm)',
            padding: '2px 6px',
            fontSize: 'var(--os-text-xs)',
            fontFamily: 'var(--os-font-mono)',
            color: 'var(--os-ink-2)',
          }}
        >
          {v}
          <button
            onClick={() => onRemove(v)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--os-ink-4)',
              padding: 0,
              lineHeight: 1,
              fontSize: 'var(--os-text-sm)',
            }}
            aria-label={`Remove ${v}`}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

function AddInput({
  placeholder,
  validate,
  onAdd,
}: {
  placeholder: string;
  validate: (v: string) => boolean;
  onAdd: (v: string) => void;
}) {
  const [val, setVal] = useState('');
  const [err, setErr] = useState('');

  const submit = () => {
    const trimmed = val.trim();
    if (!trimmed) return;
    if (!validate(trimmed)) {
      setErr('Invalid format');
      return;
    }
    setErr('');
    setVal('');
    onAdd(trimmed);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--os-s-1)', marginTop: 'var(--os-s-2)' }}>
      <div style={{ display: 'flex', gap: 'var(--os-s-2)' }}>
        <input
          value={val}
          onChange={(e) => { setVal(e.target.value); setErr(''); }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder={placeholder}
          style={{
            flex: 1,
            background: 'var(--os-paper-2)',
            border: `1px solid ${err ? 'var(--os-err)' : 'var(--os-line)'}`,
            borderRadius: 'var(--os-r-md)',
            color: 'var(--os-ink)',
            fontFamily: 'var(--os-font-mono)',
            fontSize: 'var(--os-text-sm)',
            padding: '5px 10px',
            outline: 'none',
          }}
        />
        <button
          onClick={submit}
          style={{
            background: 'var(--os-accent-tint)',
            border: '1px solid var(--os-accent)',
            borderRadius: 'var(--os-r-md)',
            color: 'var(--os-accent)',
            cursor: 'pointer',
            fontSize: 'var(--os-text-sm)',
            fontWeight: 600,
            padding: '5px 12px',
          }}
        >
          Add
        </button>
      </div>
      {err && <span style={{ color: 'var(--os-err)', fontSize: 'var(--os-text-xs)' }}>{err}</span>}
    </div>
  );
}

function CohortCard({
  cohort,
  onUpdate,
}: {
  cohort: Cohort;
  onUpdate: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      try {
        await fetch(`/api/os/cohorts/${cohort.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        onUpdate();
      } finally {
        setBusy(false);
      }
    },
    [cohort.id, onUpdate]
  );

  return (
    <div
      style={{
        background: 'var(--os-paper-2)',
        border: '1px solid var(--os-line)',
        borderRadius: 'var(--os-r-lg)',
        padding: 'var(--os-s-5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--os-s-4)',
        opacity: busy ? 0.6 : 1,
        transition: 'opacity var(--os-dur-fast)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--os-s-3)', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--os-s-3)' }}>
          <span style={{ fontWeight: 600, fontSize: 'var(--os-text-md)', color: 'var(--os-ink)' }}>
            {cohort.label}
          </span>
          <code
            style={{
              fontSize: 'var(--os-text-xs)',
              fontFamily: 'var(--os-font-mono)',
              color: 'var(--os-ink-3)',
              background: 'var(--os-paper-3)',
              padding: '1px 6px',
              borderRadius: 'var(--os-r-sm)',
            }}
          >
            {cohort.id}
          </code>
          <StatusBadge ok={cohort.full_rollout} />
        </div>
        {/* Toggle full_rollout */}
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--os-s-2)', cursor: 'pointer' }}
          title="Toggle full rollout"
        >
          <span style={{ fontSize: 'var(--os-text-xs)', color: 'var(--os-ink-3)' }}>Full rollout</span>
          <input
            type="checkbox"
            checked={cohort.full_rollout}
            onChange={() => patch({ full_rollout: !cohort.full_rollout })}
            style={{ accentColor: 'var(--os-accent)', width: 16, height: 16, cursor: 'pointer' }}
          />
        </label>
      </div>

      {cohort.description && (
        <p style={{ color: 'var(--os-ink-3)', fontSize: 'var(--os-text-sm)', margin: 0 }}>
          {cohort.description}
        </p>
      )}

      {/* Emails */}
      <div>
        <div style={{ fontSize: 'var(--os-text-xs)', color: 'var(--os-ink-4)', fontWeight: 600, marginBottom: 'var(--os-s-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Emails ({cohort.emails.length})
        </div>
        <TagList items={cohort.emails} onRemove={(e) => patch({ remove_email: e })} />
        <AddInput
          placeholder="user@example.com"
          validate={isValidEmail}
          onAdd={(e) => patch({ add_email: e })}
        />
      </div>

      {/* Org IDs */}
      <div>
        <div style={{ fontSize: 'var(--os-text-xs)', color: 'var(--os-ink-4)', fontWeight: 600, marginBottom: 'var(--os-s-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Org IDs ({cohort.org_ids.length})
        </div>
        <TagList items={cohort.org_ids} onRemove={(o) => patch({ remove_org: o })} />
        <AddInput
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          validate={isValidUuid}
          onAdd={(o) => patch({ add_org: o })}
        />
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function CohortsPage() {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/os/cohorts');
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const j = await res.json();
      setCohorts(j.cohorts ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div
      style={{
        padding: 'var(--os-s-6)',
        maxWidth: 760,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--os-s-6)',
      }}
    >
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1
            style={{
              fontFamily: 'var(--os-font-display)',
              fontSize: 'var(--os-text-xl)',
              fontWeight: 700,
              color: 'var(--os-ink)',
              margin: 0,
            }}
          >
            Cohort Management
          </h1>
          <p style={{ color: 'var(--os-ink-3)', fontSize: 'var(--os-text-sm)', margin: '4px 0 0' }}>
            Control feature flag access without redeploy. Changes apply within 30s.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{
            background: 'var(--os-paper-3)',
            border: '1px solid var(--os-line)',
            borderRadius: 'var(--os-r-md)',
            color: 'var(--os-ink-2)',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: 'var(--os-text-sm)',
            padding: '6px 14px',
          }}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            background: 'var(--os-err-tint)',
            border: '1px solid var(--os-err)',
            borderRadius: 'var(--os-r-md)',
            color: 'var(--os-err)',
            fontSize: 'var(--os-text-sm)',
            padding: 'var(--os-s-3) var(--os-s-4)',
          }}
        >
          {error}
        </div>
      )}

      {/* Cohort list */}
      {!loading && !error && cohorts.length === 0 && (
        <p style={{ color: 'var(--os-ink-4)', fontSize: 'var(--os-text-sm)' }}>No cohorts found.</p>
      )}
      {cohorts.map((c) => (
        <CohortCard key={c.id} cohort={c} onUpdate={load} />
      ))}
    </div>
  );
}
