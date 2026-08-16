'use client';

import { useState } from 'react';
import type { Agent } from '@/lib/os/schemas/agent';

interface ConstitutionEditorProps {
  agent: Agent;
  onSaved?: (updated: Agent) => void;
}

interface ConstitutionFields {
  escalate_on_negative_sentiment: boolean;
  max_msg_per_hour: number;
  max_msg_per_minute_per_contact: number;
  never_promise_prices: boolean;
  custom_rules: string;
}

function parseConstitution(raw: Record<string, unknown>): ConstitutionFields {
  return {
    escalate_on_negative_sentiment: Boolean(raw.escalate_on_negative_sentiment ?? true),
    max_msg_per_hour: Number(raw.max_msg_per_hour ?? 100),
    max_msg_per_minute_per_contact: Number(raw.max_msg_per_minute_per_contact ?? 3),
    never_promise_prices: Boolean(raw.never_promise_prices ?? true),
    custom_rules:
      typeof raw.custom_rules === 'string'
        ? raw.custom_rules
        : raw.custom_rules
          ? JSON.stringify(raw.custom_rules, null, 2)
          : '',
  };
}

export function ConstitutionEditor({ agent, onSaved }: ConstitutionEditorProps) {
  const [fields, setFields] = useState<ConstitutionFields>(() =>
    parseConstitution(agent.constitution),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);

    // validate custom_rules JSON if non-empty
    let parsedCustom: unknown = fields.custom_rules;
    if (fields.custom_rules.trim()) {
      try {
        parsedCustom = JSON.parse(fields.custom_rules);
      } catch {
        setError('custom_rules must be valid JSON or empty');
        setSaving(false);
        return;
      }
    }

    const updatedAgent: Agent = {
      ...agent,
      constitution: {
        escalate_on_negative_sentiment: fields.escalate_on_negative_sentiment,
        max_msg_per_hour: fields.max_msg_per_hour,
        max_msg_per_minute_per_contact: fields.max_msg_per_minute_per_contact,
        never_promise_prices: fields.never_promise_prices,
        custom_rules: parsedCustom,
      },
      updatedAt: new Date().toISOString(),
    };

    try {
      const res = await fetch('/api/os/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedAgent),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `save failed (${res.status})`);
      }
      setSaved(true);
      onSaved?.(updatedAgent);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">Constitution</div>
        <div className="panel-meta">agent rules</div>
      </div>

      <div className="feed" style={{ gap: 'var(--sp-3)', padding: 'var(--sp-4)' }}>

        {/* escalate_on_negative_sentiment */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={fields.escalate_on_negative_sentiment}
            onChange={(e) =>
              setFields((f) => ({ ...f, escalate_on_negative_sentiment: e.target.checked }))
            }
            className="h-3.5 w-3.5 accent-[var(--accent)]"
          />
          <span className="text-[11.5px] text-os-text">Escalate on negative sentiment</span>
        </label>

        {/* never_promise_prices */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={fields.never_promise_prices}
            onChange={(e) =>
              setFields((f) => ({ ...f, never_promise_prices: e.target.checked }))
            }
            className="h-3.5 w-3.5 accent-[var(--accent)]"
          />
          <span className="text-[11.5px] text-os-text">Never promise prices</span>
        </label>

        {/* max_msg_per_hour */}
        <div className="flex flex-col gap-1">
          <label className="font-mono text-[10px] uppercase tracking-wider text-os-dim">
            Max messages / hour
          </label>
          <input
            type="number"
            min={1}
            max={10000}
            value={fields.max_msg_per_hour}
            onChange={(e) =>
              setFields((f) => ({ ...f, max_msg_per_hour: Number(e.target.value) }))
            }
            className="w-28 rounded border border-os-border bg-os-bg px-2 py-1 text-xs text-os-text focus:border-os-border-strong focus:outline-none"
          />
        </div>

        {/* max_msg_per_minute_per_contact */}
        <div className="flex flex-col gap-1">
          <label className="font-mono text-[10px] uppercase tracking-wider text-os-dim">
            Max messages / min / contact
          </label>
          <input
            type="number"
            min={1}
            max={100}
            value={fields.max_msg_per_minute_per_contact}
            onChange={(e) =>
              setFields((f) => ({
                ...f,
                max_msg_per_minute_per_contact: Number(e.target.value),
              }))
            }
            className="w-28 rounded border border-os-border bg-os-bg px-2 py-1 text-xs text-os-text focus:border-os-border-strong focus:outline-none"
          />
        </div>

        {/* custom_rules */}
        <div className="flex flex-col gap-1">
          <label className="font-mono text-[10px] uppercase tracking-wider text-os-dim">
            Custom rules (JSON)
          </label>
          <textarea
            rows={5}
            value={fields.custom_rules}
            onChange={(e) => setFields((f) => ({ ...f, custom_rules: e.target.value }))}
            placeholder='{"key": "value"}'
            className="rounded border border-os-border bg-os-bg px-2 py-1.5 font-mono text-[10.5px] text-os-text placeholder:text-os-dim focus:border-os-border-strong focus:outline-none resize-y"
          />
        </div>

        {error && (
          <p className="font-mono text-[10px] text-os-err">⚠ {error}</p>
        )}
        {saved && !error && (
          <p className="font-mono text-[10px] text-os-accent">Constitution saved.</p>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="self-start rounded border border-os-border-strong bg-os-surface2 px-3 py-1.5 text-[11px] text-os-text transition-opacity hover:opacity-80 disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save constitution'}
        </button>
      </div>
    </div>
  );
}
