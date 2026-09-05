// Zod validators — límites del Graph API v26.0 aplicados server-side.
// Cliente puede confiar en tipos; server siempre re-valida.

import { z } from "zod";

// Nombre snake_case, ≤512 chars
export const templateNameSchema = z
  .string()
  .trim()
  .min(1, "El nombre es obligatorio")
  .max(512, "Máximo 512 caracteres")
  .regex(
    /^[a-z0-9_]+$/,
    "Solo minúsculas, números y guion bajo (snake_case)"
  );

export const languageSchema = z
  .string()
  .trim()
  .regex(/^[a-z]{2}(_[A-Z]{2})?$/, "Formato inválido (ej: es_CO, en_US, es)");

export const categorySchema = z.enum([
  "MARKETING",
  "UTILITY",
  "AUTHENTICATION",
]);

export const parameterFormatSchema = z.enum(["POSITIONAL", "NAMED"]);

// -----------------------------------------------------------------------------
// Buttons
// -----------------------------------------------------------------------------

const buttonBaseSchema = z.object({
  type: z.enum([
    "QUICK_REPLY",
    "URL",
    "PHONE_NUMBER",
    "COPY_CODE",
    "OTP",
    "FLOW",
    "VOICE_CALL",
    "CATALOG",
    "MPM",
  ]),
  text: z.string().max(25, "Máximo 25 caracteres en el texto del botón").optional(),
  url: z.string().url().optional(),
  phone_number: z
    .string()
    .regex(/^\+?[1-9]\d{6,14}$/, "Teléfono en formato E.164 (ej: +573001234567)")
    .optional(),
  example: z.array(z.string()).optional(),
  otp_type: z.enum(["COPY_CODE", "ONE_TAP", "ZERO_TAP"]).optional(),
  autofill_text: z.string().optional(),
  package_name: z.string().optional(),
  signature_hash: z.string().optional(),
  supported_apps: z
    .array(z.object({ package_name: z.string(), signature_hash: z.string() }))
    .optional(),
  flow_id: z.string().optional(),
  flow_action: z.enum(["navigate", "data_exchange"]).optional(),
  navigate_screen: z.string().optional(),
  zero_tap_terms_accepted: z.boolean().optional(),
});

export const buttonSchema = buttonBaseSchema.superRefine((btn, ctx) => {
  if (btn.type === "URL") {
    if (!btn.text) ctx.addIssue({ code: "custom", message: "URL requiere text", path: ["text"] });
    if (!btn.url) ctx.addIssue({ code: "custom", message: "URL requiere url", path: ["url"] });
    // URL dinámica: sólo sufijo puede ser variable
    if (btn.url && /\{\{/.test(btn.url) && !/\{\{\s*\d+\s*\}\}$/.test(btn.url)) {
      ctx.addIssue({
        code: "custom",
        message: "La variable sólo puede ir al final de la URL (ej: https://tu.com/{{1}})",
        path: ["url"],
      });
    }
  }
  if (btn.type === "QUICK_REPLY" && !btn.text) {
    ctx.addIssue({ code: "custom", message: "QUICK_REPLY requiere text", path: ["text"] });
  }
  if (btn.type === "PHONE_NUMBER") {
    if (!btn.text) ctx.addIssue({ code: "custom", message: "PHONE_NUMBER requiere text", path: ["text"] });
    if (!btn.phone_number) ctx.addIssue({ code: "custom", message: "PHONE_NUMBER requiere phone_number", path: ["phone_number"] });
  }
  if (btn.type === "COPY_CODE" && !btn.text) {
    ctx.addIssue({ code: "custom", message: "COPY_CODE requiere text", path: ["text"] });
  }
});

// -----------------------------------------------------------------------------
// Components
// -----------------------------------------------------------------------------

export const componentSchema = z
  .object({
    type: z.enum(["HEADER", "BODY", "FOOTER", "BUTTONS"]),
    format: z.enum(["TEXT", "IMAGE", "VIDEO", "DOCUMENT", "LOCATION"]).optional(),
    text: z.string().optional(),
    buttons: z.array(buttonSchema).max(10).optional(),
    example: z
      .object({
        header_text: z.array(z.string()).optional(),
        header_handle: z.array(z.string()).optional(),
        body_text: z.array(z.array(z.string())).optional(),
        body_text_named_params: z
          .array(z.object({ param_name: z.string(), example: z.string() }))
          .optional(),
      })
      .optional(),
    add_security_recommendation: z.boolean().optional(),
    code_expiration_minutes: z.number().int().positive().max(90).optional(),
  })
  .superRefine((c, ctx) => {
    if (c.type === "HEADER") {
      if (!c.format) ctx.addIssue({ code: "custom", message: "HEADER requiere format", path: ["format"] });
      if (c.format === "TEXT" && c.text && c.text.length > 60) {
        ctx.addIssue({ code: "custom", message: "HEADER TEXT máx 60 chars", path: ["text"] });
      }
    }
    if (c.type === "BODY") {
      if (!c.text) ctx.addIssue({ code: "custom", message: "BODY requiere text", path: ["text"] });
      if (c.text && c.text.length > 1024) {
        ctx.addIssue({ code: "custom", message: "BODY máx 1024 chars", path: ["text"] });
      }
    }
    if (c.type === "FOOTER") {
      if (!c.text) ctx.addIssue({ code: "custom", message: "FOOTER requiere text", path: ["text"] });
      if (c.text && c.text.length > 60) {
        ctx.addIssue({ code: "custom", message: "FOOTER máx 60 chars", path: ["text"] });
      }
      if (c.text && /\{\{/.test(c.text)) {
        ctx.addIssue({ code: "custom", message: "FOOTER no admite variables", path: ["text"] });
      }
    }
    if (c.type === "BUTTONS") {
      if (!c.buttons || c.buttons.length === 0) {
        ctx.addIssue({ code: "custom", message: "BUTTONS requiere al menos un botón", path: ["buttons"] });
      }
    }
  });

// -----------------------------------------------------------------------------
// Create / Edit template — reglas cross-component
// -----------------------------------------------------------------------------

export const createTemplateSchema = z
  .object({
    whatsapp_account_id: z.string().uuid(),
    name: templateNameSchema,
    language: languageSchema,
    category: categorySchema,
    parameter_format: parameterFormatSchema.default("POSITIONAL"),
    components: z.array(componentSchema).min(1, "Al menos un componente"),
    tag: z.string().max(120).optional(),
  })
  .superRefine((tpl, ctx) => {
    const types = tpl.components.map((c) => c.type);
    if (!types.includes("BODY")) {
      ctx.addIssue({ code: "custom", message: "BODY es obligatorio", path: ["components"] });
    }
    const dupes = types.filter((t, i, arr) => arr.indexOf(t) !== i);
    if (dupes.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: `Componente duplicado: ${dupes.join(", ")}. Solo uno por tipo.`,
        path: ["components"],
      });
    }
    // Body text URL fuera de botón → rechazo Meta INVALID_FORMAT (adelantamos)
    const body = tpl.components.find((c) => c.type === "BODY");
    if (body?.text && /https?:\/\/\S+/i.test(body.text)) {
      ctx.addIssue({
        code: "custom",
        message: "Las URLs deben ir en un botón CTA, no en el BODY (Meta rechaza)",
        path: ["components"],
      });
    }
  });

export const editTemplateSchema = z
  .object({
    category: categorySchema.optional(),
    components: z.array(componentSchema).optional(),
  })
  .refine((v) => v.category || v.components, {
    message: "Al menos category o components",
  });

// -----------------------------------------------------------------------------
// Send template
// -----------------------------------------------------------------------------

export const sendTemplateSchema = z.object({
  to: z
    .string()
    .regex(/^\d{7,15}$/, "Teléfono en formato E.164 sin '+' (ej: 573001234567)"),
  template_id: z.string().uuid(),
  components: z.array(z.unknown()).optional(),
});

export type CreateTemplatePayload = z.infer<typeof createTemplateSchema>;
export type EditTemplatePayload = z.infer<typeof editTemplateSchema>;
export type SendTemplatePayload = z.infer<typeof sendTemplateSchema>;
