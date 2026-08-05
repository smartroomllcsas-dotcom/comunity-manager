-- Remove only the synthetic QA data created by qa_demo_inicial_limit.sql.
-- The existing [QA] Marca Demo Inicial brand is intentionally preserved.

BEGIN;
SET LOCAL search_path TO smarttalk, public, auth, extensions;

DELETE FROM smarttalk.messages
WHERE wa_message_id LIKE 'qa-seed:%';

DELETE FROM smarttalk.conversations
WHERE metadata ->> 'qa_seed' = 'true';

DELETE FROM smarttalk.contacts
WHERE custom_fields ->> 'qa_seed' = 'true';

DELETE FROM smarttalk.channels
WHERE config ->> 'qa_seed' = 'true';

DELETE FROM public.cm_clients
WHERE name LIKE '[QA] Marca Limite %';

COMMIT;
