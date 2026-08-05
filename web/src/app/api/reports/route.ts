// Sprint 26 · Agente P — POST /api/reports (generar) + GET (listar).
//
// POST /api/reports
//   Auth: Supabase cookie → user requerido.
//   Rate-limit: 20/min por user.
//   Payload:
//     {
//       client_id: uuid,
//       period_type: 'weekly'|'monthly'|'quarterly'|'custom',
//       period_start: 'YYYY-MM-DD',
//       period_end:   'YYYY-MM-DD',
//       branding?: { logo_url?, primary_color?, secondary_color?, agency_name?, agency_footer? },
//       include_insights?: boolean (default true),
//       send_to_email?: string
//     }
//   Steps:
//     1. Fetch data desde /api/analytics (interno) mapeando el rango a días.
//     2. Adaptar payload → ReportData.
//     3. (opcional) Anthropic → insights bullets.
//     4. buildReportPdf → Buffer.
//     5. Upload a Supabase Storage bucket `cm-assets` en reports/<org>/<id>.pdf.
//     6. Insert cm_reports row (status='generated'). Si email → status='sent'
//        (send-side es stub por ahora — hay TODO explícito).
//     7. Retorna { id, public_url, size_bytes }.
//
// GET /api/reports
//   Auth: cookie. Rate-limit 60/min. Filtros: client_id, limit, status.

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { rateLimit } from "@/lib/rate-limit";
import { buildReportPdf, type ReportData, type ReportBranding } from "@/lib/reports/pdf-builder";
import { generateReportInsights } from "@/lib/reports/insights-generator";
import { BILLING_FEATURES } from "@/lib/billing/features";
import { billingDeniedResponse, checkBillingFeature } from "@/lib/billing/service";

// @react-pdf/renderer requiere Node runtime (no edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORAGE_BUCKET = process.env.CM_REPORTS_BUCKET || "cm-assets";
const MAX_PDF_MB = 5;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function getPublicAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("reports: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are required");
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

function baseUrl(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (env) return env.replace(/\/+$/, "");
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

function diffDays(start: string, end: string): number {
  try {
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    return Math.max(1, Math.ceil((e - s) / 86_400_000));
  } catch {
    return 30;
  }
}

interface ReportRequest {
  client_id: string;
  period_type: "weekly" | "monthly" | "quarterly" | "custom";
  period_start: string;
  period_end: string;
  branding?: Partial<Record<
    "logo_url" | "primary_color" | "secondary_color" | "agency_name" | "agency_footer",
    string
  >>;
  include_insights?: boolean;
  send_to_email?: string;
}

function validate(body: unknown): { ok: true; value: ReportRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Body inválido" };
  const b = body as Record<string, unknown>;
  const client_id = typeof b.client_id === "string" ? b.client_id : "";
  if (!client_id) return { ok: false, error: "client_id requerido" };
  const period_type = b.period_type as ReportRequest["period_type"];
  if (!["weekly", "monthly", "quarterly", "custom"].includes(period_type)) {
    return { ok: false, error: "period_type inválido" };
  }
  const period_start = typeof b.period_start === "string" ? b.period_start : "";
  const period_end = typeof b.period_end === "string" ? b.period_end : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(period_start) || !/^\d{4}-\d{2}-\d{2}$/.test(period_end)) {
    return { ok: false, error: "period_start / period_end deben ser YYYY-MM-DD" };
  }
  return {
    ok: true,
    value: {
      client_id,
      period_type,
      period_start,
      period_end,
      branding: (b.branding as ReportRequest["branding"]) || undefined,
      include_insights: b.include_insights !== false,
      send_to_email:
        typeof b.send_to_email === "string" && b.send_to_email.trim().includes("@")
          ? b.send_to_email.trim()
          : undefined,
    },
  };
}

// -----------------------------------------------------------------------------
// Mapping /api/analytics → ReportData
// -----------------------------------------------------------------------------

interface AnalyticsResp {
  range?: string;
  days?: number;
  summary?: {
    impressions: number;
    engagement: number;
    growth: number;
    top_platform: string | null;
    posts_published: number;
  };
  by_platform?: Array<{ platform: string; impressions: number; engagement: number; posts: number }>;
  top_posts?: Array<{
    post_id: string;
    platform: string;
    impressions: number;
    likes: number; comments: number; shares: number; saves: number; clicks: number;
    engagement_rate: number;
    snapshot_at: string;
  }>;
  timeseries?: Array<{ date: string; impressions: number; engagement: number }>;
}

async function fetchAnalytics(
  req: NextRequest,
  clientId: string,
  days: number,
): Promise<AnalyticsResp> {
  // Escoge un rango cuantizado que el endpoint acepta.
  const range = days <= 7 ? "7d" : days <= 30 ? "30d" : "90d";
  const cookieStr = req.headers.get("cookie") ?? "";
  const url = `${baseUrl(req)}/api/analytics?range=${range}&client_id=${encodeURIComponent(clientId)}`;
  const res = await fetch(url, {
    headers: cookieStr ? { cookie: cookieStr } : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`analytics fetch fallo (${res.status})`);
  }
  return (await res.json()) as AnalyticsResp;
}

function buildReportData(
  clientName: string,
  request: ReportRequest,
  analytics: AnalyticsResp,
  branding: ReportBranding,
  insights: string[],
): ReportData {
  const byPlatform = (analytics.by_platform ?? []).map((r) => ({
    platform: r.platform,
    impressions: r.impressions,
    engagement: r.engagement,
    engagementRate: r.impressions > 0 ? r.engagement / r.impressions : 0,
  }));

  const topPosts = (analytics.top_posts ?? []).map((p) => ({
    platform: p.platform,
    content: `Post ${p.post_id.slice(0, 8)} — publicado ${new Date(p.snapshot_at).toLocaleDateString("es-ES")}`,
    thumbnail: undefined,
    impressions: p.impressions,
    engagement: p.likes + p.comments + p.shares + p.saves,
    url: undefined,
  }));

  return {
    branding,
    client: { name: clientName },
    period: {
      type: request.period_type,
      start: request.period_start,
      end: request.period_end,
    },
    summary: {
      impressions: analytics.summary?.impressions ?? 0,
      engagement: analytics.summary?.engagement ?? 0,
      followersGrowth: analytics.summary?.growth ?? 0,
      postsPublished: analytics.summary?.posts_published ?? 0,
    },
    byPlatform,
    topPosts,
    timeseries: analytics.timeseries ?? [],
    insights,
  };
}

// -----------------------------------------------------------------------------
// Storage upload
// -----------------------------------------------------------------------------

async function uploadPdf(
  admin: ReturnType<typeof getPublicAdmin>,
  path: string,
  buf: Buffer,
): Promise<{ storagePath: string; publicUrl: string | null }> {
  const { error: upErr } = await admin.storage
    .from(STORAGE_BUCKET)
    .upload(path, buf, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (upErr) throw new Error(`storage upload: ${upErr.message}`);

  // Intento URL pública; si el bucket es privado, la agencia consumirá /api/reports/[id].
  const { data: pub } = admin.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return { storagePath: path, publicUrl: pub?.publicUrl ?? null };
}

// -----------------------------------------------------------------------------
// Notify (stub — email real vive en lib/notify de otro agente)
// -----------------------------------------------------------------------------

async function sendReportEmail(
  to: string,
  publicUrl: string | null,
  clientName: string,
  branding: ReportBranding,
): Promise<{ ok: boolean; note: string }> {
  // Best-effort: si existe una lib de notify, la usamos; si no, dejamos TODO.
  try {
    // Import dinámico para no romper si el módulo no existe todavía.
    // @ts-expect-error módulo opcional — lo integra otro agente cuando esté listo
    const mod: unknown = await import("@/lib/notify").catch(() => null);
    if (
      mod && typeof mod === "object" &&
      "sendReportEmail" in mod &&
      typeof (mod as { sendReportEmail: unknown }).sendReportEmail === "function"
    ) {
      const fn = (mod as { sendReportEmail: (args: Record<string, unknown>) => Promise<unknown> }).sendReportEmail;
      await fn({ to, publicUrl, clientName, branding });
      return { ok: true, note: "sent-via-notify-lib" };
    }
  } catch (e) {
    return { ok: false, note: `notify-lib error: ${e instanceof Error ? e.message : String(e)}` };
  }
  // Stub: dejamos constancia pero no fallamos el generate.
  console.warn(`[reports] TODO: envío por email a ${to} — lib/notify no expone sendReportEmail`);
  return { ok: false, note: "notify-lib-not-integrated" };
}

// -----------------------------------------------------------------------------
// POST — generate
// -----------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit(`reports:post:${user.id}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retry_after_seconds: rl.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  const v = validate(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const request = v.value;

  const admin = getPublicAdmin();
  const started = Date.now();

  // 1) Cliente + org
  const { data: client, error: cErr } = await admin
    .from("cm_clients")
    .select("id, name, organization_id, brand_name")
    .eq("id", request.client_id)
    .maybeSingle();
  if (cErr || !client) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  // 1.b) Billing enforcement (reportes): reports.access requiere suscripción
  // activa y que el plan habilite la generación de reportes. El superadmin
  // queda sin límites (checkBillingFeature lo resuelve).
  const reportsOrgId =
    (client as { organization_id: string | null }).organization_id ?? null;
  const reportsDecision = reportsOrgId
    ? await checkBillingFeature({
        organizationId: reportsOrgId,
        featureCode: BILLING_FEATURES.REPORTS_ACCESS,
        source: "api/reports",
      })
    : null;
  if (reportsDecision && !reportsDecision.allowed) {
    return billingDeniedResponse(reportsDecision);
  }

  // 2) Branding — merge request → defaults
  const branding: ReportBranding = {
    logoUrl: request.branding?.logo_url,
    primaryColor: request.branding?.primary_color || "#1f2937",
    secondaryColor: request.branding?.secondary_color || "#3b82f6",
    agencyName: request.branding?.agency_name || "Community Manager Platform",
    agencyFooter: request.branding?.agency_footer || "Reporte generado automáticamente",
  };

  // 3) Analytics
  let analytics: AnalyticsResp;
  try {
    analytics = await fetchAnalytics(req, request.client_id, diffDays(request.period_start, request.period_end));
  } catch (e) {
    return NextResponse.json(
      { error: `No pude cargar analytics: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }

  // 4) Insights (opcional)
  let insights: string[] = [];
  let insightsCost = 0;
  if (request.include_insights && process.env.ANTHROPIC_API_KEY) {
    const anthClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const insightsData = {
      client: { name: (client as { name: string }).name },
      period: { type: request.period_type, start: request.period_start, end: request.period_end },
      summary: {
        impressions: analytics.summary?.impressions ?? 0,
        engagement: analytics.summary?.engagement ?? 0,
        followersGrowth: analytics.summary?.growth ?? 0,
        postsPublished: analytics.summary?.posts_published ?? 0,
      },
      byPlatform: (analytics.by_platform ?? []).map((r) => ({
        platform: r.platform,
        impressions: r.impressions,
        engagement: r.engagement,
        engagementRate: r.impressions > 0 ? r.engagement / r.impressions : 0,
      })),
      topPosts: (analytics.top_posts ?? []).slice(0, 5).map((p) => ({
        platform: p.platform,
        content: `Post ${p.post_id.slice(0, 8)}`,
        impressions: p.impressions,
        engagement: p.likes + p.comments + p.shares + p.saves,
      })),
      timeseries: analytics.timeseries ?? [],
    };
    insights = await generateReportInsights(insightsData, anthClient);
    // Estimación rápida (input ~1000 tok, output ~350 tok, sonnet 4.5 pricing)
    insightsCost = 1000 / 1_000_000 * 3 + 350 / 1_000_000 * 15;
  }

  // 5) Build PDF
  const report = buildReportData(
    (client as { name: string }).name,
    request,
    analytics,
    branding,
    insights,
  );
  const buffer = await buildReportPdf(report);
  const sizeMb = buffer.byteLength / (1024 * 1024);
  if (sizeMb > MAX_PDF_MB) {
    console.warn(`[reports] PDF de ${sizeMb.toFixed(2)}MB supera warning threshold (${MAX_PDF_MB}MB) — cliente=${request.client_id}`);
  }

  // 6) Storage
  const orgId = (client as { organization_id: string }).organization_id;
  const reportId = crypto.randomUUID();
  const storagePath = `reports/${orgId}/${reportId}.pdf`;
  let publicUrl: string | null = null;
  try {
    const uploaded = await uploadPdf(admin, storagePath, buffer);
    publicUrl = uploaded.publicUrl;
  } catch (e) {
    console.error("[reports] upload fallo:", e);
    return NextResponse.json(
      { error: `Upload storage fallo: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }

  // 7) Email (opcional)
  let status: "generated" | "sent" | "failed" = "generated";
  let sentAt: string | null = null;
  let sentNote = "";
  if (request.send_to_email) {
    const emailResult = await sendReportEmail(
      request.send_to_email,
      publicUrl,
      (client as { name: string }).name,
      branding,
    );
    if (emailResult.ok) {
      status = "sent";
      sentAt = new Date().toISOString();
    }
    sentNote = emailResult.note;
  }

  // 8) Insert row
  const { data: inserted, error: insErr } = await admin
    .from("cm_reports")
    .insert({
      id: reportId,
      client_id: request.client_id,
      organization_id: orgId,
      period_type: request.period_type,
      period_start: request.period_start,
      period_end: request.period_end,
      status,
      branding: {
        logo_url: branding.logoUrl,
        primary_color: branding.primaryColor,
        secondary_color: branding.secondaryColor,
        agency_name: branding.agencyName,
        agency_footer: branding.agencyFooter,
      },
      storage_path: storagePath,
      public_url: publicUrl,
      size_bytes: buffer.byteLength,
      sent_to_email: request.send_to_email ?? null,
      sent_at: sentAt,
      metadata: {
        include_insights: request.include_insights,
        insights_generated: insights.length,
        insights_cost_usd: Number(insightsCost.toFixed(4)),
        generation_ms: Date.now() - started,
        email_note: sentNote || undefined,
      },
      generated_by: user.id,
    })
    .select("id, public_url, size_bytes, status")
    .single();

  if (insErr) {
    console.error("[reports] insert fallo:", insErr);
    return NextResponse.json({ error: "DB insert fallo", detail: insErr.message }, { status: 500 });
  }

  return NextResponse.json({
    id: inserted.id,
    public_url: inserted.public_url,
    size_bytes: inserted.size_bytes,
    status: inserted.status,
    insights_included: insights.length,
  });
}

// -----------------------------------------------------------------------------
// GET — list
// -----------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit(`reports:get:${user.id}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const url = new URL(req.url);
  const clientId = url.searchParams.get("client_id") || undefined;
  const status = url.searchParams.get("status") || undefined;
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));

  const admin = getPublicAdmin();

  // Filtra por org del user via RLS-equivalent (usamos service role, así que
  // resolvemos org del user manualmente).
  const { data: agent } = await admin
    .schema("smarttalk" as unknown as never)
    .from("agents")
    .select("organization_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  const orgId = (agent as { organization_id?: string } | null)?.organization_id;
  if (!orgId) {
    return NextResponse.json({ reports: [] });
  }

  let q = admin
    .from("cm_reports")
    .select("id, client_id, period_type, period_start, period_end, status, public_url, size_bytes, sent_to_email, sent_at, created_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (clientId) q = q.eq("client_id", clientId);
  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) {
    console.warn("[reports] list fallo:", error.message);
    return NextResponse.json({ reports: [] });
  }
  return NextResponse.json({ reports: data ?? [] });
}
