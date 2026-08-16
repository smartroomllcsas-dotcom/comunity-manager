'use client';

import { useCallback, useEffect, useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────
type ThemeMode = 'dark' | 'light';

interface OrgTheme {
  accent_hue: number;
  theme_mode: ThemeMode;
}

// ── Preset chips ───────────────────────────────────────────────────────────────
const PRESETS: { label: string; hue: number }[] = [
  { label: 'Cobalt',  hue: 250 },
  { label: 'Coral',   hue: 12  },
  { label: 'Emerald', hue: 150 },
  { label: 'Amber',   hue: 40  },
];

// ── Page ───────────────────────────────────────────────────────────────────────
export default function ThemePickerPage() {
  const [hue, setHue] = useState(250);
  const [mode, setMode] = useState<ThemeMode>('dark');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load current theme
  useEffect(() => {
    fetch('/api/os/theme')
      .then((r) => r.json())
      .then((d) => {
        setHue(d.accent_hue ?? 250);
        setMode(d.theme_mode ?? 'dark');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Live-preview: update CSS variable on the document root while slider moves
  useEffect(() => {
    document.documentElement.style.setProperty('--accent-hue', String(hue));
  }, [hue]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/os/theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accent_hue: hue, theme_mode: mode }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Save failed');
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }, [hue, mode]);

  if (loading) {
    return (
      <div style={{ padding: 'var(--os-s-6)', color: 'var(--os-ink-4)', fontSize: 'var(--os-text-sm)' }}>
        Loading theme…
      </div>
    );
  }

  const previewColor = `hsl(${hue}, 70%, 50%)`;

  return (
    <div
      style={{
        padding: 'var(--os-s-6)',
        maxWidth: 520,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--os-s-6)',
      }}
    >
      {/* Header */}
      <div>
        <h2
          style={{
            fontSize: 'var(--os-text-lg)',
            fontWeight: 600,
            color: 'var(--os-ink)',
            margin: 0,
          }}
        >
          Theme
        </h2>
        <p style={{ fontSize: 'var(--os-text-sm)', color: 'var(--os-ink-4)', margin: '4px 0 0' }}>
          Customize the accent color for your organization.
        </p>
      </div>

      {/* Accent hue section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--os-s-3)' }}>
        <label
          style={{
            fontSize: 'var(--os-text-xs)',
            fontWeight: 600,
            color: 'var(--os-ink-4)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Accent hue
        </label>

        {/* Color preview swatch */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--os-s-3)' }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 'var(--os-r-md)',
              background: previewColor,
              flexShrink: 0,
              border: '1px solid var(--os-line)',
            }}
          />
          <span style={{ fontSize: 'var(--os-text-sm)', color: 'var(--os-ink-3)', fontFamily: 'var(--os-font-mono)' }}>
            hsl({hue}, 70%, 50%)
          </span>
        </div>

        {/* Hue slider */}
        <input
          type="range"
          min={0}
          max={360}
          value={hue}
          onChange={(e) => setHue(Number(e.target.value))}
          style={{
            width: '100%',
            accentColor: previewColor,
            cursor: 'pointer',
          }}
          aria-label="Accent hue"
        />

        {/* Preset chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--os-s-2)' }}>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => setHue(p.hue)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--os-s-1)',
                padding: '4px 10px',
                borderRadius: 'var(--os-r-sm)',
                border: `1px solid ${hue === p.hue ? `hsl(${p.hue}, 70%, 50%)` : 'var(--os-line)'}`,
                background: hue === p.hue ? `hsl(${p.hue}, 70%, 15%)` : 'var(--os-paper-2)',
                color: hue === p.hue ? `hsl(${p.hue}, 70%, 70%)` : 'var(--os-ink-3)',
                fontSize: 'var(--os-text-sm)',
                fontWeight: hue === p.hue ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: `hsl(${p.hue}, 70%, 50%)`,
                  display: 'inline-block',
                  flexShrink: 0,
                }}
              />
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--os-s-3)' }}>
        <label
          style={{
            fontSize: 'var(--os-text-xs)',
            fontWeight: 600,
            color: 'var(--os-ink-4)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Mode
        </label>
        <div style={{ display: 'flex', gap: 'var(--os-s-2)' }}>
          {(['dark', 'light'] as ThemeMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              disabled={m === 'light'}
              title={m === 'light' ? 'Coming soon' : undefined}
              style={{
                padding: '6px 16px',
                borderRadius: 'var(--os-r-md)',
                border: `1px solid ${mode === m ? 'var(--os-accent)' : 'var(--os-line)'}`,
                background: mode === m ? 'var(--os-accent-tint)' : 'var(--os-paper-2)',
                color: mode === m ? 'var(--os-accent)' : m === 'light' ? 'var(--os-ink-5)' : 'var(--os-ink-3)',
                fontSize: 'var(--os-text-sm)',
                fontWeight: mode === m ? 600 : 400,
                cursor: m === 'light' ? 'not-allowed' : 'pointer',
                opacity: m === 'light' ? 0.5 : 1,
              }}
            >
              {m === 'dark' ? 'Dark' : 'Light (soon)'}
            </button>
          ))}
        </div>
      </div>

      {/* Save button + feedback */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--os-s-3)' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '8px 20px',
            borderRadius: 'var(--os-r-md)',
            border: 'none',
            background: `hsl(${hue}, 70%, 50%)`,
            color: '#fff',
            fontSize: 'var(--os-text-sm)',
            fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && (
          <span style={{ fontSize: 'var(--os-text-sm)', color: 'var(--os-ok)' }}>Saved</span>
        )}
        {error && (
          <span style={{ fontSize: 'var(--os-text-sm)', color: 'var(--os-err)' }}>{error}</span>
        )}
      </div>
    </div>
  );
}
