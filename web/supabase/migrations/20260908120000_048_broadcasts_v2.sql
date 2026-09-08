-- 048 · Difusiones v2
--
-- El módulo de difusiones original sólo servía con plantillas del sistema viejo
-- (message_templates), enviaba de inmediato a toda la organización y nunca
-- actualizaba entregados/leídos. Esta migración deja las tablas listas para:
--   · difusiones por EMPRESA (brand) y canal (WhatsApp API o WhatsApp por QR),
--   · plantillas nuevas aprobadas por Meta (public.cm_wa_templates) o texto libre
--     (QR), con variables por contacto,
--   · audiencia segmentada (etapa, etiqueta, origen, fecha, sin respuesta),
--   · envío programado y gradual (cupo por hora), pausa y cancelación,
--   · seguimiento real por destinatario (enviado, entregado, leído, respondido,
--     fallido con motivo, omitido con motivo).
--
-- Idempotente: se puede ejecutar más de una vez.
SET search_path TO smarttalk, public;

-- Estados nuevos
ALTER TYPE smarttalk.broadcast_status ADD VALUE IF NOT EXISTS 'paused';
ALTER TYPE smarttalk.broadcast_status ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TYPE smarttalk.broadcast_status ADD VALUE IF NOT EXISTS 'failed';
ALTER TYPE smarttalk.recipient_status ADD VALUE IF NOT EXISTS 'skipped';
ALTER TYPE smarttalk.recipient_status ADD VALUE IF NOT EXISTS 'replied';

-- Difusión
ALTER TABLE smarttalk.broadcasts
  ALTER COLUMN template_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS brand_id UUID,
  ADD COLUMN IF NOT EXISTS channel_kind TEXT NOT NULL DEFAULT 'whatsapp_cloud', -- whatsapp_cloud | waha
  ADD COLUMN IF NOT EXISTS wa_template_id UUID REFERENCES public.cm_wa_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS message_text TEXT,              -- texto libre (WhatsApp por QR)
  ADD COLUMN IF NOT EXISTS variables JSONB NOT NULL DEFAULT '{}'::jsonb,   -- {"nombre":"{{contacto.nombre}}","tema":"Promo"}
  ADD COLUMN IF NOT EXISTS audience JSONB NOT NULL DEFAULT '{}'::jsonb,    -- segmentación (ver lib/broadcasts/audience.ts)
  ADD COLUMN IF NOT EXISTS total_recipients INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS replied_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS skipped_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS send_rate_per_hour INT NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_broadcasts_brand_status ON smarttalk.broadcasts (brand_id, status, scheduled_at);

-- Destinatarios
ALTER TABLE smarttalk.broadcast_recipients
  ADD COLUMN IF NOT EXISTS wa_message_id TEXT,
  ADD COLUMN IF NOT EXISTS conversation_id UUID,
  ADD COLUMN IF NOT EXISTS error TEXT,
  ADD COLUMN IF NOT EXISTS skipped_reason TEXT,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS uq_broadcast_recipient ON smarttalk.broadcast_recipients (broadcast_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_status ON smarttalk.broadcast_recipients (broadcast_id, status);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_wamid ON smarttalk.broadcast_recipients (wa_message_id) WHERE wa_message_id IS NOT NULL;

-- Objeto marcador para validar que la migración quedó aplicada
COMMENT ON COLUMN smarttalk.broadcasts.audience IS 'Difusiones v2 (048): segmentación de audiencia por empresa.';
