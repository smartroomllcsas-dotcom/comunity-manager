'use client';

import { useState, useMemo } from 'react';
import type { Agent } from '@/lib/os/schemas/agent';
import { buildSystemPrompt } from '@/lib/os/agents/runtime';
import { PRESETS } from '@/lib/os/agents/presets';

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

interface ValidationErrors {
  max_msg_per_hour?: string;
  max_msg_per_minute_per_contact?: string;
  custom_rules?: string;
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

function validateFields(fields: ConstitutionFields): ValidationErrors {
  const errs: ValidationErrors = {};
  if (fields.max_msg_per_hour < 1 || fields.max_msg_per_hour > 1000) {
    errs.max_msg_per_hour = 'Debe estar entre 1 y 1000';
  }
  if (
    fields.max_msg_per_minute_per_contact < 1 ||
    fields.max_msg_per_minute_per_contact > 60
  ) {
    errs.max_msg_per_minute_per_contact = 'Debe estar entre 1 y 60';
  }
  return errs;
}

interface TestResult {
  output: string;
  pass: boolean;
  reason?: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export function ConstitutionEditor({ agent, onSaved }: ConstitutionEditorProps) {
  const [fields, setFields] = useState<ConstitutionFields>(() =>
    parseConstitution(agent.constitution),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // Live preview — build a synthetic agent from current fields
  const previewAgent: Agent = useMemo(
    () => ({
      ...agent,
      constitution: {
        escalate_on_negative_sentiment: fields.escalate_on_negative_sentiment,
        max_msg_per_hour: fields.max_msg_per_hour,
        max_msg_per_minute_per_contact: fields.max_msg_per_minute_per_contact,
        never_promise_prices: fields.never_promise_prices,
        custom_rules: fields.custom_rules || undefined,
      },
    }),
    [agent, fields],
  );

  const systemPromptPreview = useMemo(() => buildSystemPrompt(previewAgent), [previewAgent]);

  const validationErrors = useMemo(() => validateFields(fields), [fields]);
  const hasErrors = Object.keys(validationErrors).length > 0;

  function applyPreset(presetId: string) {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setFields(parseConstitution(preset.constitution));
    setSaved(false);
    setError(null);
    setTestResult(null);
  }

  async function handleSave() {
    if (hasErrors) return;
    setSaving(true);
    setError(null);
    setSaved(false);

    let parsedCustom: unknown = fields.custom_rules;
    if (fields.custom_rules.trim()) {
      try {
        parsedCustom = JSON.parse(fields.custom_rules);
      } catch {
        // Accept as plain text — not strictly JSON required
        parsedCustom = fields.custom_rules;
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

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      const res = await fetch(`/api/os/agents/${agent.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Hola, tengo una queja sobre el servicio' }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `run failed (${res.status})`);
      }
      const data = (await res.json()) as {
        output: unknown;
        verifyResult: { pass: boolean; reason?: string };
        run: { tokensIn: number; tokensOut: number; costUsd: number };
      };
      setTestResult({
        output: typeof data.output === 'string' ? data.output : JSON.stringify(data.output, null, 2),
        pass: data.verifyResult.pass,
        reason: data.verifyResult.reason,
        tokensIn: data.run.tokensIn,
        tokensOut: data.run.tokensOut,
        costUsd: data.run.costUsd,
      });
    } catch (err) {
      setTestError(err instanceof Error ? err.message : String(err));
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex gap-4 flex-wrap lg:flex-nowrap">
      {/* ── Left: form ── */}
      <div className="panel flex-1 min-w-0">
        <div className="panel-head">
          <div className="panel-title">Constitution</div>
          <div className="panel-meta">agent rules</div>
        </div>

        <div className="feed" style={{ gap: 'var(--sp-3)', padding: 'var(--sp-4)' }}>

          {/* Presets */}
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-os-dim">
              Presets
            </span>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  title={p.description}
                  onClick={() => applyPreset(p.id)}
                  className="rounded border border-os-border bg-os-surface px-2 py-1 text-[10.5px] text-os-text transition-colors hover:border-os-border-strong hover:bg-os-surface2"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <hr className="border-os-border" />

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
          {!fields.escalate_on_negative_sentiment && (
            <p className="font-mono text-[10px]" style={{ color: 'var(--os-warn)' }}>
              ⚠ Recomendación: mantener activado para detectar clientes frustrados
            </p>
          )}

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
              Max messages / hour <span className="normal-case">(1–1000)</span>
            </label>
            <input
              type="number"
              min={1}
              max={1000}
              value={fields.max_msg_per_hour}
              onChange={(e) =>
                setFields((f) => ({ ...f, max_msg_per_hour: Number(e.target.value) }))
              }
              className="w-28 rounded border border-os-border bg-os-bg px-2 py-1 text-xs text-os-text focus:border-os-border-strong focus:outline-none"
            />
            {validationErrors.max_msg_per_hour && (
              <p className="font-mono text-[10px] text-os-err">
                {validationErrors.max_msg_per_hour}
              </p>
            )}
          </div>

          {/* max_msg_per_minute_per_contact */}
          <div className="flex flex-col gap-1">
            <label className="font-mono text-[10px] uppercase tracking-wider text-os-dim">
              Max messages / min / contact <span className="normal-case">(1–60)</span>
            </label>
            <input
              type="number"
              min={1}
              max={60}
              value={fields.max_msg_per_minute_per_contact}
              onChange={(e) =>
                setFields((f) => ({
                  ...f,
                  max_msg_per_minute_per_contact: Number(e.target.value),
                }))
              }
              className="w-28 rounded border border-os-border bg-os-bg px-2 py-1 text-xs text-os-text focus:border-os-border-strong focus:outline-none"
            />
            {validationErrors.max_msg_per_minute_per_contact && (
              <p className="font-mono text-[10px] text-os-err">
                {validationErrors.max_msg_per_minute_per_contact}
              </p>
            )}
          </div>

          {/* custom_rules */}
          <div className="flex flex-col gap-1">
            <label className="font-mono text-[10px] uppercase tracking-wider text-os-dim">
              Custom rules (texto libre o JSON)
            </label>
            <textarea
              rows={5}
              value={fields.custom_rules}
              onChange={(e) => setFields((f) => ({ ...f, custom_rules: e.target.value }))}
              placeholder='Ej: "Respondé siempre en español" o {"key": "value"}'
              className="rounded border border-os-border bg-os-bg px-2 py-1.5 font-mono text-[10.5px] text-os-text placeholder:text-os-dim focus:border-os-border-strong focus:outline-none resize-y"
            />
          </div>

          {error && <p className="font-mono text-[10px] text-os-err">⚠ {error}</p>}
          {saved && !error && (
            <p className="font-mono text-[10px] text-os-accent">Constitution saved.</p>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleSave}
              disabled={saving || hasErrors}
              className="rounded border border-os-border-strong bg-os-surface2 px-3 py-1.5 text-[11px] text-os-text transition-opacity hover:opacity-80 disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save constitution'}
            </button>

            <button
              onClick={handleTest}
              disabled={testing}
              className="rounded border border-os-border bg-os-surface px-3 py-1.5 text-[11px] text-os-text transition-opacity hover:opacity-80 disabled:opacity-40"
            >
              {testing ? 'Testing…' : 'Test with sample input'}
            </button>
          </div>

          {/* Test result */}
          {testError && (
            <p className="font-mono text-[10px] text-os-err">⚠ test: {testError}</p>
          )}
          {testResult && (
            <div className="flex flex-col gap-1 rounded border border-os-border bg-os-surface p-3">
              <div className="flex items-center gap-2">
                <span
                  className={`font-mono text-[10px] font-semibold ${testResult.pass ? 'text-os-accent' : 'text-os-err'}`}
                >
                  {testResult.pass ? '✓ PASS' : '✗ FAIL'}
                </span>
                {testResult.reason && (
                  <span className="font-mono text-[10px] text-os-dim">{testResult.reason}</span>
                )}
                <span className="ml-auto font-mono text-[10px] text-os-dim">
                  ↑{testResult.tokensIn} ↓{testResult.tokensOut} · ${testResult.costUsd.toFixed(6)}
                </span>
              </div>
              <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[10.5px] text-os-text leading-relaxed">
                {testResult.output}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* ── Right: system prompt preview ── */}
      <div className="panel w-full lg:w-80 shrink-0">
        <div className="panel-head">
          <div className="panel-title">System prompt preview</div>
          <div className="panel-meta">live</div>
        </div>
        <div style={{ padding: 'var(--sp-4)' }}>
          <pre className="whitespace-pre-wrap break-words font-mono text-[10px] text-os-dim leading-relaxed">
            {systemPromptPreview}
          </pre>
        </div>
      </div>
    </div>
  );
}
