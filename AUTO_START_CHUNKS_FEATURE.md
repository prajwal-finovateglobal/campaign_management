# Auto-Start Chunks Feature Documentation

## Overview

This feature implements an automated sequential start system for multiple-type campaigns with chunks. It allows starting chunks one by one automatically, waiting for each to finish before proceeding to the next.

## Feature Components

### 1. Backend API Endpoints

#### Start Individual Chunk
- **Endpoint**: `POST /chunk/{chunk_id}/start`
- **Purpose**: Starts a single chunk campaign in Millis.ai
- **Validations**:
  - Chunk exists in database
  - Chunk has a CID (Millis.ai campaign ID)
  - Chunk has a caller set in Millis.ai
- **Response**: Success message with chunk details

#### Stop Individual Chunk
- **Endpoint**: `POST /chunk/{chunk_id}/stop`
- **Purpose**: Stops a single chunk campaign in Millis.ai
- **Response**: Success message with chunk details

#### Get Chunk Status
- **Endpoint**: `GET /chunk/{chunk_id}/status`
- **Purpose**: Fetches current status of a chunk from Millis.ai
- **Polling**: Used to monitor chunk status until it becomes "finished"
- **Response**: Chunk status (idle, started, finished, etc.)

### 2. Backend Service Functions

#### `start_chunk_service()`
Located in: `backend/service/chunk.py`

Validates and starts a single chunk:
1. Fetches chunk from database
2. Validates CID exists
3. Checks caller is set in Millis.ai
4. Calls Millis.ai API to start the campaign
5. Returns success/failure

#### `stop_chunk_service()`
Located in: `backend/service/chunk.py`

Stops a running chunk campaign.

#### `get_chunk_status_service()`
Located in: `backend/service/chunk.py`

Fetches and updates chunk status from Millis.ai:
1. Queries chunk from database
2. Calls Millis.ai API to get latest status
3. Updates chunk status in database
4. Returns current status

### 3. Frontend Implementation

#### New Modal: Auto-Start Chunks Modal

**Trigger**: Clicking "Start" button on a multiple-type campaign

**Components**:
1. **Gap Input Field**: Time in seconds to wait between chunks
2. **Auto Start Button**: Initiates the automated sequence
3. **Chunks Table**: Shows all chunks with:
   - Chunk details (name, CID, records, status, phone)
   - Auto-progress indicator
   - Individual "Start" button for manual control

#### States Added

```typescript
const [autoStartModal, setAutoStartModal] = useState<{
  show: boolean;
  campaign: Campaign | null;
}>({ show: false, campaign: null });

const [autoStartChunks, setAutoStartChunks] = useState<any[]>([]);
const [autoStartGap, setAutoStartGap] = useState<number>(30); // seconds
const [isAutoStarting, setIsAutoStarting] = useState(false);
const [autoStartProgress, setAutoStartProgress] = useState<Record<number, {
  status: 'pending' | 'starting' | 'started' | 'waiting_finish' | 'finished' | 'countdown' | 'failed';
  message: string;
  countdown?: number;
}>>({});
const [startingIndividualChunk, setStartingIndividualChunk] = useState<number | null>(null);
```

## How It Works

### Single Campaign (Unchanged)
1. User clicks "Start" button
2. Confirmation modal opens
3. User confirms
4. Campaign starts immediately

### Multiple Campaign (New Behavior)

#### Manual Start (Individual Button)
1. User clicks "Start" button on campaign row → Auto-Start Modal opens
2. User clicks individual "Start" button next to a specific chunk
3. That chunk starts immediately
4. NO automatic progression
5. NO waiting or timers
6. User has full manual control

#### Auto Start (Automated Sequence)
1. User clicks "Start" button on campaign row → Auto-Start Modal opens
2. User sets gap time (default: 30 seconds)
3. User clicks "Auto Start All" button
4. For each chunk in sequence:
   ```
   a. Start the chunk
   b. Wait and poll status until chunk.status === 'finished'
   c. Run countdown timer for Gap seconds
   d. Move to next chunk
   ```
5. Process repeats until all chunks complete

### Auto-Start Sequence Details

```javascript
For each chunk:
  ┌─ Step 1: Start Chunk
  │  └─ Call POST /chunk/{chunk_id}/start
  │  └─ Display: "Starting chunk 1/5..."
  │
  ├─ Step 2: Wait for Finish
  │  └─ Poll GET /chunk/{chunk_id}/status every 5 seconds
  │  └─ Display: "Waiting for chunk to finish... (status: started)"
  │  └─ Continue polling until status === 'finished'
  │
  ├─ Step 3: Chunk Finished
  │  └─ Display: "Chunk finished ✓"
  │
  └─ Step 4: Countdown (if not last chunk)
     └─ Display: "Next chunk will start in 30... 29... 28... seconds"
     └─ Count down from Gap value to 0
     └─ Then proceed to next chunk
```

### Status Polling

**Purpose**: Detect when a chunk finishes running

**Implementation**:
- Poll interval: 5 seconds
- Max attempts: 1000 (≈83 minutes max wait)
- API endpoint: `GET /chunk/{chunk_id}/status`
- Updates progress UI with current status

**Polling Loop**:
```typescript
const pollChunkStatus = async (chunkId: number): Promise<string> => {
  const maxAttempts = 1000;
  const pollInterval = 5000; // 5 seconds
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await api.get(`/chunk/${chunkId}/status`);
    const result = await response.json();
    
    if (result.status === 'finished') {
      return 'finished';
    }
    
    // Update UI with current status
    setAutoStartProgress(prev => ({
      ...prev,
      [chunkId]: {
        ...prev[chunkId],
        message: `Waiting for chunk to finish... (status: ${result.status})`
      }
    }));
    
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  throw new Error('Polling timeout');
};
```

### Countdown Timer

**Purpose**: Wait specified gap time after chunk finishes

**Implementation**:
```typescript
const runCountdown = async (chunkId: number, seconds: number): Promise<void> => {
  for (let remaining = seconds; remaining > 0; remaining--) {
    setAutoStartProgress(prev => ({
      ...prev,
      [chunkId]: {
        status: 'countdown',
        message: `Next chunk will start in ${remaining} seconds...`,
        countdown: remaining
      }
    }));
    
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
  }
};
```

## Progress Indicators

### Auto Progress Column

Shows real-time status for each chunk during auto-start:

| Icon | Status | Meaning |
|------|--------|---------|
| 🔵 Spinner | `starting` | Calling API to start chunk |
| ✅ Check | `started` | Chunk started successfully |
| 🟡 Spinner | `waiting_finish` | Polling status, waiting for finish |
| ✅ Check | `finished` | Chunk completed |
| 🕐 Clock | `countdown` | Counting down gap time |
| ❌ X | `failed` | Chunk failed to start |

## Error Handling

### Individual Chunk Failure

If a chunk fails during auto-start:
1. Display error message
2. Show confirmation dialog: "Chunk X failed: {error}. Continue with next chunk?"
3. If user clicks "Yes": Continue to next chunk
4. If user clicks "No": Stop auto-start sequence

### Critical Errors

- Network errors during API calls
- Polling timeout (chunk doesn't finish in expected time)
- Missing CID or caller information

All errors are:
1. Logged to console
2. Displayed in UI
3. Optionally allow continuation

## UI/UX Features

### Visual Feedback
- Real-time progress indicators
- Status badges with colors
- Loading spinners during operations
- Countdown timer display
- Success/error icons

### User Controls
- Gap input field (adjustable seconds)
- Auto Start button (starts sequence)
- Individual Start buttons (manual control)
- Cancel/Close button
- Modal cannot be closed during auto-start

### Responsive Design
- Table layout for chunk display
- Scrollable modal for many chunks
- Mobile-friendly controls

## Example Scenarios

### Scenario 1: 5 Chunks, 30-Second Gap

```
Timeline:
├─ 00:00 - Chunk 1 starts
├─ 00:15 - Chunk 1 finishes (took 15 seconds)
├─ 00:15 - Countdown: 30... 29... 28...
├─ 00:45 - Chunk 2 starts
├─ 01:20 - Chunk 2 finishes (took 35 seconds)
├─ 01:20 - Countdown: 30... 29... 28...
├─ 01:50 - Chunk 3 starts
├─ 02:10 - Chunk 3 finishes (took 20 seconds)
├─ 02:10 - Countdown: 30... 29... 28...
├─ 02:40 - Chunk 4 starts
├─ 03:00 - Chunk 4 finishes (took 20 seconds)
├─ 03:00 - Countdown: 30... 29... 28...
├─ 03:30 - Chunk 5 starts
├─ 04:00 - Chunk 5 finishes (took 30 seconds)
└─ 04:00 - All chunks completed!

Total time: 4 minutes
```

### Scenario 2: Manual Start

User wants to start only Chunks 2 and 5:
1. Click "Start" on campaign → Modal opens
2. Click individual "Start" button on Chunk 2 → Chunk 2 starts
3. Click individual "Start" button on Chunk 5 → Chunk 5 starts
4. Close modal

Both chunks run in parallel (user's responsibility).

## Testing Checklist

- [ ] Single-type campaigns still work with original flow
- [ ] Multiple-type campaigns open auto-start modal
- [ ] Gap input field accepts valid numbers
- [ ] Auto Start button starts sequence correctly
- [ ] Status polling detects "finished" status
- [ ] Countdown timer displays correctly
- [ ] Individual start buttons work independently
- [ ] Progress indicators update in real-time
- [ ] Error handling works for failed chunks
- [ ] Modal cannot be closed during auto-start
- [ ] All chunks complete successfully
- [ ] Chunks list refreshes after operations

## Files Modified

### Backend
- `backend/service/chunk.py`: Added start/stop/status service functions
- `backend/router/chunk.py`: Added `/start`, `/stop`, `/status` endpoints
- `backend/schema/chunk.py`: Added request/response schemas

### Frontend
- `frontend/components/CampaignManagement.tsx`:
  - Added auto-start modal and logic
  - Modified `handleOpenStartModal` to detect campaign type
  - Added auto-start handler with polling and countdown
  - Added individual chunk start handler
  - Added new states for modal and progress tracking

## Configuration

### Polling Settings
- **Poll Interval**: 5 seconds (configurable in `pollChunkStatus`)
- **Max Attempts**: 1000 (≈83 minutes max)
- **Gap Default**: 30 seconds

### To Change Defaults

**Poll Interval**:
```typescript
const pollInterval = 5000; // Change to desired milliseconds
```

**Default Gap**:
```typescript
const [autoStartGap, setAutoStartGap] = useState<number>(30); // Change default
```

## Known Limitations

1. **Single Running Instance**: Only one auto-start sequence can run at a time per user session
2. **Browser Dependency**: User must keep browser tab open during auto-start
3. **No Pause/Resume**: Cannot pause and resume auto-start sequence
4. **No Skip**: Cannot skip chunks during auto-start (only fail and ask to continue)

## Future Enhancements

- [ ] Pause/Resume auto-start
- [ ] Skip individual chunks during sequence
- [ ] Retry failed chunks automatically
- [ ] Save auto-start progress to backend (survive page refresh)
- [ ] Multiple parallel auto-start sessions
- [ ] Estimated completion time calculator
- [ ] Email notification when sequence completes

## Support

For issues or questions:
1. Check console logs for detailed error messages
2. Verify all chunks have CIDs and callers set
3. Ensure Millis.ai API is accessible
4. Check network connectivity during polling

