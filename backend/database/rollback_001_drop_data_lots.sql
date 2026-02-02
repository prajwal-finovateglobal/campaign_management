-- Rollback: Drop cms_data_lots table
-- Description: Reverts the creation of cms_data_lots table
-- WARNING: This will delete all data in cms_data_lots table
-- Date: 2026-01-26

-- Drop indexes first
DROP INDEX IF EXISTS idx_data_lots_current_phase;
DROP INDEX IF EXISTS idx_data_lots_created_at;
DROP INDEX IF EXISTS idx_data_lots_status;
DROP INDEX IF EXISTS idx_data_lots_client_id;

-- Drop trigger
DROP TRIGGER IF EXISTS trigger_update_data_lots_updated_at ON cms_data_lots;

-- Drop the table (this will also drop all constraints)
DROP TABLE IF EXISTS cms_data_lots CASCADE;

-- Note: The trigger function update_updated_at_column() is kept 
-- as it may be used by other tables. If you want to drop it:
-- DROP FUNCTION IF EXISTS update_updated_at_column();
