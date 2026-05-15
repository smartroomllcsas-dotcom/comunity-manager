-- Public grants for the Community Manager app on Supabase
-- Apply this once in the Supabase SQL editor or through your migration pipeline.
--
-- The app uses the public anon key from the browser, so the database role
-- needs explicit table privileges in addition to RLS policies.

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated;

-- Login reads cm_users directly from the browser via the anon client.
GRANT SELECT, INSERT, UPDATE, DELETE ON cm_users TO anon, authenticated;
