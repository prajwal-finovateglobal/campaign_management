"""
Repository layer for Disposition Jobs.
Handles database operations for cms_disposition_workers table.
"""
from sqlalchemy.orm import Session
from sqlalchemy import func
from database.dependencies import DB_DEPENDENCY
from models.automation import DispositionJob
from repo.tables import get_datalog_model_for_table
from typing import Optional, List
from datetime import datetime, timedelta
import pytz
import loguru
from Core.config import ALIVE_PERIOD

logger = loguru.logger.bind(repo="disposition_jobs")

# Asia/Kolkata timezone
ASIA_KOLKATA = pytz.timezone('Asia/Kolkata')

def get_current_time():
    """Get current time in Asia/Kolkata timezone"""
    return datetime.now(ASIA_KOLKATA)


async def ensure_disposition_job(
    db: DB_DEPENDENCY,
    client_id: int,
    campaign_id: int
) -> DispositionJob:
    """
    Ensure a disposition job exists for the given client_id and campaign_id.
    If job doesn't exist, create a new one with cur_idx = 0 and status = 'queue'.
    
    Args:
        db: Database session
        client_id: Client ID
        campaign_id: Campaign ID
        
    Returns:
        DispositionJob job (existing or newly created)
    """
    try:
        # Try to fetch existing job
        job = db.query(DispositionJob).filter(
            DispositionJob.client_id == client_id,
            DispositionJob.campaign_id == campaign_id
        ).first()
        
        if job:
            logger.info(f"Found existing disposition job: client_id={client_id}, campaign_id={campaign_id}, status={job.status}")
            return job
        
        # Create new job if not exists
        new_job = DispositionJob(
            client_id=client_id,
            campaign_id=campaign_id,
            cur_idx=0,
            status='queue',
            processed_records=0,
            retry_count=0
        )
        
        db.add(new_job)
        db.commit()
        db.refresh(new_job)
        
        logger.info(f"Created new disposition job: client_id={client_id}, campaign_id={campaign_id}, job_id={new_job.id}")
        return new_job
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error ensuring disposition job: {e}")
        raise


async def reset_other_campaigns_to_queue(
    db: DB_DEPENDENCY,
    client_id: int,
    active_campaign_id: int
) -> int:
    """
    Reset all other campaigns (except active one) to 'queue' status for the given client.
    Only resets campaigns that are NOT in 'completed' status.
    
    Args:
        db: Database session
        client_id: Client ID
        active_campaign_id: The currently active campaign ID (will NOT be reset)
        
    Returns:
        Number of jobs reset to queue
    """
    try:
        # Update all jobs for this client except the active campaign and completed ones
        updated_count = db.query(DispositionJob).filter(
            DispositionJob.client_id == client_id,
            DispositionJob.campaign_id != active_campaign_id,
            DispositionJob.status != 'completed'
        ).update(
            {'status': 'queue'},
            synchronize_session=False
        )
        
        db.commit()
        
        logger.info(f"Reset {updated_count} disposition jobs to 'queue' for client_id={client_id}, excluding campaign_id={active_campaign_id}")
        return updated_count
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error resetting campaigns to queue: {e}")
        raise


async def fetch_cursor(
    db: DB_DEPENDENCY,
    client_id: int,
    campaign_id: int
) -> Optional[int]:
    """
    Fetch the current cursor position (cur_idx) for a disposition job.
    
    Args:
        db: Database session
        client_id: Client ID
        campaign_id: Campaign ID
        
    Returns:
        Current cursor position (cur_idx) or None if job not found
    """
    try:
        job = db.query(DispositionJob).filter(
            DispositionJob.client_id == client_id,
            DispositionJob.campaign_id == campaign_id
        ).first()
        
        if not job:
            logger.warning(f"No disposition job found for client_id={client_id}, campaign_id={campaign_id}")
            return None
        
        logger.info(f"Fetched cursor: client_id={client_id}, campaign_id={campaign_id}, cur_idx={job.cur_idx}")
        return job.cur_idx
        
    except Exception as e:
        logger.error(f"Error fetching cursor: {e}")
        raise


async def fetch_max_cursor(
    db: DB_DEPENDENCY,
    client_id: int,
    campaign_id: int,
    table_name: str
) -> Optional[int]:
    """
    Fetch the maximum s_no from the dynamic datalog table for the given campaign.
    
    Args:
        db: Database session
        client_id: Client ID (for logging/validation)
        campaign_id: Campaign ID
        table_name: Name of the dynamic datalog table
        
    Returns:
        Maximum s_no or None if no records found
    """
    try:
        # Get the dynamic model for the table
        model = get_datalog_model_for_table(table_name)
        
        # Query for max s_no where campaign_id matches
        max_s_no = db.query(func.max(model.s_no)).filter(
            model.campaign_id == campaign_id
        ).scalar()
        
        if max_s_no is None:
            logger.info(f"No records found in {table_name} for campaign_id={campaign_id}")
            return None
        
        logger.info(f"Fetched max cursor: client_id={client_id}, campaign_id={campaign_id}, table={table_name}, max_s_no={max_s_no}")
        return max_s_no
        
    except Exception as e:
        logger.error(f"Error fetching max cursor: {e}")
        raise


async def fetch_next_disposition_job(
    db: DB_DEPENDENCY,
    client_id: int
) -> Optional[int]:
    """
    Fetch the next disposition job to process for the given client.
    
    Priority Logic:
    - Fetch all jobs with status='queue' for this client
    - Calculate max priority among all jobs
    - Jobs with priority=0 get effective_priority = max_priority + 1 (lowest priority)
    - Sort by effective_priority ascending, then by created_at ascending
    - Return the campaign_id of the first job
    
    Args:
        db: Database session
        client_id: Client ID
        
    Returns:
        Campaign ID of the next job to process, or None if no queued jobs
    """
    try:
        # Fetch all queued jobs for this client
        jobs = db.query(DispositionJob).filter(
            DispositionJob.client_id == client_id,
            DispositionJob.status == 'queue'
        ).all()
        
        if not jobs:
            logger.info(f"No queued disposition jobs found for client_id={client_id}")
            return None
        
        logger.info(f"Found {len(jobs)} queued jobs for client_id={client_id}")
        
        # Calculate max priority
        max_priority = max([job.priority for job in jobs])
        logger.info(f"Max priority among jobs: {max_priority}")
        
        # Calculate effective priority for each job
        job_priorities = []
        for job in jobs:
            if job.priority == 0:
                effective_priority = max_priority + 1  # Lowest priority
            else:
                effective_priority = job.priority
            
            job_priorities.append({
                'job': job,
                'effective_priority': effective_priority,
                'created_at': job.created_at
            })
            logger.debug(f"Job campaign_id={job.campaign_id}: priority={job.priority}, effective_priority={effective_priority}")
        
        # Sort by effective_priority ascending, then by created_at ascending
        sorted_jobs = sorted(
            job_priorities,
            key=lambda x: (x['effective_priority'], x['created_at'])
        )
        
        # Return the campaign_id of the first job
        next_job = sorted_jobs[0]['job']
        logger.info(f"Next job to process: client_id={client_id}, campaign_id={next_job.campaign_id}, effective_priority={sorted_jobs[0]['effective_priority']}")
        
        return next_job.campaign_id
        
    except Exception as e:
        logger.error(f"Error fetching next disposition job: {e}")
        raise


async def set_disposition_status(
    db: DB_DEPENDENCY,
    client_id: int,
    campaign_id: int,
    status: str
) -> bool:
    """
    Set the status of a disposition job (simplified version).
    
    Args:
        db: Database session
        client_id: Client ID
        campaign_id: Campaign ID
        status: New status ('queue', 'running', 'completed', 'failed')
        
    Returns:
        True if update successful, False otherwise
    """
    try:
        job = db.query(DispositionJob).filter(
            DispositionJob.client_id == client_id,
            DispositionJob.campaign_id == campaign_id
        ).first()
        
        if not job:
            logger.error(f"No job found: client_id={client_id}, campaign_id={campaign_id}")
            return False
        
        job.status = status
        job.updated_at = get_current_time()
        
        db.commit()
        logger.info(f"Status updated: client_id={client_id}, campaign_id={campaign_id}, status={status}")
        return True
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error setting disposition status: {e}")
        raise


async def update_disposition_job_status(
    db: DB_DEPENDENCY,
    client_id: int,
    campaign_id: int,
    status: str,
    update_heartbeat: bool = True
) -> bool:
    """
    Update the status of a disposition job.
    
    Args:
        db: Database session
        client_id: Client ID
        campaign_id: Campaign ID
        status: New status ('queue', 'running', 'completed', 'failed')
        update_heartbeat: Whether to update heartbeat_at timestamp
        
    Returns:
        True if update successful, False otherwise
    """
    try:
        job = db.query(DispositionJob).filter(
            DispositionJob.client_id == client_id,
            DispositionJob.campaign_id == campaign_id
        ).first()
        
        if not job:
            logger.error(f"No job found to update: client_id={client_id}, campaign_id={campaign_id}")
            return False
        
        job.status = status
        job.updated_at = get_current_time()
        
        if update_heartbeat:
            job.heartbeat_at = get_current_time()
        
        # Set started_at when status changes to 'running'
        if status == 'running' and not job.started_at:
            job.started_at = get_current_time()
        
        # Set ended_at when status changes to 'completed' or 'failed'
        if status in ['completed', 'failed'] and not job.ended_at:
            job.ended_at = get_current_time()
        
        db.commit()
        logger.info(f"Updated job status: client_id={client_id}, campaign_id={campaign_id}, status={status}")
        return True
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating job status: {e}")
        raise


async def update_disposition_job_progress(
    db: DB_DEPENDENCY,
    client_id: int,
    campaign_id: int,
    cur_idx: int,
    processed_records: int,
    total_records: Optional[int] = None
) -> bool:
    """
    Update the progress of a disposition job.
    
    Args:
        db: Database session
        client_id: Client ID
        campaign_id: Campaign ID
        cur_idx: Current cursor position
        processed_records: Number of records processed
        total_records: Total number of records (optional)
        
    Returns:
        True if update successful, False otherwise
    """
    try:
        job = db.query(DispositionJob).filter(
            DispositionJob.client_id == client_id,
            DispositionJob.campaign_id == campaign_id
        ).first()
        
        if not job:
            logger.error(f"No job found to update: client_id={client_id}, campaign_id={campaign_id}")
            return False
        
        job.cur_idx = cur_idx
        job.processed_records = processed_records
        
        if total_records is not None:
            job.total_records = total_records
        
        job.updated_at = get_current_time()
        job.heartbeat_at = get_current_time()
        
        db.commit()
        logger.info(f"Updated job progress: client_id={client_id}, campaign_id={campaign_id}, cur_idx={cur_idx}, processed={processed_records}")
        return True
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating job progress: {e}")
        raise


async def heartbeat(
    db: DB_DEPENDENCY,
    client_id: int,
    campaign_id: int
) -> bool:
    """
    Update the heartbeat timestamp for a disposition job.
    Used to track that the job is still actively being processed.
    
    Args:
        db: Database session
        client_id: Client ID
        campaign_id: Campaign ID
        
    Returns:
        True if update successful, False otherwise
    """
    try:
        job = db.query(DispositionJob).filter(
            DispositionJob.client_id == client_id,
            DispositionJob.campaign_id == campaign_id
        ).first()
        
        if not job:
            logger.error(f"No job found to heartbeat: client_id={client_id}, campaign_id={campaign_id}")
            return False
        
        job.heartbeat_at = get_current_time()
        
        db.commit()
        logger.info(f"Heartbeat updated: client_id={client_id}, campaign_id={campaign_id}")
        return True
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating heartbeat: {e}")
        raise


async def is_disposition_job_alive(
    db: DB_DEPENDENCY,
    client_id: int,
    campaign_id: int
) -> bool:
    """
    Check if a disposition job is still alive based on heartbeat timestamp.
    A job is considered alive if its last heartbeat was within ALIVE_PERIOD seconds.
    
    Args:
        db: Database session
        client_id: Client ID
        campaign_id: Campaign ID
        
    Returns:
        True if job is alive (heartbeat within ALIVE_PERIOD), False otherwise
    """
    try:
        job = db.query(DispositionJob).filter(
            DispositionJob.client_id == client_id,
            DispositionJob.campaign_id == campaign_id
        ).first()
        
        if not job:
            logger.warning(f"No job found for client_id={client_id}, campaign_id={campaign_id}")
            return False
        
        if not job.heartbeat_at:
            logger.info(f"Job has no heartbeat: client_id={client_id}, campaign_id={campaign_id}")
            return False
        
        # Calculate time difference
        current_time = get_current_time()
        
        # Make heartbeat_at timezone-aware if it isn't
        heartbeat_time = job.heartbeat_at
        if heartbeat_time.tzinfo is None:
            heartbeat_time = ASIA_KOLKATA.localize(heartbeat_time)
        
        time_diff = current_time - heartbeat_time
        time_diff_seconds = time_diff.total_seconds()
        
        is_alive = time_diff_seconds < ALIVE_PERIOD
        
        if is_alive:
            logger.info(f"Job is ALIVE: client_id={client_id}, campaign_id={campaign_id}, last_heartbeat={time_diff_seconds:.1f}s ago (threshold={ALIVE_PERIOD}s)")
        else:
            logger.warning(f"Job is DEAD: client_id={client_id}, campaign_id={campaign_id}, last_heartbeat={time_diff_seconds:.1f}s ago (threshold={ALIVE_PERIOD}s)")
        
        return is_alive
        
    except Exception as e:
        logger.error(f"Error checking job alive status: {e}")
        raise


async def is_disposition_job_busy(
    db: DB_DEPENDENCY,
    client_id: int
) -> bool:
    """
    Check if client has a running disposition job.
    Enforces one-job-per-client rule by stopping extra running jobs.
    
    Process:
    1. Fetch all jobs with status='running' for the client
    2. If more than 1 running job exists:
       - Keep the first (oldest by created_at)
       - Set others to action='stop' and status='queue'
    3. Return True if at least one running job exists, False otherwise
    
    Args:
        db: Database session
        client_id: Client ID
        
    Returns:
        True if client has a running job, False otherwise
    """
    try:
        # Fetch all running jobs ordered by created_at ascending (oldest first)
        running_jobs = db.query(DispositionJob).filter(
            DispositionJob.client_id == client_id,
            DispositionJob.status == 'running'
        ).order_by(DispositionJob.created_at.asc()).all()
        
        count_running = len(running_jobs)
        
        logger.info(f"Client {client_id}: Found {count_running} running disposition job(s)")
        
        if count_running > 0:
            if count_running > 1:
                # Keep first job, stop the rest
                first_job = running_jobs[0]
                extra_jobs = running_jobs[1:]
                
                logger.warning(f"Client {client_id}: Multiple running jobs detected! Keeping campaign_id={first_job.campaign_id}, stopping {len(extra_jobs)} others")
                
                for job in extra_jobs:
                    job.action = 'stop'
                    job.status = 'queue'
                    job.updated_at = get_current_time()
                    logger.info(f"Client {client_id}: Stopped extra job campaign_id={job.campaign_id}, set to action='stop', status='queue'")
                
                db.commit()
                logger.info(f"Client {client_id}: Enforced one-job-per-client rule")
            
            return True
        else:
            logger.info(f"Client {client_id}: No running jobs")
            return False
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error checking if disposition job is busy: {e}")
        raise
