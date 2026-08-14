/**
 * «Reintentar activación».
 *
 * Un canal en `error` es una conexión que existe —tiene su token cifrado, su
 * marca y su activo— pero a la que Meta rechazó la suscripción al webhook.
 * Obligar a repetir el diálogo de OAuth entero para volver a intentar una
 * llamada que suele fallar por algo transitorio (un 429, un permiso que tarda
 * en propagarse) es desproporcionado, y en el flujo de WhatsApp Embedded Signup
 * ni siquiera es posible: el `code` es de un solo uso.
 *
 * Esta ruta reintenta **sólo** la suscripción, con las credenciales que ya
 * están guardadas. No pide tokens nuevos, no toca el activo, no cambia de marca
 * y no consume cupo: el canal ya existe y ya lo consumía.
 */
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAgentBrandIds } from "@/lib/smarttalk/brand-scope";
import { isPausedBrandStatus } from "@/lib/smarttalk/brand-status";
import { resolveToken } from "@/lib/auth/token-crypto";
import { subscribePageToApp, subscribeInstagramAccountToApp } from "@/lib/meta";
import { subscribeWABAToApp } from "@/lib/whatsapp/token-manager";
import {
  activateChannels,
  activationErrorMessage,
  type MetaChannelAsset,
} from "@/lib/meta/channel-activation";

interface ChannelRow {
  id: string;
  organization_id: string;
  brand_id: string;
  type: string;
  status: string;
  meta_business_id: string | null;
  whatsapp_business_account_id: string | null;
  whatsapp_phone_number_id: string | null;
  access_token: string | null;
  access_token_ciphertext: string | null;
  config: Record<string, unknown> | null;
}

function canManageChannels(agent: {
  role: string;
  member_type?: string | null;
  is_super_admin?: boolean | null;
}) {
  return (
    agent.is_super_admin === true ||
    (agent.role === "admin" && agent.member_type === "agency_user") ||
    agent.member_type === "brand_admin"
  );
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const admin = createAdminClient("smarttalk");
  const publicAdmin = createAdminClient("public");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: agent } = await supabase
    .from("agents")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  if (!canManageChannels(agent)) {
    return Response.json(
      { error: "Solo los administradores pueden reactivar canales" },
      { status: 403 },
    );
  }

  // El filtro por organización va en la consulta: un canal de otra agencia
  // responde igual que uno inexistente, sin confirmar que existe.
  const { data: channelRow } = await admin
    .from("channels")
    .select(
      "id, organization_id, brand_id, type, status, meta_business_id, whatsapp_business_account_id, whatsapp_phone_number_id, access_token, access_token_ciphertext, config",
    )
    .eq("id", id)
    .eq("organization_id", agent.organization_id)
    .maybeSingle();

  const channel = channelRow as ChannelRow | null;
  if (!channel) return Response.json({ error: "Canal no encontrado" }, { status: 404 });

  const assignedBrandIds = await getAgentBrandIds(agent);
  if (assignedBrandIds && !assignedBrandIds.includes(channel.brand_id)) {
    return Response.json({ error: "No autorizado para este canal" }, { status: 403 });
  }

  const { data: brand } = await publicAdmin
    .from("cm_clients")
    .select("status")
    .eq("id", channel.brand_id)
    .maybeSingle();
  if (isPausedBrandStatus((brand as { status?: string | null } | null)?.status)) {
    return Response.json(
      {
        error: "inactive_brand",
        message: "Esta marca está inactiva. Reactívala antes de activar sus canales.",
      },
      { status: 409 },
    );
  }

  // Un canal desconectado a propósito no se reactiva por aquí: eso es volver a
  // conectar, con su comprobación de conflicto y su cupo.
  if (channel.status === "disconnected") {
    return Response.json(
      {
        error:
          "Este canal está desconectado. Vuelve a conectarlo desde la marca para reactivarlo.",
        code: "channel_disconnected",
      },
      { status: 409 },
    );
  }

  const token = resolveToken(channel.access_token_ciphertext, channel.access_token);
  if (!token) {
    return Response.json(
      {
        error: "El canal no tiene credenciales utilizables. Vuelve a conectarlo desde la marca.",
        code: "missing_token",
      },
      { status: 409 },
    );
  }

  const config = (channel.config || {}) as Record<string, unknown>;
  const legacyId = typeof config.legacy_id === "string" ? config.legacy_id : null;

  let asset: MetaChannelAsset;
  let assetId: string | null;
  let subscribe: () => Promise<unknown>;

  if (channel.type === "facebook_messenger") {
    asset = "facebook_page";
    assetId = channel.meta_business_id || legacyId;
    subscribe = () => subscribePageToApp(assetId as string, token);
  } else if (channel.type === "instagram") {
    asset = "instagram_account";
    assetId = channel.meta_business_id || legacyId;
    subscribe = () => subscribeInstagramAccountToApp(assetId as string, token);
  } else if (channel.type === "whatsapp_business_api" || channel.type === "whatsapp_cloud_api") {
    asset = "whatsapp_phone";
    assetId = channel.whatsapp_business_account_id;
    subscribe = () => subscribeWABAToApp(assetId as string, token);
  } else {
    return Response.json(
      { error: "Este tipo de canal no usa suscripción de webhook de Meta.", code: "unsupported_type" },
      { status: 400 },
    );
  }

  if (!assetId) {
    return Response.json(
      {
        error: "El canal no tiene guardado el identificador del activo. Vuelve a conectarlo.",
        code: "missing_asset_id",
      },
      { status: 409 },
    );
  }

  const activation = await activateChannels([
    {
      channelId: channel.id,
      asset,
      assetId,
      // Siempre degradable: el reintento existe precisamente para canales que no
      // están operativos, y un fallo debe dejarlos en `error`, no en `active`.
      wasActive: false,
      subscribe,
    },
  ]);

  if (!activation.ok) {
    return Response.json(
      {
        ok: false,
        error: activationErrorMessage(activation.failures),
        cause: activation.failures[0]?.cause,
        code: "webhook_subscription_failed",
        retryable: true,
      },
      { status: 502 },
    );
  }

  return Response.json({ ok: true, channel: { id: channel.id, status: "active" } });
}
