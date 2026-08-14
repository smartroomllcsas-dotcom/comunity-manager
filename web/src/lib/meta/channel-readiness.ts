import { createAdminClient } from "@/lib/supabase/admin";

type MetaChannelType = "facebook_messenger" | "instagram";

type EnsureMetaChannelsInput = {
  organizationId: string;
  brandId: string;
  legacyAccountId: string;
  page: { id: string; name: string };
  instagram?: { id: string; username?: string } | null;
  pageAccessTokenCiphertext: string;
  connectedAt: string;
  tokenExpiresAt: string;
  includeInstagram: boolean;
};

/**
 * Deja listos los canales operativos antes de declarar exitosa la conexión.
 * Así un mensaje enviado inmediatamente después del OAuth ya puede enrutarse
 * a la marca correcta, sin esperar a que /clients monte y ejecute sync-legacy.
 */
export async function ensureMetaChannelsReady(input: EnsureMetaChannelsInput) {
  const smarttalk = createAdminClient("smarttalk");
  const { data, error } = await smarttalk
    .from("channels")
    .select("id,type")
    .eq("organization_id", input.organizationId)
    .eq("brand_id", input.brandId);

  if (error) throw new Error(`No se pudieron consultar los canales de la marca: ${error.message}`);

  const current = (data || []) as Array<{ id: string; type: string }>;

  async function save(type: MetaChannelType, payload: Record<string, unknown>) {
    const matches = current.filter((channel) => channel.type === type);
    if (matches.length > 1) {
      throw new Error(`La marca tiene más de un canal ${type}; se bloqueó la conexión para evitar enrutamiento ambiguo`);
    }

    if (matches[0]) {
      const { error: updateError } = await smarttalk
        .from("channels")
        .update(payload)
        .eq("id", matches[0].id);
      if (updateError) throw new Error(`No se pudo actualizar el canal ${type}: ${updateError.message}`);
      return;
    }

    const { error: insertError } = await smarttalk.from("channels").insert(payload);
    if (insertError) throw new Error(`No se pudo crear el canal ${type}: ${insertError.message}`);
  }

  await save("facebook_messenger", {
    organization_id: input.organizationId,
    brand_id: input.brandId,
    type: "facebook_messenger",
    name: input.page.name || "Facebook",
    status: "active",
    access_token: null,
    access_token_ciphertext: input.pageAccessTokenCiphertext,
    facebook_app_id: process.env.META_APP_ID || null,
    // Para webhooks multimarcas este campo debe ser el activo que Meta envía
    // en entry.id, no el portafolio comercial compartido por varias páginas.
    meta_business_id: input.page.id,
    config: {
      legacy_source: "cm_social_accounts",
      legacy_type: "facebook",
      legacy_id: input.page.id,
      legacy_client_id: input.brandId,
      legacy_account_id: input.legacyAccountId,
      page_name: input.page.name,
    },
    connected_at: input.connectedAt,
    token_expires_at: input.tokenExpiresAt,
    updated_at: new Date().toISOString(),
  });

  if (input.includeInstagram && input.instagram?.id) {
    await save("instagram", {
      organization_id: input.organizationId,
      brand_id: input.brandId,
      type: "instagram",
      name: input.instagram.username
        ? `Instagram @${input.instagram.username}`
        : `${input.page.name} · Instagram`,
      status: "active",
      access_token: null,
      access_token_ciphertext: input.pageAccessTokenCiphertext,
      facebook_app_id: process.env.META_APP_ID || null,
      meta_business_id: input.instagram.id,
      config: {
        legacy_source: "cm_social_accounts",
        legacy_type: "instagram",
        legacy_id: input.instagram.id,
        legacy_client_id: input.brandId,
        legacy_account_id: input.legacyAccountId,
        instagram_username: input.instagram.username || null,
      },
      connected_at: input.connectedAt,
      token_expires_at: input.tokenExpiresAt,
      updated_at: new Date().toISOString(),
    });
  }
}
