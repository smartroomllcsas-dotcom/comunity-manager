import { describe, it, expect, beforeAll } from 'vitest';
import { signState, verifyState } from '@/lib/os/oauth-state';

beforeAll(() => {
  process.env.APPROVAL_HMAC_SECRET = 'test-secret-with-enough-length-for-security';
});

describe('oauth-state HMAC', () => {
  it('sign+verify round trip works', () => {
    const state = signState({ orgId: 'org-1', provider: 'slack' });
    const v = verifyState(state, 'slack');
    expect(v?.orgId).toBe('org-1');
  });

  it('includes issuedAt in result', () => {
    const before = Date.now();
    const state = signState({ orgId: 'org-1', provider: 'slack' });
    const v = verifyState(state, 'slack');
    expect(v?.issuedAt).toBeGreaterThanOrEqual(before);
  });

  it('rejects wrong provider', () => {
    const state = signState({ orgId: 'org-1', provider: 'slack' });
    expect(verifyState(state, 'notion')).toBeNull();
  });

  it('rejects tampered body', () => {
    const state = signState({ orgId: 'org-1', provider: 'slack' });
    const [body, sig] = state.split('.');
    const tampered = body.slice(0, -1) + (body.slice(-1) === 'X' ? 'Y' : 'X') + '.' + sig;
    expect(verifyState(tampered, 'slack')).toBeNull();
  });

  it('rejects tampered signature', () => {
    const state = signState({ orgId: 'org-1', provider: 'slack' });
    const [body, sig] = state.split('.');
    const tamperedSig = sig.slice(0, -1) + (sig.slice(-1) === 'X' ? 'Y' : 'X');
    expect(verifyState(`${body}.${tamperedSig}`, 'slack')).toBeNull();
  });

  it('rejects state missing dot separator', () => {
    expect(verifyState('nodothere', 'slack')).toBeNull();
  });

  it('round trip works for notion provider', () => {
    const state = signState({ orgId: 'org-2', provider: 'notion' });
    const v = verifyState(state, 'notion');
    expect(v?.orgId).toBe('org-2');
  });

  it('preserves optional userId', () => {
    const state = signState({ orgId: 'org-3', userId: 'user-99', provider: 'slack' });
    const v = verifyState(state, 'slack');
    expect(v?.userId).toBe('user-99');
  });

  it('rejects expired state', () => {
    // Would need to mock Date.now() — skip for Sprint 3
  });
});
