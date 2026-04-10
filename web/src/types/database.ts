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

export interface CMChatMessage {
  id: string
  user_id: string
  client_context: string | null
  mode: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}
