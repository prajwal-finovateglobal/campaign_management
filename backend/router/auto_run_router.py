"""
Auto-Run Router — Backend chunk-by-chunk loop endpoints.
Fully isolated from existing automation routers.

N-tier role: HTTP only.
  - Parses requests, calls service, maps results to HTTP responses.
  - Never imports or calls repo directly.

Endpoints:
  POST /auto-run/start                — start the loop
  GET  /auto-run/status/{campaign_id} — poll current state (frontend uses this)
  POST /auto-run/stop/{campaign_id}   — stop the loop
  POST /auto-run/pause/{campaign_id}  — pause the loop
  POST /auto-run/resume/{campaign_id} — resume a paused loop
"""

from fastapi import APIRouter, HTTPException

from database.dependencies import DB_DEPENDENCY
from schema.auto_run import StartAutoRunRequest, AutoRunStatusResponse, SimpleResponse, MonitorResponse
import service.auto_run_service as auto_run_service
import loguru

router = APIRouter(prefix="/auto-run", tags=["auto-run"])
logger = loguru.logger.bind(router="auto_run")


# ─────────────────────────────────────────────────────────────
# POST /auto-run/start
# ─────────────────────────────────────────────────────────────

@router.post("/start", response_model=SimpleResponse)
async def start_auto_run(request: StartAutoRunRequest, db: DB_DEPENDENCY):
    """
    Start the backend auto-run loop for a multiple-type campaign.
    All validation, chunk fetching, and state setup is handled by the service.
    """
    gap_seconds = max(0, request.gap_seconds or 0)

    success, message = auto_run_service.start(
        campaign_id=request.campaign_id,
        client_id=request.client_id,
        gap_seconds=gap_seconds,
        db=db,
        start_time_str=request.start_time,
        end_time_str=request.end_time,
    )

    if not success:
        # Map known conditions to appropriate HTTP status codes
        if "not found" in message.lower():
            raise HTTPException(status_code=404, detail=message)
        if "already running" in message.lower():
            raise HTTPException(status_code=409, detail=message)
        raise HTTPException(status_code=400, detail=message)

    return SimpleResponse(success=True, message=message)


# ─────────────────────────────────────────────────────────────
# GET /auto-run/status/{campaign_id}
# ─────────────────────────────────────────────────────────────

@router.get("/status/{campaign_id}", response_model=AutoRunStatusResponse)
async def get_auto_run_status(campaign_id: int, db: DB_DEPENDENCY):
    """
    Return current auto-run state.
    Frontend polls this endpoint to render the same UI as before.
    """
    status_data = auto_run_service.get_status(campaign_id, db)
    return AutoRunStatusResponse(**status_data)


# ─────────────────────────────────────────────────────────────
# POST /auto-run/stop/{campaign_id}
# ─────────────────────────────────────────────────────────────

@router.post("/stop/{campaign_id}", response_model=SimpleResponse)
async def stop_auto_run(campaign_id: int, db: DB_DEPENDENCY):
    """Signal the running loop to stop."""
    success, message = auto_run_service.stop(campaign_id, db)

    if not success:
        status_code = 404 if "not found" in message.lower() else 400
        raise HTTPException(status_code=status_code, detail=message)

    return SimpleResponse(success=True, message=message)


# ─────────────────────────────────────────────────────────────
# POST /auto-run/pause/{campaign_id}
# ─────────────────────────────────────────────────────────────

@router.post("/pause/{campaign_id}", response_model=SimpleResponse)
async def pause_auto_run(campaign_id: int, db: DB_DEPENDENCY):
    """Pause the running loop. Loop waits until resumed or stopped."""
    success, message = await auto_run_service.pause(campaign_id, db)

    if not success:
        status_code = 404 if "not found" in message.lower() else 400
        raise HTTPException(status_code=status_code, detail=message)

    return SimpleResponse(success=True, message=message)


# ─────────────────────────────────────────────────────────────
# POST /auto-run/resume/{campaign_id}
# ─────────────────────────────────────────────────────────────

@router.post("/resume/{campaign_id}", response_model=SimpleResponse)
async def resume_auto_run(campaign_id: int, db: DB_DEPENDENCY):
    """Resume a paused loop."""
    success, message = await auto_run_service.resume(campaign_id, db)

    if not success:
        status_code = 404 if "not found" in message.lower() else 400
        raise HTTPException(status_code=status_code, detail=message)

    return SimpleResponse(success=True, message=message)


# ─────────────────────────────────────────────────────────────
# GET /auto-run/monitor/{client_id}
# ─────────────────────────────────────────────────────────────

@router.get("/monitor/{client_id}", response_model=MonitorResponse)
async def get_monitor(client_id: int, db: DB_DEPENDENCY):
    """
    Return all phases → campaigns → auto-run summaries for the Monitor tab.
    Used by the frontend grid that polls every 5 seconds.
    """
    data = auto_run_service.get_monitor_data(client_id, db)
    return MonitorResponse(**data)
