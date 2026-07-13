// Alertas de canales en status=error (típicamente por token expirado tras refresh fallido).
// Envía notificación a WEBHOOK_ALERT_URL con cooldown por canal para no spammear.
import { createAdminClient } from "@/lib/supabase/admin";

const COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6h por canal
const lastAlertByChannel = new Map<string, number>();

type ErroredChannel = {
  id: string;
  name: string | null;
  type: string;
  organization_id: string;
  token_expires_at: string | null;
  updated_at: string | null;
};

export async function alertErroredChannelsIfAny(): Promise<{
  sent: boolean;
  errored: number;
  reason?: string;
}> {
  const alertUrl = process.env.WEBHOOK_ALERT_URL;
  if (!alertUrl) return { sent: false, errored: 0, reason: "no_alert_url" };

  const admin = createAdminClient("smarttalk");
  const { data, error } = await admin
    .from("channels")
    .select("id, name, type, organization_id, token_expires_at, updated_at")
    .eq("status", "error")
    .order("updated_at", { ascending: false });

  if (error) return { sent: false, errored: 0, reason: `query_error:${error.message}` };

  const rows = (data ?? []) as ErroredChannel[];
  if (rows.length === 0) return { sent: false, errored: 0, reason: "no_errored_channels" };

  const now = Date.now();
  const fresh = rows.filter((row) => {
    const last = lastAlertByChannel.get(row.id) ?? 0;
    return now - last >= COOLDOWN_MS;
  });

  if (fresh.length === 0) return { sent: false, errored: rows.length, reason: "cooldown_active" };

  const text = `🚫 Community Manager · ${fresh.length} canal(es) en status=error (posible token expirado)`;
  const samples = fresh.slice(0, 5).map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    organization_id: row.organization_id,
    token_expires_at: row.token_expires_at,
    updated_at: row.updated_at,
  }));

  try {
    const response = await fetch(alertUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, errored_count: fresh.length, samples }),
    });
    if (!response.ok) {
      return { sent: false, errored: rows.length, reason: `alert_http_${response.status}` };
    }
    fresh.forEach((row) => lastAlertByChannel.set(row.id, now));
    return { sent: true, errored: fresh.length };
  } catch (err) {
    return {
      sent: false,
      errored: rows.length,
      reason: `alert_error:${err instanceof Error ? err.message : "unknown"}`,
    };
  }
}
