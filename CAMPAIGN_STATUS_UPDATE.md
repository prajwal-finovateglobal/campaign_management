# Campaign Status Calculation for Multiple-Type Campaigns

## Overview
This document describes the implementation of dynamic status calculation for multiple-type campaigns based on their chunks' statuses.

## Status Rules

For campaigns with type='multiple', the campaign status is now calculated based on the statuses of all its chunks:

### Status Priority Rules

1. **All chunks have the same status**
   - All idle → Campaign status: **"idle"**
   - All finished → Campaign status: **"finished"**
   - All started → Campaign status: **"started"**
   - All pending → Campaign status: **"pending"**

2. **Mixed statuses**
   - Some idle + some pending (no finished, no started) → **"partly idle"**
   - Some finished + some (idle OR started) → **"partly finished"**
   - Some started + some idle (no finished) → **"chunks_started"**
   - Other mixed states → **"mixed"**

## Implementation

### 1. Helper Function (`backend/service/campaign.py`)

Added `calculate_campaign_status_from_chunks()` function:

```python
def calculate_campaign_status_from_chunks(chunks: List) -> str:
    """
    Calculate campaign status based on chunk statuses for multiple-type campaigns.
    
    Args:
        chunks: List of Chunk ORM objects
    
    Returns:
        Campaign status string
    """
```

This function:
- Counts how many chunks have each status
- Applies the status rules defined above
- Returns the appropriate campaign status

### 2. Integration Points

The status calculation is integrated into:

#### a. `get_campaign_service()` (Lines ~85-95)
- When fetching campaigns, if `type='multiple'`:
  - Fetches all chunks for the campaign
  - Calculates status using `calculate_campaign_status_from_chunks()`
  - Calculates `record_count` as sum of chunk `records_count`
  - Returns calculated values in response

```python
if campaign_type == 'multiple':
    chunks = db.query(Chunk).filter(Chunk.campaign_id == campaign.id).all()
    if chunks:
        chunk_records_sum = sum(chunk.records_count for chunk in chunks if chunk.records_count is not None)
        record_count = chunk_records_sum
        # Calculate status based on chunk statuses
        status = calculate_campaign_status_from_chunks(chunks)
```

#### b. `refresh_campaign_status()` (Lines ~327-375)
- When refreshing a single campaign's status:
  - If `type='multiple'`: calculates status from chunks (doesn't call Millis.ai)
  - If `type='single'`: fetches status from Millis.ai API
  - Updates campaign status in database
  - Returns updated status

#### c. `refresh_all_campaigns_status()` (Lines ~426-444)
- When refreshing all campaigns in a phase:
  - For each `multiple` type campaign: calculates status from chunks
  - For each `single` type campaign: fetches status from Millis.ai
  - Commits all updates to database
  - Returns all updated campaigns

### 3. Status Badge Display

The frontend (`CampaignManagement.tsx`) already has status badge rendering that will automatically display the new status values:

- `idle` → Blue badge
- `finished` → Green badge  
- `started` → Purple badge
- `pending` → Gray badge
- `partly idle` → Will use default gray styling
- `partly finished` → Will use default gray styling
- `chunks_started` → Will use default gray styling
- `mixed` → Will use default gray styling

You may want to add custom colors for the new statuses in the frontend.

## How It Works

### Example Scenario 1: All Chunks Idle
```
Chunks:
- Chunk 1: status = "idle"
- Chunk 2: status = "idle"
- Chunk 3: status = "idle"

Result: Campaign status = "idle"
```

### Example Scenario 2: Partly Finished
```
Chunks:
- Chunk 1: status = "finished"
- Chunk 2: status = "idle"
- Chunk 3: status = "started"

Result: Campaign status = "partly finished"
(because some are finished and some are idle/started)
```

### Example Scenario 3: Chunks Started
```
Chunks:
- Chunk 1: status = "started"
- Chunk 2: status = "idle"
- Chunk 3: status = "idle"

Result: Campaign status = "chunks_started"
(because some are started and some are idle)
```

### Example Scenario 4: Partly Idle
```
Chunks:
- Chunk 1: status = "idle"
- Chunk 2: status = "pending"
- Chunk 3: status = "idle"

Result: Campaign status = "partly idle"
(because some are idle and some are pending, no finished/started)
```

## Testing

1. **Create a multiple-type campaign with chunks**
   - Create campaign and generate chunks

2. **Upsert all chunks**
   - After upsertion, all chunks should have status="idle"
   - Campaign status should update to "idle"

3. **Set caller for all chunks**
   - Chunks remain in "idle" status
   - Campaign status should remain "idle"

4. **Start some chunks**
   - Start 1-2 chunks in Millis.ai
   - Click "Refresh Status" button
   - Campaign status should update to "chunks_started" or "partly finished" depending on which chunks are started

5. **Finish some chunks**
   - Let some chunks complete their calls
   - Click "Refresh Status" button
   - Campaign status should update to "partly finished"

6. **All chunks finished**
   - When all chunks complete
   - Campaign status should update to "finished"

## Database Impact

- No database schema changes required
- The campaign `status` column is updated dynamically based on chunk statuses
- For `multiple` type campaigns, status is calculated on-the-fly, not stored from Millis.ai

## Notes

- Single-type campaigns continue to fetch their status directly from Millis.ai
- Multiple-type campaigns never fetch status from Millis.ai for the parent campaign (only for individual chunks)
- The calculation is performed every time campaign data is fetched or refreshed
- Chunk statuses are still updated from Millis.ai individually when chunks are created/upserted

