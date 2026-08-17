-- Finance module DDL for Community Manager
-- Apply on server via:
--   ssh server 'docker exec -i standby-smartmedia-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1' \
--     < web/migrations/finance_tables.sql
--
-- Uses schema `smarttalk`. brand_id references public.cm_clients(id) (same
-- pattern as smarttalk.channels).

CREATE TABLE IF NOT EXISTS smarttalk.finance_transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id      uuid NOT NULL REFERENCES public.cm_clients(id) ON DELETE CASCADE,
  source        text NOT NULL,              -- 'statement_upload' | 'stripe' | 'wise' | 'fanbasis' | 'manual'
  external_id   text,                       -- provider id / row hash for dedup
  amount_cents  bigint NOT NULL,            -- signed: negative = expense, positive = income
  currency      text NOT NULL DEFAULT 'USD',
  category      text NOT NULL DEFAULT 'Uncategorized',
  tx_date       date NOT NULL,
  description   text NOT NULL DEFAULT '',
  raw           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_transactions_dedup_uk
  ON smarttalk.finance_transactions (brand_id, source, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS finance_transactions_brand_date_ix
  ON smarttalk.finance_transactions (brand_id, tx_date DESC);

CREATE INDEX IF NOT EXISTS finance_transactions_category_ix
  ON smarttalk.finance_transactions (brand_id, category);

CREATE TABLE IF NOT EXISTS smarttalk.finance_uploaded_statements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id      uuid NOT NULL REFERENCES public.cm_clients(id) ON DELETE CASCADE,
  filename      text NOT NULL,
  uploaded_at   timestamptz NOT NULL DEFAULT now(),
  parsed_count  integer NOT NULL DEFAULT 0,
  uploader_id   uuid,
  meta          jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS finance_uploaded_statements_brand_ix
  ON smarttalk.finance_uploaded_statements (brand_id, uploaded_at DESC);
