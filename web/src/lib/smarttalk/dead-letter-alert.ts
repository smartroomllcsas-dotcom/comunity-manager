// Alertas para dead-letter webhook events (status=failed AND attempts >= 3).
// Envía a WEBHOOK_ALERT_URL (Slack/Discord/n8n webhook, formato genérico JSON).
import { createAdminClient } from "@/lib/supabase/admin";

const DEAD_LETTER_ATTEMPTS = 3;
const ALERT_COOLDOWN_MS = 15 * 60 * 1000; // 15 min entre alertas para no spammear

let lastAlertSentAt = 0;

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
