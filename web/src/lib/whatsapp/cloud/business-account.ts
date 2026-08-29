// Helper para obtener credenciales WABA desencriptadas de cm_whatsapp_accounts
// para un cliente CM concreto. Nunca cachear.
//
// Reusa resolveToken() de /lib/auth/token-crypto.ts (pattern encryption
// existente: doble columna access_token + access_token_ciphertext).

import { supabaseAdmin } from "@/lib/supabase";
import { resolveToken } from "@/lib/auth/token-crypto";
import { WabaCloudClient } from "./client";

export interface WabaAccountRow {
  id: string;
  client_id: string;
  waba_id: string;
  phone_number_id: string;
  display_phone_number: string | null;
  verified_name: string | null;
}

export interface WabaCredentials {
  account: WabaAccountRow;
  token: string;
}

/**
 * Trae la cuenta WhatsApp de un cliente CM con el token ya desencriptado.
 * accountId es opcional — si es NULL usa la primera cuenta activa del cliente.
 * Lanza si no encuentra credenciales válidas.
 */
export async function getWabaCredentialsForClient(
  clientId: string,
  accountId?: string | null
): Promise<WabaCredentials> {
  let query = supabaseAdmin
    .from("cm_whatsapp_accounts")
    .select(
      "id,client_id,waba_id,phone_number_id,display_phone_number,verified_name,access_token,access_token_ciphertext"
    )
    .eq("client_id", clientId);

  query = accountId
    ? query.eq("id", accountId).limit(1)
    : query.order("connected_at", { ascending: true, nullsFirst: false }).limit(1);

  const { data, error } = await query.maybeSingle();
  if (error) {
    // Nunca filtrar mensaje de Supabase al browser: logeamos + genérico.
    console.error("[wa/cloud/business-account] db error", error.message);
    throw new Error("No se pudo cargar la cuenta de WhatsApp.");
  }
  if (!data) throw new Error("No hay cuenta de WhatsApp conectada para esta marca");

  const raw = data as Record<string, unknown>;
  const token = resolveToken(
    raw.access_token_ciphertext as string | null,
    raw.access_token as string | null
  );
  if (!token) throw new Error("La cuenta de WhatsApp no tiene token válido");
  if (!raw.waba_id || !raw.phone_number_id) {
    throw new Error("La cuenta no tiene waba_id o phone_number_id");
  }

  return {
    account: {
      id: String(raw.id),
      client_id: String(raw.client_id),
      waba_id: String(raw.waba_id),
      phone_number_id: String(raw.phone_number_id),
      display_phone_number: (raw.display_phone_number as string | null) ?? null,
      verified_name: (raw.verified_name as string | null) ?? null,
    },
    token,
  };
}

/**
 * Factory que instancia el WabaCloudClient listo para usar.
 */
export async function getWabaClientForClient(
  clientId: string,
  accountId?: string | null
): Promise<{ client: WabaCloudClient; account: WabaAccountRow }> {
  const { account, token } = await getWabaCredentialsForClient(clientId, accountId);
  return {
    client: new WabaCloudClient(account.waba_id, account.phone_number_id, token),
    account,
  };
}

/**
 * Busca la cuenta a partir del waba_id que viene en el webhook Meta. Multi-tenant:
 * necesitamos saber a qué client_id enrutar el evento.
 */
export async function findAccountByWabaId(
  wabaId: string
): Promise<WabaAccountRow | null> {
  const { data, error } = await supabaseAdmin
    .from("cm_whatsapp_accounts")
    .select("id,client_id,waba_id,phone_number_id,display_phone_number,verified_name")
    .eq("waba_id", wabaId)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[wa/cloud/business-account] findAccountByWabaId error", error.message);
    return null;
  }
  return data ? (data as WabaAccountRow) : null;
}
