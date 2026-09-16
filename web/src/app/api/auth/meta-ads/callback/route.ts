/**
 * Vuelta del diálogo de publicación y anuncios.
 *
 * Guarda el token cifrado y TODAS las cuentas publicitarias que Meta devuelva,
 * para que después se pueda cambiar de una a otra desde la tarjeta de la marca
 * sin repetir el diálogo.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCmClientAccess } from "@/lib/cm-client-access";
import { encryptToken } from "@/lib/crypto";
import { exchangeCodeForToken, getLongLivedToken, getUserAdAccounts } from "@/lib/meta";
import { saveAdsConnection, type AdAccount } from "@/lib/meta/ads-connection";

function back(appUrl: string, params: Record<string, string>) {
  const q = new URLSearchParams(params);
  return NextResponse.redirect(`${appUrl}/clients?${q}`);
}

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const denied = request.nextUrl.searchParams.get("error");

  if (denied) {
    return back(appUrl, { ads_error: "Cancelaste el permiso en Meta." });
  }
  if (!code || !state) {
    return back(appUrl, { ads_error: "Meta no devolvió el código de conexión." });
  }

  const { data: stateRow } = await supabaseAdmin
    .from("cm_oauth_states")
    .select("client_id")
    .eq("state", state)
    .maybeSingle();
  if (!stateRow?.client_id) {
    return back(appUrl, { ads_error: "La conexión caducó. Vuelve a intentarlo." });
  }
  await supabaseAdmin.from("cm_oauth_states").delete().eq("state", state);

  const clientId = stateRow.client_id as string;
  const access = await getCmClientAccess(request, clientId);
  if (!access?.organizationId) {
    return back(appUrl, { ads_error: "No autorizado para esta empresa." });
  }

  try {
    const short = await exchangeCodeForToken(code, `${appUrl}/api/auth/meta-ads/callback`);
    const long = await getLongLivedToken(short.access_token);
    const accounts = ((await getUserAdAccounts(long.access_token)) as Array<Record<string, unknown>>).map(
      (a): AdAccount => ({
        id: String(a.id || ""),
        account_id: String(a.account_id || "").replace(/^act_/, ""),
        name: String(a.name || "Cuenta sin nombre"),
        account_status: typeof a.account_status === "number" ? a.account_status : undefined,
        business_name:
          a.business && typeof a.business === "object"
            ? String((a.business as Record<string, unknown>).name || "") || null
            : null,
      })
    );

    if (accounts.length === 0) {
      return back(appUrl, {
        ads_error:
          "No encontramos ninguna cuenta publicitaria en tu portfolio. Créala en el Administrador comercial y vuelve a intentarlo.",
      });
    }

    const expiresAt = long.expires_in
      ? new Date(Date.now() + Number(long.expires_in) * 1000).toISOString()
      : null;

    const saved = await saveAdsConnection({
      organizationId: access.organizationId,
      brandId: clientId,
      tokenCiphertext: encryptToken(long.access_token),
      expiresAt,
      accounts,
      connectedBy: access.cmUserId,
    });
    if (!saved.ok) return back(appUrl, { ads_error: saved.error });

    return back(appUrl, {
      ads_ok: saved.connection.ad_account_name || "conectado",
      ads_count: String(accounts.length),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "No se pudo completar la conexión";
    return back(appUrl, { ads_error: message.slice(0, 200) });
  }
}
