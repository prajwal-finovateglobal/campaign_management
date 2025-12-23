# Chunk Size Fix

## Problem
When upserting chunks, the system was uploading 25 records per chunk even when the user specified a different chunk size (e.g., 20). This was because the frontend was using `chunks[0].records_count || 25` to determine the chunk size, but `records_count` is the number of records already uploaded (0 before upsertion), so it always defaulted to 25.

## Root Cause
The `chunk_size` specified during chunk creation was not being stored anywhere in the database. When upserting chunks later, the system had no way to retrieve the original chunk size.

## Solution
Added a `chunk_size` column to the `cms_campaign` table to store the chunk size when chunks are created.

## Changes Made

### 1. Backend Changes

#### `backend/models/client.py`
- Added `chunk_size` column to the `Campaign` model:
  ```python
  chunk_size = Column(Integer, nullable=True)  # Chunk size used when creating chunks (for multiple type)
  ```

#### `backend/service/chunk.py`
- Updated `create_chunks()` to store the chunk size in the campaign:
  ```python
  campaign.type = 'multiple'
  campaign.chunk_size = chunk_size  # Store the chunk size
  ```

#### `backend/service/campaign.py`
- Updated `get_campaign_service()` to include `chunk_size` in the campaign response:
  ```python
  'chunk_size': campaign.chunk_size if campaign.chunk_size else None
  ```
- Updated `refresh_all_campaigns_status()` similarly
- Fixed indentation error in `delete_campaign_service()` (added `pass` to empty else block)

### 2. Frontend Changes

#### `frontend/components/CampaignManagement.tsx`
- Added `chunk_size` to the `Campaign` interface:
  ```typescript
  chunk_size: number | null;  // Chunk size for multiple type campaigns
  ```
- Updated `chunkedUpsertModal` state to include `chunkSize`:
  ```typescript
  const [chunkedUpsertModal, setChunkedUpsertModal] = useState<{
    show: boolean;
    campaignId: number | null;
    campaignName: string | null;
    chunkSize: number | null;
  }>({ show: false, campaignId: null, campaignName: null, chunkSize: null });
  ```
- Updated the "Upsert" button click handler to pass `campaign.chunk_size`:
  ```typescript
  setChunkedUpsertModal({
    show: true,
    campaignId: campaign.id,
    campaignName: campaign.campaign_name || '',
    chunkSize: campaign.chunk_size || 25
  });
  ```
- Updated chunk upsertion logic to use `chunkedUpsertModal.chunkSize` instead of `chunks[0].records_count`:
  ```typescript
  const chunkSize = chunkedUpsertModal.chunkSize || 25;
  ```

### 3. Database Migration

#### `add_chunk_size_migration.sql`
Run this SQL in your PostgreSQL database:
```sql
ALTER TABLE public.cms_campaign 
ADD COLUMN IF NOT EXISTS chunk_size INTEGER NULL;

COMMENT ON COLUMN public.cms_campaign.chunk_size IS 'Chunk size used when creating chunks (for multiple type campaigns)';
```

## How to Apply

1. **Run the database migration:**
   ```bash
   psql -U <your_username> -d <your_database> -f add_chunk_size_migration.sql
   ```

2. **Restart the backend server** (required for model changes to take effect):
   ```bash
   # Stop the backend server (Ctrl+C)
   # Then restart it
   python3 backend/main.py  # or however you run your backend
   ```

3. **Restart the frontend** (if running in dev mode):
   ```bash
   # The frontend changes should be automatically picked up by the dev server
   # If not, restart your frontend dev server
   ```

## Testing

1. Create a new multiple-type campaign with a specific chunk size (e.g., 20)
2. Verify the chunk size is stored by checking the database:
   ```sql
   SELECT id, campaign_name, type, chunk_size FROM cms_campaign WHERE type = 'multiple';
   ```
3. Upsert the chunks and verify each chunk receives exactly the specified number of records (except the last chunk which may have fewer)
4. Check the console logs in the browser to see the chunk size being used

## Expected Behavior After Fix

- When you set chunk size to 20 during chunk creation, each chunk will receive exactly 20 records (except the last chunk which gets the remainder)
- When you set chunk size to 25, each chunk will receive exactly 25 records
- The chunk size is now preserved in the database and used consistently during upsertion

