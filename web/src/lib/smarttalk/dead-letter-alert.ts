// Alertas para dead-letter webhook events (status=failed AND attempts >= 3).
// Envía a WEBHOOK_ALERT_URL (Slack/Discord/n8n webhook, formato genérico JSON).
import { createAdminClient } from "@/lib/supabase/admin";

const DEAD_LETTER_ATTEMPTS = 3;
const ALERT_COOLDOWN_MS = 15 * 60 * 1000; // 15 min entre alertas para no spammear
const STALL_THRESHOLD_SEC = 5 * 60; // pending más viejo que 5 min = queue stall

let lastAlertSentAt = 0;
let lastStallAlertAt = 0;

type DeadRow = {
  id: string;
  channel: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
};

export async function alertDeadLettersIfAny(): Promise<{
  sent: boolean;
  dead: number;
  reason?: string;
}> {
  const alertUrl = process.env.WEBHOOK_ALERT_URL;
  if (!alertUrl) return { sent: false, dead: 0, reason: "no_alert_url" };

  const admin = createAdminClient("smarttalk");
  const { data, error } = await admin
    .from("webhook_events")
    .select("id, channel, attempts, last_error, created_at")
    .eq("status", "failed")
    .gte("attempts", DEAD_LETTER_ATTEMPTS)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    return { sent: false, dead: 0, reason: `query_error:${error.message}` };
  }

  const rows = (data ?? []) as DeadRow[];
  if (rows.length === 0) return { sent: false, dead: 0, reason: "no_dead_letters" };

  if (Date.now() - lastAlertSentAt < ALERT_COOLDOWN_MS) {
    return { sent: false, dead: rows.length, reason: "cooldown_active" };
  }

  const text = `⚠️ Community Manager · ${rows.length} webhook events muertos (attempts >= ${DEAD_LETTER_ATTEMPTS})`;
  const attachments = rows.slice(0, 5).map((row) => ({
    id: row.id,
    channel: row.channel,
    attempts: row.attempts,
    last_error: (row.last_error ?? "").slice(0, 200),
    created_at: row.created_at,
  }));

  try {
    const response = await fetch(alertUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, dead_count: rows.length, samples: attachments }),
    });
    if (!response.ok) {
      return { sent: false, dead: rows.length, reason: `alert_http_${response.status}` };
    }
    lastAlertSentAt = Date.now();
    return { sent: true, dead: rows.length };
  } catch (err) {
    return {
      sent: false,
      dead: rows.length,
      reason: `alert_error:${err instanceof Error ? err.message : "unknown"}`,
    };
  }
}

/**
 * Alerta cuando el pending más viejo de webhook_events tiene edad > STALL_THRESHOLD_SEC.
 * Indica que el cron *2min no está corriendo o el batch está atascado.
 * Cooldown independiente del dead-letter para no perder señal.
 */
export async function alertQueueStallIfAny(): Promise<{
  sent: boolean;
  pending: number;
  oldestAgeSec: number | null;
  reason?: string;
}> {
  const alertUrl = process.env.WEBHOOK_ALERT_URL;
  if (!alertUrl) return { sent: false, pending: 0, oldestAgeSec: null, reason: "no_alert_url" };

  const admin = createAdminClient("smarttalk");
  const { data: oldest } = await admin
    .from("webhook_events")
    .select("id, channel, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!oldest?.created_at) {
    return { sent: false, pending: 0, oldestAgeSec: null, reason: "no_pending" };
  }

  const ageSec = Math.round((Date.now() - new Date(oldest.created_at as string).getTime()) / 1000);
  if (ageSec < STALL_THRESHOLD_SEC) {
    return { sent: false, pending: 0, oldestAgeSec: ageSec, reason: "below_threshold" };
  }

  const { count: pending } = await admin
    .from("webhook_events")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  if (Date.now() - lastStallAlertAt < ALERT_COOLDOWN_MS) {
    return {
      sent: false,
      pending: pending ?? 0,
      oldestAgeSec: ageSec,
      reason: "cooldown_active",
    };
  }

  const text = `⏳ Community Manager · queue stall (pending más viejo ${ageSec}s, total ${pending} pending)`;
  try {
    const response = await fetch(alertUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        pending: pending ?? 0,
        oldestPendingAgeSec: ageSec,
        oldestPendingId: oldest.id,
      }),
    });
    if (!response.ok) {
      return {
        sent: false,
        pending: pending ?? 0,
        oldestAgeSec: ageSec,
        reason: `alert_http_${response.status}`,
      };
    }
    lastStallAlertAt = Date.now();
    return { sent: true, pending: pending ?? 0, oldestAgeSec: ageSec };
  } catch (err) {
    return {
      sent: false,
      pending: pending ?? 0,
      oldestAgeSec: ageSec,
      reason: `alert_error:${err instanceof Error ? err.message : "unknown"}`,
    };
  }
}
