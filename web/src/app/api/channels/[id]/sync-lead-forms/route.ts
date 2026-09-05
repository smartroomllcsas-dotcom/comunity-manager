/**
 * «Sincronizar leads» — importa al CRM los leads que YA existen en los
 * formularios de la página de Facebook del canal (Centro de clientes
 * potenciales). Meta solo expone los últimos 90 días.
 *
 * Idempotente: los leads ya importados se saltan (dedupe por leadgen_id),
 * así que el botón se puede pulsar las veces que haga falta; si la página
 * tiene más leads de los que caben en una pasada, responde partial=true y
 * se vuelve a pulsar para continuar.
 */
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAgentBrandIds } from "@/lib/smarttalk/brand-scope";
import { resolveToken } from "@/lib/auth/token-crypto";
import {
  ingestGraphLead,
  LEAD_GRAPH_FIELDS,
  type GraphLead,
  type LeadgenChannel,
} from "@/lib/smarttalk/lead-forms";

export const maxDuration = 60;

const META_GRAPH_URL = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v21.0"}`;
const TIME_BUDGET_MS = 45_000;

interface ChannelRow extends LeadgenChannel {
  status: string;
  meta_business_id: string | null;
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

async function graphGet(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const json = (await res.json().catch(() => null)) as {
    data?: unknown[];
    paging?: { next?: string };
    error?: { message?: string };
  } | null;
  if (!res.ok || !json || json.error) {
    throw new Error(json?.error?.message || `Graph HTTP ${res.status}`);
  }
  return json;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const admin = createAdminClient("smarttalk");

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
      { error: "Solo los administradores pueden sincronizar leads" },
      { status: 403 }
    );
  }

  const { data: channelRow } = await admin
    .from("channels")
    .select(
      "id, organization_id, brand_id, type, status, meta_business_id, access_token, access_token_ciphertext, config"
    )
    .eq("id", id)
    .eq("organization_id", agent.organization_id)
    .maybeSingle();
  const channel = channelRow as ChannelRow | null;
  if (!channel) return Response.json({ error: "Canal no encontrado" }, { status: 404 });

  if (channel.type !== "facebook_messenger") {
    return Response.json(
      { error: "Solo los canales de Facebook tienen formularios de leads" },
      { status: 409 }
    );
  }

  const assignedBrandIds = await getAgentBrandIds(agent);
  if (assignedBrandIds && !assignedBrandIds.includes(channel.brand_id)) {
    return Response.json({ error: "No autorizado para este canal" }, { status: 403 });
  }

  const pageId =
    channel.meta_business_id ||
    (channel.config?.legacy_id as string | undefined) ||
    null;
  if (!pageId) {
    return Response.json(
      { error: "El canal no tiene página de Facebook asociada" },
      { status: 409 }
    );
  }

  const token = resolveToken(channel.access_token_ciphertext, channel.access_token);
  if (!token) {
    return Response.json(
      { error: "El canal no tiene credenciales utilizables. Vuelve a conectarlo." },
      { status: 409 }
    );
  }

  const startedAt = Date.now();
  const summary = {
    forms: 0,
    seen: 0,
    imported: 0,
    duplicates: 0,
    restricted: 0,
    errors: [] as string[],
    partial: false,
  };

  try {
    const formsResponse = await graphGet(
      `${META_GRAPH_URL}/${encodeURIComponent(pageId)}/leadgen_forms?fields=id,name,status&limit=100&access_token=${encodeURIComponent(token)}`
    );
    const forms = (formsResponse.data || []) as Array<{
      id?: string;
      name?: string;
      status?: string;
    }>;
    summary.forms = forms.length;

    outer: for (const form of forms) {
      if (!form.id) continue;
      let url: string | undefined =
        `${META_GRAPH_URL}/${encodeURIComponent(form.id)}/leads?fields=${LEAD_GRAPH_FIELDS}&limit=100&access_token=${encodeURIComponent(token)}`;
      while (url) {
        if (Date.now() - startedAt > TIME_BUDGET_MS) {
          summary.partial = true;
          break outer;
        }
        const pageResponse = await graphGet(url);
        const leads = (pageResponse.data || []) as GraphLead[];
        for (const lead of leads) {
          summary.seen += 1;
          try {
            const result = await ingestGraphLead(channel, lead, {
              pageId,
              formId: form.id,
            });
            if (result.duplicate) summary.duplicates += 1;
            else if (result.restricted) summary.restricted += 1;
            else if (result.processed) summary.imported += 1;
          } catch (e) {
            summary.errors.push(
              `lead ${lead.id}: ${e instanceof Error ? e.message : String(e)}`
            );
            if (summary.errors.length >= 5) {
              summary.partial = true;
              break outer;
            }
          }
        }
        url = pageResponse.paging?.next;
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Sin permiso de leads, Meta responde (#200)/requires leads_retrieval.
    return Response.json(
      {
        error: `No se pudieron leer los formularios de la página: ${message}. Si menciona permisos, reconecta la página para regenerar el token con leads_retrieval.`,
        summary,
      },
      { status: 502 }
    );
  }

  return Response.json({ success: true, ...summary });
}
