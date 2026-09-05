/**
 * POST /api/whatsapp/cloud/sync
 *   body: { clientId, accountId?, dry_run? }
 *
 * Trae plantillas desde Meta (paginado hasta 500 max) y upsert en cm_wa_templates.
 * Reconciliación por si perdimos webhooks. Devuelve { synced, created, updated, skipped }.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCmClientAccess } from "@/lib/cm-client-access";
import {
  getWabaClientForClient,
  getWabaCredentialsForClient,
} from "@/lib/whatsapp/cloud/business-account";
import { friendlyWhatsAppError } from "@/lib/whatsapp/cloud/error-map";
import type { WaTemplateStatus } from "@/lib/whatsapp/cloud/types";

const MAX_PAGES = 5; // 5 páginas × 100 items = 500 templates hard-cap por sync

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const clientId = (body as { clientId?: string }).clientId;
  const accountId = (body as { accountId?: string }).accountId ?? null;
  const dryRun = Boolean((body as { dry_run?: boolean }).dry_run);

  if (!clientId) return NextResponse.json({ error: "clientId requerido" }, { status: 400 });

  const access = await getCmClientAccess(request, clientId);
  if (!access) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  let waba;
  try {
    waba = await getWabaClientForClient(access.clientId, accountId);
  } catch (err) {
    console.error("[wa/cloud/sync] getWabaClient failed", err);
    return NextResponse.json({ error: "No hay cuenta WhatsApp conectada para esta marca." }, { status: 400 });
  }
  // Verificamos ownership también acá (defensivo)
  await getWabaCredentialsForClient(access.clientId, waba.account.id);

  const collected: Array<Record<string, unknown>> = [];
  let cursor: string | undefined;
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const resp = await waba.client.listTemplates({ limit: 100, after: cursor });
      collected.push(...(resp.data ?? []));
      cursor = resp.paging?.cursors?.after;
      if (!cursor || !resp.paging?.next) break;
    }
  } catch (err) {
    return NextResponse.json({ error: friendlyWhatsAppError(err) }, { status: 400 });
  }

  if (dryRun) {
    return NextResponse.json({
      found: collected.length,
      truncated: Boolean(cursor),
      dry_run: true,
    });
  }

  // Pre-cargamos existentes en una sola query para evitar N+1 en el loop
  const { data: existingRows } = await supabaseAdmin
    .from("cm_wa_templates")
    .select("name,language")
    .eq("whatsapp_account_id", waba.account.id);
  const existingSet = new Set(
    ((existingRows ?? []) as Array<{ name: string; language: string }>).map(
      (r) => `${r.name}::${r.language}`
    )
  );

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const raw of collected) {
    const t = raw as {
      id: string;
      name: string;
      language: string;
      category: string;
      status: WaTemplateStatus;
      quality_score?: { score: string };
      components?: unknown[];
      rejected_reason?: string;
      previous_category?: string;
      parameter_format?: string;
    };
    const row = {
      client_id: access.clientId,
      whatsapp_account_id: waba.account.id,
      meta_id: t.id,
      name: t.name,
      language: t.language,
      category: t.category ?? "UTILITY",
      status: t.status ?? "PENDING",
      quality: (t.quality_score?.score as string) ?? "UNKNOWN",
      components: t.components ?? [],
      parameter_format: t.parameter_format ?? "POSITIONAL",
      rejection_reason: t.rejected_reason ?? null,
      previous_category: t.previous_category ?? null,
      synced_at: new Date().toISOString(),
    };

    const existed = existingSet.has(`${t.name}::${t.language}`);

    const { error } = await supabaseAdmin
      .from("cm_wa_templates")
      .upsert(row, { onConflict: "whatsapp_account_id,name,language" });
    if (error) {
      failed++;
      continue;
    }

    if (existed) updated++;
    else created++;
  }

  return NextResponse.json({
    synced: collected.length,
    created,
    updated,
    failed,
    truncated: Boolean(cursor), // true si hay más templates en Meta que no trajimos
  });
}
