-- Ensure the existing public cm_social_accounts table matches the current Meta flow
-- schema used by the app. This migration is idempotent and safe to run on
-- environments where the table already exists but is missing token columns.

ALTER TABLE IF EXISTS public.cm_social_accounts
  ADD COLUMN IF NOT EXISTS access_token TEXT;

ALTER TABLE IF EXISTS public.cm_social_accounts
  ADD COLUMN IF NOT EXISTS page_access_token TEXT;

ALTER TABLE IF EXISTS public.cm_social_accounts
  ADD COLUMN IF NOT EXISTS meta_user_id TEXT;

ALTER TABLE IF EXISTS public.cm_social_accounts
  ADD COLUMN IF NOT EXISTS page_id TEXT;

ALTER TABLE IF EXISTS public.cm_social_accounts
  ADD COLUMN IF NOT EXISTS page_name TEXT;

ALTER TABLE IF EXISTS public.cm_social_accounts
  ADD COLUMN IF NOT EXISTS instagram_id TEXT;

ALTER TABLE IF EXISTS public.cm_social_accounts
  ADD COLUMN IF NOT EXISTS instagram_username TEXT;

ALTER TABLE IF EXISTS public.cm_social_accounts
  ADD COLUMN IF NOT EXISTS ad_account_id TEXT;

ALTER TABLE IF EXISTS public.cm_social_accounts
  ADD COLUMN IF NOT EXISTS ad_account_name TEXT;

ALTER TABLE IF EXISTS public.cm_social_accounts
  ADD COLUMN IF NOT EXISTS business_id TEXT;

ALTER TABLE IF EXISTS public.cm_social_accounts
  ADD COLUMN IF NOT EXISTS scopes TEXT[] DEFAULT '{}';

ALTER TABLE IF EXISTS public.cm_social_accounts
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;

ALTER TABLE IF EXISTS public.cm_social_accounts
  ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE IF EXISTS public.cm_social_accounts
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

