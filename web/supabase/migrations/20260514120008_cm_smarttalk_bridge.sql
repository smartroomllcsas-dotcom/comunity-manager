-- Enlaza clientes de Community Manager con organizaciones SmartTalk (inbox multicanal).
SET search_path TO smarttalk, public, auth, extensions;

ALTER TABLE smarttalk.organizations
  ADD COLUMN IF NOT EXISTS cm_client_id UUID REFERENCES public.cm_clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_cm_client_id
  ON smarttalk.organizations(cm_client_id);

ALTER TABLE public.cm_clients
  ADD COLUMN IF NOT EXISTS smarttalk_organization_id UUID REFERENCES smarttalk.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cm_clients_smarttalk_organization_id
  ON public.cm_clients(smarttalk_organization_id);
