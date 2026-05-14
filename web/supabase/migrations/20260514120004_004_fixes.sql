SET search_path TO smarttalk, public, auth, extensions;

-- Add channel_id to broadcasts for multi-channel support
ALTER TABLE broadcasts ADD COLUMN channel_id UUID REFERENCES channels(id) ON DELETE SET NULL;

-- Add token_expires_at to channels for token refresh tracking
ALTER TABLE channels ADD COLUMN token_expires_at TIMESTAMPTZ;

-- Index for token refresh cron job
CREATE INDEX idx_channels_token_expiry ON channels(token_expires_at) WHERE status = 'active';
