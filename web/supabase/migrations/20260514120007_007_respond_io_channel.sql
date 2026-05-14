SET search_path TO smarttalk, public, auth, extensions;

-- 007_respond_io_channel.sql
-- Add Respond.io as a channel provider.
-- Credentials live in channels.config (JSONB): { apiToken, respondChannelId, respondChannelType, webhookSecret? }

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'channel_type' AND e.enumlabel = 'respond_io'
  ) THEN
    ALTER TYPE channel_type ADD VALUE 'respond_io';
  END IF;
END$$;

-- Optional indexed reference to the Respond.io workspace-level channel id
ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS respond_io_channel_id TEXT;

CREATE INDEX IF NOT EXISTS idx_channels_respond_io_channel_id
  ON channels (respond_io_channel_id)
  WHERE respond_io_channel_id IS NOT NULL;

COMMENT ON COLUMN channels.respond_io_channel_id IS
  'Respond.io channelId for this connected channel. See channels.config for apiToken and metadata.';
