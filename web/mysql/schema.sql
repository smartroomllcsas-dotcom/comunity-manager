CREATE DATABASE IF NOT EXISTS comunity_manager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE comunity_manager;

CREATE TABLE IF NOT EXISTS cm_users (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'admin',
  plan VARCHAR(50) DEFAULT 'pro',
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cm_clients (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  industry VARCHAR(255),
  platforms JSON,
  status VARCHAR(50) DEFAULT 'onboarding',
  posts_this_month INT DEFAULT 0,
  brand_voice TEXT,
  language VARCHAR(10) DEFAULT 'en',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cm_content_pillars (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  color VARCHAR(100) NOT NULL,
  post_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cm_scheduled_posts (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  platform VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT,
  pillar VARCHAR(255),
  scheduled_date DATE NOT NULL,
  scheduled_time TIME NOT NULL,
  day_of_week INT,
  time_slot INT,
  status VARCHAR(50) DEFAULT 'scheduled',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cm_agents (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(255) NOT NULL,
  description TEXT,
  skills INT DEFAULT 0,
  phase INT DEFAULT 1,
  status VARCHAR(50) DEFAULT 'coming-soon',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cm_activity_log (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  action TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'info',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cm_chat_history (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  client_context TEXT,
  mode VARCHAR(10) DEFAULT 'B',
  role VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cm_oauth_states (
  state VARCHAR(255) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cm_social_accounts (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  meta_user_id VARCHAR(255) NOT NULL,
  access_token TEXT NOT NULL,
  page_id VARCHAR(255),
  page_name VARCHAR(255),
  page_access_token TEXT,
  instagram_id VARCHAR(255),
  instagram_username VARCHAR(255),
  ad_account_id VARCHAR(255),
  ad_account_name VARCHAR(255),
  business_id VARCHAR(255),
  scopes JSON,
  token_expires_at TIMESTAMP NULL,
  connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cm_whatsapp_accounts (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36),
  user_id VARCHAR(36),
  waba_id VARCHAR(255) NOT NULL,
  phone_number_id VARCHAR(255) NOT NULL,
  access_token TEXT NOT NULL,
  display_phone_number VARCHAR(100),
  verified_name VARCHAR(255),
  connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_whatsapp_account (waba_id, phone_number_id)
);

CREATE INDEX idx_cm_clients_user ON cm_clients(user_id);
CREATE INDEX idx_cm_posts_client ON cm_scheduled_posts(client_id);
CREATE INDEX idx_cm_posts_user ON cm_scheduled_posts(user_id);
CREATE INDEX idx_cm_activity_user ON cm_activity_log(user_id);
CREATE INDEX idx_cm_chat_user ON cm_chat_history(user_id);
CREATE INDEX idx_cm_pillars_client ON cm_content_pillars(client_id);
CREATE INDEX idx_cm_social_client ON cm_social_accounts(client_id);
CREATE INDEX idx_cm_whatsapp_client ON cm_whatsapp_accounts(client_id);
CREATE INDEX idx_cm_whatsapp_user ON cm_whatsapp_accounts(user_id);

INSERT IGNORE INTO cm_agents (id, name, role, description, skills, phase, status) VALUES
  (UUID(), 'Orchestrator', 'Central Coordinator', 'Routes requests to specialist agents, manages workflows, and ensures quality across all operations.', 8, 1, 'active'),
  (UUID(), 'Content Writer', 'Content Creation', 'Generates platform-native content adapted to each client brand voice and content pillars.', 6, 1, 'active'),
  (UUID(), 'Scheduler', 'Calendar Management', 'Manages content calendar, optimizes posting times, and handles scheduling across platforms.', 5, 1, 'active'),
  (UUID(), 'Analyst', 'Performance Analytics', 'Tracks engagement metrics, generates reports, and provides data-driven recommendations.', 4, 1, 'active'),
  (UUID(), 'Visual Designer', 'Image Generation', 'Creates visual content, image prompts, and maintains brand visual consistency.', 5, 2, 'coming-soon'),
  (UUID(), 'Community Manager', 'Engagement & DMs', 'Handles community interactions, responds to comments, and manages direct messages.', 4, 2, 'coming-soon'),
  (UUID(), 'Ad Manager', 'Paid Campaigns', 'Creates and optimizes paid advertising campaigns across Meta, Google, and TikTok.', 6, 2, 'coming-soon'),
  (UUID(), 'SEO Specialist', 'Search Optimization', 'Optimizes content for search visibility, manages keywords, and tracks rankings.', 4, 3, 'coming-soon'),
  (UUID(), 'Email Marketer', 'Email Campaigns', 'Designs email sequences, newsletters, and automated marketing funnels.', 5, 3, 'coming-soon'),
  (UUID(), 'Crisis Handler', 'Reputation Management', 'Monitors brand sentiment, handles negative situations, and manages crisis communication.', 3, 3, 'coming-soon'),
  (UUID(), 'Trend Scout', 'Trend Analysis', 'Monitors trending topics, hashtags, and viral content opportunities across platforms.', 4, 3, 'coming-soon');
