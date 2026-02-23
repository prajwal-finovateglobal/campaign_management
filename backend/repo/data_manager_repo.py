"""
Repository layer for Data Manager Jobs.
Handles database operations for cms_data_managers table.
"""
from database.dependencies import DB_DEPENDENCY
from models.automation import DataManager
from typing import Optional, List
from datetime import datetime
import pytz
import loguru

logger = loguru.logger.bind(repo="data_manager")

# Asia/Kolkata timezone
ASIA_KOLKATA = pytz.timezone('Asia/Kolkata')

def get_current_time():
    """Get current time in Asia/Kolkata timezone"""
    return datetime.now(ASIA_KOLKATA)


async def get_data_manager_priorities(
    db: DB_DEPENDENCY,
    client_id: int
) -> List[int]:
    """
    Get list of available data manager priorities for a client.
    Returns all existing priorities (except 0) + (max_priority + 1).
    
    Args:
        db: Database session
        client_id: Client ID
        
    Returns:
        List of available priorities
    """
    try:
        # Fetch all distinct priorities for this client, excluding 0
        priorities = db.query(DataManager.priority).filter(
            DataManager.client_id == client_id,
            DataManager.priority != 0
        ).distinct().all()
        
        # Extract priority values
        priority_list = [p.priority for p in priorities]
        
        # Calculate max + 1
        if priority_list:
            max_priority = max(priority_list)
            priority_list.append(max_priority + 1)
        else:
            # If no priorities exist (all are 0), start with 1
            priority_list = [1]
        
        # Sort the list
        priority_list.sort()
        
        logger.info(f"Fetched data manager priorities for client_id={client_id}: {priority_list}")
        return priority_list
        
    except Exception as e:
        logger.error(f"Error fetching data manager priorities: {e}")
        raise


async def ensure_data_manager_job(
    db: DB_DEPENDENCY,
    client_id: int,
    campaign_id: int,
    priority: int = 0
) -> DataManager:
    """
    Ensure a data manager job exists for the given client_id and campaign_id.
    If job doesn't exist, create a new one with status = 'queue' and action = 'run'.
    
    Args:
        db: Database session
        client_id: Client ID
        campaign_id: Campaign ID
        priority: Priority of the job (default: 0)
        
    Returns:
        DataManager job (existing or newly created)
    """
    try:
        # Try to fetch existing job
        job = db.query(DataManager).filter(
            DataManager.client_id == client_id,
            DataManager.campaign_id == campaign_id
        ).first()
        
        if job:
            logger.info(f"Found existing data manager job: client_id={client_id}, campaign_id={campaign_id}, status={job.status}, priority={job.priority}")
            return job
        
        # Create new job if not exists
        new_job = DataManager(
            client_id=client_id,
            campaign_id=campaign_id,
            status='queue',
            priority=priority,
            action='run',
            processed_steps=0,
            retry_count=0
        )
        
        db.add(new_job)
        db.commit()
        db.refresh(new_job)
        
        logger.info(f"Created new data manager job: client_id={client_id}, campaign_id={campaign_id}, job_id={new_job.id}, priority={priority}")
        return new_job
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error ensuring data manager job: {e}")
        raise


async def get_next_data_manager_job(
    db: DB_DEPENDENCY,
    client_id: int
) -> Optional[DataManager]:
    """
    Fetch the next data manager job to process for a client.
    
    Selection logic (same as disposition jobs):
    1. Only fetch jobs with status='queue' and action='run'
    2. Priority normalization: jobs with priority=0 are converted to max_priority+1 (logically, not in DB)
    3. Higher priority values execute first (lower number = higher priority)
    4. Sort by effective_priority (ascending), then by created_at (ascending)
    
    Args:
        db: Database session
        client_id: Client ID
        
    Returns:
        DataManager job to process next, or None if no queued jobs
    """
    try:
        # Fetch all queued jobs with action='run' for this client
        jobs = db.query(DataManager).filter(
            DataManager.client_id == client_id,
            DataManager.status == 'queue',
            DataManager.action == 'run'
        ).all()
        
        if not jobs:
            logger.info(f"No queued data manager jobs found for client_id={client_id}")
            return None
        
        logger.info(f"Found {len(jobs)} queued data manager jobs for client_id={client_id}")
        
        # Calculate max priority
        max_priority = max([job.priority for job in jobs]) if jobs else 0
        logger.info(f"Max priority among jobs: {max_priority}")
        
        # Calculate effective priority for each job (logical conversion, not DB update)
        job_priorities = []
        for job in jobs:
            # Priority normalization: 0 -> max_priority + 1
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
        
        # Sort by effective_priority (ascending - lower number = higher priority), then by created_at (ascending)
        sorted_jobs = sorted(
            job_priorities,
            key=lambda x: (x['effective_priority'], x['created_at'])
        )
        
        # Return the first job
        next_job = sorted_jobs[0]['job']
        logger.info(f"Next data manager job to process: client_id={client_id}, campaign_id={next_job.campaign_id}, effective_priority={sorted_jobs[0]['effective_priority']}")
        
        return next_job
        
    except Exception as e:
        logger.error(f"Error fetching next data manager job: {e}")
        raise


async def pause_other_data_manager_jobs(
    db: DB_DEPENDENCY,
    client_id: int,
    campaign_id: int
) -> int:
    """
    Pause all other data manager jobs (except current one) for the given client.
    Sets status='queue' and action='stop' for other jobs.
    Only pauses jobs that are NOT in 'completed' status.
    
    Args:
        db: Database session
        client_id: Client ID
        campaign_id: The currently active campaign ID (will NOT be paused)
        
    Returns:
        Number of jobs paused
    """
    try:
        # Update all jobs for this client except the current campaign and completed ones
        updated_count = db.query(DataManager).filter(
            DataManager.client_id == client_id,
            DataManager.campaign_id != campaign_id,
            DataManager.status != 'completed'
        ).update(
            {
                'status': 'queue',
                'action': 'stop',
                'updated_at': get_current_time()
            },
            synchronize_session=False
        )
        
        db.commit()
        
        logger.info(f"Paused {updated_count} data manager jobs for client_id={client_id}, excluding campaign_id={campaign_id}")
        return updated_count
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error pausing data manager jobs: {e}")
        raise


async def set_data_manager_job_status(
    db: DB_DEPENDENCY,
    client_id: int,
    campaign_id: int,
    status: str
) -> bool:
    """
    Set the status of a data manager job.
    
    PROTECTION: Completed jobs cannot be changed to any other status.
    
    Args:
        db: Database session
        client_id: Client ID
        campaign_id: Campaign ID
        status: New status ('queue', 'running', 'completed', 'failed')
        
    Returns:
        True if update successful, False otherwise
    """
    try:
        job = db.query(DataManager).filter(
            DataManager.client_id == client_id,
            DataManager.campaign_id == campaign_id
        ).first()
        
        if not job:
            logger.error(f"No data manager job found: client_id={client_id}, campaign_id={campaign_id}")
            return False
        
        # PROTECTION: Never change completed jobs
        if job.status == 'completed':
            logger.warning(f"Cannot change status of completed job: client_id={client_id}, campaign_id={campaign_id}, current_status=completed, attempted_status={status}")
            return False
        
        job.status = status
        job.updated_at = get_current_time()
        
        # Set started_at when status changes to 'running'
        if status == 'running' and not job.started_at:
            job.started_at = get_current_time()
        
        # Set ended_at when status changes to 'completed' or 'failed'
        if status in ['completed', 'failed'] and not job.ended_at:
            job.ended_at = get_current_time()
        
        db.commit()
        logger.info(f"Status updated: client_id={client_id}, campaign_id={campaign_id}, status={status}")
        return True
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error setting data manager job status: {e}")
        raise


async def data_manager_heartbeat(
    db: DB_DEPENDENCY,
    client_id: int,
    campaign_id: int,
    status: str
) -> bool:
    """
    Update heartbeat timestamp and status for a data manager job.
    
    Args:
        db: Database session
        client_id: Client ID
        campaign_id: Campaign ID
        status: Status to set
        
    Returns:
        True if update successful, False otherwise
    """
    try:
        job = db.query(DataManager).filter(
            DataManager.client_id == client_id,
            DataManager.campaign_id == campaign_id
        ).first()
        
        if not job:
            logger.error(f"No data manager job found: client_id={client_id}, campaign_id={campaign_id}")
            return False
        
        # PROTECTION: Never change completed jobs
        if job.status == 'completed':
            logger.warning(f"Cannot update heartbeat of completed job: client_id={client_id}, campaign_id={campaign_id}")
            return False
        
        job.heartbeat_at = get_current_time()
        job.status = status
        job.updated_at = get_current_time()
        
        # Set started_at when status changes to 'running'
        if status == 'running' and not job.started_at:
            job.started_at = get_current_time()
        
        # Set ended_at when status changes to 'completed' or 'failed'
        if status in ['completed', 'failed'] and not job.ended_at:
            job.ended_at = get_current_time()
        
        db.commit()
        logger.info(f"Heartbeat updated: client_id={client_id}, campaign_id={campaign_id}, status={status}")
        return True
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating data manager heartbeat: {e}")
        raise
