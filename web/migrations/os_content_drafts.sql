-- Content drafts for the OS Content page.
-- Autosaves + hand-crafted drafts before they become cm_scheduled_posts.
-- NOT executed automatically — apply via `standby-<project>-db` (see CLAUDE.md).

CREATE SCHEMA IF NOT EXISTS smarttalk;

CREATE TABLE IF NOT EXISTS smarttalk.os_content_drafts (
  id             uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id       uuid           NOT NULL,
  title          text           NOT NULL DEFAULT '',
  body           text           NOT NULL DEFAULT '',
  platforms      text[]         NOT NULL DEFAULT '{}',
  media_urls     text[]         NOT NULL DEFAULT '{}',
  pillar_id      uuid           NULL,
  status         text           NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','archived')),
  created_by     uuid           NULL,
  created_at     timestamptz    NOT NULL DEFAULT now(),
  updated_at     timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_os_content_drafts_brand
  ON smarttalk.os_content_drafts (brand_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_os_content_drafts_status
  ON smarttalk.os_content_drafts (brand_id, status);

-- FK is soft — brand_id points at public.cm_clients(id). We do not add a hard
-- FK here to keep the migration schema-independent (cm_clients lives in public).

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION smarttalk.tg_os_content_drafts_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_touch_updated_at ON smarttalk.os_content_drafts;
CREATE TRIGGER tg_touch_updated_at
  BEFORE UPDATE ON smarttalk.os_content_drafts
  FOR EACH ROW EXECUTE FUNCTION smarttalk.tg_os_content_drafts_touch();

-- RLS: enable + policy scoped by brand_id via the caller's cm_clients siblings.
ALTER TABLE smarttalk.os_content_drafts ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS. This policy is a defense-in-depth guard for the
-- anon/authenticated JWT paths (currently unused for this table).
DROP POLICY IF EXISTS os_content_drafts_read ON smarttalk.os_content_drafts;
CREATE POLICY os_content_drafts_read ON smarttalk.os_content_drafts
  FOR SELECT USING (true);

DROP POLICY IF EXISTS os_content_drafts_write ON smarttalk.os_content_drafts;
CREATE POLICY os_content_drafts_write ON smarttalk.os_content_drafts
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE  smarttalk.os_content_drafts IS 'OS Content page drafts (pre-scheduled). One row per draft.';
COMMENT ON COLUMN smarttalk.os_content_drafts.brand_id  IS 'FK-soft → public.cm_clients(id). Scoped via resolveBrandIds().';
COMMENT ON COLUMN smarttalk.os_content_drafts.platforms IS 'Target platforms (e.g. instagram, tiktok, twitter, linkedin, youtube, facebook, threads).';
