// WhatsApp Business Platform (Cloud API oficial) — tipos multi-tenant CM.
// Aditivo a /lib/whatsapp/{api,types,webhook}.ts que sirven a WAHA (canal beta).
// Alineado con Graph API v26.0 y schema public.cm_wa_templates.

export type WaTemplateStatus =
  | "APPROVED"
  | "PENDING"
  | "REJECTED"
  | "PAUSED"
  | "DISABLED"
  | "IN_APPEAL"
  | "PENDING_DELETION";

export type WaTemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";
export type WaTemplateQuality = "GREEN" | "YELLOW" | "RED" | "UNKNOWN";
export type WaParameterFormat = "POSITIONAL" | "NAMED";

// -----------------------------------------------------------------------------
// Componentes (schema Meta)
// -----------------------------------------------------------------------------

export type WaComponentType = "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
export type WaHeaderFormat = "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION";

export type WaButtonType =
  | "QUICK_REPLY"
  | "URL"
  | "PHONE_NUMBER"
  | "COPY_CODE"
  | "OTP"
  | "FLOW"
  | "VOICE_CALL"
  | "CATALOG"
  | "MPM";

export interface WaButton {
  type: WaButtonType;
  text?: string;                    // QUICK_REPLY / URL / PHONE_NUMBER / COPY_CODE
  url?: string;                     // URL — puede tener {{1}} al final
  phone_number?: string;            // PHONE_NUMBER — E.164
  example?: string[];               // URL con variable → sample suffix
  otp_type?: "COPY_CODE" | "ONE_TAP" | "ZERO_TAP";
  autofill_text?: string;           // OTP ONE_TAP autofill button label
  package_name?: string;            // OTP ONE_TAP Android
  signature_hash?: string;          // OTP ONE_TAP Android
  supported_apps?: Array<{ package_name: string; signature_hash: string }>;
  flow_id?: string;                 // FLOW
  flow_action?: "navigate" | "data_exchange";
  navigate_screen?: string;
  zero_tap_terms_accepted?: boolean;
}

export interface WaComponent {
  type: WaComponentType;
  format?: WaHeaderFormat;          // solo HEADER
  text?: string;                    // HEADER TEXT / BODY / FOOTER
  buttons?: WaButton[];             // BUTTONS
  example?: {
    header_text?: string[];
    header_handle?: string[];       // resumable upload media handle
    body_text?: string[][];         // positional
    body_text_named_params?: Array<{ param_name: string; example: string }>;
  };
  add_security_recommendation?: boolean; // AUTHENTICATION BODY
  code_expiration_minutes?: number;      // AUTHENTICATION FOOTER
}

// -----------------------------------------------------------------------------
// Row types (DB)
// -----------------------------------------------------------------------------

export interface CmWaTemplate {
  id: string;
  client_id: string;
  whatsapp_account_id: string;
  meta_id: string | null;
  name: string;
  language: string;
  category: WaTemplateCategory;
  status: WaTemplateStatus;
  quality: WaTemplateQuality;
  components: WaComponent[];
  parameter_format: WaParameterFormat;
  rejection_reason: string | null;
  previous_category: WaTemplateCategory | null;
  tag: string | null;
  created_by_cm_user_id: string | null;
  synced_at: string;
  created_at: string;
  updated_at: string;
}

export interface CmWaTemplateSend {
  id: string;
  client_id: string;
  whatsapp_account_id: string;
  template_id: string | null;
  to_phone: string;
  template_name: string;
  language: string;
  wamid: string | null;
  status: "queued" | "sent" | "delivered" | "read" | "failed";
  error: Record<string, unknown> | null;
  sent_by_cm_user_id: string | null;
  created_at: string;
  updated_at: string;
}

// -----------------------------------------------------------------------------
// API DTOs
// -----------------------------------------------------------------------------

export interface CreateTemplateInput {
  name: string;
  language: string;
  category: WaTemplateCategory;
  parameter_format?: WaParameterFormat;
  components: WaComponent[];
  tag?: string;
}

export interface EditTemplateInput {
  category?: WaTemplateCategory;
  components?: WaComponent[];
}

export interface SendTemplateInput {
  to: string;                       // E.164 sin +
  template_id: string;              // uuid cm_wa_templates.id
  components?: unknown[];           // payload send params (opcional si no hay vars)
}

// -----------------------------------------------------------------------------
// Meta API response shapes
// -----------------------------------------------------------------------------

export interface MetaTemplateCreateResponse {
  id: string;
  status: WaTemplateStatus;
  category: WaTemplateCategory;
}

export interface MetaTemplateListResponse {
  data: Array<{
    id: string;
    name: string;
    language: string;
    category: WaTemplateCategory;
    status: WaTemplateStatus;
    quality_score?: { score: WaTemplateQuality };
    components?: WaComponent[];
    rejected_reason?: string;
    previous_category?: WaTemplateCategory;
    parameter_format?: WaParameterFormat;
  }>;
  paging?: { cursors?: { before?: string; after?: string }; next?: string };
}

export interface MetaSendMessageResponse {
  messaging_product: "whatsapp";
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string; message_status?: string }>;
}
