CREATE TABLE IF NOT EXISTS os_agent_templates (
  id              text PRIMARY KEY,
  publisher       text NOT NULL DEFAULT 'official',
  name            text NOT NULL,
  description     text NOT NULL DEFAULT '',
  category        text NOT NULL,
  icon            text,
  tier            text NOT NULL DEFAULT 'worker' CHECK (tier IN ('lead','specialist','worker')),
  model           text NOT NULL DEFAULT 'claude-sonnet-4-6',
  tools           jsonb NOT NULL DEFAULT '[]'::jsonb,
  constitution    jsonb NOT NULL DEFAULT '{}'::jsonb,
  suggested_skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggested_goals jsonb NOT NULL DEFAULT '[]'::jsonb,
  installs_count  int NOT NULL DEFAULT 0,
  featured        boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);
-- Public read (marketplace), no RLS enforcement (all orgs see all templates)

-- Seed with the 4 presets from S4-06 plus 4 more community-oriented
INSERT INTO os_agent_templates (id, name, description, category, icon, tier, constitution, suggested_skills, suggested_goals, featured) VALUES
('support-tier1', 'Support Tier 1', 'Responde consultas frecuentes, escala frustración a humano', 'support', 'headset', 'worker',
  '{"max_msg_per_hour":200,"escalate_on_negative_sentiment":true,"never_promise_prices":true}'::jsonb,
  '["reply.faq","escalate.negative"]'::jsonb, '["sla_response","trust_avg"]'::jsonb, true),
('sales-qualifier', 'Sales Qualifier', 'Califica leads con 3 preguntas y escala a humano si score>=0.7', 'sales', 'target', 'specialist',
  '{"max_msg_per_hour":100,"escalate_on_negative_sentiment":true,"never_promise_prices":true}'::jsonb,
  '["qualify.lead","schedule.meeting"]'::jsonb, '["leads_unassigned"]'::jsonb, true),
('content-writer', 'Content Writer', 'Genera 3 drafts de posts para redes con tono del brand', 'content', 'pencil', 'worker',
  '{"max_msg_per_hour":20}'::jsonb,
  '["draft.post","suggest.hashtags"]'::jsonb, '[]'::jsonb, true),
('escalator', 'Escalator', 'Detecta urgencia y notifica al canal Slack de guardia', 'monitoring', 'alert', 'worker',
  '{"max_msg_per_hour":500,"escalate_on_negative_sentiment":true}'::jsonb,
  '["detect.urgent","notify.slack"]'::jsonb, '["sla_response"]'::jsonb, true),
('community-manager', 'Community Manager', 'Modera comentarios, responde con voz de brand', 'community', 'users', 'specialist',
  '{"max_msg_per_hour":150,"escalate_on_negative_sentiment":true}'::jsonb,
  '["moderate.comment","respond.brand"]'::jsonb, '["trust_avg"]'::jsonb, false),
('appointment-scheduler', 'Appointment Scheduler', 'Agenda citas via calendario', 'sales', 'calendar', 'worker',
  '{"max_msg_per_hour":50}'::jsonb,
  '["check.calendar","confirm.slot"]'::jsonb, '[]'::jsonb, false),
('review-collector', 'Review Collector', 'Solicita reviews post-compra', 'growth', 'star', 'worker',
  '{"max_msg_per_hour":30}'::jsonb,
  '["request.review"]'::jsonb, '[]'::jsonb, false),
('churn-detector', 'Churn Detector', 'Detecta señales de churn y activa retention flow', 'retention', 'shield', 'specialist',
  '{"max_msg_per_hour":50}'::jsonb,
  '["detect.churn_signal","trigger.retention"]'::jsonb, '["trust_avg"]'::jsonb, false)
ON CONFLICT (id) DO NOTHING;

-- DOWN (Sprint 5 marketplace rollback):
-- DROP TABLE IF EXISTS os_agent_templates CASCADE;
