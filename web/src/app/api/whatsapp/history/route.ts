/**
 * GET /api/whatsapp/history?clientId=… — historial de WhatsApp de una marca.
 *
 * Por qué existe
 * --------------
 * La pantalla de detalle consultaba `cm_chat_history` **desde el navegador**,
 * componiendo el filtro con el `clientId` de la URL:
 *
 * ```ts
 * supabase.from('cm_chat_history').eq('client_context', `whatsapp:${clientId}`)
 * ```
 *
 * Esa consulta la firma la sesión del usuario, así que su alcance depende por
 * completo de las políticas RLS de la tabla —no de la autorización de marca que
 * el resto del módulo aplica—. Y el filtro viaja en el cliente: quien cambie el
 * `clientId` de la barra de direcciones cambia la consulta.
 *
 * Aquí el orden se invierte: **primero se autoriza**, y sólo después se
 * consulta con `service_role`.
 *
 * Reglas
 * ------
 *   - `getCmClientAccess()` decide, igual que en las escrituras. Sin acceso,
 *     403.
 *   - El `client_context` lo compone el servidor a partir de la marca
 *     **validada**, nunca a partir de un valor recibido. El navegador no puede
 *     pedir un contexto arbitrario.
 *   - Resultados acotados y ordenados por `created_at` descendente.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCmClientAccess } from "@/lib/cm-client-access";

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 100;

/** El contexto lo compone el servidor. Es la clave de todo el aislamiento. */
export function whatsappHistoryContext(clientId: string) {
  return `whatsapp:${clientId}`;
}

function parseLimit(raw: string | null) {
  const parsed = Number.parseInt(raw || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ error: "clientId requerido" }, { status: 400 });
  }

  const access = await getCmClientAccess(request, clientId);
  if (!access) {
    return NextResponse.json(
      { entries: [], error: "No autorizado para esta marca" },
      { status: 403 },
    );
  }

  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));

  const { data, error } = await supabaseAdmin
    .from("cm_chat_history")
    .select("id,role,content,client_context,created_at")
    // `access.clientId` sale de la fila comprobada, no del parámetro.
    .eq("client_context", whatsappHistoryContext(access.clientId))
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[whatsapp-history] no se pudo cargar el historial", {
      clientId: access.clientId,
      code: (error as { code?: string }).code,
    });
    return NextResponse.json(
      { entries: [], error: "No fue posible cargar el historial." },
      { status: 500 },
    );
  }

  return NextResponse.json({ entries: data ?? [] });
}
