/**
 * QA · Prueba de concurrencia para smarttalk.reserve_billing_capacity (migración 031).
 *
 * Estrategia no destructiva: la organización QA suele estar por encima de su
 * límite contratado, así que el script NO borra contactos. En su lugar crea un
 * plan temporal privado cuyo entitlement `contacts.total` deja exactamente un
 * cupo libre, apunta la organización a ese plan durante la prueba y restaura el
 * `plan_id` original en el bloque `finally`.
 *
 * Requisitos:
 *   web/.env.local con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
 *   QA_ORGANIZATION_ID (obligatorio; el script se niega a correr sin él)
 *
 * Uso:
 *   QA_ORGANIZATION_ID=<uuid> node scripts/qa-billing-concurrency.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(scriptDir, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}
loadEnvFile(path.join(webDir, ".env.local"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const organizationId = process.env.QA_ORGANIZATION_ID?.trim();
const FEATURE = "contacts.total";

if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridos");
if (!organizationId) throw new Error("QA_ORGANIZATION_ID es obligatorio: el script nunca elige la organización por su cuenta");

const options = { auth: { autoRefreshToken: false, persistSession: false } };
// Dos clientes independientes para que las dos reservas viajen por conexiones
// distintas y compitan de verdad por el advisory lock del RPC.
const st = createClient(url, serviceKey, { ...options, db: { schema: "smarttalk" } });
const stB = createClient(url, serviceKey, { ...options, db: { schema: "smarttalk" } });

const evidence = { organizationId, feature: FEATURE, steps: [] };
const record = (step, data) => {
  evidence.steps.push({ step, at: new Date().toISOString(), ...data });
  console.error(`[qa] ${step}`);
};

async function must(label, promise) {
  const result = await promise;
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result;
}

const countContacts = async () =>
  (await must("contacts count", st.from("contacts").select("id", { count: "exact", head: true }).eq("organization_id", organizationId))).count;

const readOrg = async () =>
  (await must("organizations read", st.from("organizations")
    .select("id,name,plan_id,is_active,billing_enforcement_mode,onboarding_status,trial_ends_at")
    .eq("id", organizationId).maybeSingle())).data;

const readSubscriptions = async () =>
  (await must("subscriptions read", st.from("subscriptions")
    .select("id,plan_id,status,current_period_start,current_period_end,trial_ends_at,grace_ends_at")
    .eq("organization_id", organizationId).order("created_at", { ascending: true }))).data;

const readEntitlement = async (planId) =>
  (await must("plan_entitlements read", st.from("plan_entitlements")
    .select("feature_code,enabled,limit_value,overage_policy,reset_interval")
    .eq("plan_id", planId).eq("feature_code", FEATURE).maybeSingle())).data;

const readReservations = async () =>
  (await must("reservations read", st.from("billing_quota_reservations")
    .select("id,feature_code,quantity,status,resource_id,expires_at,created_at,consumed_at,released_at")
    .eq("organization_id", organizationId).order("created_at", { ascending: true }))).data;

const reserve = (client, quantity = 1) =>
  client.rpc("reserve_billing_capacity", {
    p_organization_id: organizationId,
    p_feature_code: FEATURE,
    p_quantity: quantity,
  });

const normalizeRow = (data) => (Array.isArray(data) ? data[0] : data) || null;

let temporaryPlanId = null;
let originalPlanId = null;
let planWasSwitched = false;
const syntheticReservationIds = new Set();
let initialReservationIds = new Set();

try {
  // ---------------------------------------------------------------- snapshot
  const initialOrg = await readOrg();
  if (!initialOrg) throw new Error(`la organización ${organizationId} no existe`);
  originalPlanId = initialOrg.plan_id;
  const initialContacts = await countContacts();
  const initialSubscriptions = await readSubscriptions();
  const initialEntitlement = originalPlanId ? await readEntitlement(originalPlanId) : null;
  const initialReservations = await readReservations();
  initialReservationIds = new Set(initialReservations.map((row) => row.id));
  evidence.initialState = {
    organization: initialOrg,
    contacts: initialContacts,
    subscriptions: initialSubscriptions,
    entitlement: initialEntitlement,
    reservations: initialReservations,
  };
  record("snapshot-inicial", { contacts: initialContacts, planId: originalPlanId, limit: initialEntitlement?.limit_value ?? null });

  if (initialReservations.some((row) => row.status === "held")) {
    throw new Error("existen reservas 'held' previas en esta organización; abortando para no mezclar evidencia");
  }

  // ------------------------------------------------- plan temporal (1 cupo)
  const basePlan = originalPlanId
    ? (await must("plans read", st.from("plans").select("*").eq("id", originalPlanId).maybeSingle())).data
    : null;
  if (!basePlan) throw new Error("no se pudo leer el plan original de la organización QA");

  const stamp = Date.now();
  const targetLimit = initialContacts + 1; // exactamente un cupo disponible
  const createdPlan = await must("plans insert", st.from("plans").insert({
    name: `[QA-TEST] Concurrencia temporal ${stamp}`,
    code: `qa-test-concurrency-${stamp}`,
    description: "Plan temporal de prueba de concurrencia. Se elimina al terminar el script.",
    max_agents: basePlan.max_agents,
    max_contacts: targetLimit,
    max_broadcasts_per_month: basePlan.max_broadcasts_per_month,
    max_chatbot_flows: basePlan.max_chatbot_flows,
    ai_enabled: basePlan.ai_enabled,
    price_monthly: basePlan.price_monthly,
    is_public: false,
  }).select("id,code,name,is_public,status,max_contacts").single());
  temporaryPlanId = createdPlan.data.id;
  record("plan-temporal-creado", { plan: createdPlan.data });

  await must("plan_entitlements insert", st.from("plan_entitlements").insert({
    plan_id: temporaryPlanId,
    feature_code: FEATURE,
    enabled: true,
    limit_value: targetLimit,
    reset_interval: "none",
    overage_policy: "block",
  }).select("id"));

  const contactsBeforeSwitch = await countContacts();
  if (contactsBeforeSwitch !== initialContacts) {
    throw new Error(`el conteo de contactos cambió (${initialContacts} -> ${contactsBeforeSwitch}); abortando`);
  }

  await must("organizations update (plan temporal)", st.from("organizations")
    .update({ plan_id: temporaryPlanId }).eq("id", organizationId).select("id,plan_id"));
  planWasSwitched = true;
  evidence.setup = { targetLimit, contactsAtSetup: contactsBeforeSwitch, temporaryPlanId, originalPlanId, freeSlots: targetLimit - contactsBeforeSwitch };
  record("plan-temporal-aplicado", evidence.setup);

  // ------------------------------------------------------ prueba concurrente
  // Warm-up: abre la conexión de cada cliente para que el disparo simultáneo
  // no quede sesgado por el handshake TLS.
  await Promise.all([
    st.from("organizations").select("id").eq("id", organizationId).maybeSingle(),
    stB.from("organizations").select("id").eq("id", organizationId).maybeSingle(),
  ]);

  const startedAt = Date.now();
  const [resA, resB] = await Promise.all([reserve(st), reserve(stB)]);
  const finishedAt = Date.now();

  const parse = (label, res) => {
    if (res.error) return { request: label, rpcError: res.error.message };
    const row = normalizeRow(res.data);
    return {
      request: label,
      allowed: row?.allowed ?? null,
      reason: row?.reason ?? null,
      reservation_id: row?.reservation_id ?? null,
      current_usage: row?.current_usage ?? null,
      limit_value: row?.limit_value ?? null,
    };
  };
  const requestA = parse("A", resA);
  const requestB = parse("B", resB);
  for (const request of [requestA, requestB]) {
    if (request.reservation_id) syntheticReservationIds.add(request.reservation_id);
  }
  evidence.concurrency = { dispatchedInParallel: true, elapsedMs: finishedAt - startedAt, requests: [requestA, requestB] };
  record("reservas-simultaneas", evidence.concurrency);

  const allowed = [requestA, requestB].filter((item) => item.allowed === true);
  const denied = [requestA, requestB].filter((item) => item.allowed === false);
  evidence.concurrency.allowedCount = allowed.length;
  evidence.concurrency.deniedCount = denied.length;
  evidence.concurrency.verdict =
    allowed.length === 1 && denied.length === 1 && denied[0].reason === "limit_reached" ? "PASS" : "FAIL";

  evidence.reservationsAfterRace = await readReservations();

  // ------------------------------------------------------------- consumo
  const winner = allowed[0];
  if (winner?.reservation_id) {
    const consumed = await st.rpc("consume_billing_capacity", {
      p_reservation_id: winner.reservation_id,
      p_resource_id: `qa-concurrency-test-${stamp}`,
    });
    evidence.consume = { reservationId: winner.reservation_id, returned: consumed.data, error: consumed.error?.message || null };
    record("consumo-reserva-ganadora", evidence.consume);
  }

  // Sonda posterior: documenta que una reserva `consumed` deja de ocupar cupo,
  // porque el RPC asume que el llamador ya insertó la fila real del recurso.
  const probe = parse("probe-post-consumo", await reserve(st));
  if (probe.reservation_id) syntheticReservationIds.add(probe.reservation_id);
  evidence.postConsumeProbe = probe;
  record("sonda-post-consumo", probe);

  // ------------------------------------------------------------- liberación
  const heldNow = (await readReservations()).filter(
    (row) => syntheticReservationIds.has(row.id) && row.status === "held",
  );
  evidence.released = [];
  for (const row of heldNow) {
    const released = await st.rpc("release_billing_capacity", { p_reservation_id: row.id });
    evidence.released.push({ reservationId: row.id, returned: released.data, error: released.error?.message || null });
  }
  record("liberacion-reservas", { count: evidence.released.length });

  evidence.finalReservations = await readReservations();
} finally {
  // ------------------------------------------------------------- restauración
  evidence.restore = {};
  try {
    if (planWasSwitched && originalPlanId) {
      const restored = await st.from("organizations").update({ plan_id: originalPlanId })
        .eq("id", organizationId).select("id,plan_id").maybeSingle();
      evidence.restore.organizationPlanId = restored.data?.plan_id || null;
      evidence.restore.organizationError = restored.error?.message || null;
    }
    if (temporaryPlanId) {
      // Sólo se eliminan las reservas creadas por esta ejecución. Nunca se hace
      // un DELETE amplio por organización/feature, para no tocar evidencia ajena.
      const syntheticIds = [...syntheticReservationIds];
      const wipe = syntheticIds.length
        ? await st.from("billing_quota_reservations").delete().in("id", syntheticIds).select("id,status")
        : { data: [], error: null };
      evidence.restore.deletedReservations = wipe.data?.length ?? 0;
      evidence.restore.deletedReservationsError = wipe.error?.message || null;

      const entDel = await st.from("plan_entitlements").delete().eq("plan_id", temporaryPlanId).select("id");
      evidence.restore.deletedEntitlements = entDel.data?.length ?? 0;
      const planDel = await st.from("plans").delete().eq("id", temporaryPlanId).select("id");
      evidence.restore.deletedTemporaryPlan = planDel.data?.length ?? 0;
      evidence.restore.temporaryPlanError = planDel.error?.message || null;
    }
    const finalReservations = await readReservations();
    evidence.finalState = {
      organization: await readOrg(),
      contacts: await countContacts(),
      subscriptions: await readSubscriptions(),
      entitlement: originalPlanId ? await readEntitlement(originalPlanId) : null,
      reservations: finalReservations,
    };
    evidence.restore.unexpectedReservationIds = finalReservations
      .filter((row) => !initialReservationIds.has(row.id))
      .map((row) => row.id);
  } catch (error) {
    evidence.restore.fatal = error instanceof Error ? error.message : String(error);
  }
  console.log(JSON.stringify(evidence, null, 2));
}
