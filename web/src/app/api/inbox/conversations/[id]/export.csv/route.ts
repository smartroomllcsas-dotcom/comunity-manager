// Export CSV de todos los mensajes de una conversación. Bearer $CRON_SECRET.
// Útil para auditorías, compliance y hand-offs.
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_ROWS = 10_000;

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = request.headers.get("authorization");
  if (bearer === `Bearer ${secret}`) return true;
  return request.headers.get("x-cron-secret") === secret;
}

function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function contentPreview(content: unknown): string {
  if (!content || typeof content !== "object") return "";
  const c = content as { type?: string; text?: string; caption?: string; url?: string; filename?: string; template_name?: string };
  if (c.type === "text") return c.text ?? "";
  if (c.type === "template") return `[template ${c.template_name ?? ""}]`;
  if (c.type === "image" || c.type === "video" || c.type === "audio") {
    return `[${c.type}${c.caption ? ` · ${c.caption}` : ""} · ${c.url ?? ""}]`;
  }
  if (c.type === "document") return `[document ${c.filename ?? ""} · ${c.url ?? ""}]`;
  if (c.type === "sticker") return `[sticker ${c.url ?? ""}]`;
  return `[${c.type ?? "unknown"}]`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const admin = createAdminClient("smarttalk");
  const { data: conv } = await admin
    .from("conversations")
    .select("id, organization_id")
    .eq("id", id)
    .maybeSingle();
  if (!conv) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: rows, error } = await admin
    .from("messages")
    .select("id, created_at, direction, type, content, wa_message_id, status, is_bot, agent:agents(name)")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })
    .limit(MAX_ROWS);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const header = [
    "id",
    "created_at",
    "direction",
    "type",
    "status",
    "is_bot",
    "agent_name",
    "wa_message_id",
    "content_preview",
  ];

  const lines = [header.join(",")];
  for (const row of rows ?? []) {
    const agent = (row.agent as { name?: string } | null | undefined)?.name ?? "";
    lines.push(
      [
        row.id,
        row.created_at,
        row.direction,
        row.type,
        row.status,
        row.is_bot,
        agent,
        row.wa_message_id ?? "",
        contentPreview(row.content),
      ]
        .map(csvEscape)
        .join(",")
    );
  }

  const csv = lines.join("\n");
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="conversation-${id}-messages.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
