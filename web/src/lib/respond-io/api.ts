import { createAdminClient } from "@/lib/supabase/admin";
import type {
  RespondIoConfig,
  RespondIoSendResponse,
  RespondIoChannelSource,
} from "./types";

const RESPOND_IO_BASE = process.env.RESPOND_IO_API_BASE || "https://api.respond.io/v2";

type Json = Record<string, unknown>;

async function callRespondIo<T = Json>(
  path: string,
  apiToken: string,
  init?: { method?: string; body?: Json; query?: Record<string, string | number | undefined> },
): Promise<T> {
  const url = new URL(`${RESPOND_IO_BASE}${path}`);
  if (init?.query) {
    for (const [k, v] of Object.entries(init.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const response = await fetch(url.toString(), {
    method: init?.method || (init?.body ? "POST" : "GET"),
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });

  if (!response.ok) {
    let detail: unknown;
    try { detail = await response.json(); } catch { detail = await response.text(); }
    throw new Error(`Respond.io API ${response.status}: ${JSON.stringify(detail)}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Verifies an API token by calling a harmless read endpoint.
 * Uses GET /contact with limit=1 (available in Growth+ plans).
 */
export async function verifyRespondIoToken(apiToken: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await callRespondIo("/contact/list_by", apiToken, {
      method: "POST",
      body: { filter: [], limit: 1 },
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface SendTextParams {
  apiToken: string;
  contactIdentifier: string;
  channelId?: string;
  text: string;
}

/**
 * Send a text message to a contact. Respond.io identifier format:
 *   - "phone:+5731234567890"
 *   - "email:foo@bar.com"
 *   - "id:<respond_io_contact_id>"
 */
export async function sendRespondIoText({
  apiToken, contactIdentifier, channelId, text,
}: SendTextParams): Promise<RespondIoSendResponse> {
  return callRespondIo<RespondIoSendResponse>(
    `/contact/${encodeURIComponent(contactIdentifier)}/message`,
    apiToken,
    {
      method: "POST",
      body: { channelId, message: { type: "text", text } },
    },
  );
}

export interface SendAttachmentParams {
  apiToken: string;
  contactIdentifier: string;
  channelId?: string;
  type: "image" | "video" | "audio" | "file";
  url: string;
  description?: string;
}

export async function sendRespondIoAttachment({
  apiToken, contactIdentifier, channelId, type, url, description,
}: SendAttachmentParams): Promise<RespondIoSendResponse> {
  return callRespondIo<RespondIoSendResponse>(
    `/contact/${encodeURIComponent(contactIdentifier)}/message`,
    apiToken,
    {
      method: "POST",
      body: {
        channelId,
        message: { type: "attachment", attachment: { type, url, description } },
      },
    },
  );
}

export interface UpsertContactParams {
  apiToken: string;
  identifier: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  customFields?: Record<string, unknown>;
}

export async function upsertRespondIoContact({
  apiToken, identifier, firstName, lastName, phone, email, customFields,
}: UpsertContactParams) {
  return callRespondIo(
    `/contact/create_or_update/${encodeURIComponent(identifier)}`,
    apiToken,
    {
      method: "POST",
      body: {
        firstName, lastName, phone, email,
        custom_fields: customFields,
      },
    },
  );
}

export async function listContactChannels(apiToken: string, identifier: string) {
  return callRespondIo(
    `/contact/${encodeURIComponent(identifier)}/channels`,
    apiToken,
  );
}

/**
 * Resolve Respond.io credentials from a channel row.
 * Throws if the channel is missing, inactive, or not a Respond.io channel.
 */
export async function getRespondIoCredentials(channelId: string): Promise<RespondIoConfig> {
  const admin = createAdminClient();
  const { data: channel, error } = await admin
    .from("channels")
    .select("type, status, config, respond_io_channel_id, access_token")
    .eq("id", channelId)
    .single();

  if (error || !channel) throw new Error("Channel not found");
  if (channel.type !== "respond_io") throw new Error("Channel is not a Respond.io channel");
  if (channel.status !== "active") throw new Error("Channel is not active");

  const config = (channel.config || {}) as Partial<RespondIoConfig>;
  const apiToken = config.apiToken || channel.access_token;
  const respondChannelId = config.respondChannelId || channel.respond_io_channel_id;
  const respondChannelType = config.respondChannelType;

  if (!apiToken) throw new Error("Respond.io apiToken missing in channel.config");
  if (!respondChannelId) throw new Error("Respond.io respondChannelId missing in channel.config");

  return {
    apiToken,
    respondChannelId,
    respondChannelType: (respondChannelType || "whatsapp") as RespondIoChannelSource,
    workspaceId: config.workspaceId,
    webhookSecret: config.webhookSecret,
    displayName: config.displayName,
  };
}
