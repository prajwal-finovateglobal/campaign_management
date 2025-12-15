-- PostgreSQL SQL Script to Create Client, Phase, and Campaign Tables
-- Execute these statements in order due to foreign key dependencies

-- ============================================================================
-- 1. CLIENT TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS client (
    id SERIAL PRIMARY KEY,
    name VARCHAR NOT NULL,
    meta_map JSONB NOT NULL,
    table_name VARCHAR NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add index on table_name for faster lookups
CREATE INDEX IF NOT EXISTS idx_client_table_name ON client(table_name);

-- Add comment to table
COMMENT ON TABLE client IS 'Stores client information and associates each client with a specific data table';
COMMENT ON COLUMN client.table_name IS 'Name of the associated DataLog table for this client';

-- ============================================================================
-- 2. PHASE TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS phase (
    id SERIAL PRIMARY KEY,
    name VARCHAR NOT NULL,
    client_id INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_phase_client 
        FOREIGN KEY (client_id) 
        REFERENCES client(id) 
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

-- Add index on client_id for faster joins
CREATE INDEX IF NOT EXISTS idx_phase_client_id ON phase(client_id);

-- Add comment to table
COMMENT ON TABLE phase IS 'Stores phases associated with clients';
COMMENT ON COLUMN phase.client_id IS 'Foreign key reference to client.id';

-- ============================================================================
-- 3. CAMPAIGN TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS campaign (
    id SERIAL PRIMARY KEY,
    campaign_name VARCHAR NOT NULL,
    upsert_time TIMESTAMP NOT NULL,
    phase_id INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_campaign_phase 
        FOREIGN KEY (phase_id) 
        REFERENCES phase(id) 
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

-- Add index on phase_id for faster joins
CREATE INDEX IF NOT EXISTS idx_campaign_phase_id ON campaign(phase_id);

-- Add index on campaign_name for faster searches
CREATE INDEX IF NOT EXISTS idx_campaign_name ON campaign(campaign_name);

-- Add comment to table
COMMENT ON TABLE campaign IS 'Stores campaigns associated with phases';
COMMENT ON COLUMN campaign.phase_id IS 'Foreign key reference to phase.id';
COMMENT ON COLUMN campaign.upsert_time IS 'Timestamp when campaign was created or last updated';

-- ============================================================================
-- OPTIONAL: Sample Data Insertion (for testing)
-- ============================================================================

-- Insert sample client
-- INSERT INTO client (name, meta_map, table_name) 
-- VALUES (
--     'Sample Client',
--     '{"key": "value"}'::jsonb,
--     'client1_table'
-- );

-- Insert sample phase (replace 1 with actual client_id)
-- INSERT INTO phase (name, client_id) 
-- VALUES ('Phase 1', 1);

-- Insert sample campaign (replace 1 with actual phase_id)
-- INSERT INTO campaign (campaign_name, upsert_time, phase_id) 
-- VALUES ('Campaign 1', CURRENT_TIMESTAMP, 1);

