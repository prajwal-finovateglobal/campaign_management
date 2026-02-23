-- ============================================================================
-- Migration 004: Create cms_campaign_state table
-- Purpose: Tracks backend-driven auto-run loop state for multiple-type campaigns
-- Date: 2026-02-20
-- ============================================================================

CREATE TABLE IF NOT EXISTS cms_campaign_state (
    id                  BIGSERIAL PRIMARY KEY,
    campaign_id         BIGINT NOT NULL REFERENCES cms_campaign(id) ON DELETE CASCADE,
    client_id           BIGINT NOT NULL,

    -- Overall run state: idle, running, paused, stopped, completed
    status              VARCHAR(20) NOT NULL DEFAULT 'idle',

    -- Control flag read by the loop: run, pause, stop
    action              VARCHAR(10) NOT NULL DEFAULT 'run',

    -- Config snapshot at the time auto-run was started
    gap_seconds         INTEGER NOT NULL DEFAULT 30,

    -- Progress tracking
    current_chunk_index INTEGER NOT NULL DEFAULT 0,
    total_chunks        INTEGER NOT NULL DEFAULT 0,

    -- Per-chunk progress stored as JSONB array
    -- Each element: { chunk_id, chunk_name, status, message }
    -- status values: pending, starting, started, waiting_finish, countdown, finished, failed
    chunk_progress      JSONB,

    -- Timestamps
    started_at          TIMESTAMP WITH TIME ZONE,
    ended_at            TIMESTAMP WITH TIME ZONE,
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT ((timezone('Asia/Kolkata', NOW()))::timestamp AT TIME ZONE 'Asia/Kolkata'),
    updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT ((timezone('Asia/Kolkata', NOW()))::timestamp AT TIME ZONE 'Asia/Kolkata'),

    -- One row per campaign
    CONSTRAINT uq_campaign_state_campaign_id UNIQUE (campaign_id),

    -- Valid status values
    CONSTRAINT chk_campaign_state_status CHECK (status IN ('idle', 'running', 'paused', 'stopped', 'completed')),

    -- Valid action values
    CONSTRAINT chk_campaign_state_action CHECK (action IN ('run', 'pause', 'stop')),

    -- gap_seconds must be non-negative
    CONSTRAINT chk_campaign_state_gap CHECK (gap_seconds >= 0)
);

-- Index for quick lookup by client
CREATE INDEX IF NOT EXISTS idx_campaign_state_client_id
ON cms_campaign_state(client_id);

-- Index for filtering by status (e.g. find all running loops)
CREATE INDEX IF NOT EXISTS idx_campaign_state_status
ON cms_campaign_state(status);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION update_campaign_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = ((timezone('Asia/Kolkata', NOW()))::timestamp AT TIME ZONE 'Asia/Kolkata');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_campaign_state_updated_at ON cms_campaign_state;
CREATE TRIGGER trigger_update_campaign_state_updated_at
    BEFORE UPDATE ON cms_campaign_state
    FOR EACH ROW
    EXECUTE FUNCTION update_campaign_state_updated_at();

-- Comments
COMMENT ON TABLE cms_campaign_state IS 'Backend auto-run loop state for multiple-type campaigns. One row per campaign.';
COMMENT ON COLUMN cms_campaign_state.status IS 'idle | running | paused | stopped | completed';
COMMENT ON COLUMN cms_campaign_state.action IS 'Control flag read by loop: run | pause | stop';
COMMENT ON COLUMN cms_campaign_state.gap_seconds IS 'Countdown gap in seconds between chunks';
COMMENT ON COLUMN cms_campaign_state.current_chunk_index IS '0-based index of the chunk currently being processed';
COMMENT ON COLUMN cms_campaign_state.chunk_progress IS 'JSONB array: [{chunk_id, chunk_name, status, message}]';
