/**
 * QA · Pruebas sintéticas del billing outbox (migración 032).
 *
 * Todos los jobs creados llevan el prefijo `qa-test-outbox-` en su
 * `idempotency_key`. El script se niega a operar si encuentra jobs que no sean
 * suyos, para no reclamar ni mover trabajo real.
 *
 * Fases:
 *   race        A · claim concurrente con dos worker_id + complete/ownership
 *   retry       B · reintento con backoff hasta dead_letter (job process_webhook)
 *   idem-setup  C · crea notification_log 'sent' + job send_notification
 *   idem-verify C · verifica el resultado después de correr el worker real
 *   cleanup     borra todas las filas sintéticas de este script
 *
 * Uso:
 *   QA_ORGANIZATION_ID=<uuid> node scripts/qa-billing-outbox.mjs <fase>
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
const phase = process.argv[2];
const PREFIX = "qa-test-outbox-";
const STATE_FILE = path.join(webDir, ".qa-outbox-state.json");

if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridos");
if (!organizationId) throw new Error("QA_ORGANIZATION_ID es obligatorio");
if (!phase) throw new Error("fase requerida: race | retry | idem-setup | idem-verify | cleanup");

const options = { auth: { autoRefreshToken: false, persistSession: false } };
const st = createClient(url, serviceKey, { ...options, db: { schema: "smarttalk" } });
const stB = createClient(url, serviceKey, { ...options, db: { schema: "smarttalk" } });
const pub = createClient(url, serviceKey, { ...options, db: { schema: "public" } });

const evidence = { phase, organizationId, at: new Date().toISOString() };

async function must(label, promise) {
  const result = await promise;
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result;
}

const jobColumns =
  "id,job_type,organization_id,idempotency_key,status,attempt_count,available_at,locked_at,locked_by,last_error_code,last_error_message,created_at,completed_at";

const readJob = async (id) =>
  (await must("job read", st.from("billing_outbox_jobs").select(jobColumns).eq("id", id).maybeSingle())).data;

/** Aborta si existe cualquier job que no haya creado este script. */
async function assertNoForeignJobs() {
  const all = (await must("outbox scan", st.from("billing_outbox_jobs").select(jobColumns))).data;
  const foreign = all.filter((job) => !job.idempotency_key.startsWith(PREFIX));
  if (foreign.length > 0) {
    throw new Error(`hay ${foreign.length} job(s) reales en billing_outbox_jobs; abortando para no reclamarlos`);
  }
  return all;
}

const readState = () => (fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) : {});
const writeState = (patch) => fs.writeFileSync(STATE_FILE, JSON.stringify({ ...readState(), ...patch }, null, 2));

const secondsUntil = (iso) => Math.round((new Date(iso).getTime() - Date.now()) / 1000);

// ---------------------------------------------------------------- fase: race
async function phaseRace() {
  evidence.preexistingJobs = await assertNoForeignJobs();
  const stamp = Date.now();
  const key = `${PREFIX}race-${stamp}`;
  const created = await must("insert job", st.from("billing_outbox_jobs").insert({
    job_type: "process_webhook",
    organization_id: organizationId,
    idempotency_key: key,
    status: "pending",
    payload: { qa_synthetic: true, note: "QA claim race. No provider is contacted." },
  }).select(jobColumns).single());
  const job = created.data;
  evidence.job = { id: job.id, idempotency_key: job.idempotency_key, statusBefore: job.status, attemptCountBefore: job.attempt_count };

  const workerA = `qa-worker-A-${stamp}`;
  const workerB = `qa-worker-B-${stamp}`;

  // Warm-up para que las dos conexiones ya estén abiertas al disparar.
  await Promise.all([
    st.from("billing_outbox_jobs").select("id").eq("id", job.id).maybeSingle(),
    stB.from("billing_outbox_jobs").select("id").eq("id", job.id).maybeSingle(),
  ]);

  const [claimA, claimB] = await Promise.all([
    st.rpc("claim_billing_outbox_jobs", { p_limit: 5, p_worker_id: workerA, p_lease_seconds: 120 }),
    stB.rpc("claim_billing_outbox_jobs", { p_limit: 5, p_worker_id: workerB, p_lease_seconds: 120 }),
  ]);

  const summarize = (label, workerId, res) => ({
    worker_id: workerId,
    label,
    rpcError: res.error?.message || null,
    claimedJobIds: (res.data || []).map((row) => row.id),
    claimedOurJob: (res.data || []).some((row) => row.id === job.id),
  });
  const a = summarize("A", workerA, claimA);
  const b = summarize("B", workerB, claimB);
  evidence.claims = [a, b];

  const jobAfterClaim = await readJob(job.id);
  evidence.jobAfterClaim = jobAfterClaim;
  const winner = [a, b].filter((item) => item.claimedOurJob);
  evidence.winners = winner.map((item) => item.worker_id);
  evidence.raceVerdict =
    winner.length === 1 && jobAfterClaim.status === "processing" && jobAfterClaim.locked_by === winner[0].worker_id
      ? "PASS"
      : "FAIL";

  // Ownership: el worker perdedor no puede cerrar el job.
  const loser = [a, b].find((item) => !item.claimedOurJob);
  const wrongComplete = await st.rpc("complete_billing_outbox_job", { p_job_id: job.id, p_worker_id: loser.worker_id });
  evidence.completeByLoser = { worker_id: loser.worker_id, returned: wrongComplete.data, error: wrongComplete.error?.message || null };

  const rightComplete = await st.rpc("complete_billing_outbox_job", { p_job_id: job.id, p_worker_id: winner[0].worker_id });
  evidence.completeByWinner = { worker_id: winner[0].worker_id, returned: rightComplete.data, error: rightComplete.error?.message || null };
  evidence.jobFinal = await readJob(job.id);
  evidence.ownershipVerdict =
    wrongComplete.data === false && rightComplete.data === true && evidence.jobFinal.status === "completed" ? "PASS" : "FAIL";
}

// --------------------------------------------------------------- fase: retry
async function phaseRetry() {
  await assertNoForeignJobs();
  const stamp = Date.now();
  const maxAttempts = 3;
  const worker = `qa-worker-retry-${stamp}`;
  const created = await must("insert job", st.from("billing_outbox_jobs").insert({
    job_type: "process_webhook",
    organization_id: organizationId,
    idempotency_key: `${PREFIX}retry-${stamp}`,
    status: "pending",
    payload: { qa_synthetic: true, note: "QA retry/backoff. process_webhook has no handler and contacts no provider." },
  }).select(jobColumns).single());
  const jobId = created.data.id;
  evidence.job = { id: jobId, idempotency_key: created.data.idempotency_key, maxAttempts };
  evidence.rounds = [];

  // Ownership negativo: retry con un worker que no posee el lease.
  const claim0 = await st.rpc("claim_billing_outbox_jobs", { p_limit: 5, p_worker_id: worker, p_lease_seconds: 120 });
  if (claim0.error) throw new Error(`claim inicial: ${claim0.error.message}`);
  const notOwned = await st.rpc("retry_billing_outbox_job", {
    p_job_id: jobId, p_worker_id: `${worker}-impostor`,
    p_error_code: "qa_not_owner", p_error_message: "QA ownership probe", p_max_attempts: maxAttempts,
  });
  evidence.retryByNonOwner = { returned: notOwned.data, error: notOwned.error?.message || null };
  const afterProbe = await readJob(jobId);
  evidence.jobAfterOwnershipProbe = afterProbe;

  // Ronda 1 usa el claim que ya hicimos (attempt_count = 1).
  for (let round = 1; round <= maxAttempts; round += 1) {
    if (round > 1) {
      // Acelerador de prueba: el backoff real deja available_at en el futuro.
      // Se adelanta SÓLO en este job sintético para poder observar la
      // progresión completa sin esperar minutos reales.
      await must("forzar available_at", st.from("billing_outbox_jobs")
        .update({ available_at: new Date().toISOString() }).eq("id", jobId).select("id"));
      const claim = await st.rpc("claim_billing_outbox_jobs", { p_limit: 5, p_worker_id: worker, p_lease_seconds: 120 });
      if (claim.error) throw new Error(`claim ronda ${round}: ${claim.error.message}`);
    }
    const claimed = await readJob(jobId);
    const retried = await st.rpc("retry_billing_outbox_job", {
      p_job_id: jobId, p_worker_id: worker,
      p_error_code: "qa_synthetic_failure", p_error_message: `QA synthetic failure round ${round}`,
      p_max_attempts: maxAttempts,
    });
    const after = await readJob(jobId);
    evidence.rounds.push({
      round,
      statusBefore: claimed.status,
      attemptCountAfterClaim: claimed.attempt_count,
      lockedBy: claimed.locked_by,
      rpcReturned: retried.data,
      rpcError: retried.error?.message || null,
      statusAfter: after.status,
      attemptCountAfter: after.attempt_count,
      availableAtAfter: after.available_at,
      backoffSeconds: secondsUntil(after.available_at),
      lastErrorCode: after.last_error_code,
      lastErrorMessage: after.last_error_message,
      lockedByAfter: after.locked_by,
    });
    if (after.status === "dead_letter") break;
  }
  evidence.jobFinal = await readJob(jobId);
  const [r1, r2, r3] = evidence.rounds;
  evidence.retryVerdict =
    r1?.statusAfter === "retry" && r1?.backoffSeconds >= 55 && r1?.backoffSeconds <= 60 &&
    r2?.statusAfter === "retry" && r2?.backoffSeconds >= 115 && r2?.backoffSeconds <= 120 &&
    r3?.statusAfter === "dead_letter" &&
    evidence.retryByNonOwner.returned === "not_owned"
      ? "PASS"
      : "FAIL";
}

// ---------------------------------------------------------- fase: idem-setup
async function phaseIdemSetup() {
  await assertNoForeignJobs();
  const stamp = Date.now();
  const agent = (await must("agent read", st.from("agents")
    .select("id,email").eq("organization_id", organizationId).eq("role", "admin")
    .order("created_at", { ascending: true }).limit(1).maybeSingle())).data;
  if (!agent) throw new Error("la organización QA no tiene un agente admin para asociar la notificación");

  const logKey = `${PREFIX}idem-${stamp}`;
  const log = await must("notification_logs insert", st.from("notification_logs").insert({
    organization_id: organizationId,
    channel: "email",
    template_code: "qa_synthetic_idempotency",
    recipient_agent_id: agent.id,
    recipient_hash: `qa-hash-${stamp}`,
    status: "sent",
    idempotency_key: logKey,
    attempt_count: 1,
    provider_message_id: `qa-preexisting-${stamp}`,
    sent_at: new Date().toISOString(),
    metadata: { qa_synthetic: true, note: "Preexisting sent log for worker idempotency test." },
  }).select("id,status,attempt_count,provider_message_id,sent_at,next_attempt_at").single());

  const job = await must("job insert", st.from("billing_outbox_jobs").insert({
    job_type: "send_notification",
    organization_id: organizationId,
    idempotency_key: `${PREFIX}idem-job-${stamp}`,
    status: "pending",
    payload: {
      qa_synthetic: true,
      notificationLogId: log.data.id,
      request: {
        organizationId,
        channels: ["email"],
        recipients: { email: `qa-idempotency-${stamp}@communitymanager.invalid` },
        template: "custom",
        variables: { subject: "QA idempotency probe", body: "QA synthetic. Must never reach a provider." },
      },
    },
  }).select(jobColumns).single());

  const providerLogBefore = await pub.from("cm_notifications_log").select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  evidence.notificationLog = log.data;
  evidence.job = job.data;
  evidence.providerLogCountBefore = providerLogBefore.count;
  evidence.providerLogError = providerLogBefore.error?.message || null;
  writeState({
    idem: {
      notificationLogId: log.data.id,
      jobId: job.data.id,
      providerLogCountBefore: providerLogBefore.count,
      notificationLogBefore: log.data,
      jobStatusBefore: job.data.status,
      jobAttemptCountBefore: job.data.attempt_count,
    },
  });
}

// --------------------------------------------------------- fase: idem-verify
async function phaseIdemVerify() {
  const state = readState().idem;
  if (!state) throw new Error("no hay estado de idem-setup; ejecuta la fase idem-setup primero");
  const job = await readJob(state.jobId);
  const log = (await must("notification_logs read", st.from("notification_logs")
    .select("id,status,attempt_count,provider_message_id,sent_at,next_attempt_at,failure_code")
    .eq("id", state.notificationLogId).maybeSingle())).data;
  const providerLogAfter = await pub.from("cm_notifications_log").select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  evidence.before = state;
  evidence.jobAfter = job;
  evidence.notificationLogAfter = log;
  evidence.providerLogCountAfter = providerLogAfter.count;
  evidence.providerCalled = providerLogAfter.count !== state.providerLogCountBefore;
  evidence.idempotencyVerdict =
    job?.status === "completed" &&
    job?.attempt_count === 1 &&
    log?.status === "sent" &&
    log?.attempt_count === state.notificationLogBefore.attempt_count &&
    log?.provider_message_id === state.notificationLogBefore.provider_message_id &&
    evidence.providerCalled === false
      ? "PASS"
      : "FAIL";
}

// -------------------------------------------------------------- fase: cleanup
async function phaseCleanup() {
  const all = (await must("outbox scan", st.from("billing_outbox_jobs").select(jobColumns))).data;
  const mine = all.filter((job) => job.idempotency_key.startsWith(PREFIX));
  const foreign = all.filter((job) => !job.idempotency_key.startsWith(PREFIX));
  evidence.foreignJobsLeftUntouched = foreign.length;

  const deletedJobs = await st.from("billing_outbox_jobs").delete()
    .in("id", mine.map((job) => job.id)).select("id,idempotency_key,status");
  evidence.deletedJobs = deletedJobs.data || [];
  evidence.deletedJobsError = deletedJobs.error?.message || null;

  const logs = (await must("notification_logs scan", st.from("notification_logs")
    .select("id,idempotency_key,status").eq("organization_id", organizationId))).data;
  const mineLogs = logs.filter((log) => log.idempotency_key.startsWith(PREFIX));
  const deletedLogs = mineLogs.length
    ? await st.from("notification_logs").delete().in("id", mineLogs.map((log) => log.id)).select("id,idempotency_key")
    : { data: [] };
  evidence.deletedNotificationLogs = deletedLogs.data || [];
  evidence.deletedNotificationLogsError = deletedLogs.error?.message || null;

  evidence.finalOutboxRows = (await must("outbox final", st.from("billing_outbox_jobs").select(jobColumns))).data;
  evidence.finalNotificationLogRows = (await must("logs final", st.from("notification_logs")
    .select("id,idempotency_key,status").eq("organization_id", organizationId))).data;
  if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
}

const phases = {
  race: phaseRace,
  retry: phaseRetry,
  "idem-setup": phaseIdemSetup,
  "idem-verify": phaseIdemVerify,
  cleanup: phaseCleanup,
};
if (!phases[phase]) throw new Error(`fase desconocida: ${phase}`);

try {
  await phases[phase]();
} catch (error) {
  evidence.fatal = error instanceof Error ? error.message : String(error);
} finally {
  console.log(JSON.stringify(evidence, null, 2));
  if (evidence.fatal) process.exitCode = 1;
}
