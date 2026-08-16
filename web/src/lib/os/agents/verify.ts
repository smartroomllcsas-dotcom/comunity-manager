export type VerifyOutcome = { pass: true } | { pass: false; reason: string };

export function verify(spec: Record<string, unknown>, output: unknown): VerifyOutcome {
  if (output === null || output === undefined) return { pass: false, reason: 'empty output' };
  if (typeof output === 'string' && output.trim() === '') return { pass: false, reason: 'blank output' };
  return { pass: true };
}
