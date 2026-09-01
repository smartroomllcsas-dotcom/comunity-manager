/**
 * POST /api/whatsapp/cloud/brochure  (multipart: clientId, file)
 *   Sube el catálogo/brochure de una empresa a un bucket público y guarda la
 *   URL en cm_lead_agent_settings. Límite 5 MB (WhatsApp entrega hasta 100 MB
 *   pero un brochure liviano llega mejor). Tipos: PDF, JPG, PNG.
 *
 * DELETE /api/whatsapp/cloud/brochure?clientId=<uuid>
 *   Quita el brochure (borra del storage + limpia columnas).
 *
 * Multi-tenant: getCmClientAccess() — mismo rail que el resto de rutas cloud.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCmClientAccess } from "@/lib/cm-client-access";

const BUCKET = "lead-brochures";
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

async function ensureBucket() {
  const { data: buckets } = await supabaseAdmin.storage.listBuckets();
  if (!buckets?.some((b: { name: string }) => b.name === BUCKET)) {
    await supabaseAdmin.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_SIZE,
    });
  }
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "multipart requerido" }, { status: 400 });

  const clientId = String(form.get("clientId") || "");
  if (!clientId) return NextResponse.json({ error: "clientId requerido" }, { status: 400 });

  const access = await getCmClientAccess(request, clientId);
  if (!access) return NextResponse.json({ error: "No autorizado para esta marca" }, { status: 403 });

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB. Máximo 5 MB.` },
      { status: 413 }
    );
  }
  const ext = ALLOWED[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "Formato no permitido. Usa PDF, JPG o PNG." },
      { status: 415 }
    );
  }

  await ensureBucket();
  const buffer = Buffer.from(await file.arrayBuffer());
  const safeName = (file.name || `catalogo.${ext}`).replace(/[^\w.\-]+/g, "_").slice(-80);
  const storagePath = `${access.clientId}/${Date.now()}_${safeName}`;

  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: file.type, upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath);

  const { error: dbErr } = await supabaseAdmin
    .from("cm_lead_agent_settings")
    .upsert(
      {
        client_id: access.clientId,
        brochure_url: pub.publicUrl,
        brochure_filename: safeName,
      },
      { onConflict: "client_id" }
    );
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  return NextResponse.json({ brochure_url: pub.publicUrl, brochure_filename: safeName });
}

export async function DELETE(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId requerido" }, { status: 400 });

  const access = await getCmClientAccess(request, clientId);
  if (!access) return NextResponse.json({ error: "No autorizado para esta marca" }, { status: 403 });

  const { data: row } = await supabaseAdmin
    .from("cm_lead_agent_settings")
    .select("brochure_url")
    .eq("client_id", access.clientId)
    .maybeSingle();

  // Best-effort remove del storage (el path es lo que sigue a /BUCKET/)
  const url = row?.brochure_url as string | undefined;
  if (url) {
    const marker = `/${BUCKET}/`;
    const idx = url.indexOf(marker);
    if (idx >= 0) {
      const p = decodeURIComponent(url.slice(idx + marker.length).split("?")[0]);
      await supabaseAdmin.storage.from(BUCKET).remove([p]).catch(() => null);
    }
  }

  await supabaseAdmin
    .from("cm_lead_agent_settings")
    .update({ brochure_url: null, brochure_filename: null, brochure_mode: "off" })
    .eq("client_id", access.clientId);

  return NextResponse.json({ ok: true });
}
