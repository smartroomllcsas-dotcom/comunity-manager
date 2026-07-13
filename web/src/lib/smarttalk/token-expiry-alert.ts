// Alerta cuando el token de un canal expira en <TOKEN_EXPIRY_WARN_DAYS.
// Da tiempo al operador de reautenticar antes del corte real.
import { createAdminClient } from "@/lib/supabase/admin";

const WARN_DAYS = 3;
const COOLDOWN_MS = 12 * 60 * 60 * 1000;
const lastAlertByChannel = new Map<string, number>();

type ExpiringChannel = {
  id: string;
  name: string | null;
  type: string;
  organization_id: string;
  token_expires_at: string | null;
};

export async function alertExpiringTokensIfAny(): Promise<{
  sent: boolean;
  expiring: number;
  reason?: string;
}> {
  const alertUrl = process.env.WEBHOOK_ALERT_URL;
  if (!alertUrl) return { sent: false, expiring: 0, reason: "no_alert_url" };

  const admin = createAdminClient("smarttalk");
  const cutoff = new Date(Date.now() + WARN_DAYS * 86400 * 1000).toISOString();
  const { data, error } = await admin
    .from("channels")
    .select("id, name, type, organization_id, token_expires_at")
    .eq("status", "active")
    .not("token_expires_at", "is", null)
    .lt("token_expires_at", cutoff)
    .order("token_expires_at", { ascending: true });

  if (error) return { sent: false, expiring: 0, reason: `query_error:${error.message}` };

  const rows = (data ?? []) as ExpiringChannel[];
  if (rows.length === 0) return { sent: false, expiring: 0, reason: "no_expiring" };

  const now = Date.now();
  const fresh = rows.filter((row) => now - (lastAlertByChannel.get(row.id) ?? 0) >= COOLDOWN_MS);
  if (fresh.length === 0) return { sent: false, expiring: rows.length, reason: "cooldown_active" };

  const text = `⏰ Community Manager · ${fresh.length} canal(es) con token expirando en <${WARN_DAYS}d`;
  const samples = fresh.slice(0, 10).map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    organization_id: row.organization_id,
    token_expires_at: row.token_expires_at,
  }));

  try {
    const response = await fetch(alertUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, expiring_count: fresh.length, samples }),
    });
    if (!response.ok) {
      return { sent: false, expiring: rows.length, reason: `alert_http_${response.status}` };
    }
    fresh.forEach((row) => lastAlertByChannel.set(row.id, now));
    return { sent: true, expiring: fresh.length };
  } catch (err) {
    return {
      sent: false,
      expiring: rows.length,
      reason: `alert_error:${err instanceof Error ? err.message : "unknown"}`,
    };
  }
}
