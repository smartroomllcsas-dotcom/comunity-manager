import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { agentCanAccessBrand, getBrandInOrganization } from "@/lib/smarttalk/brand-scope";
import { billingDeniedResponse, checkBillingFeature } from "@/lib/billing/service";
import { BILLING_FEATURES } from "@/lib/billing/features";
import { WahaError, wahaFromEnv } from "@/lib/waha/client";
import { sessionNameForBrand } from "@/lib/waha/session-name";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: agent } = await admin
    .from("agents")
    .select("id, organization_id, member_type, is_super_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  let body: { brandId?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { brandId, name } = body;
  if (!brandId || typeof brandId !== "string" || !brandId.trim()) {
    return NextResponse.json({ error: "brandId es requerido" }, { status: 400 });
  }
  // #8: cap name length to prevent oversized payloads reaching channels.name
  if (typeof name === "string" && name.length > 100) {
    return NextResponse.json({ error: "name debe tener máximo 100 caracteres" }, { status: 400 });
  }

  const brand = await getBrandInOrganization(brandId, agent.organization_id);
  if (!brand) {
    return NextResponse.json({ error: "La marca no pertenece a esta organización" }, { status: 403 });
  }
  if (!(await agentCanAccessBrand(agent, brand.id))) {
    return NextResponse.json({ error: "No tienes acceso a esta marca" }, { status: 403 });
  }

  const billingDecision = await checkBillingFeature({
    organizationId: agent.organization_id,
    featureCode: BILLING_FEATURES.CHANNELS_ACTIVE,
    requestedUnits: 1,
    source: "channels/waha/connect",
  });
  if (!billingDecision.allowed) return billingDeniedResponse(billingDecision);

  let sessionName: string;
  try {
    sessionName = sessionNameForBrand(brandId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const hmac = process.env.WAHA_WEBHOOK_HMAC_SECRET;
  if (!hmac) {
    return NextResponse.json({ error: "server missing WAHA_WEBHOOK_HMAC_SECRET" }, { status: 500 });
  }

  const displayName = name?.trim() || "WhatsApp (WAHA · beta)";

  // Idempotencia: reusar canal waha existente de la marca (doble clic / reintento)
  const { data: existing } = await admin
    .from("channels")
    .select("id")
    .eq("brand_id", brand.id)
    .eq("type", "waha")
    .in("status", ["pending", "active"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let channelIdCreated = false;
  let channelRowId: string;
  if (existing) {
    channelRowId = existing.id;
  } else {
    const { data: channel, error: channelError } = await admin
      .from("channels")
      .insert({
        organization_id: agent.organization_id,
        brand_id: brand.id,
        type: "waha",
        name: displayName,
        status: "pending",
        config: {
          sessionName,
          brandId,
          hmacSecretHint: "env:WAHA_WEBHOOK_HMAC_SECRET",
        },
      })
      .select()
      .single();

    if (channelError || !channel) {
      return NextResponse.json({ error: channelError?.message ?? "Failed to create channel" }, { status: 500 });
    }
    channelRowId = channel.id;
    channelIdCreated = true;
  }

  const { error: sessionError } = await admin
    .from("waha_sessions")
    .upsert(
      {
        channel_id: channelRowId,
        session_name: sessionName,
        status: "STARTING",
      },
      { onConflict: "session_name" }
    );

  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }

  // Build webhook URL
  let appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL ||
    "https://www.comunitymanager.io";
  if (!/^https?:\/\//i.test(appUrl)) {
    appUrl = `https://${appUrl}`;
  }
  const webhookUrl = `${appUrl}/api/webhook/waha`;

  const waha = wahaFromEnv();
  const sessionInput = {
    name: sessionName,
    webhookUrl,
    webhookHmacSecret: hmac,
  };
  try {
    await waha.createSession(sessionInput);
  } catch (err) {
    // 422 = la sesión ya existe en WAHA (reintento/doble clic) → reusarla,
    // pero si está muerta (FAILED/STOPPED o QR caducado) recrearla desde cero
    if (err instanceof WahaError && err.status === 422) {
      try {
        const live = await waha.getSession(sessionName);
        if (live.status === "FAILED" || live.status === "STOPPED") {
          await waha.deleteSession(sessionName);
          // WAHA tarda en liberar el nombre tras el delete
          await new Promise((r) => setTimeout(r, 1500));
          try {
            await waha.createSession(sessionInput);
          } catch (retryErr) {
            if (retryErr instanceof WahaError && retryErr.status === 422) {
              await new Promise((r) => setTimeout(r, 2500));
              await waha.createSession(sessionInput);
            } else {
              throw retryErr;
            }
          }
        }
      } catch (recreateErr) {
        const fullMsg = recreateErr instanceof Error ? recreateErr.message : String(recreateErr);
        console.error("[waha/connect] recreate failed:", fullMsg);
        if (channelIdCreated) {
          await admin.from("channels").delete().eq("id", channelRowId);
        }
        return NextResponse.json(
          { error: "Upstream WAHA error creating session" },
          { status: 502 }
        );
      }
    } else {
      // H2: sanitize — WahaError.message may include the upstream body which
      // could echo secret headers. Log the full error server-side, return generic.
      const fullMsg = err instanceof Error ? err.message : String(err);
      console.error("[waha/connect] createSession failed:", fullMsg);

      // #3 rollback: DELETE the channel row instead of marking it 'error'.
      // Orphan 'error' rows would count against CHANNELS_ACTIVE billing quota.
      // CASCADE removes the waha_sessions row we just upserted.
      if (channelIdCreated) {
        await admin.from("channels").delete().eq("id", channelRowId);
      }

      return NextResponse.json(
        { error: "Upstream WAHA error creating session" },
        { status: 502 }
      );
    }
  }

  return NextResponse.json(
    { channelId: channelRowId, sessionName, status: "STARTING" },
    { status: 201 }
  );
}
