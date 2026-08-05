import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_STATUSES = new Set(["online", "away", "offline"]);

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
  const status = typeof body?.status === "string" ? body.status : "";
  if (!ALLOWED_STATUSES.has(status)) {
    return Response.json({ error: "Invalid status" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("agents")
    .update({ status })
    .eq("id", user.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ success: true, status });
}
