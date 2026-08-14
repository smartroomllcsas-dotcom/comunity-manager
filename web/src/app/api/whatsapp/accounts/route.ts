/**
 * GET /api/whatsapp/accounts — cuentas de WhatsApp visibles para este usuario.
 *
 * Qué estaba mal
 * --------------
 * La ruta autorizaba con la cookie `cm_user_id` y filtraba `cm_clients` por
 * `user_id`. Es decir, sólo el **propietario histórico** de la marca veía su
 * cuenta: un administrador de la agencia o un asesor con la marca asignada
 * recibían una lista vacía sobre su propia marca, y la pantalla de detalle los
 * expulsaba a `/clients`.
 *
 * Las acciones POST de WhatsApp (`subscribe`, `register`, `test-message`,
 * `exchange`) ya usaban `getCmClientAccess()`. Esta lectura se había quedado
 * atrás, así que la autorización de escritura y la de lectura no coincidían.
 *
 * Qué hace ahora
 * --------------
 *   - Con `clientId`: lo valida con `getCmClientAccess()` —la misma puerta que
 *     las escrituras— y consulta **exactamente** esa marca. Sin acceso, 403.
 *   - Sin `clientId`: usa `listAccessibleCmClientIds()`, que aplica
 *     organización, propiedad histórica y asignaciones de asesor. Mantiene la
 *     carga general de `/clients`.
 *
 * Nunca devuelve credenciales: la consulta pide una lista blanca de columnas y,
 * además, la fila se reconstruye campo a campo antes de responder.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCmClientAccess, listAccessibleCmClientIds } from '@/lib/cm-client-access'

/**
 * Columnas seguras. Las credenciales existen en la tabla y quedan fuera a
 * propósito: esta respuesta llega al navegador.
 */
const ACCOUNT_COLUMNS =
  'id,client_id,waba_id,phone_number_id,display_phone_number,verified_name,connected_at'

interface PublicWhatsAppAccount {
  id: string
  client_id: string | null
  waba_id: string | null
  phone_number_id: string | null
  display_phone_number: string | null
  verified_name: string | null
  connected_at: string | null
}

/**
 * Reconstruye la fila campo a campo antes de devolverla.
 *
 * La lista de columnas del `select` ya deja fuera las credenciales, pero esa
 * garantía vive en una cadena de texto: basta que alguien añada un campo o pida
 * la fila entera para que el token salga por aquí sin que nada avise. Esta
 * proyección explícita convierte la promesa en código, y hace que la prueba de
 * «nunca devuelve tokens» compruebe algo real en lugar de confiar en PostgREST.
 */
function toPublicAccount(row: Record<string, unknown>): PublicWhatsAppAccount {
  return {
    id: String(row.id),
    client_id: (row.client_id as string | null) ?? null,
    waba_id: (row.waba_id as string | null) ?? null,
    phone_number_id: (row.phone_number_id as string | null) ?? null,
    display_phone_number: (row.display_phone_number as string | null) ?? null,
    verified_name: (row.verified_name as string | null) ?? null,
    connected_at: (row.connected_at as string | null) ?? null,
  }
}

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get('clientId')

  // --- Una marca concreta: misma autorización que las escrituras ------------
  if (clientId) {
    const access = await getCmClientAccess(request, clientId)
    if (!access) {
      return NextResponse.json(
        { accounts: [], error: 'No autorizado para esta marca' },
        { status: 403 },
      )
    }

    // `access.clientId` viene de la fila validada, no del parámetro: aunque
    // fueran iguales, filtrar por lo comprobado y no por lo recibido es lo que
    // hace imposible que un `clientId` manipulado se cuele.
    const { data: accounts, error } = await supabaseAdmin
      .from('cm_whatsapp_accounts')
      .select(ACCOUNT_COLUMNS)
      .eq('client_id', access.clientId)

    if (error) {
      return NextResponse.json(
        { accounts: [], error: 'No fue posible cargar la cuenta de WhatsApp.' },
        { status: 500 },
      )
    }

    return NextResponse.json({
      accounts: ((accounts ?? []) as Array<Record<string, unknown>>).map(toPublicAccount),
    })
  }

  // --- Listado general: sólo las marcas del alcance del usuario -------------
  const clientIds = await listAccessibleCmClientIds(request)
  if (clientIds === null) {
    return NextResponse.json({ accounts: [], error: 'No autenticado' }, { status: 401 })
  }
  if (clientIds.length === 0) {
    return NextResponse.json({ accounts: [] })
  }

  const { data: accounts, error } = await supabaseAdmin
    .from('cm_whatsapp_accounts')
    .select(ACCOUNT_COLUMNS)
    .in('client_id', clientIds)

  if (error) {
    return NextResponse.json(
      { accounts: [], error: 'No fue posible cargar las cuentas de WhatsApp.' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    accounts: ((accounts ?? []) as Array<Record<string, unknown>>).map(toPublicAccount),
  })
}
