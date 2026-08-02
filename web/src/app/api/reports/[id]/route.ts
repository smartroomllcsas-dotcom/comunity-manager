// Sprint 26 · Agente P — GET/DELETE report individual.
//
// GET /api/reports/[id]
//   Auth cookie. Streamea el PDF (proxy desde Storage). Content-Disposition
//   = attachment. Fallback: redirect a public_url si ya existe.
//
// DELETE /api/reports/[id]
//   Auth cookie. Borra fila + PDF del Storage.

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORAGE_BUCKET = process.env.CM_REPORTS_BUCKET || "cm-assets";

function getPublicAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("reports/[id]: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are required");
  }
  return createSbClient(url.trim(), key.trim(), {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "public" },
  });
}

async function requireUser() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function loadReport(id: string) {
  const admin = getPublicAdmin();
  const { data, error } = await admin
    .from("cm_reports")
    .select("id, organization_id, storage_path, public_url, size_bytes, client_id, period_start, period_end")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as {
    id: string;
    organization_id: string;
    storage_path: string | null;
    public_url: string | null;
    size_bytes: number | null;
    client_id: string;
    period_start: string;
    period_end: string;
  };
}

async function userInOrg(userId: string, orgId: string): Promise<boolean> {
  const admin = getPublicAdmin();
  const { data } = await admin
    .schema("smarttalk" as unknown as never)
    .from("agents")
    .select("organization_id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  return (data as { organization_id?: string } | null)?.organization_id === orgId;
}

// -----------------------------------------------------------------------------
// GET
// -----------------------------------------------------------------------------

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit(`reports:download:${user.id}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const { id } = await ctx.params;
  const report = await loadReport(id);
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  const allowed = await userInOrg(user.id, report.organization_id);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!report.storage_path) {
    if (report.public_url) return NextResponse.redirect(report.public_url);
    return NextResponse.json({ error: "PDF no disponible" }, { status: 410 });
  }

  const admin = getPublicAdmin();
  const { data: file, error } = await admin.storage
    .from(STORAGE_BUCKET)
    .download(report.storage_path);
  if (error || !file) {
    // fallback: si tenemos public_url usable, redirige.
    if (report.public_url) return NextResponse.redirect(report.public_url);
    return NextResponse.json({ error: `Storage download fallo: ${error?.message || "unknown"}` }, { status: 502 });
  }
  const arrayBuffer = await file.arrayBuffer();
  const filename = `reporte-${report.client_id.slice(0, 8)}-${report.period_end}.pdf`;
  return new NextResponse(arrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(arrayBuffer.byteLength),
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-cache",
    },
  });
}

// -----------------------------------------------------------------------------
// DELETE
// -----------------------------------------------------------------------------

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit(`reports:delete:${user.id}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const { id } = await ctx.params;
  const report = await loadReport(id);
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  const allowed = await userInOrg(user.id, report.organization_id);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = getPublicAdmin();
  if (report.storage_path) {
    await admin.storage.from(STORAGE_BUCKET).remove([report.storage_path]).catch(() => null);
  }
  const { error: delErr } = await admin.from("cm_reports").delete().eq("id", id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
