export const BILLING_FEATURES = {
  TEAM_MEMBERS: "team.members",
  BRANDS_TOTAL: "brands.total",
  CHANNELS_ACTIVE: "channels.active",
  CONTACTS_TOTAL: "contacts.total",
  MESSAGES_OUTBOUND_MONTH: "messages.outbound_month",
  BROADCASTS_MONTH: "broadcasts.month",
  POSTS_MONTH: "posts.month",
  AUTOMATION_FLOWS: "automations.flows",
  AI_ACCESS: "ai.access",
  AI_REQUESTS_MONTH: "ai.requests_month",
  REPORTS_ACCESS: "reports.access",
  STORAGE_BYTES: "storage.bytes",
} as const;

export type BillingFeatureCode =
  (typeof BILLING_FEATURES)[keyof typeof BILLING_FEATURES];

export type BillingEnforcementMode = "off" | "observe" | "soft" | "hard";

