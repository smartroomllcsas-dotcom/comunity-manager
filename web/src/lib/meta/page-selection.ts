/**
 * Selección explícita de página cuando Meta devuelve más de una.
 *
 * El callback de OAuth ya no decide por el usuario. Cuando hay varios
 * candidatos, guarda aquí lo necesario y manda a una pantalla de selección.
 *
 * Qué viaja al navegador y qué no
 * -------------------------------
 * Al navegador van **sólo** nombre, id de página y —en el flujo de Instagram—
 * el usuario asociado. Los tokens se quedan cifrados en la base
 * (`payload_ciphertext`) y no aparecen en la URL, ni en la respuesta, ni en el
 * log, ni en `localStorage`.
 *
 * Por qué se guardan los tokens en vez de repetir el intercambio
 * -------------------------------------------------------------
 * El `code` de OAuth es de un solo uso: cuando el usuario elige, ya no se puede
 * volver a canjear. O se guardan los tokens ya obtenidos, o habría que mandarlo
 * otra vez por todo el diálogo de Meta.
 *
 * Quién puede consumirla
 * ----------------------
 * El mismo `cm_user_id`, la misma organización y la misma marca que iniciaron
 * el OAuth. Un identificador filtrado no sirve sin esa sesión.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptToken, decryptToken } from "@/lib/crypto";

export type MetaFlow = "facebook" | "facebook_instagram_ads";

/** Lo que ve el navegador. Sin tokens, por construcción del tipo. */
export interface PageCandidate {
  id: string;
  name: string;
  /** Sufijo del id, para distinguir páginas homónimas sin publicar el id entero. */
  idHint: string;
  instagramId?: string | null;
  instagramUsername?: string | null;
}

/** Lo que se queda cifrado en la base. */
interface SelectionSecret {
  userAccessToken: string;
  profileId: string;
  pages: Array<{
    id: string;
    name: string;
    access_token: string;
    instagram_business_account?: { id: string; username?: string } | null;
  }>;
}

const TABLE = "cm_oauth_pending_selections";

/** Últimos 4 caracteres. Suficiente para desambiguar sin exponer el id completo. */
export function idHint(id: string): string {
  const clean = String(id || "");
  return clean.length <= 4 ? clean : `…${clean.slice(-4)}`;
}

export function toCandidates(
  pages: SelectionSecret["pages"],
  flow: MetaFlow,
): PageCandidate[] {
  return pages.map((page) => ({
    id: page.id,
    name: page.name,
    idHint: idHint(page.id),
    // En el flujo de Instagram se muestra también la cuenta asociada: dos
    // páginas con nombre parecido pueden llevar a cuentas distintas, y esa es
    // justamente la confusión que hay que evitar.
    ...(flow === "facebook"
      ? {}
      : {
          instagramId: page.instagram_business_account?.id || null,
          instagramUsername: page.instagram_business_account?.username || null,
        }),
  }));
}

export interface CreateSelectionInput {
  cmUserId: string;
  organizationId: string;
  clientId: string;
  flow: MetaFlow;
  secret: SelectionSecret;
}

/** Guarda los candidatos y devuelve el identificador de la selección. */
export async function createPendingSelection(
  input: CreateSelectionInput,
): Promise<{ ok: true; selectionId: string } | { ok: false; error: string }> {
  const publicAdmin = createAdminClient("public");

  // Purga perezosa: al crear una selección nueva se limpian las caducadas del
  // mismo usuario. Evita un cron para un volumen tan bajo.
  await publicAdmin
    .from(TABLE)
    .delete()
    .eq("cm_user_id", input.cmUserId)
    .lt("expires_at", new Date().toISOString());

  const candidates = toCandidates(input.secret.pages, input.flow);

  const { data, error } = await publicAdmin
    .from(TABLE)
    .insert({
      cm_user_id: input.cmUserId,
      organization_id: input.organizationId,
      client_id: input.clientId,
      flow: input.flow,
      candidates,
      payload_ciphertext: encryptToken(JSON.stringify(input.secret)),
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message || "no se pudo guardar la selección" };
  }
  return { ok: true, selectionId: (data as { id: string }).id };
}

export interface PendingSelection {
  id: string;
  clientId: string;
  organizationId: string;
  flow: MetaFlow;
  candidates: PageCandidate[];
  secret: SelectionSecret;
}

/**
 * Carga una selección pendiente comprobando dueño, organización y vigencia.
 *
 * El filtro por `cm_user_id` va **en la consulta**, no en una comprobación
 * posterior: así una selección ajena es indistinguible de una inexistente.
 */
export async function loadPendingSelection(input: {
  selectionId: string;
  cmUserId: string;
  organizationId: string;
}): Promise<PendingSelection | null> {
  const publicAdmin = createAdminClient("public");
  const { data, error } = await publicAdmin
    .from(TABLE)
    .select("id, client_id, organization_id, flow, candidates, payload_ciphertext, expires_at, consumed_at")
    .eq("id", input.selectionId)
    .eq("cm_user_id", input.cmUserId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as {
    id: string;
    client_id: string;
    organization_id: string;
    flow: MetaFlow;
    candidates: PageCandidate[];
    payload_ciphertext: string;
    expires_at: string;
    consumed_at: string | null;
  };

  if (row.consumed_at) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;

  let secret: SelectionSecret;
  try {
    secret = JSON.parse(decryptToken(row.payload_ciphertext) || "") as SelectionSecret;
  } catch {
    // Sin clave de cifrado o con datos corruptos, la selección es inservible.
    return null;
  }
  if (!secret?.pages?.length) return null;

  return {
    id: row.id,
    clientId: row.client_id,
    organizationId: row.organization_id,
    flow: row.flow,
    candidates: row.candidates || [],
    secret,
  };
}

/**
 * Marca la selección como usada y dice **si fue esta llamada** la que la
 * consumió.
 *
 * La condición `consumed_at IS NULL` va dentro del propio UPDATE y se pide la
 * fila de vuelta. Postgres serializa las escrituras sobre la misma fila, así
 * que de dos peticiones simultáneas exactamente una recibe fila: la otra ve
 * `consumed_at` ya escrito y su `WHERE` no casa.
 *
 * La versión anterior devolvía `void` y quien llamaba continuaba pase lo que
 * pase. Dos POST a la vez —un doble clic basta— podían conectar dos páginas
 * distintas con la misma autorización.
 */
export async function consumePendingSelection(selectionId: string): Promise<boolean> {
  const publicAdmin = createAdminClient("public");
  const { data, error } = await publicAdmin
    .from(TABLE)
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", selectionId)
    .is("consumed_at", null)
    .select("id");

  // Ante un error de escritura NO se continúa: no consumir y conectar igual
  // sería el peor de los dos mundos.
  if (error) return false;
  return Array.isArray(data) && data.length > 0;
}

/** La página elegida, dentro de la selección. `null` si el id no pertenece. */
export function pickPage(selection: PendingSelection, pageId: string) {
  return selection.secret.pages.find((page) => page.id === pageId) || null;
}
