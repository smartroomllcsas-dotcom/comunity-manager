/**
 * Campos seguros para respuestas del navegador.
 *
 * Las credenciales viven en access_token/access_token_ciphertext y, en el
 * caso de Respond.io, también pueden existir dentro de config. Ninguno de
 * esos campos debe salir de una API administrativa.
 */
export const CHANNEL_PUBLIC_COLUMNS =
  "id, organization_id, brand_id, type, name, status, whatsapp_phone_number_id, whatsapp_business_account_id, whatsapp_phone_number, facebook_app_id, meta_business_id, respond_io_channel_id, connected_at, last_active_at, token_expires_at, created_at, updated_at";

export function toPublicChannel(channel: Record<string, unknown>) {
  const {
    access_token: _accessToken,
    access_token_ciphertext: _accessTokenCiphertext,
    config: _config,
    ...safeChannel
  } = channel;

  return safeChannel;
}
