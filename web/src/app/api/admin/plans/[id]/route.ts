import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySuperAdmin } from "@/lib/admin/verify-super-admin";
import {
  syncPlanEntitlements,
  syncPlanPrice,
} from "@/lib/billing/admin-plans";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifySuperAdmin())) {
    return Response.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await request.json()) as Record<string, unknown>;
  const allowed: Record<string, unknown> = {};
  for (const key of [
    "name",
    "description",
    "status",
    "is_public",
    "max_agents",
    "max_contacts",
    "max_broadcasts_per_month",
    "max_chatbot_flows",
    "ai_enabled",
    "price_monthly",
  ]) {
    if (body[key] !== undefined) allowed[key] = body[key];
  }

  const admin = createAdminClient();
  const { data: plan, error } = await admin
    .from("plans")
    .update(allowed)
    .eq("id", id)
    .select()
    .single();
  if (error || !plan) {
    return Response.json(
      { error: error?.message || "Plan no encontrado" },
      { status: error?.code === "PGRST116" ? 404 : 500 }
    );
  }

  try {
    await syncPlanEntitlements(id, { ...plan, ...body });
    if (body.price_monthly !== undefined) await syncPlanPrice(id, body);
  } catch (syncError) {
    const message =
      syncError instanceof Error ? syncError.message : "Error configurando plan";
    return Response.json({ error: message }, { status: 500 });
  }

  return Response.json({ plan });
}
