// Opt-in E2E test against the deployed WAHA server.
// Enable with:  WAHA_E2E=1 WAHA_BASE_URL=... WAHA_API_KEY=... node --test tests/waha.e2e.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

const SHOULD_RUN = process.env.WAHA_E2E === "1";
const base = process.env.WAHA_BASE_URL;
const key = process.env.WAHA_API_KEY;

test("WAHA server reachable", { skip: !SHOULD_RUN }, async () => {
  const res = await fetch(`${base}/ping`);
  assert.equal(res.status, 200);
});

test("WAHA authorized listSessions", { skip: !SHOULD_RUN }, async () => {
  const res = await fetch(`${base}/api/sessions`, { headers: { "X-Api-Key": key } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
});

test("WAHA rejects wrong key", { skip: !SHOULD_RUN }, async () => {
  const res = await fetch(`${base}/api/sessions`, { headers: { "X-Api-Key": "wrong" } });
  assert.equal(res.status, 401);
});
