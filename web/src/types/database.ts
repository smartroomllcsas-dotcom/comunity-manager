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
