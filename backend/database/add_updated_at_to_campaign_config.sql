-- Add updated_at column to cms_campaign_config table
ALTER TABLE cms_campaign_config 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata');

-- Add comment
COMMENT ON COLUMN cms_campaign_config.updated_at IS 'Last updated timestamp in Asia/Kolkata timezone';
