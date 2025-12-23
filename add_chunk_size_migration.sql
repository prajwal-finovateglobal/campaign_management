-- Migration: Add chunk_size column to cms_campaign table
-- This column stores the chunk size used when creating chunks for multiple-type campaigns
-- Run this in your PostgreSQL database

ALTER TABLE public.cms_campaign 
ADD COLUMN IF NOT EXISTS chunk_size INTEGER NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.cms_campaign.chunk_size IS 'Chunk size used when creating chunks (for multiple type campaigns)';
