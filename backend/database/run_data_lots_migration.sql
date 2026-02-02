-- Master Migration Script: Data Lots Implementation
-- Description: Runs all migrations to add cms_data_lots table and lot_id column
-- Date: 2026-01-26
-- Timezone: Asia/Kolkata
-- 
-- USAGE:
--   psql -h <host> -U <user> -d <database> -f run_data_lots_migration.sql
--
-- PREREQUISITE: 
--   - Backup database before running
--   - Ensure no active campaign jobs are running
--   - Verify cms_client table exists

\echo '========================================='
\echo 'Starting Data Lots Migration'
\echo '========================================='
\echo ''

-- Enable timing to show how long each step takes
\timing on

\echo '>> Step 1: Creating cms_data_lots table...'
\i 001_create_data_lots_table.sql
\echo '✓ Step 1 completed'
\echo ''

\echo '>> Step 2: Creating updated_at trigger for cms_data_lots...'
\i 002_create_updated_at_trigger.sql
\echo '✓ Step 2 completed'
\echo ''

\echo '>> Step 3: Adding lot_id column to cms_campaign_jobs...'
\i 003_add_lot_id_to_campaign_jobs.sql
\echo '✓ Step 3 completed'
\echo ''

\echo '========================================='
\echo 'Verifying Migration Results'
\echo '========================================='
\echo ''

-- Verify cms_data_lots table exists
\echo '>> Checking cms_data_lots table...'
SELECT 
    COUNT(*) as table_exists 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'cms_data_lots';

-- Verify cms_data_lots columns
\echo ''
\echo '>> cms_data_lots table structure:'
\d cms_data_lots

-- Verify lot_id column exists in cms_campaign_jobs
\echo ''
\echo '>> Checking lot_id column in cms_campaign_jobs...'
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'cms_campaign_jobs'
AND column_name = 'lot_id';

-- Verify foreign key constraint
\echo ''
\echo '>> Verifying foreign key constraints:'
SELECT
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
AND (tc.table_name = 'cms_data_lots' OR tc.table_name = 'cms_campaign_jobs')
ORDER BY tc.table_name;

-- Verify indexes
\echo ''
\echo '>> Verifying indexes:'
SELECT
    schemaname,
    tablename,
    indexname
FROM pg_indexes
WHERE schemaname = 'public'
AND (tablename = 'cms_data_lots' OR 
     (tablename = 'cms_campaign_jobs' AND indexname LIKE '%lot_id%'))
ORDER BY tablename, indexname;

-- Verify trigger
\echo ''
\echo '>> Verifying trigger:'
SELECT
    trigger_name,
    event_manipulation,
    event_object_table,
    action_timing,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'cms_data_lots'
AND trigger_name = 'trigger_update_data_lots_updated_at';

\echo ''
\echo '========================================='
\echo 'Migration Completed Successfully!'
\echo '========================================='
\echo ''
\echo 'Next steps:'
\echo '1. Update your application code to use the new DataLot model'
\echo '2. Restart your application to load the new models'
\echo '3. Test creating data lots and linking campaign jobs'
\echo ''
\echo 'Rollback commands (if needed):'
\echo '  psql -f rollback_002_remove_lot_id_from_campaign_jobs.sql'
\echo '  psql -f rollback_001_drop_data_lots.sql'
\echo ''

\timing off
