/**
 * Inicio de la conexión de publicación y anuncios de una marca.
 *
 * Deliberadamente NO reutiliza `initiateMetaOAuth`: ese flujo lleva los
 * permisos del chat y escribe en `channels`. Aquí va otra lista y otra tabla,
 * para que un permiso que Meta rechace rompa este botón y nada más.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { getCmClientAccess } from "@/lib/cm-client-access";
import { ADS_SCOPES } from "@/lib/meta/ads-connection";

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId requerido" }, { status: 400 });
  if (!(await getCmClientAccess(request, clientId))) {
    return NextResponse.json({ error: "No autorizado para esta empresa" }, { status: 403 });
  }
  if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
    return NextResponse.json({ error: "Meta API no configurada" }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  // El prefijo distingue este callback del de los canales al volver de Meta.
  const state = `ads:${clientId}:${crypto.randomBytes(16).toString("hex")}`;
  await supabaseAdmin.from("cm_oauth_states").insert({ state, client_id: clientId });

  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID,
    redirect_uri: `${appUrl}/api/auth/meta-ads/callback`,
    state,
    response_type: "code",
    scope: ADS_SCOPES.join(","),
  });
  return NextResponse.redirect(`https://www.facebook.com/v21.0/dialog/oauth?${params}`);
}
