// Wrapper mínimo Graph API v26.0 para WhatsApp Business Platform (Cloud API).
// Sin SDK oficial de Meta — fetch directo, ~200 LOC, cubre 90% del uso CM.
// No mezclar con /lib/whatsapp/api.ts que sirve al canal WAHA (unofficial).

import type {
  CreateTemplateInput,
  EditTemplateInput,
  MetaSendMessageResponse,
  MetaTemplateCreateResponse,
  MetaTemplateListResponse,
  WaComponent,
} from "./types";

const API_VERSION = process.env.WHATSAPP_CLOUD_API_VERSION || "v26.0";
const BASE = `https://graph.facebook.com/${API_VERSION}`;

export class WabaCloudApiError extends Error {
  status: number;
  code?: number;
  type?: string;
  subcode?: number;
  fbtrace_id?: string;
  raw: unknown;

  constructor(status: number, body: unknown) {
    const err = (body as { error?: { message?: string; code?: number; type?: string; error_subcode?: number; fbtrace_id?: string } })?.error;
    super(err?.message || `Graph API error ${status}`);
    this.name = "WabaCloudApiError";
    this.status = status;
    this.code = err?.code;
    this.type = err?.type;
    this.subcode = err?.error_subcode;
    this.fbtrace_id = err?.fbtrace_id;
    this.raw = body;
  }
}

async function metaFetch<T>(
  path: string,
  init: RequestInit & { token: string }
): Promise<T> {
  const { token, ...rest } = init;
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(rest.headers || {}),
    },
  });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = { error: { message: `Non-JSON response (${res.status})` } };
  }

  if (!res.ok) throw new WabaCloudApiError(res.status, body);
  return body as T;
}

/**
 * Cliente Graph API por WABA. Instanciar por request/tenant.
 * NO cachear entre tenants: cada uno tiene su token + WABA + phone.
 */
export class WabaCloudClient {
  constructor(
    public readonly wabaId: string,
    public readonly phoneNumberId: string,
    private readonly token: string
  ) {}

  // ---------------------------------------------------------------------------
  // Templates CRUD
  // ---------------------------------------------------------------------------

  createTemplate(input: CreateTemplateInput) {
    const body = {
      name: input.name,
      language: input.language,
      category: input.category,
      parameter_format: input.parameter_format ?? "POSITIONAL",
      components: input.components,
    };
    return metaFetch<MetaTemplateCreateResponse>(
      `/${this.wabaId}/message_templates`,
      { method: "POST", body: JSON.stringify(body), token: this.token }
    );
  }

  listTemplates(params: {
    status?: string;
    category?: string;
    language?: string;
    name?: string;
    name_or_content?: string;
    limit?: number;
    after?: string;
  } = {}) {
    const q = new URLSearchParams({
      fields:
        "id,name,language,category,status,quality_score,components,rejected_reason,previous_category,parameter_format",
      limit: String(params.limit ?? 100),
    });
    if (params.status) q.set("status", params.status);
    if (params.category) q.set("category", params.category);
    if (params.language) q.set("language", params.language);
    if (params.name) q.set("name", params.name);
    if (params.name_or_content) q.set("name_or_content", params.name_or_content);
    if (params.after) q.set("after", params.after);

    return metaFetch<MetaTemplateListResponse>(
      `/${this.wabaId}/message_templates?${q.toString()}`,
      { method: "GET", token: this.token }
    );
  }

  getTemplate(templateId: string) {
    const q = new URLSearchParams({
      fields:
        "id,name,language,category,status,quality_score,components,rejected_reason,previous_category,parameter_format",
    });
    return metaFetch<MetaTemplateListResponse["data"][number]>(
      `/${templateId}?${q.toString()}`,
      { method: "GET", token: this.token }
    );
  }

  editTemplate(templateId: string, patch: EditTemplateInput) {
    return metaFetch<{ success: boolean }>(`/${templateId}`, {
      method: "POST",
      body: JSON.stringify(patch),
      token: this.token,
    });
  }

  /**
   * Delete por hsm_id borra solo esa variante de idioma;
   * omitir hsmId borra TODAS las traducciones de ese `name`.
   */
  deleteTemplate(name: string, hsmId?: string) {
    const q = new URLSearchParams({ name });
    if (hsmId) q.set("hsm_id", hsmId);
    return metaFetch<{ success: boolean }>(
      `/${this.wabaId}/message_templates?${q.toString()}`,
      { method: "DELETE", token: this.token }
    );
  }

  // ---------------------------------------------------------------------------
  // Send
  // ---------------------------------------------------------------------------

  sendTemplateMessage(input: {
    to: string;
    templateName: string;
    language: string;
    components?: unknown[];
  }) {
    const body = {
      messaging_product: "whatsapp" as const,
      to: input.to,
      type: "template" as const,
      template: {
        name: input.templateName,
        language: { code: input.language },
        components: input.components ?? [],
      },
    };
    return metaFetch<MetaSendMessageResponse>(
      `/${this.phoneNumberId}/messages`,
      { method: "POST", body: JSON.stringify(body), token: this.token }
    );
  }

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------

  /**
   * Extrae número de placeholders del BODY (para preview + validación).
   * Cuenta variables únicas {{1..n}} en formato POSITIONAL.
   */
  static countBodyVariables(components: WaComponent[]): number {
    const body = components.find((c) => c.type === "BODY");
    if (!body?.text) return 0;
    const matches = body.text.match(/\{\{\s*(\d+)\s*\}\}/g) || [];
    const nums = new Set(matches.map((m) => Number(m.replace(/[^\d]/g, ""))));
    return nums.size;
  }
}

// -----------------------------------------------------------------------------
// Webhook signature verify (compartido — el receiver lo importa desde aquí)
// -----------------------------------------------------------------------------

import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  appSecret: string
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const received = signatureHeader.slice("sha256=".length);
  try {
    return (
      expected.length === received.length &&
      timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"))
    );
  } catch {
    return false;
  }
}
