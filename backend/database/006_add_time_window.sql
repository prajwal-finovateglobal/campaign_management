-- Migration 006: Time-window columns for cms_campaign_state
-- Allow the auto-run loop to operate only within a daily IST time window.
-- e.g. start_time = '09:30', end_time = '19:30'
-- Outside the window the loop sleeps (status = 'scheduled') and resumes
-- automatically when the window opens the next day.
-- Date: 2026-02-22

-- TIME (no timezone) -- values are always interpreted as IST by the application.
-- NULL means "no restriction" -- loop runs 24x7.

ALTER TABLE cms_campaign_state
    ADD COLUMN IF NOT EXISTS start_time TIME NULL,
    ADD COLUMN IF NOT EXISTS end_time   TIME NULL;

COMMENT ON COLUMN cms_campaign_state.start_time IS
    'IST time of day the loop may begin/resume (NULL = no restriction). Format HH:MM.';

COMMENT ON COLUMN cms_campaign_state.end_time IS
    'IST time of day the loop pauses and waits for next-day start_time (NULL = no restriction). Format HH:MM.';
