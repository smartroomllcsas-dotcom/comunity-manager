// Añadir / quitar tags de un contacto. Bearer $CRON_SECRET.
// POST body: { add?: string[], remove?: string[] }.
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_TAG_LEN = 40;
const MAX_TAGS = 30;

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = request.headers.get("authorization");
  if (bearer === `Bearer ${secret}`) return true;
  return request.headers.get("x-cron-secret") === secret;
}

function sanitize(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((v): v is string => typeof v === "string")
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length <= MAX_TAG_LEN);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as {
    add?: string[];
    remove?: string[];
  };
  const add = sanitize(body.add);
  const remove = sanitize(body.remove);
  if (add.length === 0 && remove.length === 0) {
    return NextResponse.json({ error: "add o remove requerido" }, { status: 400 });
  }

  const admin = createAdminClient("smarttalk");
  const { data: current, error: fetchErr } = await admin
    .from("contacts")
    .select("id, tags")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const currentTags = Array.isArray(current.tags) ? (current.tags as string[]) : [];
  const removeSet = new Set(remove);
  const merged = new Set(currentTags.filter((t) => !removeSet.has(t)));
  add.forEach((t) => merged.add(t));
  const finalTags = [...merged].slice(0, MAX_TAGS);

  const { error: updateErr } = await admin
    .from("contacts")
    .update({ tags: finalTags })
    .eq("id", id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    id,
    tags: finalTags,
    added: add.filter((t) => !currentTags.includes(t)),
    removed: currentTags.filter((t) => removeSet.has(t)),
  });
}
