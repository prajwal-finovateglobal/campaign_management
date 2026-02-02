-- Migration: Create cms_data_lots table
-- Description: New table to manage data lots (batches) that go through multiple phases
-- Date: 2026-01-26
-- Timezone: Asia/Kolkata

-- Create cms_data_lots table
CREATE TABLE IF NOT EXISTS cms_data_lots (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    client_id INTEGER NOT NULL,
    max_phases INTEGER NOT NULL DEFAULT 1,
    current_phase_no INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    total_records INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata'),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata'),
    ended_at TIMESTAMP WITH TIME ZONE,
    
    -- Foreign key constraint
    CONSTRAINT fk_data_lots_client FOREIGN KEY (client_id) 
        REFERENCES cms_client(id) ON DELETE CASCADE,
    
    -- Unique constraint: unique lot name per client
    CONSTRAINT uq_data_lots_name_client UNIQUE (name, client_id),
    
    -- Check constraints
    CONSTRAINT chk_max_phases_positive CHECK (max_phases > 0),
    CONSTRAINT chk_current_phase_positive CHECK (current_phase_no >= 1),
    CONSTRAINT chk_current_phase_within_max CHECK (current_phase_no <= max_phases),
    CONSTRAINT chk_total_records_non_negative CHECK (total_records >= 0),
    CONSTRAINT chk_status_valid CHECK (status IN ('active', 'completed', 'paused', 'cancelled'))
);

-- Create indexes for better query performance
CREATE INDEX idx_data_lots_client_id ON cms_data_lots(client_id);
CREATE INDEX idx_data_lots_status ON cms_data_lots(status);
CREATE INDEX idx_data_lots_created_at ON cms_data_lots(created_at DESC);
CREATE INDEX idx_data_lots_current_phase ON cms_data_lots(current_phase_no);

-- Add comment to table
COMMENT ON TABLE cms_data_lots IS 'Manages data lots (batches) that go through multiple phases of campaign processing';

-- Add comments to columns
COMMENT ON COLUMN cms_data_lots.id IS 'Primary key, auto-increment';
COMMENT ON COLUMN cms_data_lots.name IS 'Human-readable lot identifier';
COMMENT ON COLUMN cms_data_lots.client_id IS 'Foreign key to cms_client';
COMMENT ON COLUMN cms_data_lots.max_phases IS 'Maximum number of phases this lot will go through';
COMMENT ON COLUMN cms_data_lots.current_phase_no IS 'Current active phase number';
COMMENT ON COLUMN cms_data_lots.status IS 'Current status: active, completed, paused, cancelled';
COMMENT ON COLUMN cms_data_lots.total_records IS 'Total number of records in this data lot';
COMMENT ON COLUMN cms_data_lots.created_at IS 'Timestamp when lot was created (Asia/Kolkata timezone)';
COMMENT ON COLUMN cms_data_lots.updated_at IS 'Timestamp when lot was last updated (Asia/Kolkata timezone)';
COMMENT ON COLUMN cms_data_lots.ended_at IS 'Timestamp when lot was completed/cancelled (Asia/Kolkata timezone)';
