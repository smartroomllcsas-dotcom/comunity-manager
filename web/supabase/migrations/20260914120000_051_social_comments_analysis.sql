-- 051 · Análisis de cada comentario (sentimiento, intención, urgencia)
--
-- Sustituye al módulo "Escucha social", que nunca llegó a guardar una sola
-- mención: sondeaba cada 15 minutos una tabla de cuentas vieja, con los tokens
-- y los identificadores vacíos, y en otra pantalla. Los comentarios ya entran
-- aquí al instante por webhook y por empresa, así que el análisis se hace
-- sobre ellos en vez de montar una segunda tubería.
--
-- Idempotente.
SET search_path TO smarttalk, public;

ALTER TABLE smarttalk.social_comments
  ADD COLUMN IF NOT EXISTS sentiment       TEXT,        -- positivo | neutral | negativo
  ADD COLUMN IF NOT EXISTS sentiment_score NUMERIC(4,3),-- -1.000 (peor) a 1.000 (mejor)
  ADD COLUMN IF NOT EXISTS intent          TEXT,        -- pregunta | compra | queja | elogio | spam | otro
  ADD COLUMN IF NOT EXISTS urgency         SMALLINT,    -- 0 a 100
  ADD COLUMN IF NOT EXISTS analyzed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS needs_human     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS needs_human_reason TEXT;

-- El panel de las últimas 24 h y el aviso de crisis leen por marca y fecha.
CREATE INDEX IF NOT EXISTS idx_social_comments_brand_analysis
  ON smarttalk.social_comments (brand_id, commented_at DESC)
  INCLUDE (sentiment, urgency, needs_human);

-- Lo que espera revisión de una persona se consulta aparte y es poco.
CREATE INDEX IF NOT EXISTS idx_social_comments_needs_human
  ON smarttalk.social_comments (brand_id, commented_at DESC)
  WHERE needs_human;
