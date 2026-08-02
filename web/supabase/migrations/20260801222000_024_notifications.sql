-- Sprint 26 · Agente Q — Real notifications (Resend / Slack / WhatsApp templates)
-- Persistent log of every outbound notification, per-org isolated via RLS.

CREATE TABLE IF NOT EXISTS public.cm_notifications_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  client_id UUID,
  channel TEXT NOT NULL CHECK (channel IN ('email','slack','whatsapp','sms','webhook')),
  recipient TEXT NOT NULL,   -- email / phone / slack channel or webhook target
  subject TEXT,
  body_preview TEXT,          -- primeros 500 chars, para debugging sin exponer todo
  template_id TEXT,
  variables JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','bounced')),
  provider_id TEXT,           -- id del provider (Resend id, Slack ts, WA msg id)
  error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cm_notifications_log_org_time
  ON public.cm_notifications_log (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cm_notifications_log_status
  ON public.cm_notifications_log (status)
  WHERE status IN ('pending','failed');

ALTER TABLE public.cm_notifications_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE tablename = 'cm_notifications_log'
      AND policyname = 'cm_notifications_log_org_isolation'
  ) THEN
    CREATE POLICY "cm_notifications_log_org_isolation" ON public.cm_notifications_log
      FOR ALL USING (
        organization_id = (SELECT smarttalk.get_agent_org_id() FROM auth.users LIMIT 1)
      );
  END IF;
END $$;
