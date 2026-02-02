-- Rollback: Remove lot_id column from cms_campaign_jobs
-- Description: Reverts the addition of lot_id column
-- WARNING: This will delete all lot_id references in cms_campaign_jobs
-- Date: 2026-01-26

-- Drop index first
DROP INDEX IF EXISTS idx_campaign_jobs_lot_id;

-- Drop foreign key constraint
ALTER TABLE cms_campaign_jobs
DROP CONSTRAINT IF EXISTS fk_campaign_jobs_lot;

-- Drop the column
ALTER TABLE cms_campaign_jobs
DROP COLUMN IF EXISTS lot_id;
