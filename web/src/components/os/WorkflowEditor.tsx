'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Save, Loader2, AlertCircle } from 'lucide-react';
import { z } from 'zod';
import { WorkflowSchema, WorkflowStepSchema } from '@/lib/os/schemas/workflow';
import type { Workflow, WorkflowStep } from '@/lib/os/schemas/workflow';

// ── Types ─────────────────────────────────────────────────────────────────────

type StepKind = WorkflowStep['kind'];
const STEP_KINDS: StepKind[] = ['trigger', 'condition', 'action', 'wait', 'branch'];

const KIND_COLOR: Record<StepKind, string> = {
  trigger:   'var(--ok)',
  condition: 'var(--warn)',
  action:    'var(--os-accent)',
  wait:      'var(--text-3)',
  branch:    '#a78bfa',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStep(): WorkflowStep {
  return {
    id: crypto.randomUUID(),
    kind: 'action',
    label: '',
    config: {},
    next: null,
    onError: null,
  };
}

function isValidJson(s: string): boolean {
  if (!s.trim()) return true;
  try { JSON.parse(s); return true; } catch { return false; }
}

function configToString(config: Record<string, unknown>): string {
  if (!config || Object.keys(config).length === 0) return '';
  return JSON.stringify(config, null, 2);
}

function parseConfig(s: string): Record<string, unknown> {
  if (!s.trim()) return {};
  try { return JSON.parse(s); } catch { return {}; }
}

// ── StepRow ───────────────────────────────────────────────────────────────────

interface StepRowProps {
  step: WorkflowStep;
  index: number;
  allIds: string[];
  onChange: (updated: WorkflowStep) => void;
  onRemove: () => void;
  configStr: string;
  onConfigChange: (v: string) => void;
}

function StepRow({ step, index, allIds, onChange, onRemove, configStr, onConfigChange }: StepRowProps) {
  const otherIds = allIds.filter((id) => id !== step.id);
  const jsonInvalid = configStr.trim() !== '' && !isValidJson(configStr);

  return (
    <div className="rounded-lg border border-os-border bg-os-surface2 p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center gap-2">
        <span className="shrink-0 font-mono text-[11px] text-os-dim w-5">{index + 1}.</span>

        {/* Kind */}
        <select
          value={step.kind}
          onChange={(e) => onChange({ ...step, kind: e.target.value as StepKind })}
          className="rounded border border-os-border bg-os-surface px-2 py-1 font-mono text-[11px] text-os-text focus:border-os-accent focus:outline-none"
          style={{ color: KIND_COLOR[step.kind] }}
        >
          {STEP_KINDS.map((k) => (
            <option key={k} value={k} style={{ color: KIND_COLOR[k] }}>{k}</option>
          ))}
        </select>

        {/* Label */}
        <input
          type="text"
          value={step.label}
          placeholder="Label…"
          onChange={(e) => onChange({ ...step, label: e.target.value })}
          className="flex-1 rounded border border-os-border bg-os-surface px-2 py-1 font-mono text-[11px] text-os-text placeholder:text-os-dim focus:border-os-accent focus:outline-none"
        />

        {/* Remove */}
        <button
          type="button"
          onClick={onRemove}
          title="Remove step"
          className="shrink-0 rounded p-1 text-os-dim transition-colors hover:bg-os-surface hover:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Config JSON */}
      <div>
        <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-os-dim">
          Config (JSON)
        </label>
        <textarea
          value={configStr}
          onChange={(e) => onConfigChange(e.target.value)}
          rows={3}
          placeholder='{}'
          className={`w-full rounded border bg-os-surface px-2 py-1.5 font-mono text-[11px] text-os-text placeholder:text-os-dim focus:outline-none resize-y ${
            jsonInvalid ? 'border-red-500 focus:border-red-500' : 'border-os-border focus:border-os-accent'
          }`}
        />
        {jsonInvalid && (
          <p className="mt-1 flex items-center gap-1 font-mono text-[10px] text-red-400">
            <AlertCircle className="h-3 w-3" /> Invalid JSON
          </p>
        )}
      </div>

      {/* Next / onError selects */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-os-dim">
            Next step
          </label>
          <select
            value={step.next ?? ''}
            onChange={(e) => onChange({ ...step, next: e.target.value || null })}
            className="w-full rounded border border-os-border bg-os-surface px-2 py-1 font-mono text-[11px] text-os-text focus:border-os-accent focus:outline-none"
          >
            <option value="">— none —</option>
            {otherIds.map((id) => (
              <option key={id} value={id}>{id.slice(0, 8)}…</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-os-dim">
            On error
          </label>
          <select
            value={step.onError ?? ''}
            onChange={(e) => onChange({ ...step, onError: e.target.value || null })}
            className="w-full rounded border border-os-border bg-os-surface px-2 py-1 font-mono text-[11px] text-os-text focus:border-os-accent focus:outline-none"
          >
            <option value="">— none —</option>
            {otherIds.map((id) => (
              <option key={id} value={id}>{id.slice(0, 8)}…</option>
            ))}
          </select>
        </div>
      </div>

      {/* Step ID (read-only for reference) */}
      <p className="font-mono text-[9px] text-os-dim">id: {step.id}</p>
    </div>
  );
}

// ── WorkflowEditor ────────────────────────────────────────────────────────────

interface WorkflowEditorProps {
  initial?: Partial<Workflow>;
}

export function WorkflowEditor({ initial }: WorkflowEditorProps) {
  const router = useRouter();

  const [name, setName] = useState(initial?.name ?? '');
  const [subtitle, setSubtitle] = useState(initial?.subtitle ?? '');
  const [steps, setSteps] = useState<WorkflowStep[]>(initial?.steps ?? []);
  // Parallel array — config JSON strings (not parsed until save)
  const [configStrs, setConfigStrs] = useState<string[]>(
    (initial?.steps ?? []).map((s) => configToString(s.config))
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allIds = steps.map((s) => s.id);

  // ── Step mutations ──────────────────────────────────────────────────────────

  const addStep = useCallback(() => {
    setSteps((prev) => [...prev, makeStep()]);
    setConfigStrs((prev) => [...prev, '']);
  }, []);

  const removeStep = useCallback((idx: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== idx));
    setConfigStrs((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const updateStep = useCallback((idx: number, updated: WorkflowStep) => {
    setSteps((prev) => prev.map((s, i) => (i === idx ? updated : s)));
  }, []);

  const updateConfigStr = useCallback((idx: number, v: string) => {
    setConfigStrs((prev) => prev.map((s, i) => (i === idx ? v : s)));
  }, []);

  // ── Validation + Save ───────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setError(null);

    // Validate JSON configs
    for (let i = 0; i < configStrs.length; i++) {
      if (configStrs[i].trim() && !isValidJson(configStrs[i])) {
        setError(`Step ${i + 1} has invalid JSON config`);
        return;
      }
    }

    // Build final steps
    const finalSteps = steps.map((s, i) => ({
      ...s,
      config: parseConfig(configStrs[i]),
    }));

    // Zod validate
    let parsed: Workflow;
    try {
      const stepsValidated = z.array(WorkflowStepSchema).parse(finalSteps);
      parsed = WorkflowSchema.parse({
        id: initial?.id ?? crypto.randomUUID(),
        orgId: initial?.orgId ?? '00000000-0000-0000-0000-000000000000',
        name: name.trim(),
        subtitle: subtitle.trim(),
        revenueUsd: initial?.revenueUsd ?? 0,
        ord: initial?.ord ?? 0,
        steps: stepsValidated,
        createdAt: initial?.createdAt ?? new Date().toISOString(),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Validation failed';
      setError(msg);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/os/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      router.push('/os/workflows');
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
      setSaving(false);
    }
  }, [steps, configStrs, name, subtitle, initial, router]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header fields */}
      <div className="space-y-3">
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-os-dim">
            Workflow name *
          </label>
          <input
            type="text"
            value={name}
            placeholder="My workflow"
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-os-border bg-os-surface px-3 py-2 font-mono text-[13px] text-os-text placeholder:text-os-dim focus:border-os-accent focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-os-dim">
            Subtitle
          </label>
          <input
            type="text"
            value={subtitle}
            placeholder="Short description…"
            onChange={(e) => setSubtitle(e.target.value)}
            className="w-full rounded border border-os-border bg-os-surface px-3 py-2 font-mono text-[11px] text-os-text placeholder:text-os-dim focus:border-os-accent focus:outline-none"
          />
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-os-dim">
            Steps ({steps.length})
          </p>
          <button
            type="button"
            onClick={addStep}
            className="flex items-center gap-1.5 rounded border border-os-border bg-os-surface px-3 py-1.5 font-mono text-[11px] text-os-text transition-colors hover:border-os-accent hover:text-os-accent"
          >
            <Plus className="h-3.5 w-3.5" />
            Add step
          </button>
        </div>

        {steps.length === 0 && (
          <div className="flex items-center justify-center rounded-lg border border-dashed border-os-border py-10">
            <p className="font-mono text-[11px] text-os-dim">
              No steps yet — click "Add step" to start
            </p>
          </div>
        )}

        {steps.map((step, idx) => (
          <StepRow
            key={step.id}
            step={step}
            index={idx}
            allIds={allIds}
            onChange={(updated) => updateStep(idx, updated)}
            onRemove={() => removeStep(idx)}
            configStr={configStrs[idx] ?? ''}
            onConfigChange={(v) => updateConfigStr(idx, v)}
          />
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <p className="font-mono text-[11px] text-red-400">{error}</p>
        </div>
      )}

      {/* Save */}
      <div className="flex items-center justify-end gap-3 border-t border-os-border pt-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded border border-os-border px-4 py-2 font-mono text-[11px] text-os-dim transition-colors hover:border-os-border-strong hover:text-os-text"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="flex items-center gap-2 rounded bg-os-accent px-4 py-2 font-mono text-[11px] text-black transition-opacity disabled:opacity-50 hover:opacity-90"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save workflow
        </button>
      </div>
    </div>
  );
}
