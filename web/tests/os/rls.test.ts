import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

// Env vars needed. Set them in .env.local or export before running:
// SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET
const url = process.env.SUPABASE_URL!;
const anonKey = process.env.SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const jwtSecret = process.env.SUPABASE_JWT_SECRET!;

function fakeJwtWithOrg(orgId: string): string {
  return jwt.sign(
    { org_id: orgId, role: 'authenticated', aud: 'authenticated' },
    jwtSecret,
    { algorithm: 'HS256', expiresIn: '1h' }
  );
}

function clientForOrg(orgId: string): SupabaseClient {
  const c = createClient(url, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${fakeJwtWithOrg(orgId)}` },
    },
  });
  return c;
}

const skipReason = !url || !anonKey || !serviceKey || !jwtSecret
  ? 'Skipping RLS tests: missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_JWT_SECRET env vars'
  : null;

describe.skipIf(!!skipReason)('os_* RLS enforcement', () => {
  const orgA = '00000000-0000-4000-a000-000000000001';
  const orgB = '00000000-0000-4000-a000-000000000002';

  beforeAll(async () => {
    const service = createClient(url, serviceKey);
    // Ensure test orgs exist (upsert-safe)
    await service.from('organizations').upsert([
      { id: orgA, name: 'RLS Test Org A' },
      { id: orgB, name: 'RLS Test Org B' },
    ], { onConflict: 'id' });
    // Insert one agent per org
    await service.from('os_agents').upsert([
      { id: 'rls-test-A1', org_id: orgA, department_id: 'test', name: 'A1', status: 'active', tier: 'worker' },
      { id: 'rls-test-B1', org_id: orgB, department_id: 'test', name: 'B1', status: 'active', tier: 'worker' },
    ], { onConflict: 'id' });
  });

  afterAll(async () => {
    const service = createClient(url, serviceKey);
    await service.from('os_agents').delete().in('id', ['rls-test-A1', 'rls-test-B1', 'rls-test-attack']);
    // Leave test orgs — harmless
  });

  it('org A sees only its own agent', async () => {
    const { data, error } = await clientForOrg(orgA).from('os_agents').select('id').in('id', ['rls-test-A1', 'rls-test-B1']);
    expect(error).toBeNull();
    expect(data?.map(r => r.id).sort()).toEqual(['rls-test-A1']);
  });

  it('org B sees only its own agent', async () => {
    const { data, error } = await clientForOrg(orgB).from('os_agents').select('id').in('id', ['rls-test-A1', 'rls-test-B1']);
    expect(error).toBeNull();
    expect(data?.map(r => r.id).sort()).toEqual(['rls-test-B1']);
  });

  it('org A cannot insert an agent for org B', async () => {
    const { error } = await clientForOrg(orgA).from('os_agents').insert({
      id: 'rls-test-attack', org_id: orgB, department_id: 't', name: 'X', status: 'active', tier: 'worker',
    });
    expect(error).toBeTruthy();
  });
});
