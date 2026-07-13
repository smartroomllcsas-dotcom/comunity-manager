// Bulk tag: aplica add/remove a un conjunto de contactos de una org.
// Bearer $CRON_SECRET. Cap 500 contactos por call.
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_CONTACTS = 500;
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

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    organization_id?: string;
    contact_ids?: string[];
    add?: string[];
    remove?: string[];
  };

  if (!body.organization_id) {
    return NextResponse.json({ error: "organization_id requerido" }, { status: 400 });
  }
  const contactIds = Array.isArray(body.contact_ids)
    ? body.contact_ids.filter((v): v is string => typeof v === "string")
    : [];
  if (contactIds.length === 0) {
    return NextResponse.json({ error: "contact_ids requerido" }, { status: 400 });
  }
  if (contactIds.length > MAX_CONTACTS) {
    return NextResponse.json(
      { error: `máximo ${MAX_CONTACTS} contactos por call` },
      { status: 400 }
    );
  }
  const add = sanitize(body.add);
  const remove = sanitize(body.remove);
  if (add.length === 0 && remove.length === 0) {
    return NextResponse.json({ error: "add o remove requerido" }, { status: 400 });
  }

  const admin = createAdminClient("smarttalk");
  const { data: current, error: fetchErr } = await admin
    .from("contacts")
    .select("id, tags")
    .eq("organization_id", body.organization_id)
    .in("id", contactIds);
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

  const rows = current ?? [];
  const removeSet = new Set(remove);
  let updated = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const currentTags = Array.isArray(row.tags) ? (row.tags as string[]) : [];
    const merged = new Set(currentTags.filter((t) => !removeSet.has(t)));
    add.forEach((t) => merged.add(t));
    const finalTags = [...merged].slice(0, MAX_TAGS);

    const { error } = await admin.from("contacts").update({ tags: finalTags }).eq("id", row.id);
    if (error) errors.push(`${row.id}:${error.message}`);
    else updated += 1;
  }

  return NextResponse.json({
    ok: errors.length === 0,
    organization_id: body.organization_id,
    requested: contactIds.length,
    matched: rows.length,
    updated,
    errors: errors.slice(0, 10),
  });
}
