-- Migration: Add priority column to cms_data_managers table
-- Date: 2026-02-03

-- Add priority column with default value 0
ALTER TABLE cms_data_managers
ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0;

-- Add comment
COMMENT ON COLUMN cms_data_managers.priority IS 'Priority for data manager job execution (0 = default/lowest priority)';
