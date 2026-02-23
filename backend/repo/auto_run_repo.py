"""
Repository for cms_campaign_state + per-chunk progress via cms_chunks.

Option B: per-chunk progress is stored as individual rows in cms_chunks
(auto_run_status + auto_run_message columns), NOT as a JSON blob.

- cms_campaign_state  → overall loop state (running/paused/stopped, gap, index)
- cms_chunks          → per-chunk progress (one targeted UPDATE per chunk)

This means updating one chunk = one small UPDATE WHERE id=X.
No JSON blob read/write, works efficiently for 500–1000+ chunks.
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
import pytz
import loguru

from models.automation import CampaignState
from models.client import Chunk, Phase, Campaign

logger = loguru.logger.bind(repo="auto_run")
IST = pytz.timezone('Asia/Kolkata')


def _now() -> datetime:
    return datetime.now(IST)


# ─────────────────────────────────────────────────────────────
# cms_campaign_state — overall run state
# ─────────────────────────────────────────────────────────────

def get_state(db, campaign_id: int) -> Optional[CampaignState]:
    """Fetch the state row for a campaign. Returns None if not found."""
    return (
        db.query(CampaignState)
        .filter(CampaignState.campaign_id == campaign_id)
        .first()
    )


def upsert_state(
    db,
    campaign_id: int,
    client_id: int,
    gap_seconds: int,
    total_chunks: int,
    start_time=None,   # datetime.time or None
    end_time=None,     # datetime.time or None
) -> CampaignState:
    """
    Create or fully reset the state row when starting a new auto-run.
    Per-chunk progress lives in cms_chunks — this row holds only overall state.
    start_time / end_time restrict the daily IST window the loop may run in.
    """
    state = get_state(db, campaign_id)
    now = _now()

    if state:
        state.client_id           = client_id
        state.status              = 'idle'
        state.action              = 'run'
        state.gap_seconds         = gap_seconds
        state.current_chunk_index = 0
        state.total_chunks        = total_chunks
        state.start_time          = start_time
        state.end_time            = end_time
        state.started_at          = None
        state.ended_at            = None
        state.updated_at          = now
    else:
        state = CampaignState(
            campaign_id=campaign_id,
            client_id=client_id,
            status='idle',
            action='run',
            gap_seconds=gap_seconds,
            current_chunk_index=0,
            total_chunks=total_chunks,
            start_time=start_time,
            end_time=end_time,
        )
        db.add(state)

    db.commit()
    db.refresh(state)
    logger.info(f"[AUTO_RUN_REPO] State upserted: campaign={campaign_id}, total_chunks={total_chunks}, window={start_time}-{end_time}")
    return state


def set_status(db, campaign_id: int, status: str, **extra_fields):
    """
    Update overall loop status. Accepts optional started_at / ended_at.
    Rolls back any pending transaction before querying so a prior flush
    failure (e.g. constraint violation) cannot leave the session unusable.
    """
    try:
        db.rollback()  # no-op when session is clean; recovers PendingRollbackError
    except Exception:
        pass

    state = get_state(db, campaign_id)
    if not state:
        logger.warning(f"[AUTO_RUN_REPO] set_status: no state for campaign {campaign_id}")
        return

    state.status     = status
    state.updated_at = _now()

    for key, value in extra_fields.items():
        setattr(state, key, value)

    db.commit()
    logger.info(f"[AUTO_RUN_REPO] Status → '{status}' for campaign {campaign_id}")


def set_action(db, campaign_id: int, action: str):
    """Write the action flag (run/pause/stop) to DB — persists across restarts."""
    state = get_state(db, campaign_id)
    if not state:
        logger.warning(f"[AUTO_RUN_REPO] set_action: no state for campaign {campaign_id}")
        return

    state.action     = action
    state.updated_at = _now()
    db.commit()
    logger.info(f"[AUTO_RUN_REPO] Action → '{action}' for campaign {campaign_id}")


def update_current_chunk(db, campaign_id: int, index: int):
    """Record which chunk index the loop is currently on."""
    state = get_state(db, campaign_id)
    if not state:
        return

    state.current_chunk_index = index
    state.updated_at          = _now()
    db.commit()


# ─────────────────────────────────────────────────────────────
# cms_chunks — per-chunk progress (Option B)
# ─────────────────────────────────────────────────────────────

def reset_chunk_progress(db, campaign_id: int):
    """
    Reset all chunks for a campaign to 'pending' at the start of a new auto-run.
    Single batch UPDATE — efficient even for 1000 chunks.
    """
    db.query(Chunk).filter(Chunk.campaign_id == campaign_id).update(
        {
            'auto_run_status':  'pending',
            'auto_run_message': 'Waiting to start...',
        },
        synchronize_session=False
    )
    db.commit()
    logger.info(f"[AUTO_RUN_REPO] Chunk progress reset to 'pending' for campaign {campaign_id}")


def update_chunk(db, chunk_id: int, status: str, message: str):
    """
    Update auto_run_status and auto_run_message for a single chunk.
    Targeted single-row UPDATE — O(1), no JSON blob involved.

    status values:
        pending | starting | started | waiting_finish | countdown | finished | failed
    """
    db.query(Chunk).filter(Chunk.id == chunk_id).update(
        {
            'auto_run_status':  status,
            'auto_run_message': message,
        },
        synchronize_session=False
    )
    db.commit()


def get_monitor_data(db, client_id: int) -> List[Dict[str, Any]]:
    """
    Fetch all phases for a client, each with its campaigns and their auto-run states.
    Used by the Monitor tab grid. Returns plain dicts — no ORM objects leaked.
    """
    phases = (
        db.query(Phase)
        .filter(Phase.client_id == client_id)
        .order_by(Phase.id)
        .all()
    )

    result: List[Dict[str, Any]] = []
    for phase in phases:
        campaigns = (
            db.query(Campaign)
            .filter(Campaign.phase_id == phase.id)
            .order_by(Campaign.id)
            .all()
        )

        camp_list: List[Dict[str, Any]] = []
        for idx, camp in enumerate(campaigns, start=1):
            state: Optional[CampaignState] = (
                db.query(CampaignState)
                .filter(CampaignState.campaign_id == camp.id)
                .first()
            )

            # Fetch chunk progress only if there is a state row
            chunk_progress: List[Dict[str, Any]] = []
            if state:
                chunks = (
                    db.query(Chunk)
                    .filter(Chunk.campaign_id == camp.id)
                    .order_by(Chunk.id)
                    .all()
                )
                chunk_progress = [
                    {
                        "chunk_id":      c.id,
                        "chunk_name":    c.chunk_name,
                        "status":        c.auto_run_status  or 'pending',
                        "message":       c.auto_run_message or '',
                        "millis_status": c.status,
                    }
                    for c in chunks
                ]

            camp_list.append({
                "id":             camp.id,
                "campaign_name":  camp.campaign_name or f"Campaign {idx}",
                "campaign_index": idx,
                "type":           camp.type,
                "millis_status":  camp.status,
                "records_count":  camp.records_count,
                "state": {
                    "status":                state.status,
                    "action":                state.action,
                    "gap_seconds":           state.gap_seconds,
                    "current_chunk_index":   state.current_chunk_index,
                    "total_chunks":          state.total_chunks,
                    "start_time":            state.start_time,
                    "end_time":              state.end_time,
                    "started_at":            state.started_at,
                    "ended_at":              state.ended_at,
                    "updated_at":            state.updated_at,
                } if state else None,
                "chunk_progress": chunk_progress,
            })

        result.append({
            "id":        phase.id,
            "name":      phase.name,
            "campaigns": camp_list,
        })

    return result


def get_chunk_progress(db, campaign_id: int) -> List[Dict[str, Any]]:
    """
    Fetch per-chunk progress for the status API.
    Returns list of dicts ordered by chunk id (insertion order).
    Includes both auto-run status and Millis.ai status for the frontend.
    """
    chunks = (
        db.query(Chunk)
        .filter(Chunk.campaign_id == campaign_id)
        .order_by(Chunk.id)
        .all()
    )

    return [
        {
            "chunk_id":      c.id,
            "chunk_name":    c.chunk_name,
            "status":        c.auto_run_status  or 'pending',
            "message":       c.auto_run_message or '',
            "millis_status": c.status,           # idle | started | finished (from Millis.ai)
        }
        for c in chunks
    ]
