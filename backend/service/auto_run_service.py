"""
Auto-Run Service — Backend chunk-by-chunk loop for multiple-type campaigns.

Runs as an asyncio background task. Fully isolated from existing automation.

N-tier responsibilities:
  Router  → calls only public functions in this file (never touches repo)
  Service → owns all business logic, validation, orchestration (this file)
  Repo    → raw DB reads/writes (auto_run_repo.py)

Option B: per-chunk progress stored in cms_chunks.auto_run_status / auto_run_message.
"""

import asyncio
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta, time as time_type
import pytz
import loguru

from database.session import SessionLocal
from models.client import Campaign
from service.chunk import get_chunks_by_campaign, start_chunk_service, get_chunk_status_service
from service.notification import (
    notify_campaign_started,
    notify_campaign_paused,
    notify_campaign_resumed,
    notify_campaign_completed,
    notify_window_waiting_to_start,
    notify_window_closed,
    notify_next_window,
    notify_window_resumed,
    notify_credit_health_alert,
)
import repo.auto_run_repo as repo

logger = loguru.logger.bind(service="auto_run")
IST = pytz.timezone('Asia/Kolkata')


# ─────────────────────────────────────────────────────────────
# In-memory state
# ─────────────────────────────────────────────────────────────

# { campaign_id: 'run' | 'pause' | 'stop' }
_flags: Dict[int, str] = {}

# { campaign_id: asyncio.Task }
_tasks: Dict[int, asyncio.Task] = {}

# { campaign_id: {'start_time': time_type | None, 'end_time': time_type | None} }
# Populated on start(); used by _wait_for_time_window inside the loop.
_time_windows: Dict[int, dict] = {}


# ─────────────────────────────────────────────────────────────
# Internal exception for clean loop exit on stop
# ─────────────────────────────────────────────────────────────

class _StoppedByUser(Exception):
    pass


# ─────────────────────────────────────────────────────────────
# Internal — flag helpers
# ─────────────────────────────────────────────────────────────

def _get_flag(campaign_id: int) -> str:
    return _flags.get(campaign_id, 'run')


async def _check_flag(campaign_id: int):
    """Raise _StoppedByUser on stop. Wait (2s ticks) while paused."""
    flag = _get_flag(campaign_id)

    if flag == 'stop':
        raise _StoppedByUser()

    while flag == 'pause':
        logger.debug(f"[AUTO_RUN] Campaign {campaign_id} paused, waiting...")
        await asyncio.sleep(2)
        flag = _get_flag(campaign_id)
        if flag == 'stop':
            raise _StoppedByUser()


async def _check_control(campaign_id: int, db):
    """
    Combined per-tick guard used inside polling and countdown loops.
    1. Checks stop/pause flag (raises _StoppedByUser on stop).
    2. Enforces the daily time window — if the window has closed mid-chunk,
       the loop goes into 'scheduled' state and waits until it reopens.
    Called on every tick inside _poll_until_finished and _countdown.
    """
    await _check_flag(campaign_id)
    await _wait_for_time_window(campaign_id, db)


# ─────────────────────────────────────────────────────────────
# Internal — daily time-window enforcement
# ─────────────────────────────────────────────────────────────

async def _wait_for_time_window(campaign_id: int, db):
    """
    If the campaign has a daily time window configured, block the loop here
    until the current IST time falls inside [start_time, end_time).

    While waiting:
      - DB status is set to 'scheduled'
      - Google Chat notification sent on window-close and window-open events
      - The loop sleeps in 5-second ticks, honouring stop/pause signals

    When the window opens:
      - DB status is restored to 'running'
      - Function returns and the loop continues normally

    NULL start_time OR NULL end_time → no restriction (returns immediately).
    """
    window = _time_windows.get(campaign_id)
    if not window:
        return

    start_t: Optional[time_type] = window.get('start_time')
    end_t:   Optional[time_type] = window.get('end_time')

    if start_t is None or end_t is None:
        return

    while True:
        now_ist  = datetime.now(IST)
        cur_time = now_ist.time().replace(second=0, microsecond=0)

        if start_t <= cur_time < end_t:    # strict < end_t: window closes exactly at end_time
            state = repo.get_state(db, campaign_id)
            if state and state.status == 'scheduled':
                repo.set_status(db, campaign_id, 'running')
                logger.info(f"[AUTO_RUN] Time window opened — campaign {campaign_id} resuming")

                # 🌅 Notify: window opened, loop resuming
                try:
                    from models.client import Campaign
                    campaign         = db.query(Campaign).filter(Campaign.id == campaign_id).first()
                    progress         = repo.get_chunk_progress(db, campaign_id)
                    chunks_done      = sum(1 for c in progress if c['status'] == 'finished')
                    chunks_left      = sum(1 for c in progress if c['status'] in ('pending', 'starting', 'waiting_finish', 'countdown'))
                    next_chunk_num   = chunks_done + 1  # 1-based index of the next chunk to run
                    await notify_window_resumed(
                        campaign_name=campaign.campaign_name if campaign else str(campaign_id),
                        campaign_id=campaign_id,
                        resumed_at=now_ist,
                        start_time_str=start_t.strftime('%H:%M'),
                        chunks_done=chunks_done,
                        chunks_left=chunks_left,
                        total_chunks=state.total_chunks,
                        next_chunk_number=next_chunk_num,
                    )
                except Exception as e:
                    logger.warning(f"[AUTO_RUN] Window-resumed notification failed: {e}")
            return

        # Compute next window-open moment
        if cur_time < start_t:
            next_open = now_ist.replace(
                hour=start_t.hour, minute=start_t.minute, second=0, microsecond=0
            )
        else:
            tomorrow  = now_ist + timedelta(days=1)
            next_open = tomorrow.replace(
                hour=start_t.hour, minute=start_t.minute, second=0, microsecond=0
            )

        wait_secs        = max(0.0, (next_open - now_ist).total_seconds())
        next_resume_str  = next_open.strftime('%H:%M')

        state = repo.get_state(db, campaign_id)
        if state and state.status != 'scheduled':
            repo.set_status(db, campaign_id, 'scheduled')
            logger.info(
                f"[AUTO_RUN] Campaign {campaign_id} outside time window "
                f"({cur_time.strftime('%H:%M')} not in "
                f"{start_t.strftime('%H:%M')}–{end_t.strftime('%H:%M')} IST). "
                f"Waiting {wait_secs:.0f}s until {next_open.strftime('%H:%M IST')}."
            )

            try:
                from models.client import Campaign as _Campaign
                campaign       = db.query(_Campaign).filter(_Campaign.id == campaign_id).first()
                cname          = campaign.campaign_name if campaign else str(campaign_id)
                progress       = repo.get_chunk_progress(db, campaign_id)
                chunks_done    = sum(1 for c in progress if c['status'] == 'finished')
                chunks_left    = sum(1 for c in progress if c['status'] in (
                    'pending', 'starting', 'waiting_finish', 'countdown'))
                next_chunk_num = chunks_done + 1

                # Choose notification by time: before window = waiting to open; after end = window closed
                if cur_time < start_t:
                    # ⏳ Current time is BEFORE window opens — waiting for start_time (e.g. started at 1:59, window 2:00)
                    await notify_window_waiting_to_start(
                        campaign_name=cname,
                        campaign_id=campaign_id,
                        scheduled_at=now_ist,
                        start_time_str=start_t.strftime('%H:%M'),
                        next_open_dt=next_open,
                        total_chunks=state.total_chunks,
                        next_chunk_number=next_chunk_num,
                    )
                else:
                    # 🕐 Current time is past end_time — window closed mid-run
                    await notify_window_closed(
                        campaign_name=cname,
                        campaign_id=campaign_id,
                        closed_at=now_ist,
                        end_time_str=end_t.strftime('%H:%M'),
                        chunks_done=chunks_done,
                        chunks_left=chunks_left,
                        total_chunks=state.total_chunks,
                        next_chunk_number=next_chunk_num,
                    )
                    await notify_next_window(
                        campaign_name=cname,
                        campaign_id=campaign_id,
                        next_open_dt=next_open,
                        chunks_left=chunks_left,
                        next_chunk_number=next_chunk_num,
                    )
            except Exception as e:
                logger.warning(f"[AUTO_RUN] Window-transition notification failed: {e}")

        # Sleep in 5-second ticks so stop/pause signals are picked up quickly
        slept = 0.0
        while slept < wait_secs:
            tick = min(5.0, wait_secs - slept)
            await asyncio.sleep(tick)
            slept += tick
            await _check_flag(campaign_id)

            # Early-exit: window may have opened (e.g. exact time reached mid-tick)
            cur_t_now = datetime.now(IST).time().replace(second=0, microsecond=0)
            if start_t <= cur_t_now < end_t:    # same strict < end_t
                break


# ─────────────────────────────────────────────────────────────
# Internal — poll until chunk finished
# ─────────────────────────────────────────────────────────────

async def _poll_until_finished(campaign_id: int, chunk_id: int, db):
    """
    Poll chunk status every 10s until 'finished'.
    Checks flag + time window every second during the 10s wait.
    Max ~166 min (1000 × 10s).
    """
    max_attempts = 1000

    for attempt in range(max_attempts):
        await _check_control(campaign_id, db)

        success, err, result = await get_chunk_status_service(db, chunk_id)

        if success and result and result.get('status') == 'finished':
            logger.info(f"[AUTO_RUN] Chunk {chunk_id} finished (attempt {attempt + 1})")
            # Mark finished immediately so UI is never left showing a stale polling message
            repo.update_chunk(db, chunk_id, 'finished', 'Completed ✓')
            return

        status_label = result.get('status') if (success and result) else 'unknown'
        elapsed      = (attempt + 1) * 10

        repo.update_chunk(db, chunk_id, 'waiting_finish', f'Waiting... status={status_label}, elapsed={elapsed}s')

        for _ in range(10):
            await asyncio.sleep(1)
            await _check_control(campaign_id, db)

    raise TimeoutError(f"Chunk {chunk_id} did not finish within polling timeout")


# ─────────────────────────────────────────────────────────────
# Internal — countdown between chunks
# ─────────────────────────────────────────────────────────────

async def _countdown(campaign_id: int, chunk_id: int, gap_seconds: int, db):
    """
    Count down gap_seconds. DB written every 5s (not every second).
    Respects stop/pause + time window on every tick.
    """
    for remaining in range(gap_seconds, 0, -1):
        await _check_control(campaign_id, db)

        if remaining == gap_seconds or remaining % 5 == 0:
            repo.update_chunk(db, chunk_id, 'countdown', f'Next chunk in {remaining}s...')

        await asyncio.sleep(1)


# ─────────────────────────────────────────────────────────────
# Internal — Exotel credit health check
# ─────────────────────────────────────────────────────────────

async def _check_credit_health(
    campaign_id: int,
    client_id: int,
    chunk_index: int,
    campaign_name: str,
    db,
) -> None:
    """
    Runs at the start of every chunk (after the first 5 are skipped).

    Queries the most recent 150 call records for this campaign, sorted by
    call_start_ts DESC. Uses the same connected-call definition as the
    existing filter (duration IS NOT NULL AND recording IS NOT NULL).

    If 0 out of however many records were fetched are connected, sends a
    Google Chat alert. The loop is NEVER stopped — this is alert-only.

    Chunk indices 0–4 (first 5 chunks of the campaign) are silently skipped
    to allow data to build up and avoid false positives at campaign start.
    This is based on the absolute index within the campaign, not relative
    to any pause/resume point.
    """
    # ── Grace period: skip the first 5 chunks ──────────────────────────
    if chunk_index < 5:
        logger.debug(
            f"[CREDIT_CHECK] Skipping health check for campaign {campaign_id} "
            f"chunk_index={chunk_index} (grace period: first 5 chunks)"
        )
        return

    try:
        from sqlalchemy import desc
        from repo.tables import get_datalog_model_for_client

        DataLogModel = get_datalog_model_for_client(db, client_id)
        if DataLogModel is None:
            logger.warning(
                f"[CREDIT_CHECK] Could not resolve DataLog model for "
                f"client_id={client_id} — skipping health check"
            )
            return

        # ── Fetch the most recent ≤150 calls for this campaign ──────────
        recent_records = (
            db.query(DataLogModel)
            .filter(DataLogModel.campaign_id == campaign_id)
            .order_by(desc(DataLogModel.call_start_ts))
            .limit(150)
            .all()
        )

        total_fetched = len(recent_records)

        # ── Count connected calls (mirrors filter_by_connected_status) ──
        # Connected = duration IS NOT NULL AND recording IS NOT NULL
        connected_count = sum(
            1 for r in recent_records
            if r.duration is not None and r.recording is not None
        )

        logger.info(
            f"[CREDIT_CHECK] Campaign {campaign_id} chunk_index={chunk_index}: "
            f"{connected_count}/{total_fetched} connected in last {total_fetched} records"
        )

        # Alert if 0 connected — this includes the case where total_fetched is 0
        # (no records at all after grace period is also a warning signal)
        if connected_count == 0:
            logger.warning(
                f"[CREDIT_CHECK] ⚠️ ZERO connected calls in last {total_fetched} records "
                f"for campaign {campaign_id} — Exotel credits may be exhausted!"
            )
            try:
                await notify_credit_health_alert(
                    campaign_name=campaign_name,
                    campaign_id=campaign_id,
                    chunk_index=chunk_index,
                    total_fetched=total_fetched,
                    connected_count=connected_count,
                )
            except Exception as notify_err:
                logger.warning(
                    f"[CREDIT_CHECK] Alert notification failed for "
                    f"campaign {campaign_id}: {notify_err}"
                )

    except Exception as e:
        # Never interrupt the loop — log and continue
        logger.warning(
            f"[CREDIT_CHECK] Health check raised an exception for "
            f"campaign {campaign_id} chunk_index={chunk_index}: {e}"
        )


# ─────────────────────────────────────────────────────────────
# Internal — main loop (runs as asyncio background task)
# ─────────────────────────────────────────────────────────────

async def _run_loop(
    campaign_id: int,
    client_id: int,
    campaign_name: str,
    chunks: List[dict],
    gap_seconds: int,
    start_time: Optional[time_type] = None,
    end_time:   Optional[time_type] = None,
):
    """
    The core loop. Creates its own DB session — independent of any HTTP request.
    Per-chunk updates go directly to cms_chunks rows (Option B).
    """
    db  = SessionLocal()
    now = datetime.now(IST)

    try:
        total = len(chunks)
        logger.info(
            f"[AUTO_RUN] ══ Loop started: campaign={campaign_id} "
            f"({campaign_name}), chunks={total}, gap={gap_seconds}s ══"
        )

        repo.set_status(db, campaign_id, 'running', started_at=now)

        try:
            await notify_campaign_started(
                campaign_name=campaign_name,
                campaign_id=campaign_id,
                started_at=now,
                total_chunks=total,
                chunks_left=total,
            )
        except Exception as e:
            logger.warning(f"[AUTO_RUN] Started notification failed: {e}")

        # Chunks already marked finished in DB — skip Millis and skip iteration entirely
        progress_snapshot = repo.get_chunk_progress(db, campaign_id)
        already_finished_ids = {c['chunk_id'] for c in progress_snapshot if c['status'] == 'finished'}

        # Start from first chunk that is NOT finished — no point iterating 1..499 if all finished (resume fast)
        start_index = 0
        for idx, ch in enumerate(chunks):
            if ch['id'] not in already_finished_ids:
                start_index = idx
                break
        else:
            # All chunks already finished
            start_index = total
        if start_index >= total:
            logger.info(f"[AUTO_RUN] All {total} chunks already finished — marking campaign completed")
            completed_at = datetime.now(IST)
            repo.set_status(db, campaign_id, 'completed', ended_at=completed_at)
            try:
                await notify_campaign_completed(
                    campaign_name=campaign_name,
                    campaign_id=campaign_id,
                    started_at=now,
                    completed_at=completed_at,
                )
            except Exception as e:
                logger.warning(f"[AUTO_RUN] Completed notification failed: {e}")
        else:
            # Run loop only from first non-finished chunk
            if start_index > 0:
                logger.info(
                    f"[AUTO_RUN] Resuming from chunk {start_index + 1}/{total} "
                    f"(skipping {start_index} already finished)"
                )

            for i in range(start_index, total):
                chunk = chunks[i]
                chunk_id   = chunk['id']
                chunk_name = chunk['chunk_name']

                logger.info(f"[AUTO_RUN] ── Chunk {i + 1}/{total}: {chunk_name} (id={chunk_id})")

                # Enforce daily time window BEFORE each chunk (pauses here if outside window)
                await _wait_for_time_window(campaign_id, db)

                # Credit health check — alert if 0 connected calls in recent records
                if i % 2 != 0:
                    await _check_credit_health(campaign_id, client_id, i, campaign_name, db)

                repo.update_current_chunk(db, campaign_id, i)

                repo.update_chunk(db, chunk_id, 'pending', 'Checking status...')

                await _check_flag(campaign_id)
                success, err, result = await get_chunk_status_service(db, chunk_id)

                if not success:
                    repo.update_chunk(db, chunk_id, 'failed', f'Status check failed: {err}')
                    logger.error(f"[AUTO_RUN] Status check failed for chunk {chunk_id}: {err}")
                    continue

                current_status = result.get('status', 'unknown')
                logger.info(f"[AUTO_RUN] Chunk {chunk_name} Millis status: {current_status}")

                if current_status == 'finished':
                    repo.update_chunk(db, chunk_id, 'finished', 'Already finished (skipped, no timer)')
                    continue

                if current_status == 'started':
                    repo.update_chunk(db, chunk_id, 'waiting_finish', 'Already started, waiting...')
                    await _poll_until_finished(campaign_id, chunk_id, db)
                    repo.update_chunk(db, chunk_id, 'finished', 'Finished (no timer — was already started)')
                    continue

                if current_status == 'idle':
                    repo.update_chunk(db, chunk_id, 'starting', f'Starting chunk {i + 1}/{total}...')

                    start_success, start_err, _ = await start_chunk_service(db, chunk_id)

                    if not start_success:
                        repo.update_chunk(db, chunk_id, 'failed', f'Failed to start: {start_err}')
                        logger.error(f"[AUTO_RUN] Failed to start {chunk_name}: {start_err}")
                        continue

                    repo.update_chunk(db, chunk_id, 'waiting_finish', 'Chunk started, waiting for finish...')
                    await _poll_until_finished(campaign_id, chunk_id, db)
                    repo.update_chunk(db, chunk_id, 'finished', 'Finished (idle → started → finished)')
                    logger.info(f"[AUTO_RUN] {chunk_name} finished")

                    if i < total - 1:
                        await _countdown(campaign_id, chunk_id, gap_seconds, db)
                        # Countdown overwrites the chunk's status with 'countdown'.
                        # Restore it to 'finished' so the UI shows a green tick, not a stale timer.
                        repo.update_chunk(db, chunk_id, 'finished', 'Completed ✓')
                        # Check time window after countdown (window might have closed mid-gap)
                        await _wait_for_time_window(campaign_id, db)

                else:
                    repo.update_chunk(db, chunk_id, 'failed', f'Unexpected status: {current_status} (skipped)')
                    logger.warning(f"[AUTO_RUN] {chunk_name} unexpected status: {current_status}")

            completed_at = datetime.now(IST)
            logger.info(f"[AUTO_RUN] ══ All chunks done for campaign {campaign_id} ══")
            repo.set_status(db, campaign_id, 'completed', ended_at=completed_at)

            try:
                await notify_campaign_completed(
                    campaign_name=campaign_name,
                    campaign_id=campaign_id,
                    started_at=now,
                    completed_at=completed_at,
                )
            except Exception as e:
                logger.warning(f"[AUTO_RUN] Completed notification failed: {e}")

    except _StoppedByUser:
        stopped_at = datetime.now(IST)
        logger.info(f"[AUTO_RUN] ══ Stopped by user: campaign {campaign_id} ══")
        repo.set_status(db, campaign_id, 'stopped', ended_at=stopped_at)

        # Clean up chunks that were interrupted mid-flight so the UI never shows
        # stale "Waiting... / countdown / Starting..." messages after a stop.
        progress = repo.get_chunk_progress(db, campaign_id)
        for c in progress:
            if c['status'] == 'countdown':
                # Chunk itself finished — countdown was just interrupted
                repo.update_chunk(db, c['chunk_id'], 'finished', 'Completed ✓')
            elif c['status'] in ('waiting_finish', 'starting', 'pending'):
                # Chunk was mid-flight or queued — reset so next run re-checks Millis
                repo.update_chunk(db, c['chunk_id'], 'pending', 'Stopped — will re-check on next run')

        progress    = repo.get_chunk_progress(db, campaign_id)
        chunks_done = sum(1 for c in progress if c['status'] == 'finished')
        chunks_left = sum(1 for c in progress if c['status'] == 'pending')

        try:
            await notify_campaign_paused(
                campaign_name=campaign_name,
                campaign_id=campaign_id,
                paused_at=stopped_at,
                started_at=now,
                chunks_done=chunks_done,
                chunks_left=chunks_left,
                total_chunks=len(chunks),
            )
        except Exception as e:
            logger.warning(f"[AUTO_RUN] Paused notification failed: {e}")

    except Exception as e:
        logger.error(f"[AUTO_RUN] ══ Loop error: campaign {campaign_id}: {e} ══")
        repo.set_status(db, campaign_id, 'stopped', ended_at=datetime.now(IST))
        try:
            progress = repo.get_chunk_progress(db, campaign_id)
            for c in progress:
                if c['status'] == 'countdown':
                    repo.update_chunk(db, c['chunk_id'], 'finished', 'Completed ✓')
                elif c['status'] in ('waiting_finish', 'starting', 'pending'):
                    repo.update_chunk(db, c['chunk_id'], 'pending', 'Stopped — will re-check on next run')
        except Exception as cleanup_err:
            logger.warning(f"[AUTO_RUN] Chunk cleanup after error failed: {cleanup_err}")

    finally:
        _tasks.pop(campaign_id, None)
        _flags.pop(campaign_id, None)
        db.close()
        logger.info(f"[AUTO_RUN] Loop exited for campaign {campaign_id}")


# ─────────────────────────────────────────────────────────────
# Public API — router calls only these functions
# ─────────────────────────────────────────────────────────────

def is_running(campaign_id: int) -> bool:
    task = _tasks.get(campaign_id)
    return task is not None and not task.done()


def start(
    campaign_id: int,
    client_id: int,
    gap_seconds: int,
    db,
    start_time_str: Optional[str] = None,   # "HH:MM" or None
    end_time_str:   Optional[str] = None,   # "HH:MM" or None
) -> Tuple[bool, str]:
    """
    Full orchestration entry point:
      1. Validate campaign exists
      2. Guard against duplicate runs
      3. Fetch chunks from DB
      4. Parse optional daily time window (start_time_str / end_time_str = "HH:MM")
      5. Persist initial state + reset chunk progress
      6. Launch asyncio background task

    Returns (True, success_message) or (False, error_message).
    Router raises HTTPException on False — this function never raises.
    """
    try:
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            return False, f"Campaign {campaign_id} not found"

        if is_running(campaign_id):
            return False, f"Auto-run already running for campaign {campaign_id}"

        success, err, result = get_chunks_by_campaign(db, campaign_id)
        if not success:
            return False, err or "Failed to fetch chunks"

        chunks = result.get("chunks", [])
        if not chunks:
            return False, "No chunks found for this campaign"

        # Parse time-window strings → datetime.time objects and validate
        start_t = _parse_time(start_time_str)
        end_t   = _parse_time(end_time_str)

        if (start_t is None) != (end_t is None):
            return False, "Both start_time and end_time must be provided together, or both left blank."
        if start_t is not None and start_t > end_t:
            return False, f"start_time ({start_t.strftime('%H:%M')}) cannot be greater than end_time ({end_t.strftime('%H:%M')})."
        # start == end means run 24×7 — treat as no restriction
        if start_t is not None and start_t == end_t:
            start_t = None
            end_t   = None

        _time_windows[campaign_id] = {'start_time': start_t, 'end_time': end_t}

        repo.upsert_state(
            db, campaign_id, client_id, gap_seconds, len(chunks),
            start_time=start_t, end_time=end_t
        )

        # Only reset chunk progress on a true fresh start. If some chunks are already
        # finished (e.g. user stopped and starts again), preserve them so the loop
        # resumes from first non-finished and does not re-fetch Millis for 1..N.
        progress = repo.get_chunk_progress(db, campaign_id)
        any_finished = any(c['status'] == 'finished' for c in progress)
        if not any_finished:
            repo.reset_chunk_progress(db, campaign_id)

        _flags[campaign_id] = 'run'
        task = asyncio.create_task(
            _run_loop(
                campaign_id, client_id, campaign.campaign_name, chunks,
                gap_seconds, start_t, end_t
            )
        )
        _tasks[campaign_id] = task

        window_str = f"{start_time_str}–{end_time_str} IST" if start_t and end_t else "no restriction"
        logger.info(f"[AUTO_RUN] Task created for campaign {campaign_id}, window={window_str}")
        return True, f"Auto-run started for '{campaign.campaign_name}' ({len(chunks)} chunks)"

    except Exception as e:
        logger.error(f"[AUTO_RUN] start() error: {e}")
        return False, f"Failed to start auto-run: {str(e)}"


def _parse_time(time_str: Optional[str]) -> Optional[time_type]:
    """Parse 'HH:MM' string into datetime.time. Returns None for empty/invalid input."""
    if not time_str:
        return None
    try:
        parts = time_str.strip().split(':')
        return time_type(int(parts[0]), int(parts[1]))
    except Exception:
        logger.warning(f"[AUTO_RUN] Invalid time string ignored: {time_str!r}")
        return None


def stop(campaign_id: int, db) -> Tuple[bool, str]:
    """
    Signal the loop to stop.
    Returns (False, reason) if no state exists.
    Sets DB status to 'stopped' immediately so the UI updates right away;
    the loop will exit when it next checks the flag.
    """
    state = repo.get_state(db, campaign_id)
    if not state:
        return False, f"No auto-run state found for campaign {campaign_id}"

    _flags[campaign_id] = 'stop'
    repo.set_action(db, campaign_id, 'stop')
    repo.set_status(db, campaign_id, 'stopped', ended_at=datetime.now(IST))
    logger.info(f"[AUTO_RUN] Stop signal sent for campaign {campaign_id}")
    return True, f"Stop signal sent for campaign {campaign_id}"


async def pause(campaign_id: int, db) -> Tuple[bool, str]:
    """
    Pause the running loop and notify Google Chat.
    Works when the loop is actively running OR sleeping in the time window ('scheduled').
    Returns (False, reason) if not currently active.
    """
    if not is_running(campaign_id):
        return False, f"Auto-run is not currently running for campaign {campaign_id}"

    state = repo.get_state(db, campaign_id)
    if not state:
        return False, f"No auto-run state found for campaign {campaign_id}"

    if state.status not in ('running', 'scheduled'):
        return False, f"Auto-run is not in a pausable state for campaign {campaign_id} (current: {state.status})"

    _flags[campaign_id] = 'pause'
    repo.set_action(db, campaign_id, 'pause')
    repo.set_status(db, campaign_id, 'paused')
    logger.info(f"[AUTO_RUN] Pause signal sent for campaign {campaign_id}")

    # Send Google Chat notification
    try:
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        progress    = repo.get_chunk_progress(db, campaign_id)
        chunks_done = sum(1 for c in progress if c['status'] in ('finished',))
        chunks_left = sum(1 for c in progress if c['status'] in ('pending', 'starting', 'waiting_finish', 'countdown'))
        await notify_campaign_paused(
            campaign_name=campaign.campaign_name if campaign else str(campaign_id),
            campaign_id=campaign_id,
            paused_at=datetime.now(IST),
            started_at=state.started_at,
            chunks_done=chunks_done,
            chunks_left=chunks_left,
            total_chunks=state.total_chunks,
        )
    except Exception as e:
        logger.warning(f"[AUTO_RUN] Paused notification failed: {e}")

    return True, f"Pause signal sent for campaign {campaign_id}"


async def resume(campaign_id: int, db) -> Tuple[bool, str]:
    """
    Resume a paused loop and notify Google Chat.
    Returns (False, reason) if not currently paused or if the loop died (server restart).
    """
    state = repo.get_state(db, campaign_id)
    if not state:
        return False, f"No auto-run state found for campaign {campaign_id}"

    if state.status != 'paused':
        return False, f"Auto-run is not paused for campaign {campaign_id} (current: {state.status})"

    if not is_running(campaign_id):
        # Task is gone (server restarted while paused) — reset to stopped so user can start fresh
        repo.set_status(db, campaign_id, 'stopped')
        return False, "Loop is no longer active (server may have restarted). Please use Stop to reset, then Start again."

    _flags[campaign_id] = 'run'
    repo.set_action(db, campaign_id, 'run')
    repo.set_status(db, campaign_id, 'running')
    logger.info(f"[AUTO_RUN] Resume signal sent for campaign {campaign_id}")

    # Send Google Chat notification
    try:
        campaign    = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        progress    = repo.get_chunk_progress(db, campaign_id)
        chunks_done = sum(1 for c in progress if c['status'] == 'finished')
        chunks_left = sum(1 for c in progress if c['status'] in ('pending', 'starting', 'waiting_finish', 'countdown'))
        await notify_campaign_resumed(
            campaign_name=campaign.campaign_name if campaign else str(campaign_id),
            campaign_id=campaign_id,
            resumed_at=datetime.now(IST),
            chunks_done=chunks_done,
            chunks_left=chunks_left,
            total_chunks=state.total_chunks,
        )
    except Exception as e:
        logger.warning(f"[AUTO_RUN] Resumed notification failed: {e}")

    return True, f"Resume signal sent for campaign {campaign_id}"


def get_status(campaign_id: int, db) -> dict:
    """
    Return full current state for the status API.
    chunk_progress comes from cms_chunks rows — no JSON blob.

    Auto-heal: if the DB says 'running' or 'paused' but no asyncio task is alive
    (e.g. after a server restart), immediately correct the status to 'stopped' so
    the frontend never gets stuck on a ghost "RUNNING" display.
    """
    state          = repo.get_state(db, campaign_id)
    chunk_progress = repo.get_chunk_progress(db, campaign_id)

    if not state:
        return {
            "campaign_id":         campaign_id,
            "status":              "idle",
            "action":              "run",
            "is_running":          False,
            "gap_seconds":         20,
            "current_chunk_index": 0,
            "total_chunks":        0,
            "chunk_progress":      chunk_progress,
            "start_time":          None,
            "end_time":            None,
            "next_resume_at":      None,
            "started_at":          None,
            "ended_at":            None,
            "updated_at":          None,
        }

    task_alive = is_running(campaign_id)

    # Auto-heal: DB says active but asyncio task is gone (server restart)
    # Note: 'scheduled' is intentionally excluded — task is alive but sleeping.
    if state.status in ('running', 'paused') and not task_alive:
        logger.warning(
            f"[AUTO_RUN] Stale '{state.status}' state detected for campaign {campaign_id} "
            f"(no live task). Auto-correcting to 'stopped'."
        )
        repo.set_status(db, campaign_id, 'stopped', ended_at=datetime.now(IST))
        effective_status = 'stopped'
    else:
        effective_status = state.status

    # Compute next_resume_at for 'scheduled' status
    next_resume_at = None
    if effective_status == 'scheduled' and state.start_time:
        now_ist  = datetime.now(IST)
        cur_time = now_ist.time().replace(second=0, microsecond=0)
        st       = state.start_time if isinstance(state.start_time, time_type) else state.start_time
        if cur_time < st:
            nxt = now_ist.replace(hour=st.hour, minute=st.minute, second=0, microsecond=0)
        else:
            nxt = (now_ist + timedelta(days=1)).replace(
                hour=st.hour, minute=st.minute, second=0, microsecond=0
            )
        next_resume_at = nxt.strftime('%Y-%m-%dT%H:%M:00+05:30')

    def _fmt_time(t) -> Optional[str]:
        if t is None:
            return None
        if isinstance(t, time_type):
            return t.strftime('%H:%M')
        return str(t)[:5]  # 'HH:MM' slice from DB TIME string

    return {
        "campaign_id":         state.campaign_id,
        "status":              effective_status,
        "action":              state.action,
        "is_running":          task_alive,
        "gap_seconds":         state.gap_seconds,
        "current_chunk_index": state.current_chunk_index,
        "total_chunks":        state.total_chunks,
        "chunk_progress":      chunk_progress,
        "start_time":          _fmt_time(state.start_time),
        "end_time":            _fmt_time(state.end_time),
        "next_resume_at":      next_resume_at,
        "started_at":          state.started_at.isoformat() if state.started_at else None,
        "ended_at":            state.ended_at.isoformat()   if state.ended_at   else None,
        "updated_at":          state.updated_at.isoformat() if state.updated_at else None,
    }


# ─────────────────────────────────────────────────────────────
# Public — monitor (all phases → campaigns → auto-run summary)
# ─────────────────────────────────────────────────────────────

def get_monitor_data(client_id: int, db) -> dict:
    """
    Return a lightweight phase → campaign → auto-run summary for the Monitor tab.
    One DB round-trip per phase; chunks_done is a cheap COUNT query (no full list).
    Auto-heal is applied: stale running/paused states with no live task → stopped.
    """
    from models.client import Phase, Campaign, Chunk as ChunkModel

    phases = (
        db.query(Phase)
        .filter(Phase.client_id == client_id)
        .order_by(Phase.id)
        .all()
    )

    def _fmt(t) -> Optional[str]:
        if t is None:
            return None
        if isinstance(t, time_type):
            return t.strftime('%H:%M')
        return str(t)[:5]

    phase_list = []
    for phase in phases:
        campaigns = (
            db.query(Campaign)
            .filter(Campaign.phase_id == phase.id)
            .order_by(Campaign.id)
            .all()
        )

        cam_list = []
        for idx, campaign in enumerate(campaigns):
            state = repo.get_state(db, campaign.id)
            auto_run_summary = None

            if state:
                task_alive = is_running(campaign.id)

                # Auto-heal: DB says active but asyncio task is gone
                if state.status in ('running', 'paused') and not task_alive:
                    logger.warning(
                        f"[MONITOR] Stale '{state.status}' for campaign {campaign.id} — correcting to stopped"
                    )
                    repo.set_status(db, campaign.id, 'stopped', ended_at=datetime.now(IST))
                    effective_status = 'stopped'
                else:
                    effective_status = state.status

                # Cheap count — no full chunk list needed for the grid
                chunks_done = (
                    db.query(ChunkModel)
                    .filter(
                        ChunkModel.campaign_id == campaign.id,
                        ChunkModel.auto_run_status == 'finished',
                    )
                    .count()
                )

                # next_resume_at for scheduled status
                next_resume_at = None
                if effective_status == 'scheduled' and state.start_time:
                    now_ist  = datetime.now(IST)
                    cur_time = now_ist.time().replace(second=0, microsecond=0)
                    st = state.start_time if isinstance(state.start_time, time_type) else state.start_time
                    if cur_time < st:
                        nxt = now_ist.replace(hour=st.hour, minute=st.minute, second=0, microsecond=0)
                    else:
                        nxt = (now_ist + timedelta(days=1)).replace(
                            hour=st.hour, minute=st.minute, second=0, microsecond=0
                        )
                    next_resume_at = nxt.strftime('%Y-%m-%dT%H:%M:00+05:30')

                auto_run_summary = {
                    "status":              effective_status,
                    "is_running":          task_alive,
                    "current_chunk_index": state.current_chunk_index,
                    "total_chunks":        state.total_chunks,
                    "gap_seconds":         state.gap_seconds,
                    "start_time":          _fmt(state.start_time),
                    "end_time":            _fmt(state.end_time),
                    "next_resume_at":      next_resume_at,
                    "chunks_done":         chunks_done,
                    "started_at":          state.started_at.isoformat() if state.started_at else None,
                    "ended_at":            state.ended_at.isoformat()   if state.ended_at   else None,
                    "updated_at":          state.updated_at.isoformat() if state.updated_at else None,
                }

            cam_list.append({
                "id":             campaign.id,
                "campaign_name":  campaign.campaign_name or f"Campaign {idx + 1}",
                "campaign_index": idx + 1,
                "type":           campaign.type,
                "millis_status":  campaign.status,
                "records_count":  campaign.records_count,
                "auto_run":       auto_run_summary,
            })

        phase_list.append({
            "id":        phase.id,
            "name":      phase.name,
            "campaigns": cam_list,
        })

    return {
        "client_id": client_id,
        "phases":    phase_list,
    }