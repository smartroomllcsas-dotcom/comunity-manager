import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify, type NotifyRequest } from "@/lib/notify/dispatcher";

export type BillingOutboxJobType =
  | "process_webhook"
  | "renew_subscription"
  | "reconcile_payment"
  | "expire_subscription"
  | "apply_plan_change"
  | "send_notification";

export interface BillingOutboxJob {
  id: string;
  job_type: BillingOutboxJobType;
  organization_id: string | null;
  payload: Record<string, unknown>;
  attempt_count: number;
}

type NotificationPayload = {
  notificationLogId?: string;
  request: NotifyRequest;
};

export function outboxRetryDelaySeconds(attemptCount: number) {
  const attempt = Math.max(0, Math.min(10, Math.floor(attemptCount)));
  return Math.min(3600, 30 * 2 ** attempt);
}

function parseNotificationPayload(payload: Record<string, unknown>): NotificationPayload {
  const request = payload.request;
  if (!request || typeof request !== "object") {
    throw new Error("send_notification payload.request is required");
  }
  const value = request as Partial<NotifyRequest>;
  if (!value.organizationId || !Array.isArray(value.channels) || !value.template) {
    throw new Error("send_notification payload.request is invalid");
  }
  return {
    notificationLogId:
      typeof payload.notificationLogId === "string" ? payload.notificationLogId : undefined,
    request: value as NotifyRequest,
  };
}

async function processNotification(job: BillingOutboxJob) {
  const payload = parseNotificationPayload(job.payload);
  const admin = createAdminClient();

  if (payload.notificationLogId) {
    const { data: existing, error } = await admin
      .from("notification_logs")
      .select("id, status")
      .eq("id", payload.notificationLogId)
      .maybeSingle();
    if (error) throw new Error(`notification log lookup failed: ${error.message}`);
    if (existing?.status === "sent" || existing?.status === "delivered") {
      return { skipped: true };
    }
  }

  const result = await notify(payload.request);
  const failed = result.results.filter((item) => !item.ok);
  if (failed.length > 0) {
    const message = failed.map((item) => `${item.channel}: ${item.error || "failed"}`).join("; ");
    if (payload.notificationLogId) {
      await admin
        .from("notification_logs")
        .update({
          status: "failed",
          failure_code: "provider_failure",
          attempt_count: job.attempt_count,
          next_attempt_at: new Date(Date.now() + outboxRetryDelaySeconds(job.attempt_count) * 1000).toISOString(),
        })
        .eq("id", payload.notificationLogId);
    }
    throw new Error(message);
  }

  if (payload.notificationLogId) {
    const providerId = result.results.map((item) => item.id).find(Boolean) || null;
    const { error } = await admin
      .from("notification_logs")
      .update({
        status: "sent",
        provider_message_id: providerId,
        attempt_count: job.attempt_count,
        next_attempt_at: null,
        sent_at: new Date().toISOString(),
      })
      .eq("id", payload.notificationLogId);
    if (error) throw new Error(`notification log update failed: ${error.message}`);
  }

  return { sent: result.results.length };
}

async function processJob(job: BillingOutboxJob) {
  switch (job.job_type) {
    case "send_notification":
      return processNotification(job);
    default:
      throw new Error(`No handler registered for billing job type '${job.job_type}'`);
  }
}

export async function processBillingOutboxJobs(limit = 25) {
  const admin = createAdminClient();
  const workerId = `vercel-billing-${randomUUID()}`;
  const { data, error } = await admin.rpc("claim_billing_outbox_jobs", {
    p_limit: limit,
    p_worker_id: workerId,
    p_lease_seconds: 120,
  });
  if (error) throw new Error(`billing outbox claim failed: ${error.message}`);

  const jobs = (data || []) as BillingOutboxJob[];
  let completed = 0;
  let retried = 0;
  let deadLettered = 0;

  for (const job of jobs) {
    try {
      await processJob(job);
      const { data: didComplete, error: completeError } = await admin.rpc(
        "complete_billing_outbox_job",
        { p_job_id: job.id, p_worker_id: workerId },
      );
      if (completeError || !didComplete) {
        throw new Error(completeError?.message || "outbox completion was not owned by worker");
      }
      completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const { data: retryStatus, error: retryError } = await admin.rpc(
        "retry_billing_outbox_job",
        {
          p_job_id: job.id,
          p_worker_id: workerId,
          p_error_code: "handler_failed",
          p_error_message: message,
          p_max_attempts: 5,
        },
      );
      if (retryError) throw new Error(`billing outbox retry failed: ${retryError.message}`);
      if (retryStatus === "dead_letter") deadLettered += 1;
      else retried += 1;
    }
  }

  return { claimed: jobs.length, completed, retried, deadLettered, workerId };
}
