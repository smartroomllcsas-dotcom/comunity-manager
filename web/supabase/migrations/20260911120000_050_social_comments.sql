-- 050 · Comentarios de publicaciones y pautas (Facebook e Instagram)
--
-- Cada comentario de un lead se guarda aquí para poder responderlo en público,
-- escribirle al interno (private reply de Meta) y, cuando contesta, seguir la
-- conversación en el Inbox con el agente de la empresa.
--
-- Aislamiento: organization_id + brand_id, como el resto del modelo.
-- Idempotente.
SET search_path TO smarttalk, public;

CREATE TABLE IF NOT EXISTS smarttalk.social_comments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL,
  brand_id           UUID,
  channel_id         UUID,
  platform           TEXT NOT NULL,                       -- facebook | instagram
  comment_id         TEXT NOT NULL,                       -- id del comentario en Meta
  parent_id          TEXT,                                -- comentario padre (si es respuesta)
  post_id            TEXT,
  post_permalink     TEXT,
  is_ad              BOOLEAN NOT NULL DEFAULT FALSE,      -- comentario en una pauta
  ad_id              TEXT,
  author_id          TEXT,                                -- id del autor en Meta
  author_name        TEXT,
  message            TEXT,
  commented_at       TIMESTAMPTZ,
  status             TEXT NOT NULL DEFAULT 'nuevo',       -- nuevo | respondido | ignorado | fallido
  public_reply_text  TEXT,
  public_reply_id    TEXT,
  public_replied_at  TIMESTAMPTZ,
  dm_text            TEXT,
  dm_message_id      TEXT,
  dm_sent_at         TIMESTAMPTZ,
  last_error         TEXT,
  contact_id         UUID,                                -- lead creado al abrir el interno
  conversation_id    UUID,
  replied_by         UUID,                                -- asesor, si fue manual
  handled_by         TEXT,                                -- auto | manual
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_social_comments_comment_id
  ON smarttalk.social_comments (comment_id);

CREATE INDEX IF NOT EXISTS idx_social_comments_brand
  ON smarttalk.social_comments (brand_id, status, commented_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_comments_author
  ON smarttalk.social_comments (brand_id, author_id);

ALTER TABLE smarttalk.social_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS social_comments_service ON smarttalk.social_comments;
CREATE POLICY social_comments_service
  ON smarttalk.social_comments USING (true) WITH CHECK (true);

COMMENT ON TABLE smarttalk.social_comments IS
  'Comentarios de publicaciones y pautas por empresa (050): respuesta pública, mensaje al interno y enlace al chat.';
