import { NextRequest } from "next/server";
import { isPausedBrandStatus } from "@/lib/smarttalk/brand-status";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  exchangeForLongLivedToken,
  subscribeWABAToApp,
  registerPhoneNumber,
} from "@/lib/whatsapp/token-manager";
import { encryptToken } from "@/lib/auth/token-crypto";
import { getBrandInOrganization } from "@/lib/smarttalk/brand-scope";
import { getAgentBrandIds } from "@/lib/smarttalk/brand-scope";
import { CHANNEL_PUBLIC_COLUMNS, toPublicChannel } from "@/lib/smarttalk/channel-public";
import { billingDeniedResponse, checkBillingFeature } from "@/lib/billing/service";
import { BILLING_FEATURES } from "@/lib/billing/features";
import { findAssetConflict } from "@/lib/meta/asset-conflicts";
import {
  activateChannels,
  activationErrorMessage,
  wasAssetOperational,
  PENDING_SUBSCRIPTION_CONFIG,
} from "@/lib/meta/channel-activation";

const FB_APP_ID = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID!;
const FB_APP_SECRET = process.env.FACEBOOK_APP_SECRET!;
const WA_API_VERSION = process.env.WHATSAPP_API_VERSION || "v21.0";
const FB_GRAPH_URL = `https://graph.facebook.com/${WA_API_VERSION}`;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: agent } = await supabase
    .from("agents")
    .select("*")
    .eq("id", user.id)
    .single();
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  if (agent.role !== "admin") {
    return Response.json({ error: "Solo los administradores pueden conectar canales" }, { status: 403 });
  }

  const { code, brandId } = (await request.json()) as { code: string; brandId: string };
  if (!code || !brandId) {
    return Response.json({ error: "El código y brandId son requeridos" }, { status: 400 });
  }

  const brand = await getBrandInOrganization(brandId, agent.organization_id);
  if (!brand) {
    return Response.json({ error: "La marca no pertenece a esta organización" }, { status: 403 });
  }
  if (isPausedBrandStatus((brand as { status?: string | null }).status)) {
    return Response.json(
      {
        error: "inactive_brand",
        message: "Esta marca está inactiva. Reactívala antes de conectar canales.",
      },
      { status: 409 }
    );
  }

  const assignedBrandIds = await getAgentBrandIds(agent);
  if (assignedBrandIds && !assignedBrandIds.includes(brand.id)) {
    return Response.json({ error: "No autorizado para esta marca" }, { status: 403 });
  }

  // Ojo: esta búsqueda es por marca y tipo, no por número. El canal que
  // devuelve puede apuntar a un número y un WABA completamente distintos de los
  // que se están conectando ahora, así que su estado por sí solo no dice nada
  // sobre si la suscripción anterior cubre este activo.
  const { data: existingChannel } = await admin
    .from("channels")
    .select("id, status, whatsapp_phone_number_id, whatsapp_business_account_id, config")
    .eq("organization_id", agent.organization_id)
    .eq("brand_id", brand.id)
    .eq("type", "whatsapp_business_api")
    .neq("status", "disconnected")
    .maybeSingle();
  if (!existingChannel) {
    const billingDecision = await checkBillingFeature({
      organizationId: agent.organization_id,
      featureCode: BILLING_FEATURES.CHANNELS_ACTIVE,
      requestedUnits: 1,
      source: "oauth/whatsapp-connect",
    });
    if (!billingDecision.allowed) return billingDeniedResponse(billingDecision);
  }

  try {
    // 1. Exchange code for access token
    const tokenResponse = await fetch(
      `${FB_GRAPH_URL}/oauth/access_token?client_id=${FB_APP_ID}&client_secret=${FB_APP_SECRET}&code=${code}`
    );
    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      return Response.json(
        { error: "Error al obtener token de acceso de Facebook" },
        { status: 400 }
      );
    }

    const shortLivedToken = tokenData.access_token;

    // 2. Exchange short-lived token for long-lived token (60 days)
    let accessToken = shortLivedToken;
    let tokenExpiresAt: string | null = null;
    try {
      const longLivedResult = await exchangeForLongLivedToken(shortLivedToken);
      accessToken = longLivedResult.access_token;
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + longLivedResult.expires_in);
      tokenExpiresAt = expiresAt.toISOString();
    } catch (exchangeErr) {
      // If long-lived exchange fails, continue with short-lived token
      console.warn("Long-lived token exchange failed, using short-lived token:", exchangeErr);
    }

    // 3. Debug token to get WABA info
    const debugResponse = await fetch(
      `${FB_GRAPH_URL}/debug_token?input_token=${accessToken}`,
      {
        headers: {
          Authorization: `Bearer ${FB_APP_ID}|${FB_APP_SECRET}`,
        },
      }
    );
    const debugData = await debugResponse.json();

    // 3. Get shared WABA IDs from the token granular scopes
    let wabaId: string | null = null;

    if (debugData.data?.granular_scopes) {
      const wabaScope = debugData.data.granular_scopes.find(
        (s: { scope: string; target_ids?: string[] }) =>
          s.scope === "whatsapp_business_management"
      );
      if (wabaScope?.target_ids?.[0]) {
        wabaId = wabaScope.target_ids[0];
      }
    }

    // 4. If no WABA from debug, try getting shared WABAs
    if (!wabaId) {
      const sharedResponse = await fetch(
        `${FB_GRAPH_URL}/me/businesses?access_token=${accessToken}`
      );
      const sharedData = await sharedResponse.json();

      if (sharedData.data?.[0]?.id) {
        const businessId = sharedData.data[0].id;
        const wabaListResponse = await fetch(
          `${FB_GRAPH_URL}/${businessId}/owned_whatsapp_business_accounts?access_token=${accessToken}`
        );
        const wabaListData = await wabaListResponse.json();
        if (wabaListData.data?.[0]?.id) {
          wabaId = wabaListData.data[0].id;
        }
      }
    }

    if (!wabaId) {
      return Response.json(
        { error: "No se pudo obtener el ID de WhatsApp Business Account" },
        { status: 400 }
      );
    }

    // 5. Get phone numbers for this WABA
    const phonesResponse = await fetch(
      `${FB_GRAPH_URL}/${wabaId}/phone_numbers`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const phonesData = await phonesResponse.json();

    const phoneInfo = phonesData.data?.[0];
    const phoneNumberId = phoneInfo?.id || null;
    const phoneNumber = phoneInfo?.display_phone_number || null;

    // 6. Un número activo pertenece a una sola marca.
    //
    // Esta ruta no comprobaba nada: iba directa al INSERT y dejaba que el
    // índice único decidiera. Eso convertía «esta página ya está en otra marca»
    // —un caso de negocio con mensaje acordado— en un 23505 genérico, y no
    // cubría en absoluto la cuenta legacy de `cm_whatsapp_accounts`.
    if (phoneNumberId) {
      const conflict = await findAssetConflict({
        kind: "whatsapp_phone",
        assetId: phoneNumberId,
        organizationId: agent.organization_id,
        brandId: brand.id,
      });
      if (conflict) {
        return Response.json({ error: conflict.message }, { status: 409 });
      }
    }

    // 7. Register phone number for messaging.
    //
    // No bloquea: un número ya registrado devuelve error y ese caso es normal
    // en una reconexión. No afecta a la recepción de webhooks, que es lo que
    // decide si el canal está operativo.
    if (phoneNumberId) {
      try {
        await registerPhoneNumber(phoneNumberId, accessToken);
      } catch (regErr) {
        console.warn("Phone registration failed (non-blocking):", regErr);
      }
    }

    // 8. Create or update the channel record.
    //
    // Antes siempre insertaba: reconectar la misma marca chocaba con
    // `uq_channels_whatsapp_phone` y devolvía «ya está conectado a otro canal»
    // señalando a la propia marca. La reconexión es idempotente por definición
    // —renueva el token, conserva la fila, los contactos y las conversaciones—.
    const channelRecord = {
      organization_id: agent.organization_id,
      brand_id: brand.id,
      type: "whatsapp_business_api",
      name: phoneNumber
        ? `WhatsApp ${phoneNumber}`
        : "WhatsApp Business",
      status: "active",
      whatsapp_phone_number_id: phoneNumberId,
      whatsapp_business_account_id: wabaId,
      whatsapp_phone_number: phoneNumber,
      access_token: null,
      access_token_ciphertext: encryptToken(accessToken),
      facebook_app_id: FB_APP_ID,
      token_expires_at: tokenExpiresAt,
      config: {
        connected_via: "embedded_signup",
        phone_info: phoneInfo || {},
      },
      connected_at: new Date().toISOString(),
    };

    // ¿El canal que ya existe recibía por ESTE número y ESTE WABA?
    const wasOperational = wasAssetOperational({
      status: existingChannel?.status,
      config: existingChannel?.config as Record<string, unknown> | null,
      assetPairs: [
        [existingChannel?.whatsapp_phone_number_id, phoneNumberId],
        [existingChannel?.whatsapp_business_account_id, wabaId],
      ],
    });

    const { data: channel, error } = existingChannel
      ? await admin
          .from("channels")
          .update({
            ...channelRecord,
            config: {
              ...(wasOperational
                ? ((existingChannel.config as Record<string, unknown> | null) || {})
                : {}),
              ...channelRecord.config,
              // Activo nuevo o cambiado: no-suscrito hasta que Meta lo
              // confirme, escrito ANTES de preguntárselo.
              ...(wasOperational ? {} : PENDING_SUBSCRIPTION_CONFIG),
            },
          })
          .eq("id", existingChannel.id)
          .select(CHANNEL_PUBLIC_COLUMNS)
          .single()
      : await admin
          .from("channels")
          .insert({
            ...channelRecord,
            config: { ...channelRecord.config, ...PENDING_SUBSCRIPTION_CONFIG },
          })
          .select(CHANNEL_PUBLIC_COLUMNS)
          .single();

    if (error) {
      if (error.code === "23505") {
        return Response.json(
          { error: "Este número de WhatsApp ya está conectado a otro canal." },
          { status: 409 },
        );
      }
      return Response.json({ error: error.message }, { status: 500 });
    }

    // 9. Subscribe the WABA. La suscripción forma parte del éxito: sin ella
    // Meta no envía un solo evento y el canal aparecería «conectado» con la
    // bandeja vacía. Antes era `non-blocking` y su fallo sólo dejaba un warn.
    const channelId = (channel as { id?: string } | null)?.id || existingChannel?.id;
    if (channelId) {
      const activation = await activateChannels([
        {
          channelId,
          asset: "whatsapp_phone",
          assetId: phoneNumberId || wabaId,
          wasActive: wasOperational,
          subscribe: () => subscribeWABAToApp(wabaId, accessToken),
        },
      ]);

      if (!activation.ok) {
        return Response.json(
          {
            error: activationErrorMessage(activation.failures),
            code: "webhook_subscription_failed",
            retryable: true,
            channel: toPublicChannel({
              ...(channel as Record<string, unknown>),
              status: activation.failures[0]?.degraded ? "error" : "active",
            }),
          },
          { status: 502 },
        );
      }
    }

    // 10. Also update the organization's default WhatsApp credentials
    // for backward compatibility with existing webhook logic.
    await admin
      .from("organizations")
      .update({
        whatsapp_phone_number_id: phoneNumberId,
        whatsapp_business_account_id: wabaId,
        access_token: null,
        access_token_ciphertext: encryptToken(accessToken),
      })
      .eq("id", agent.organization_id);

    // 11. Sync message templates from WhatsApp (non-blocking)
    try {
      const waApiVersion = process.env.WHATSAPP_API_VERSION || "v21.0";
      const templatesResponse = await fetch(
        `https://graph.facebook.com/${waApiVersion}/${wabaId}/message_templates`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (templatesResponse.ok) {
        const { data: templates } = await templatesResponse.json();
        for (const t of templates || []) {
          await admin.from("message_templates").upsert({
            organization_id: agent.organization_id,
            wa_template_id: t.id,
            name: t.name,
            language: t.language,
            category: t.category?.toLowerCase() || "utility",
            components: t.components || [],
            status: t.status === "APPROVED" ? "approved" : t.status === "REJECTED" ? "rejected" : "pending",
          }, { onConflict: "id" });
        }
      }
    } catch (syncErr) {
      console.warn("Template sync failed (non-blocking):", syncErr);
    }

    return Response.json({ channel }, { status: 201 });
  } catch (err) {
    console.error("WhatsApp connect error:", err);
    return Response.json(
      { error: "Error interno al conectar WhatsApp" },
      { status: 500 }
    );
  }
}
