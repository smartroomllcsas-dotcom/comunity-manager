import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  exchangeForLongLivedToken,
  subscribeWABAToApp,
  registerPhoneNumber,
} from "@/lib/whatsapp/token-manager";

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

  const { code } = (await request.json()) as { code: string };
  if (!code) {
    return Response.json({ error: "El código de autorización es requerido" }, { status: 400 });
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

    // 6. Subscribe WABA to app for webhooks
    try {
      await subscribeWABAToApp(wabaId, accessToken);
    } catch (subErr) {
      console.warn("WABA subscription failed (non-blocking):", subErr);
    }

    // 7. Register phone number for messaging
    if (phoneNumberId) {
      try {
        await registerPhoneNumber(phoneNumberId, accessToken);
      } catch (regErr) {
        console.warn("Phone registration failed (non-blocking):", regErr);
      }
    }

    // 8. Create channel record in the database
    const { data: channel, error } = await admin
      .from("channels")
      .insert({
        organization_id: agent.organization_id,
        type: "whatsapp_business_api",
        name: phoneNumber
          ? `WhatsApp ${phoneNumber}`
          : "WhatsApp Business",
        status: "active",
        whatsapp_phone_number_id: phoneNumberId,
        whatsapp_business_account_id: wabaId,
        whatsapp_phone_number: phoneNumber,
        access_token: accessToken,
        facebook_app_id: FB_APP_ID,
        token_expires_at: tokenExpiresAt,
        config: {
          connected_via: "embedded_signup",
          phone_info: phoneInfo || {},
        },
        connected_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    // 9. Also update the organization's default WhatsApp credentials
    // for backward compatibility with existing webhook logic
    await admin
      .from("organizations")
      .update({
        whatsapp_phone_number_id: phoneNumberId,
        whatsapp_business_account_id: wabaId,
        access_token: accessToken,
      })
      .eq("id", agent.organization_id);

    // 10. Sync message templates from WhatsApp (non-blocking)
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
