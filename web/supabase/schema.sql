-- Community Manager Platform Schema
-- Prefix: cm_ (shared Supabase DB)

-- Users table (basic auth)
CREATE TABLE IF NOT EXISTS cm_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'admin',
  plan TEXT DEFAULT 'pro',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Clients (brands managed by the user)
CREATE TABLE IF NOT EXISTS cm_clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES cm_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  industry TEXT,
  platforms TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'onboarding' CHECK (status IN ('active', 'onboarding', 'paused')),
  posts_this_month INTEGER DEFAULT 0,
  brand_voice TEXT,
  language TEXT DEFAULT 'en',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Content Pillars per client
CREATE TABLE IF NOT EXISTS cm_content_pillars (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES cm_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  post_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Scheduled Posts (calendar)
CREATE TABLE IF NOT EXISTS cm_scheduled_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES cm_clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES cm_users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  pillar TEXT,
  scheduled_date DATE NOT NULL,
  scheduled_time TIME NOT NULL,
  day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
  time_slot INTEGER CHECK (time_slot BETWEEN 0 AND 23),
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('draft', 'scheduled', 'published', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Agents
CREATE TABLE IF NOT EXISTS cm_agents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  description TEXT,
  skills INTEGER DEFAULT 0,
  phase INTEGER DEFAULT 1,
  status TEXT DEFAULT 'coming-soon' CHECK (status IN ('active', 'coming-soon')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Activity Log
CREATE TABLE IF NOT EXISTS cm_activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES cm_users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  status TEXT DEFAULT 'info' CHECK (status IN ('success', 'info', 'warning', 'error')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Chat History
CREATE TABLE IF NOT EXISTS cm_chat_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES cm_users(id) ON DELETE CASCADE,
  client_context TEXT,
  mode TEXT DEFAULT 'B',
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Policies
ALTER TABLE cm_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE cm_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE cm_content_pillars ENABLE ROW LEVEL SECURITY;
ALTER TABLE cm_scheduled_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cm_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE cm_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE cm_chat_history ENABLE ROW LEVEL SECURITY;

-- Agents are readable by all authenticated
CREATE POLICY "cm_agents_read" ON cm_agents FOR SELECT USING (true);

-- Users can read/update their own profile
CREATE POLICY "cm_users_own" ON cm_users FOR ALL USING (true);

-- Clients belong to user
CREATE POLICY "cm_clients_own" ON cm_clients FOR ALL USING (true);

-- Pillars through client
CREATE POLICY "cm_pillars_own" ON cm_content_pillars FOR ALL USING (true);

-- Posts belong to user
CREATE POLICY "cm_posts_own" ON cm_scheduled_posts FOR ALL USING (true);

-- Activity belongs to user
CREATE POLICY "cm_activity_own" ON cm_activity_log FOR ALL USING (true);

-- Chat belongs to user
CREATE POLICY "cm_chat_own" ON cm_chat_history FOR ALL USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cm_clients_user ON cm_clients(user_id);
CREATE INDEX IF NOT EXISTS idx_cm_posts_client ON cm_scheduled_posts(client_id);
CREATE INDEX IF NOT EXISTS idx_cm_posts_user ON cm_scheduled_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_cm_activity_user ON cm_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_cm_chat_user ON cm_chat_history(user_id);
CREATE INDEX IF NOT EXISTS idx_cm_pillars_client ON cm_content_pillars(client_id);

-- Seed default agents
INSERT INTO cm_agents (name, role, description, skills, phase, status) VALUES
  ('Orchestrator', 'Central Coordinator', 'Routes requests to specialist agents, manages workflows, and ensures quality across all operations.', 8, 1, 'active'),
  ('Content Writer', 'Content Creation', 'Generates platform-native content adapted to each client brand voice and content pillars.', 6, 1, 'active'),
  ('Scheduler', 'Calendar Management', 'Manages content calendar, optimizes posting times, and handles scheduling across platforms.', 5, 1, 'active'),
  ('Analyst', 'Performance Analytics', 'Tracks engagement metrics, generates reports, and provides data-driven recommendations.', 4, 1, 'active'),
  ('Visual Designer', 'Image Generation', 'Creates visual content, image prompts, and maintains brand visual consistency.', 5, 2, 'coming-soon'),
  ('Community Manager', 'Engagement & DMs', 'Handles community interactions, responds to comments, and manages direct messages.', 4, 2, 'coming-soon'),
  ('Ad Manager', 'Paid Campaigns', 'Creates and optimizes paid advertising campaigns across Meta, Google, and TikTok.', 6, 2, 'coming-soon'),
  ('SEO Specialist', 'Search Optimization', 'Optimizes content for search visibility, manages keywords, and tracks rankings.', 4, 3, 'coming-soon'),
  ('Email Marketer', 'Email Campaigns', 'Designs email sequences, newsletters, and automated marketing funnels.', 5, 3, 'coming-soon'),
  ('Crisis Handler', 'Reputation Management', 'Monitors brand sentiment, handles negative situations, and manages crisis communication.', 3, 3, 'coming-soon'),
  ('Trend Scout', 'Trend Analysis', 'Monitors trending topics, hashtags, and viral content opportunities across platforms.', 4, 3, 'coming-soon')
ON CONFLICT DO NOTHING;
