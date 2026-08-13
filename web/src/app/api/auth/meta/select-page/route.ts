/**
 * Selección explícita de página tras el OAuth de Meta.
 *
 *   GET  ?selection=<id>  → candidatos que ve la pantalla de selección
 *   POST { selection, pageId } → conecta la página elegida
 *
 * Lo que esta ruta **no** hace, y es lo importante: no devuelve tokens. Los
 * candidatos salen de la columna `candidates`, que sólo contiene nombre, id y
 * —en el flujo de Instagram— la cuenta asociada. Los tokens viven cifrados en
 * `payload_ciphertext` y no salen de la capa de servidor.
 *
 * Autorización, en tres capas que se aplican todas:
 *   1. Sesión válida.
 *   2. La selección pertenece a este `cm_user_id` y a esta organización — el
 *      filtro va en la consulta, así que una selección ajena responde igual que
 *      una inexistente.
 *   3. El usuario sigue teniendo acceso a la marca destino.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCmClientAccess } from "@/lib/cm-client-access";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  consumePendingSelection,
  loadPendingSelection,
  pickPage,
} from "@/lib/meta/page-selection";
import { findAssetConflict } from "@/lib/meta/asset-conflicts";
import { finalizeMetaConnection } from "@/lib/meta-oauth-handler";

function notFound() {
  return NextResponse.json({ error: "Selección no encontrada o expirada." }, { status: 404 });
}

/**
 * Acceso del usuario a la marca de la selección.
 *
 * Se carga la selección **primero** para saber a qué marca pertenece, y luego
 * se comprueba el acceso a esa marca: al revés habría que confiar en un
 * `clientId` que viene del cliente.
 */
async function resolveSelection(request: NextRequest, selectionId: string) {
  if (!selectionId) return null;

  // La organización se obtiene de la sesión, no del parámetro.
  const publicAdmin = createAdminClient("public");
  const { data: row } = await publicAdmin
    .from("cm_oauth_pending_selections")
    .select("client_id")
    .eq("id", selectionId)
    .maybeSingle();
  if (!row) return null;

  const clientId = (row as { client_id: string }).client_id;
  const access = await getCmClientAccess(request, clientId);
  if (!access?.organizationId) return null;
  // Se estrecha aquí para no arrastrar `string | null` por toda la ruta: sin
  // organización no hay nada que resolver, y ya se descartó arriba.
  const organizationId: string = access.organizationId;

  const selection = await loadPendingSelection({
    selectionId,
    cmUserId: access.cmUserId,
    organizationId,
  });
  if (!selection) return null;

  return { access: { cmUserId: access.cmUserId, organizationId }, selection };
}

export async function GET(request: NextRequest) {
  const selectionId = request.nextUrl.searchParams.get("selection") || "";
  const resolved = await resolveSelection(request, selectionId);
  if (!resolved) return notFound();

  const { access, selection } = resolved;

  const publicAdmin = createAdminClient("public");
  const { data: brand } = await publicAdmin
    .from("cm_clients")
    .select("id, name")
    .eq("id", selection.clientId)
    .maybeSingle();

  // Cada candidato se acompaña de si ya está ocupado y por quién, para poder
  // deshabilitarlo en la interfaz en vez de dejar que el usuario lo intente y
  // reciba un error después.
  const candidates = await Promise.all(
    selection.candidates.map(async (candidate) => {
      const conflict = await findAssetConflict({
        kind: "facebook_page",
        assetId: candidate.id,
        organizationId: access.organizationId,
        brandId: selection.clientId,
      });
      const igConflict = candidate.instagramId
        ? await findAssetConflict({
            kind: "instagram_account",
            assetId: candidate.instagramId,
            organizationId: access.organizationId,
            brandId: selection.clientId,
          })
        : null;
      const blocking = conflict || igConflict;
      return {
        ...candidate,
        disabled: Boolean(blocking),
        disabledReason: blocking?.message || null,
        connectedToBrand: blocking?.brandName || null,
      };
    }),
  );

  return NextResponse.json({
    selection: {
      id: selection.id,
      flow: selection.flow,
      brand: { id: selection.clientId, name: (brand as { name?: string } | null)?.name || null },
      candidates,
    },
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | { selection?: string; pageId?: string }
    | null;

  const selectionId = typeof body?.selection === "string" ? body.selection : "";
  const pageId = typeof body?.pageId === "string" ? body.pageId : "";
  if (!selectionId || !pageId) {
    return NextResponse.json({ error: "selection y pageId son requeridos." }, { status: 400 });
  }

  const resolved = await resolveSelection(request, selectionId);
  if (!resolved) return notFound();

  const { access, selection } = resolved;

  // La página tiene que ser una de las que Meta devolvió en ESTE flujo. Sin
  // esto, un identificador arbitrario podría intentar conectarse.
  const page = pickPage(selection, pageId);
  if (!page) {
    return NextResponse.json(
      { error: "La página seleccionada no pertenece a esta autorización." },
      { status: 400 },
    );
  }

  const igAccount =
    selection.flow === "facebook" ? null : page.instagram_business_account || null;

  // Una sola vez, de verdad: el UPDATE condicionado dice si ESTA petición fue
  // la que consumió la selección. Si no lo fue, otra ya está conectando —o ya
  // conectó— y aquí no se finaliza nada.
  const consumed = await consumePendingSelection(selection.id);
  if (!consumed) {
    return NextResponse.json(
      { error: "Esta selección ya se está procesando o ya se utilizó.", code: "already_consumed" },
      { status: 409 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const response = await finalizeMetaConnection({
    appUrl,
    clientId: selection.clientId,
    access: { organizationId: access.organizationId, cmUserId: access.cmUserId },
    flow: selection.flow,
    page,
    igAccount,
    // El token largo se recupera descifrado del lado servidor; nunca se envía.
    longToken: { access_token: selection.secret.userAccessToken },
    profile: { id: selection.secret.profileId },
  });

  // `finalizeMetaConnection` devuelve una redirección pensada para el callback.
  // Aquí la petición es fetch, así que se traduce a JSON con el destino.
  const location = response.headers.get("location");
  return NextResponse.json({ ok: true, redirectTo: location || `${appUrl}/clients` });
}
