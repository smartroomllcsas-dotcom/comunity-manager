/**
 * Conexión de publicación y anuncios de una empresa.
 *
 * GET    ?clientId=   → estado (sin el token)
 * PATCH  { clientId, adAccountId } → cambia la cuenta publicitaria elegida
 * DELETE ?clientId=   → desconecta (borra el token guardado)
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCmClientAccess } from "@/lib/cm-client-access";
import { getAdsConnection, selectAdAccount, disconnectAds } from "@/lib/meta/ads-connection";

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId requerido" }, { status: 400 });
  const access = await getCmClientAccess(request, clientId);
  if (!access) return NextResponse.json({ error: "No autorizado para esta empresa" }, { status: 403 });
  return NextResponse.json({ connection: await getAdsConnection(access.clientId) });
}

const patchSchema = z.object({ clientId: z.string().uuid(), adAccountId: z.string().min(1).max(40) });

export async function PATCH(request: NextRequest) {
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Validación fallida" }, { status: 422 });
  const access = await getCmClientAccess(request, parsed.data.clientId);
  if (!access) return NextResponse.json({ error: "No autorizado para esta empresa" }, { status: 403 });

  const result = await selectAdAccount(access.clientId, parsed.data.adAccountId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json({ connection: result.connection });
}

export async function DELETE(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId requerido" }, { status: 400 });
  const access = await getCmClientAccess(request, clientId);
  if (!access) return NextResponse.json({ error: "No autorizado para esta empresa" }, { status: 403 });

  const result = await disconnectAds(access.clientId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
