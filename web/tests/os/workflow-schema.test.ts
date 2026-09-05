import { describe, it, expect } from 'vitest';
import { WorkflowSchema, WorkflowStepSchema } from '../../src/lib/os/schemas/workflow';

describe('WorkflowStepSchema', () => {
  it('parses a valid trigger step', () => {
    const step = WorkflowStepSchema.parse({
      id: 'step-1',
      kind: 'trigger',
      label: 'New lead',
      next: 'step-2',
    });
    expect(step.kind).toBe('trigger');
    expect(step.config).toEqual({});
    expect(step.next).toBe('step-2');
    expect(step.onError).toBeUndefined();
  });

  it('rejects unknown kind', () => {
    expect(() =>
      WorkflowStepSchema.parse({ id: 's', kind: 'unknown', label: 'x' })
    ).toThrow();
  });

  it('allows null next/onError', () => {
    const step = WorkflowStepSchema.parse({
      id: 'step-end',
      kind: 'action',
      label: 'Send email',
      next: null,
      onError: null,
    });
    expect(step.next).toBeNull();
    expect(step.onError).toBeNull();
  });
});

describe('WorkflowSchema', () => {
  it('parses a complete workflow with steps', () => {
    const wf = WorkflowSchema.parse({
      id: 'wf-001',
      orgId: '00000000-0000-4000-8000-000000000001',
      name: 'Onboarding',
      createdAt: new Date().toISOString(),
      steps: [
        { id: 's1', kind: 'trigger', label: 'Sign up', next: 's2' },
        { id: 's2', kind: 'action',  label: 'Send welcome', onError: 's3' },
        { id: 's3', kind: 'wait',    label: 'Wait 1h' },
      ],
    });
    expect(wf.steps).toHaveLength(3);
    expect(wf.steps[0].kind).toBe('trigger');
    expect(wf.steps[1].onError).toBe('s3');
  });

  it('defaults steps to empty array', () => {
    const wf = WorkflowSchema.parse({
      id: 'wf-002',
      orgId: '00000000-0000-4000-8000-000000000002',
      name: 'Empty',
      createdAt: new Date().toISOString(),
    });
    expect(wf.steps).toEqual([]);
    expect(wf.subtitle).toBe('');
    expect(wf.revenueUsd).toBe(0);
  });
});
