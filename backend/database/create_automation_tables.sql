-- ============================================================================
-- Campaign Automation System Tables
-- ============================================================================
-- Execute these statements in order due to dependencies

-- ============================================================================
-- 1. CAMPAIGN CONFIG DEFAULTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS cms_campaign_config_defaults (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL,
    name VARCHAR NOT NULL,
    attempts INTEGER NOT NULL,
    description TEXT,
    enable_disposition BOOLEAN NOT NULL,
    enable_data_cleanup BOOLEAN NOT NULL,
    enable_auto_iteration BOOLEAN NOT NULL,
    campaign_priority INTEGER NOT NULL,
    disposition_priority INTEGER NOT NULL,
    chunk_size INTEGER NOT NULL,
    retry_on_failure BOOLEAN NOT NULL DEFAULT TRUE,
    max_retries INTEGER NOT NULL,
    on_failure_action VARCHAR(20) DEFAULT 'pause',
    is_active_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT ((timezone('Asia/Kolkata', NOW()))::timestamp AT TIME ZONE 'Asia/Kolkata'),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT ((timezone('Asia/Kolkata', NOW()))::timestamp AT TIME ZONE 'Asia/Kolkata')
);

-- Create unique index to enforce only one active default per client
CREATE UNIQUE INDEX IF NOT EXISTS uq_default_per_client
ON cms_campaign_config_defaults (client_id)
WHERE is_active_default = TRUE;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_config_defaults_client_id 
ON cms_campaign_config_defaults(client_id);

-- Add comments
COMMENT ON TABLE cms_campaign_config_defaults IS 'Default configuration templates for campaign automation per client';
COMMENT ON COLUMN cms_campaign_config_defaults.is_active_default IS 'Only one default config can be active per client';

-- ============================================================================
-- 2. CAMPAIGN CONFIG TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS cms_campaign_config (
    id BIGSERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL,
    campaign_id BIGINT NOT NULL,
    default_config_id BIGINT,
    enable_disposition BOOLEAN NOT NULL,
    enable_data_cleanup BOOLEAN NOT NULL,
    enable_next_iteration BOOLEAN NOT NULL,
    campaign_priority INTEGER NOT NULL,
    disposition_priority INTEGER NOT NULL,
    chunk_size INTEGER NOT NULL,
    retry_on_failure BOOLEAN NOT NULL,
    max_retries INTEGER NOT NULL,
    on_failure_action VARCHAR(20),
    data_scope JSONB NOT NULL,
    locked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT ((timezone('Asia/Kolkata', NOW()))::timestamp AT TIME ZONE 'Asia/Kolkata'),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT ((timezone('Asia/Kolkata', NOW()))::timestamp AT TIME ZONE 'Asia/Kolkata')
);

-- Create unique index to enforce one config per campaign
CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_config
ON cms_campaign_config (client_id, campaign_id);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_campaign_config_client_id 
ON cms_campaign_config(client_id);

CREATE INDEX IF NOT EXISTS idx_campaign_config_campaign_id 
ON cms_campaign_config(campaign_id);

-- Add comments
COMMENT ON TABLE cms_campaign_config IS 'Active configuration for automated campaigns';
COMMENT ON COLUMN cms_campaign_config.data_scope IS 'JSONB field defining data filtering and scope rules';
COMMENT ON COLUMN cms_campaign_config.locked_at IS 'Timestamp when config was locked for execution';

-- ============================================================================
-- 3. CAMPAIGN JOBS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS cms_campaign_jobs (
    id BIGSERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL,
    campaign_id BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL,
    current_stage VARCHAR(30),
    priority INTEGER NOT NULL DEFAULT 0,
    action VARCHAR(10) NOT NULL DEFAULT 'run',
    heartbeat_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    config JSONB
);

-- Enforce one running campaign per client
CREATE UNIQUE INDEX IF NOT EXISTS uq_running_campaign_per_client
ON cms_campaign_jobs (client_id)
WHERE status = 'running';

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_campaign_status
ON cms_campaign_jobs (client_id, status);

CREATE INDEX IF NOT EXISTS idx_campaign_jobs_priority
ON cms_campaign_jobs (priority DESC, created_at);

-- Add comments
COMMENT ON TABLE cms_campaign_jobs IS 'Active campaign job execution tracker';
COMMENT ON COLUMN cms_campaign_jobs.heartbeat_at IS 'Last heartbeat to detect stalled jobs';
COMMENT ON COLUMN cms_campaign_jobs.config IS 'Snapshot of configuration at job start time';

-- ============================================================================
-- 4. DISPOSITION JOBS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS cms_disposition_jobs (
    id BIGSERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL,
    campaign_id BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    action VARCHAR(10) NOT NULL DEFAULT 'run',
    cur_idx BIGINT NOT NULL DEFAULT 0,
    total_records BIGINT,
    processed_records BIGINT NOT NULL DEFAULT 0,
    heartbeat_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Enforce one disposition job per campaign
CREATE UNIQUE INDEX IF NOT EXISTS uq_disposition_per_campaign
ON cms_disposition_jobs (client_id, campaign_id);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_disposition_status
ON cms_disposition_jobs (status);

CREATE INDEX IF NOT EXISTS idx_disposition_client_campaign
ON cms_disposition_jobs (client_id, campaign_id);

CREATE INDEX IF NOT EXISTS idx_disposition_priority
ON cms_disposition_jobs (priority DESC, created_at);

-- Add comments
COMMENT ON TABLE cms_disposition_jobs IS 'Disposition processing jobs for automated campaigns';
COMMENT ON COLUMN cms_disposition_jobs.cur_idx IS 'Current index in disposition processing';
COMMENT ON COLUMN cms_disposition_jobs.priority IS 'Job priority (0 = lowest priority, higher numbers = higher priority)';

-- ============================================================================
-- 5. DATA MANAGERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS cms_data_managers (
    id BIGSERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL,
    campaign_id BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL,
    action VARCHAR(10) NOT NULL DEFAULT 'run',
    processed_steps INTEGER NOT NULL DEFAULT 0,
    total_steps INTEGER,
    heartbeat_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Enforce one data manager per campaign
CREATE UNIQUE INDEX IF NOT EXISTS uq_data_manager_per_campaign
ON cms_data_managers (client_id, campaign_id);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_data_manager_status
ON cms_data_managers (status);

CREATE INDEX IF NOT EXISTS idx_data_manager_client_campaign
ON cms_data_managers (client_id, campaign_id);

-- Add comments
COMMENT ON TABLE cms_data_managers IS 'Data cleanup/management workers for automated campaigns';
COMMENT ON COLUMN cms_data_managers.processed_steps IS 'Number of cleanup steps completed';

-- ============================================================================
-- 6. CAMPAIGN MONITORING TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS cms_campaign_monitoring (
    id BIGSERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL,
    campaign_id BIGINT NOT NULL,
    campaign_status VARCHAR(20),
    current_stage VARCHAR(30),
    campaign_progress NUMERIC(5,2),
    disposition_progress NUMERIC(5,2),
    data_manager_progress NUMERIC(5,2),
    disposition_cur_idx BIGINT,
    disposition_processed BIGINT,
    disposition_total BIGINT,
    last_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT ((timezone('Asia/Kolkata', NOW()))::timestamp AT TIME ZONE 'Asia/Kolkata')
);

-- Enforce one monitoring record per campaign
CREATE UNIQUE INDEX IF NOT EXISTS uq_monitoring_campaign
ON cms_campaign_monitoring (client_id, campaign_id);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_monitoring_status
ON cms_campaign_monitoring (campaign_status);

CREATE INDEX IF NOT EXISTS idx_monitoring_client_campaign
ON cms_campaign_monitoring (client_id, campaign_id);

-- Add comments
COMMENT ON TABLE cms_campaign_monitoring IS 'Real-time monitoring and progress tracking for automated campaigns';
COMMENT ON COLUMN cms_campaign_monitoring.campaign_progress IS 'Overall campaign progress percentage (0.00 to 100.00)';
COMMENT ON COLUMN cms_campaign_monitoring.disposition_progress IS 'Disposition processing progress percentage';
COMMENT ON COLUMN cms_campaign_monitoring.data_manager_progress IS 'Data cleanup progress percentage';
