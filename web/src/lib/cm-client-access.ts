import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mysqlQuery, quoteId } from "@/lib/mysql";

interface CmClientAccess {
  clientId: string;
  cmUserId: string;
  organizationId: string | null;
}

function isLocalMysql() {
  return (
    process.env.NODE_ENV !== "production" &&
    (process.env.NEXT_PUBLIC_DB_PROVIDER || "").toLowerCase() === "mysql"
  );
}

export async function getCmClientAccess(
  request: NextRequest,
  clientId: string
): Promise<CmClientAccess | null> {
  if (isLocalMysql()) {
    const cmUserId = request.cookies.get("cm_user_id")?.value;
    if (!cmUserId) return null;
    const rows = await mysqlQuery<Array<{ id: string }>>(
      `SELECT ${quoteId("id")} FROM ${quoteId("cm_clients")} WHERE ${quoteId("id")} = ? AND ${quoteId("user_id")} = ? LIMIT 1`,
      [clientId, cmUserId]
    );
    return rows[0]
      ? {
          clientId: rows[0].id,
          cmUserId,
          organizationId: null,
        }
      : null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const publicAdmin = createAdminClient("public");
  const smarttalkAdmin = createAdminClient();
  const [{ data: cmUser }, { data: agent }] = await Promise.all([
    publicAdmin
      .from("cm_users")
      .select("id")
      .eq("email", user.email.toLowerCase())
      .maybeSingle(),
    smarttalkAdmin
      .from("agents")
      .select("id, organization_id, member_type")
      .eq("id", user.id)
      .maybeSingle(),
  ]);
  if (!cmUser) return null;

  const { data: client } = await publicAdmin
    .from("cm_clients")
    .select("id, user_id, smarttalk_organization_id")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) return null;
  const ownsClient = client.user_id === cmUser.id;
  const belongsToAgency =
    Boolean(agent?.organization_id) &&
    client.smarttalk_organization_id === agent?.organization_id;
  if (!ownsClient && !belongsToAgency) return null;
  if (agent?.member_type === "brand_advisor") {
    const { data: assignment } = await smarttalkAdmin
      .from("brand_advisor_assignments")
      .select("id")
      .eq("agent_id", agent.id)
      .eq("brand_id", client.id)
      .maybeSingle();
    if (!assignment) return null;
  }

  return {
    clientId: client.id,
    cmUserId: cmUser.id,
    organizationId: client.smarttalk_organization_id || null,
  };
}
