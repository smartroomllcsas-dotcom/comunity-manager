-- =============================================================================
-- smarttalk schema bootstrap
-- =============================================================================
-- Run this FIRST in Supabase Studio (https://studio.smartgenapp.com) before
-- applying 001..007. Creates a dedicated schema so smarttalk tables live next
-- to bliss (same Postgres instance, fully isolated namespace) and grants the
-- standard Supabase roles access.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS smarttalk;

-- Allow the supabase roles to use the schema
GRANT USAGE ON SCHEMA smarttalk TO postgres, anon, authenticated, service_role;

-- Existing objects (none on first run, but safe on re-runs)
GRANT ALL ON ALL TABLES    IN SCHEMA smarttalk TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA smarttalk TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA smarttalk TO postgres, anon, authenticated, service_role;

-- Future objects created by migrations 001..007
ALTER DEFAULT PRIVILEGES IN SCHEMA smarttalk
  GRANT ALL ON TABLES    TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA smarttalk
  GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA smarttalk
  GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;

-- =============================================================================
-- AFTER running 001..007, run on node-01 (root):
--   docker compose -f /opt/stack/supabase/docker-compose.yml exec -T rest \
--     sh -c 'echo "PGRST_DB_SCHEMAS=public,smarttalk,graphql_public,storage"'
-- Or edit /opt/stack/supabase/.env and add "smarttalk" to PGRST_DB_SCHEMAS,
-- then: docker compose restart rest kong
--
-- To enable Realtime on smarttalk tables (inbox live updates):
--   ALTER PUBLICATION supabase_realtime ADD TABLE
--     smarttalk.messages,
--     smarttalk.conversations,
--     smarttalk.contacts;
-- =============================================================================
