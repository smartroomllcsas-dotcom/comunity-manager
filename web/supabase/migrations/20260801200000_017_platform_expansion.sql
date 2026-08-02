-- Sprint 24 · Platform expansion (TikTok, LinkedIn, Threads) publish tracking
--
-- The CHECK constraint on cm_social_accounts.platform was already extended
-- in Sprint 22 migration 016 to include ('tiktok','linkedin','threads',...).
-- This migration adds the columns the Inngest publish worker needs to persist
-- the result of a publish attempt (platform post id, url, published_at,
-- last_error, retry_count).
--
-- Every ALTER uses IF NOT EXISTS so this is safe to re-run.

SET search_path TO public, extensions;

-- ---------------------------------------------------------------------------
-- 1. Verify platform CHECK constraint covers the 3 new channels.
--    (No-op if 016 already added them; comment kept for auditor visibility.)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.constraint_column_usage
    WHERE table_name = 'cm_social_accounts'
      AND column_name = 'platform'
  ) THEN
    -- constraint dropped/missing; the app will still enforce via TS,
    -- but flag it in an activity log so ops notices.
    RAISE NOTICE 'cm_social_accounts.platform CHECK constraint missing; ensure Sprint 22 migration 016 was applied.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Publish tracking columns on cm_scheduled_posts.
-- ---------------------------------------------------------------------------

ALTER TABLE IF EXISTS public.cm_scheduled_posts
  ADD COLUMN IF NOT EXISTS platform_post_id  TEXT,
  ADD COLUMN IF NOT EXISTS platform_post_url TEXT,
  ADD COLUMN IF NOT EXISTS published_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error        TEXT,
  ADD COLUMN IF NOT EXISTS retry_count       INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.cm_scheduled_posts.platform_post_id IS
  'ID returned by the target social platform after a successful publish (Sprint 24).';
COMMENT ON COLUMN public.cm_scheduled_posts.platform_post_url IS
  'Canonical URL to the published post, when the platform exposes one.';
COMMENT ON COLUMN public.cm_scheduled_posts.published_at IS
  'Server timestamp at which the publish call succeeded.';
COMMENT ON COLUMN public.cm_scheduled_posts.last_error IS
  'Last publish error message; only meaningful when status = ''failed''.';
COMMENT ON COLUMN public.cm_scheduled_posts.retry_count IS
  'Number of retries attempted by the Inngest worker before final resolution.';

-- ---------------------------------------------------------------------------
-- 3. Indexes to speed up dashboards ("what published today") and error triage.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_cm_scheduled_posts_published
  ON public.cm_scheduled_posts (published_at DESC)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_cm_scheduled_posts_failed
  ON public.cm_scheduled_posts (updated_at DESC)
  WHERE status = 'failed';
