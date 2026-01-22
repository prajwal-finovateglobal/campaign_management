-- Add priority column to cms_disposition_jobs table
ALTER TABLE cms_disposition_jobs 
ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0;

-- Add index for priority
CREATE INDEX IF NOT EXISTS idx_disposition_priority
ON cms_disposition_jobs (priority DESC, created_at);

-- Add comment
COMMENT ON COLUMN cms_disposition_jobs.priority IS 'Job priority (0 = lowest priority, higher numbers = higher priority)';
