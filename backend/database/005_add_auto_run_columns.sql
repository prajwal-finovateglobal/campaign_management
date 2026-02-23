-- ============================================================================
-- Migration 005: Option B — use cms_chunks for per-chunk auto-run progress
-- Purpose:
--   1. Add auto_run_status + auto_run_message columns to cms_chunks
--      (keeps Millis.ai 'status' column fully separate and untouched)
--   2. Drop chunk_progress JSON column from cms_campaign_state
--      (no longer needed — cms_chunks rows replace it)
-- Date: 2026-02-20
-- ============================================================================

-- ── 1. cms_chunks: add auto-run progress columns ──────────────────────────

-- Loop-specific status for display (completely separate from Millis.ai status)
-- Values: pending | starting | started | waiting_finish | countdown | finished | failed
ALTER TABLE cms_chunks
    ADD COLUMN IF NOT EXISTS auto_run_status VARCHAR(30);

-- Human-readable message for the UI (e.g. "Waiting... elapsed=40s", "Next chunk in 12s...")
ALTER TABLE cms_chunks
    ADD COLUMN IF NOT EXISTS auto_run_message TEXT;

-- Index for quickly fetching all chunks for a campaign by auto_run_status
CREATE INDEX IF NOT EXISTS idx_chunks_auto_run_status
    ON cms_chunks(campaign_id, auto_run_status);

COMMENT ON COLUMN cms_chunks.auto_run_status IS
    'Auto-run loop status: pending|starting|started|waiting_finish|countdown|finished|failed. Independent of Millis.ai status.';
COMMENT ON COLUMN cms_chunks.auto_run_message IS
    'Human-readable progress message for the auto-run UI.';


-- ── 2. cms_campaign_state: drop chunk_progress (replaced by cms_chunks) ───

ALTER TABLE cms_campaign_state
    DROP COLUMN IF EXISTS chunk_progress;

COMMENT ON TABLE cms_campaign_state IS
    'Backend auto-run loop state for multiple-type campaigns. Per-chunk progress is now in cms_chunks.auto_run_status/auto_run_message.';
