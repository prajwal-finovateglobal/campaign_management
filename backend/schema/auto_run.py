from pydantic import BaseModel
from typing import Optional, List, Any


class StartAutoRunRequest(BaseModel):
    campaign_id: int
    client_id:   int
    gap_seconds: Optional[int] = 30
    # Daily IST time window — "HH:MM" strings, both must be set to take effect.
    # NULL / omitted means no restriction (loop runs 24x7).
    start_time:  Optional[str] = None   # e.g. "09:30"
    end_time:    Optional[str] = None   # e.g. "19:30"


class ChunkProgressItem(BaseModel):
    chunk_id:      int
    chunk_name:    str
    status:        str            # pending|starting|started|waiting_finish|countdown|finished|failed
    message:       str
    millis_status: Optional[str]  # idle|started|finished (from Millis.ai)


class AutoRunStatusResponse(BaseModel):
    campaign_id:          int
    status:               str           # idle|running|paused|scheduled|stopped|completed
    action:               str           # run|pause|stop
    is_running:           bool
    gap_seconds:          int
    current_chunk_index:  int
    total_chunks:         int
    chunk_progress:       List[Any]
    start_time:           Optional[str] = None   # "HH:MM" IST or None
    end_time:             Optional[str] = None   # "HH:MM" IST or None
    next_resume_at:       Optional[str] = None   # ISO-8601 when loop will auto-wake
    started_at:           Optional[str]
    ended_at:             Optional[str]
    updated_at:           Optional[str] = None


class SimpleResponse(BaseModel):
    success: bool
    message: str


# ─── Monitor schemas ──────────────────────────────────────────────────────────

class AutoRunSummary(BaseModel):
    """Lightweight auto-run state for one campaign in the Monitor grid."""
    status:                str            # idle|running|paused|stopped|completed|scheduled
    is_running:            bool
    current_chunk_index:   int
    total_chunks:          int
    gap_seconds:           int
    start_time:            Optional[str] = None   # "HH:MM" or None
    end_time:              Optional[str] = None   # "HH:MM" or None
    next_resume_at:        Optional[str] = None   # ISO-8601
    chunks_done:           int
    started_at:            Optional[str] = None
    ended_at:              Optional[str] = None
    updated_at:            Optional[str] = None


class MonitorCampaign(BaseModel):
    id:             int
    campaign_name:  str
    campaign_index: int            # 1-based position within the phase
    type:           Optional[str] = None
    millis_status:  Optional[str] = None
    records_count:  Optional[int] = None
    auto_run:       Optional[AutoRunSummary] = None


class MonitorPhase(BaseModel):
    id:        int
    name:      str
    campaigns: List[MonitorCampaign]


class MonitorResponse(BaseModel):
    client_id: int
    phases:    List[MonitorPhase]
