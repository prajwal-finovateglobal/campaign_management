-- Migration: Add lot_id column to cms_campaign_jobs table
-- Description: Links campaign jobs to their parent data lot for tracking and grouping
-- Date: 2026-01-26
-- Timezone: Asia/Kolkata

-- Add lot_id column to cms_campaign_jobs
ALTER TABLE cms_campaign_jobs 
ADD COLUMN IF NOT EXISTS lot_id INTEGER;

-- Add foreign key constraint
ALTER TABLE cms_campaign_jobs
ADD CONSTRAINT fk_campaign_jobs_lot FOREIGN KEY (lot_id) 
    REFERENCES cms_data_lots(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_campaign_jobs_lot_id ON cms_campaign_jobs(lot_id);

-- Add comment to column
COMMENT ON COLUMN cms_campaign_jobs.lot_id IS 'Foreign key to cms_data_lots - links campaign job to its data lot (nullable)';
