import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySuperAdmin } from "@/lib/admin/verify-super-admin";
import {
  syncPlanEntitlements,
  syncPlanPrice,
} from "@/lib/billing/admin-plans";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function GET() {
  if (!(await verifySuperAdmin())) {
    return Response.json({ error: "No autorizado" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("plans")
    .select(
      "*, prices:plan_prices(*), entitlements:plan_entitlements(*)"
    )
    .order("created_at", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ plans: data || [] });
}

export async function POST(request: NextRequest) {
  if (!(await verifySuperAdmin())) {
    return Response.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const name = String(body.name || "").trim();
  if (!name) {
    return Response.json({ error: "Nombre requerido" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: plan, error } = await admin
    .from("plans")
    .insert({
      name,
      code: `${slugify(name)}-${Date.now().toString(36)}`,
      description: String(body.description || "") || null,
      status: body.status === "active" ? "active" : "draft",
      is_public: Boolean(body.is_public),
      max_agents: Number(body.max_agents ?? 2),
      max_contacts: Number(body.max_contacts ?? 500),
      max_broadcasts_per_month: Number(
        body.max_broadcasts_per_month ?? 5
      ),
      max_chatbot_flows: Number(body.max_chatbot_flows ?? 3),
      ai_enabled: Boolean(body.ai_enabled),
      price_monthly: Number(body.price_monthly ?? 0),
    })
    .select()
    .single();
  if (error || !plan) {
    return Response.json(
      { error: error?.message || "No se pudo crear el plan" },
      { status: 500 }
    );
  }

  try {
    await syncPlanEntitlements(plan.id, { ...plan, ...body });
    await syncPlanPrice(plan.id, body);
  } catch (syncError) {
    await admin.from("plans").delete().eq("id", plan.id);
    const message =
      syncError instanceof Error ? syncError.message : "Error configurando plan";
    return Response.json({ error: message }, { status: 500 });
  }

  return Response.json({ plan }, { status: 201 });
}
