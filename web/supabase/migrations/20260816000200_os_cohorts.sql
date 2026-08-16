CREATE TABLE os_cohorts (
  id              text PRIMARY KEY,           -- 'community-os', 'brain-preview', etc.
  label           text NOT NULL,
  description     text NOT NULL DEFAULT '',
  full_rollout    boolean NOT NULL DEFAULT false,
  emails          text[] NOT NULL DEFAULT '{}',
  org_ids         uuid[] NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- No RLS: this is a global config table (accessed by service role from flag decide())
-- Owner-only mutation is enforced at API layer

INSERT INTO os_cohorts (id, label, description, full_rollout, emails)
VALUES ('community-os', 'Community OS', 'Access to /os/* namespace', false, ARRAY['leonelzc2005@gmail.com', 'leonel.zc2005@gmail.com'])
ON CONFLICT (id) DO NOTHING;

-- DOWN (Sprint 3 cohorts rollback):
-- DROP TABLE IF EXISTS os_cohorts CASCADE;
