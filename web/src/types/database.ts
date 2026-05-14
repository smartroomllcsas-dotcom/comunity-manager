export interface CMUser {
  id: string
  email: string
  password_hash: string
  name: string
  role: string
  plan: string
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface CMClient {
  id: string
  user_id: string
  name: string
  industry: string | null
  platforms: string[]
  status: 'active' | 'onboarding' | 'paused'
  posts_this_month: number
  brand_voice: string | null
  language: string
  created_at: string
  updated_at: string
  smarttalk_organization_id?: string | null
}

export interface CMContentPillar {
  id: string
  client_id: string
  name: string
  color: string
  post_count: number
  created_at: string
}

export interface CMScheduledPost {
  id: string
  client_id: string
  user_id: string
  platform: string
  title: string
  content: string | null
  pillar: string | null
  scheduled_date: string
  scheduled_time: string
  day_of_week: number
  time_slot: number
  status: 'draft' | 'scheduled' | 'published' | 'failed'
  created_at: string
}

export interface CMAgent {
  id: string
  name: string
  role: string
  description: string | null
  skills: number
  phase: number
  status: 'active' | 'coming-soon'
  created_at: string
}

export interface CMActivityLog {
  id: string
  user_id: string
  action: string
  status: 'success' | 'info' | 'warning' | 'error'
  created_at: string
}

export interface CMOAuthState {
  state: string
  client_id: string
  created_at: string
}

export interface CMSocialAccount {
  id: string
  client_id: string
  meta_user_id: string
  access_token: string
  page_id: string | null
  page_name: string | null
  page_access_token: string | null
  instagram_id: string | null
  instagram_username: string | null
  ad_account_id: string | null
  ad_account_name: string | null
  business_id: string | null
  scopes: string[]
  token_expires_at: string | null
  connected_at: string
  updated_at: string
}

export interface CMWhatsAppAccount {
  id: string
  client_id: string | null
  user_id: string | null
  waba_id: string
  phone_number_id: string
  access_token: string
  display_phone_number: string | null
  verified_name: string | null
  connected_at: string
  updated_at: string
}

export interface CMChatMessage {
  id: string
  user_id: string
  client_context: string | null
  mode: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}


// --- SmartTalk / inbox multicanal (schema smarttalk) ---

export type AgentRole = "admin" | "supervisor" | "agent";
export type AgentStatus = "online" | "away" | "offline";
export type ConversationStatus = "open" | "pending" | "resolved" | "closed";
export type ConversationPriority = "low" | "medium" | "high";
export type MessageDirection = "inbound" | "outbound";
export type MessageType = "text" | "image" | "video" | "audio" | "document" | "template" | "interactive" | "location" | "sticker";
export type MessageStatus = "pending" | "sent" | "delivered" | "read" | "failed";
export type TemplateCategory = "marketing" | "utility" | "authentication";
export type TemplateStatus = "approved" | "pending" | "rejected";
export type BroadcastStatus = "draft" | "scheduled" | "sending" | "completed";
export type RecipientStatus = "pending" | "sent" | "delivered" | "read" | "failed";
export type TriggerType = "keyword" | "first_message" | "menu_option";
export type AIProvider = "openai" | "anthropic";
export type ChannelType = "whatsapp_business_api" | "whatsapp_cloud_api" | "facebook_messenger" | "instagram" | "telegram" | "tiktok" | "webchat" | "custom";
export type ChannelStatus = "active" | "disconnected" | "pending" | "error";
export type CustomFieldType = "text" | "number" | "date" | "time" | "list" | "checkbox" | "url";

export interface Organization {
  id: string;
  name: string;
  whatsapp_phone_number_id: string | null;
  whatsapp_business_account_id: string | null;
  access_token: string | null;
  webhook_verify_token: string;
  business_hours: { timezone: string; schedule: Record<string, { open: string; close: string; enabled: boolean }> };
  plan_id: string | null;
  trial_ends_at: string | null;
  is_active: boolean;
  created_at: string;
  plan?: Plan;
  cm_client_id?: string | null;
}

export interface Plan {
  id: string;
  name: string;
  max_agents: number;
  max_contacts: number;
  max_broadcasts_per_month: number;
  max_chatbot_flows: number;
  ai_enabled: boolean;
  price_monthly: number;
  created_at: string;
}

export interface Invitation {
  id: string;
  organization_id: string;
  email: string;
  role: AgentRole;
  invited_by: string;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
}

export interface Channel {
  id: string;
  organization_id: string;
  type: ChannelType;
  name: string;
  status: ChannelStatus;
  whatsapp_phone_number_id: string | null;
  whatsapp_business_account_id: string | null;
  whatsapp_phone_number: string | null;
  access_token: string | null;
  facebook_app_id: string | null;
  meta_business_id: string | null;
  config: Record<string, unknown>;
  connected_at: string | null;
  last_active_at: string | null;
  token_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Agent {
  id: string;
  organization_id: string;
  name: string;
  email: string;
  role: AgentRole;
  status: AgentStatus;
  max_concurrent_chats: number;
  is_super_admin: boolean;
  created_at: string;
}

export interface Contact {
  id: string;
  organization_id: string;
  wa_id: string;
  name: string | null;
  profile_picture_url: string | null;
  tags: string[];
  custom_fields: Record<string, string>;
  created_at: string;
  last_message_at: string | null;
  lifecycle_stage_id: string | null;
  lifecycle_stage?: LifecycleStage;
}

export interface Conversation {
  id: string;
  organization_id: string;
  contact_id: string;
  assigned_agent_id: string | null;
  status: ConversationStatus;
  priority: ConversationPriority;
  unread_count: number;
  last_message_preview: string | null;
  metadata: Record<string, unknown>;
  opened_at: string;
  resolved_at: string | null;
  created_at: string;
  channel_id: string | null;
  snoozed_until: string | null;
  closing_category: string | null;
  closing_notes: string | null;
  closed_by: string | null;
  first_response_at: string | null;
  first_assigned_at: string | null;
  updated_at: string;
  contact?: Contact;
  assigned_agent?: Agent;
  channel?: Channel;
}

export interface Message {
  id: string;
  conversation_id: string;
  contact_id: string | null;
  agent_id: string | null;
  direction: MessageDirection;
  type: MessageType;
  content: MessageContent;
  wa_message_id: string | null;
  status: MessageStatus;
  is_bot: boolean;
  created_at: string;
  agent?: Agent;
}

export type MessageContent =
  | { type: "text"; text: string }
  | { type: "image"; url: string; caption?: string }
  | { type: "video"; url: string; caption?: string }
  | { type: "audio"; url: string }
  | { type: "document"; url: string; filename: string; caption?: string }
  | { type: "template"; template_name: string; language: string; components: unknown[] }
  | { type: "interactive"; interactive_type: "button" | "list"; body: string; buttons?: { id: string; title: string }[]; sections?: { title: string; rows: { id: string; title: string; description?: string }[] }[] }
  | { type: "location"; latitude: number; longitude: number; name?: string }
  | { type: "sticker"; url: string };

export interface MessageTemplate {
  id: string;
  organization_id: string;
  wa_template_id: string | null;
  name: string;
  language: string;
  category: TemplateCategory;
  components: unknown[];
  status: TemplateStatus;
  created_at: string;
}

export interface Broadcast {
  id: string;
  organization_id: string;
  name: string;
  template_id: string;
  contact_filter: { tags?: string[] };
  status: BroadcastStatus;
  scheduled_at: string | null;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  channel_id: string | null;
  created_at: string;
  template?: MessageTemplate;
  channel?: Pick<Channel, "id" | "name" | "whatsapp_phone_number"> | null;
}

export interface BroadcastRecipient {
  id: string;
  broadcast_id: string;
  contact_id: string;
  status: RecipientStatus;
  sent_at: string | null;
  contact?: Contact;
}

export interface ChatbotFlowNode {
  id: string;
  type: "message" | "menu" | "condition" | "assign_agent" | "ai_handoff";
  content?: string;
  prompt?: string;
  team?: string;
  keyword?: string;
  options?: { label: string; next: string }[];
  next?: string;
  match_next?: string;
  no_match_next?: string;
}

export interface ChatbotFlow {
  id: string;
  organization_id: string;
  name: string;
  trigger_type: TriggerType;
  trigger_value: string | null;
  flow_data: { nodes: ChatbotFlowNode[] };
  is_active: boolean;
  created_at: string;
}

export interface AIConfig {
  id: string;
  organization_id: string;
  provider: AIProvider;
  model: string;
  system_prompt: string;
  knowledge_base: string[];
  escalation_rules: { keywords: string[]; max_turns: number };
  max_turns: number;
  is_active: boolean;
  created_at: string;
}

export interface QuickReply {
  id: string;
  organization_id: string;
  shortcut: string;
  content: string;
  created_at: string;
}

export type InvitationStatus = "pending" | "accepted" | "expired" | "cancelled";

export interface Invitation {
  id: string;
  organization_id: string;
  email: string;
  role: AgentRole;
  status: InvitationStatus;
  invited_by: string;
  expires_at: string;
  created_at: string;
  inviter?: Agent;
}

export interface InternalNote {
  id: string;
  conversation_id: string;
  agent_id: string;
  content: string;
  created_at: string;
  agent?: Agent;
}

export interface Team {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at?: string;
  members?: AgentTeam[];
}

export interface AgentTeam {
  id: string;
  agent_id: string;
  team_id: string;
  created_at: string;
  agent?: Agent;
  team?: Team;
}

export interface LifecycleStage {
  id: string;
  organization_id: string;
  name: string;
  type: string;
  color: string;
  position: number;
  is_default: boolean;
  created_at: string;
}

export interface LifecycleHistory {
  id: string;
  contact_id: string;
  organization_id: string;
  from_stage_id: string | null;
  to_stage_id: string;
  changed_by: string | null;
  changed_by_type: string;
  created_at: string;
  from_stage?: LifecycleStage;
  to_stage?: LifecycleStage;
}

export interface Tag {
  id: string;
  organization_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface ContactFieldDefinition {
  id: string;
  organization_id: string;
  name: string;
  field_key: string;
  type: CustomFieldType;
  options: unknown[];
  description: string | null;
  visibility: string;
  position: number;
  created_at: string;
}

export interface ContactSegment {
  id: string;
  organization_id: string;
  name: string;
  conditions: unknown[];
  contact_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClosingCategory {
  id: string;
  organization_id: string;
  name: string;
  created_at: string;
}

export interface ContactActivity {
  id: string;
  contact_id: string;
  organization_id: string;
  type: string;
  description: string;
  metadata: Record<string, unknown>;
  performed_by: string | null;
  created_at: string;
  performer?: Agent;
}

export interface AssignmentRule {
  id: string;
  organization_id: string;
  name: string;
  type: string;
  team_id: string | null;
  is_active: boolean;
  config: Record<string, unknown>;
  created_at: string;
  team?: Team;
}

export type SubscriptionStatus = "trial" | "active" | "past_due" | "cancelled" | "suspended";
export type PaymentStatus = "pending" | "approved" | "rejected" | "failed";
export type PaymentMethod = "credit_card" | "pse" | "cash";

export interface Subscription {
  id: string;
  organization_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  epayco_subscription_id: string | null;
  epayco_customer_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  payment_method: PaymentMethod | null;
  last_payment_at: string | null;
  last_payment_amount: number | null;
  created_at: string;
  updated_at: string;
  organization?: Organization;
  plan?: Plan;
}

export interface Payment {
  id: string;
  organization_id: string;
  subscription_id: string | null;
  epayco_ref: string | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  payment_method: string | null;
  description: string | null;
  epayco_response: Record<string, unknown>;
  created_at: string;
  organization?: Organization;
}

export interface UsageRecord {
  id: string;
  organization_id: string;
  period_start: string;
  period_end: string;
  contacts_count: number;
  messages_sent: number;
  broadcasts_sent: number;
  agents_count: number;
  created_at: string;
}

export interface KnowledgeSource {
  id: string;
  organization_id: string;
  ai_config_id: string | null;
  ai_agent_id: string | null;
  type: string;
  name: string;
  content: string | null;
  url: string | null;
  file_path: string | null;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type AIAgentType = "receptionist" | "sales" | "support" | "custom";

export type AIActionType =
  | "close_conversation"
  | "assign_agent"
  | "assign_team"
  | "update_lifecycle"
  | "update_contact_field"
  | "update_tag"
  | "add_comment"
  | "trigger_workflow"
  | "http_request";

export interface AIActionConfig {
  type: AIActionType;
  enabled: boolean;
  instructions?: string;
  config?: Record<string, unknown>;
}

export interface AIAgent {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  emoji: string;
  agent_type: AIAgentType;
  system_prompt: string;
  actions: AIActionConfig[];
  max_tokens: number;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  knowledge_sources?: KnowledgeSource[];
}

