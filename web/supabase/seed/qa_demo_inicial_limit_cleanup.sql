-- Remove only the synthetic QA data created by qa_demo_inicial_limit.sql.
-- The existing [QA] Marca Demo Inicial brand is intentionally preserved.

BEGIN;
SET LOCAL search_path TO smarttalk, public, auth, extensions;

DELETE FROM smarttalk.invitation_brand_assignments
WHERE invitation_id IN (
  SELECT id
  FROM smarttalk.invitations
  WHERE organization_id = (SELECT id FROM smarttalk.organizations WHERE name = 'QA Agencia Inicial' ORDER BY created_at DESC LIMIT 1)
    AND email LIKE 'qa-%@communitymanager.invalid'
);

DELETE FROM smarttalk.invitations
WHERE organization_id = (SELECT id FROM smarttalk.organizations WHERE name = 'QA Agencia Inicial' ORDER BY created_at DESC LIMIT 1)
  AND email LIKE 'qa-%@communitymanager.invalid';

DELETE FROM smarttalk.broadcasts
WHERE organization_id = (SELECT id FROM smarttalk.organizations WHERE name = 'QA Agencia Inicial' ORDER BY created_at DESC LIMIT 1)
  AND name LIKE '[QA] Difusión Sintética%';

DELETE FROM smarttalk.message_templates
WHERE organization_id = (SELECT id FROM smarttalk.organizations WHERE name = 'QA Agencia Inicial' ORDER BY created_at DESC LIMIT 1)
  AND name = '[QA] Plantilla Sintética';

DELETE FROM smarttalk.chatbot_flows
WHERE organization_id = (SELECT id FROM smarttalk.organizations WHERE name = 'QA Agencia Inicial' ORDER BY created_at DESC LIMIT 1)
  AND name LIKE '[QA] Flujo Sintético%';

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
