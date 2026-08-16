'use client';

import { useCallback, useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Cohort {
  id: string;
  label: string;
  full_rollout: boolean;
}

interface Stats {
  users_count: number;
  orgs_count: number;
  full_rollout: boolean;
  activity_last_24h: number;
}

interface ActivityEntry {
  id: string;
  at: string;
  summary: string;
  ok: boolean;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function GARolloutPage() {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [selected, setSelected] = useState<Cohort | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [log, setLog] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmPending, setConfirmPending] = useState(false);
  const [pendingValue, setPendingValue] = useState<boolean | null>(null);

  // Load cohorts
  const loadCohorts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/os/cohorts');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      const list: Cohort[] = j.cohorts ?? [];
      setCohorts(list);
      if (list.length > 0 && !selected) setSelected(list[0]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [selected]);

  // Load stats + activity log for the selected cohort
  const loadStats = useCallback(async (cohortId: string) => {
    setStatsLoading(true);
    try {
      const [statsRes, actRes] = await Promise.all([
        fetch(`/api/os/cohorts/${cohortId}/stats`),
        fetch(`/api/os/activity?kind=cohort.toggle&limit=20`),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (actRes.ok) {
        const j = await actRes.json();
        setLog((j.activities ?? []).filter((a: ActivityEntry & { payload?: any }) =>
          !a || !(a as any).payload || (a as any).payload?.cohortId === cohortId
        ));
      }
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => { loadCohorts(); }, [loadCohorts]);
  useEffect(() => { if (selected) loadStats(selected.id); }, [selected, loadStats]);

  // Initiate toggle — require double-confirm
  const initiateToggle = (value: boolean) => {
    setPendingValue(value);
    setConfirmPending(true);
  };

  const cancelToggle = () => {
    setConfirmPending(false);
    setPendingValue(null);
  };

  const confirmToggle = async () => {
    if (!selected || pendingValue === null) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/os/cohorts/${selected.id}/rollout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_rollout: pendingValue }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      // Optimistically update local cohort state
      setSelected((prev) => prev ? { ...prev, full_rollout: pendingValue } : prev);
      setCohorts((prev) => prev.map((c) => c.id === selected.id ? { ...c, full_rollout: pendingValue } : c));
      setConfirmPending(false);
      setPendingValue(null);
      // Reload stats after toggle
      await loadStats(selected.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const isOn = selected?.full_rollout ?? stats?.full_rollout ?? false;

  return (
    <div
      style={{
        padding: 'var(--os-s-6)',
        maxWidth: 680,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--os-s-6)',
      }}
    >
      {/* Page header */}
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
          GA Rollout
        </h1>
        <p style={{ color: 'var(--os-ink-3)', fontSize: 'var(--os-text-sm)', margin: '4px 0 0' }}>
          Enable Community OS for all users in a cohort. Irreversible in production — confirm before toggling.
        </p>
      </div>

      {/* Error banner */}
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

      {loading && (
        <p style={{ color: 'var(--os-ink-4)', fontSize: 'var(--os-text-sm)' }}>Loading cohorts…</p>
      )}

      {/* Cohort selector */}
      {!loading && cohorts.length > 1 && (
        <div>
          <label style={{ fontSize: 'var(--os-text-xs)', color: 'var(--os-ink-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Cohort
          </label>
          <select
            value={selected?.id ?? ''}
            onChange={(e) => {
              const c = cohorts.find((x) => x.id === e.target.value) ?? null;
              setSelected(c);
              setStats(null);
              setLog([]);
              setConfirmPending(false);
              setPendingValue(null);
            }}
            style={{
              display: 'block',
              marginTop: 'var(--os-s-1)',
              background: 'var(--os-paper-2)',
              border: '1px solid var(--os-line)',
              borderRadius: 'var(--os-r-md)',
              color: 'var(--os-ink)',
              fontSize: 'var(--os-text-sm)',
              padding: '6px 10px',
              width: '100%',
            }}
          >
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Stats card */}
      {selected && (
        <div
          style={{
            background: 'var(--os-paper-2)',
            border: '1px solid var(--os-line)',
            borderRadius: 'var(--os-r-lg)',
            padding: 'var(--os-s-5)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--os-s-4)',
          }}
        >
          {/* Big toggle row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--os-s-4)' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 'var(--os-text-md)', color: 'var(--os-ink)' }}>
                Enable Community OS for ALL users
              </div>
              <div style={{ fontSize: 'var(--os-text-xs)', color: 'var(--os-ink-3)', marginTop: 'var(--os-s-1)' }}>
                Cohort: <span style={{ fontFamily: 'var(--os-font-mono)' }}>{selected.label}</span>
              </div>
            </div>
            {/* Toggle switch */}
            <button
              onClick={() => !busy && !confirmPending && initiateToggle(!isOn)}
              disabled={busy || confirmPending}
              aria-pressed={isOn}
              style={{
                position: 'relative',
                width: 48,
                height: 26,
                borderRadius: 13,
                background: isOn ? 'var(--os-accent)' : 'var(--os-paper-3)',
                border: `1px solid ${isOn ? 'var(--os-accent)' : 'var(--os-line)'}`,
                cursor: busy || confirmPending ? 'not-allowed' : 'pointer',
                transition: 'background var(--os-dur-fast), border-color var(--os-dur-fast)',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 3,
                  left: isOn ? 24 : 3,
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: '#fff',
                  transition: 'left var(--os-dur-fast)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }}
              />
            </button>
          </div>

          {/* Warning */}
          <div
            style={{
              background: 'var(--os-warn-tint, #fffbeb)',
              border: '1px solid var(--os-warn, #d97706)',
              borderRadius: 'var(--os-r-md)',
              color: 'var(--os-warn, #92400e)',
              fontSize: 'var(--os-text-xs)',
              padding: 'var(--os-s-2) var(--os-s-3)',
              lineHeight: 1.5,
            }}
          >
            Toggling ON is a GA rollout — ALL users see /os immediately. This action is logged and cannot be automatically reversed.
          </div>

          {/* Stats row */}
          <div style={{ display: 'flex', gap: 'var(--os-s-4)', flexWrap: 'wrap' }}>
            {[
              { label: 'Users with access', value: statsLoading ? '…' : String(stats?.users_count ?? 0) },
              { label: 'Orgs', value: statsLoading ? '…' : String(stats?.orgs_count ?? 0) },
              { label: 'Toggle events (24h)', value: statsLoading ? '…' : String(stats?.activity_last_24h ?? 0) },
            ].map(({ label, value }) => (
              <div
                key={label}
                style={{
                  background: 'var(--os-paper-3)',
                  border: '1px solid var(--os-line)',
                  borderRadius: 'var(--os-r-md)',
                  padding: 'var(--os-s-3) var(--os-s-4)',
                  flex: '1 1 140px',
                  minWidth: 0,
                }}
              >
                <div style={{ fontSize: 'var(--os-text-xs)', color: 'var(--os-ink-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {label}
                </div>
                <div style={{ fontSize: 'var(--os-text-lg)', fontWeight: 700, color: 'var(--os-ink)', marginTop: 'var(--os-s-1)' }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* Confirm dialog */}
          {confirmPending && (
            <div
              style={{
                background: pendingValue ? 'var(--os-err-tint)' : 'var(--os-paper-3)',
                border: `1px solid ${pendingValue ? 'var(--os-err)' : 'var(--os-line)'}`,
                borderRadius: 'var(--os-r-md)',
                padding: 'var(--os-s-4)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--os-s-3)',
              }}
            >
              <div style={{ fontWeight: 600, color: pendingValue ? 'var(--os-err)' : 'var(--os-ink)', fontSize: 'var(--os-text-sm)' }}>
                {pendingValue
                  ? 'You are about to enable GA rollout for ALL users. Are you sure?'
                  : 'You are about to disable GA rollout. Are you sure?'}
              </div>
              <div style={{ display: 'flex', gap: 'var(--os-s-3)' }}>
                <button
                  onClick={confirmToggle}
                  disabled={busy}
                  style={{
                    background: pendingValue ? 'var(--os-err)' : 'var(--os-accent)',
                    border: 'none',
                    borderRadius: 'var(--os-r-md)',
                    color: '#fff',
                    cursor: busy ? 'not-allowed' : 'pointer',
                    fontSize: 'var(--os-text-sm)',
                    fontWeight: 700,
                    padding: '7px 18px',
                    opacity: busy ? 0.6 : 1,
                  }}
                >
                  {busy ? 'Saving…' : 'Confirmar'}
                </button>
                <button
                  onClick={cancelToggle}
                  disabled={busy}
                  style={{
                    background: 'var(--os-paper-3)',
                    border: '1px solid var(--os-line)',
                    borderRadius: 'var(--os-r-md)',
                    color: 'var(--os-ink-2)',
                    cursor: busy ? 'not-allowed' : 'pointer',
                    fontSize: 'var(--os-text-sm)',
                    padding: '7px 18px',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Activity log */}
      {selected && log.length > 0 && (
        <div>
          <div style={{ fontSize: 'var(--os-text-xs)', color: 'var(--os-ink-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--os-s-3)' }}>
            Rollout state changes
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--os-s-2)' }}>
            {log.map((entry) => (
              <div
                key={entry.id}
                style={{
                  background: 'var(--os-paper-2)',
                  border: '1px solid var(--os-line)',
                  borderRadius: 'var(--os-r-md)',
                  padding: 'var(--os-s-3) var(--os-s-4)',
                  display: 'flex',
                  gap: 'var(--os-s-3)',
                  alignItems: 'flex-start',
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: 'var(--os-text-xs)',
                    fontFamily: 'var(--os-font-mono)',
                    color: 'var(--os-ink-4)',
                    paddingTop: 1,
                    minWidth: 140,
                  }}
                >
                  {new Date(entry.at).toLocaleString()}
                </span>
                <span style={{ fontSize: 'var(--os-text-sm)', color: 'var(--os-ink-2)', flex: 1 }}>
                  {entry.summary}
                </span>
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: 'var(--os-text-xs)',
                    padding: '1px 6px',
                    borderRadius: 'var(--os-r-sm)',
                    background: entry.ok ? 'var(--os-ok-tint)' : 'var(--os-err-tint)',
                    color: entry.ok ? 'var(--os-ok)' : 'var(--os-err)',
                    fontWeight: 500,
                  }}
                >
                  {entry.ok ? 'ok' : 'err'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {selected && !statsLoading && log.length === 0 && (
        <p style={{ color: 'var(--os-ink-4)', fontSize: 'var(--os-text-sm)' }}>No rollout state changes recorded yet.</p>
      )}
    </div>
  );
}
