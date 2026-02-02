-- Migration: Create trigger for auto-updating updated_at timestamp
-- Description: Automatically updates updated_at column when record is modified
-- Date: 2026-01-26
-- Timezone: Asia/Kolkata

-- Create or replace function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on cms_data_lots table
DROP TRIGGER IF EXISTS trigger_update_data_lots_updated_at ON cms_data_lots;

CREATE TRIGGER trigger_update_data_lots_updated_at
    BEFORE UPDATE ON cms_data_lots
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comment to trigger
COMMENT ON TRIGGER trigger_update_data_lots_updated_at ON cms_data_lots 
    IS 'Automatically updates updated_at timestamp to Asia/Kolkata timezone on record modification';
