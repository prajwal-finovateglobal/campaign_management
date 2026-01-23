"""
Service layer for Disposition Jobs.
Orchestrates disposition job operations with business logic.
"""
from database.dependencies import DB_DEPENDENCY
from repo.disposition_jobs_repo import (
    ensure_disposition_job,
    reset_other_campaigns_to_queue,
    fetch_cursor,
    fetch_max_cursor,
    fetch_next_disposition_job,
    set_disposition_status,
    update_disposition_job_status,
    update_disposition_job_progress,
    heartbeat,
    is_disposition_job_alive,
    is_disposition_job_busy,
    get_disposition_priorities
)
from typing import Optional, Tuple, Dict, Any
import loguru
import time

logger = loguru.logger.bind(service="disposition_jobs")


async def disposition_priority(
    db: DB_DEPENDENCY,
    client_id: int
) -> Tuple[bool, str, Optional[list[int]]]:
    """
    Get list of available disposition priorities for a client.
    Returns all existing priorities (except 0) + (max_priority + 1).
    
    Args:
        db: Database session
        client_id: Client ID
        
    Returns:
        Tuple of (success, message, priority_list)
    """
    try:
        priority_list = await get_disposition_priorities(db, client_id)
        return (True, f"Found {len(priority_list)} available priorities", priority_list)
        
    except Exception as e:
        logger.error(f"Error getting disposition priorities: {e}")
        return (False, f"Error: {str(e)}", None)


async def ensure_job_exists(
    db: DB_DEPENDENCY,
    client_id: int,
    campaign_id: int,
    priority: int = 0
) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    """
    Ensure a disposition job exists for the campaign.
    
    Args:
        db: Database session
        client_id: Client ID
        campaign_id: Campaign ID
        priority: Priority of the job (default: 0)
        
    Returns:
        Tuple of (success, message, job_data)
    """
    try:
        job = await ensure_disposition_job(db, client_id, campaign_id, priority)
        
        job_data = {
            'id': job.id,
            'client_id': job.client_id,
            'campaign_id': job.campaign_id,
            'status': job.status,
            'priority': job.priority,
            'cur_idx': job.cur_idx,
            'processed_records': job.processed_records,
            'total_records': job.total_records
        }
        
        return (True, "Job ensured successfully", job_data)
        
    except Exception as e:
        logger.error(f"Error ensuring job: {e}")
        return (False, f"Error: {str(e)}", None)


async def pause_other_campaigns(
    db: DB_DEPENDENCY,
    client_id: int,
    active_campaign_id: int
) -> Tuple[bool, str, int]:
    """
    Reset all other campaigns to queue status (pausing them).
    Only one campaign can run at a time per client.
    
    Args:
        db: Database session
        client_id: Client ID
        active_campaign_id: Currently active campaign ID
        
    Returns:
        Tuple of (success, message, count_reset)
    """
    try:
        count = await reset_other_campaigns_to_queue(db, client_id, active_campaign_id)
        
        if count > 0:
            message = f"Reset {count} campaign(s) to queue status"
        else:
            message = "No other campaigns to reset"
        
        return (True, message, count)
        
    except Exception as e:
        logger.error(f"Error pausing other campaigns: {e}")
        return (False, f"Error: {str(e)}", 0)


async def get_current_cursor(
    db: DB_DEPENDENCY,
    client_id: int,
    campaign_id: int
) -> Tuple[bool, str, Optional[int]]:
    """
    Get the current cursor position for a disposition job.
    
    Args:
        db: Database session
        client_id: Client ID
        campaign_id: Campaign ID
        
    Returns:
        Tuple of (success, message, cur_idx)
    """
    try:
        cur_idx = await fetch_cursor(db, client_id, campaign_id)
        
        if cur_idx is None:
            return (False, "Job not found", None)
        
        return (True, f"Current cursor: {cur_idx}", cur_idx)
        
    except Exception as e:
        logger.error(f"Error getting cursor: {e}")
        return (False, f"Error: {str(e)}", None)


async def get_max_cursor(
    db: DB_DEPENDENCY,
    client_id: int,
    campaign_id: int,
    table_name: str
) -> Tuple[bool, str, Optional[int]]:
    """
    Get the maximum cursor position (max s_no) from datalog table.
    
    Args:
        db: Database session
        client_id: Client ID
        campaign_id: Campaign ID
        table_name: Datalog table name
        
    Returns:
        Tuple of (success, message, max_cursor)
    """
    try:
        max_cursor = await fetch_max_cursor(db, client_id, campaign_id, table_name)
        
        if max_cursor is None:
            return (True, "No records found in table", 0)
        
        return (True, f"Max cursor: {max_cursor}", max_cursor)
        
    except Exception as e:
        logger.error(f"Error getting max cursor: {e}")
        return (False, f"Error: {str(e)}", None)


async def get_next_job(
    db: DB_DEPENDENCY,
    client_id: int
) -> Tuple[bool, str, Optional[int]]:
    """
    Get the next disposition job to process based on priority.
    
    Args:
        db: Database session
        client_id: Client ID
        
    Returns:
        Tuple of (success, message, campaign_id)
    """
    try:
        campaign_id = await fetch_next_disposition_job(db, client_id)
        
        if campaign_id is None:
            return (True, "No queued jobs available", None)
        
        return (True, f"Next job: campaign_id={campaign_id}", campaign_id)
        
    except Exception as e:
        logger.error(f"Error getting next job: {e}")
        return (False, f"Error: {str(e)}", None)


async def update_job_status(
    db: DB_DEPENDENCY,
    client_id: int,
    campaign_id: int,
    status: str
) -> Tuple[bool, str]:
    """
    Update disposition job status.
    
    Args:
        db: Database session
        client_id: Client ID
        campaign_id: Campaign ID
        status: New status
        
    Returns:
        Tuple of (success, message)
    """
    try:
        success = await update_disposition_job_status(db, client_id, campaign_id, status)
        
        if success:
            return (True, f"Status updated to '{status}'")
        else:
            return (False, "Job not found")
        
    except Exception as e:
        logger.error(f"Error updating status: {e}")
        return (False, f"Error: {str(e)}")


async def update_job_progress(
    db: DB_DEPENDENCY,
    client_id: int,
    campaign_id: int,
    cur_idx: int,
    processed_records: int,
    total_records: Optional[int] = None
) -> Tuple[bool, str]:
    """
    Update disposition job progress.
    
    Args:
        db: Database session
        client_id: Client ID
        campaign_id: Campaign ID
        cur_idx: Current cursor position
        processed_records: Number of records processed
        total_records: Total records (optional)
        
    Returns:
        Tuple of (success, message)
    """
    try:
        success = await update_disposition_job_progress(
            db, client_id, campaign_id, cur_idx, processed_records, total_records
        )
        
        if success:
            return (True, f"Progress updated: processed={processed_records}, cur_idx={cur_idx}")
        else:
            return (False, "Job not found")
        
    except Exception as e:
        logger.error(f"Error updating progress: {e}")
        return (False, f"Error: {str(e)}")


async def send_heartbeat(
    db: DB_DEPENDENCY,
    client_id: int,
    campaign_id: int
) -> Tuple[bool, str]:
    """
    Send a heartbeat signal for a disposition job.
    Updates the heartbeat timestamp to indicate the job is still active.
    
    Args:
        db: Database session
        client_id: Client ID
        campaign_id: Campaign ID
        
    Returns:
        Tuple of (success, message)
    """
    try:
        success = await heartbeat(db, client_id, campaign_id)
        
        if success:
            return (True, "Heartbeat updated")
        else:
            return (False, "Job not found")
        
    except Exception as e:
        logger.error(f"Error sending heartbeat: {e}")
        return (False, f"Error: {str(e)}")


async def check_job_alive(
    db: DB_DEPENDENCY,
    client_id: int
) -> Tuple[bool, str, bool]:
    """
    Check if client has an alive disposition job based on heartbeat.
    
    Handles multiple scenarios:
    - 0 running jobs: Returns False (client is idle/sleeping)
    - 1 running job: Checks its heartbeat liveness
    - 2+ running jobs: Checks first job, resets others to queue
    
    Args:
        db: Database session
        client_id: Client ID
        
    Returns:
        Tuple of (success, message, is_alive)
        - success: Whether the check was successful
        - message: Status message
        - is_alive: True if client has alive job, False otherwise
    """
    try:
        is_alive = await is_disposition_job_alive(db, client_id)
        
        if is_alive:
            return (True, "Client has an alive job", True)
        else:
            return (True, "No alive jobs (sleeping or dead)", False)
        
    except Exception as e:
        logger.error(f"Error checking job alive: {e}")
        return (False, f"Error: {str(e)}", False)


async def check_if_busy(
    db: DB_DEPENDENCY,
    client_id: int
) -> Tuple[bool, str, bool]:
    """
    Check if client has a running disposition job.
    Enforces one-job-per-client rule by stopping extra jobs.
    
    Args:
        db: Database session
        client_id: Client ID
        
    Returns:
        Tuple of (success, message, is_busy)
        - success: Whether the check was successful
        - message: Status message
        - is_busy: True if client has a running job, False otherwise
    """
    try:
        is_busy = await is_disposition_job_busy(db, client_id)
        
        if is_busy:
            return (True, "Client has a running disposition job", is_busy)
        else:
            return (True, "Client has no running disposition jobs", is_busy)
            
    except Exception as e:
        logger.error(f"Error checking if client is busy: {e}")
        return (False, f"Error: {str(e)}", False)
async def set_job_status(
    db: DB_DEPENDENCY,
    client_id: int,
    campaign_id: int,
    status: str
) -> Tuple[bool, str, None]:
    """
    Set the status of a disposition job (simplified version).
    
    Args:
        db: Database session
        client_id: Client ID
        campaign_id: Campaign ID
        status: New status ('queue', 'running', 'completed', 'failed')
        
    Returns:
        Tuple of (success, message, None)
    """
    try:
        success = await set_disposition_status(db, client_id, campaign_id, status)
        
        if success:
            return (True, f"Status set to '{status}' successfully", None)
        else:
            return (False, "Failed to set status - job not found", None)
            
    except Exception as e:
        logger.error(f"Error setting status: {e}")
        return (False, f"Error: {str(e)}", None)


def process_disposition(
    db: DB_DEPENDENCY,
    client_id: int,
    campaign_id: int,
    table_name: str
) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    """
    Process disposition for a campaign (SYNC function - process completion is critical).
    
    This is a synchronous function to ensure the entire process completes.
    Currently implements a skeleton loop with cur_idx updates.
    Later, the time.sleep(1) will be replaced with actual disposition processing logic.
    
    Args:
        db: Database session
        client_id: Client ID
        campaign_id: Campaign ID
        table_name: Datalog table name
        
    Returns:
        Tuple of (success, message, result_data)
        - success: Whether processing completed successfully
        - message: Status message
        - result_data: Dictionary with processing results
    """
    try:
        logger.info(f"Starting disposition processing: client_id={client_id}, campaign_id={campaign_id}, table={table_name}")
        
        # Process loop - 10 iterations
        for i in range(10):
            logger.info(f"Processing iteration {i}: Updating cur_idx to {i}")
            
            # Update cur_idx in cms_disposition_jobs
            # Using the existing update_disposition_job_progress function
            # We'll call the repo function directly since this is sync
            from repo.disposition_jobs_repo import DispositionJob
            
            job = db.query(DispositionJob).filter(
                DispositionJob.client_id == client_id,
                DispositionJob.campaign_id == campaign_id
            ).first()
            
            if job:
                job.cur_idx = i
                db.commit()
                logger.debug(f"Updated cur_idx to {i} for campaign {campaign_id}")
            else:
                logger.error(f"Job not found: client_id={client_id}, campaign_id={campaign_id}")
                return (False, "Job not found", None)
            
            # Placeholder sleep - will be replaced with actual disposition logic later
            time.sleep(1)
        
        # After 10 iterations, set status to completed
        logger.info(f"All iterations complete. Setting status to 'completed'")
        
        job = db.query(DispositionJob).filter(
            DispositionJob.client_id == client_id,
            DispositionJob.campaign_id == campaign_id
        ).first()
        
        if job:
            job.status = 'completed'
            job.cur_idx = 10  # Final cursor position
            db.commit()
            logger.info(f"Disposition processing completed: client_id={client_id}, campaign_id={campaign_id}")
        
        # Return result
        result = {
            "client_id": client_id,
            "campaign_id": campaign_id,
            "table_name": table_name,
            "status": "completed",
            "total_iterations": 10,
            "final_cur_idx": 10
        }
        
        return (True, "Disposition processing completed successfully", result)
        
    except Exception as e:
        logger.error(f"Error in disposition processing: {e}")
        db.rollback()
        return (False, f"Error: {str(e)}", None)


