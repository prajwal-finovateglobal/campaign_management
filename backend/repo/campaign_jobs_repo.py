"""
Repository layer for Campaign Jobs.
Handles database operations for cms_campaign_jobs table.
"""
from database.dependencies import DB_DEPENDENCY
from models.automation import CampaignJob
from models.client import Campaign
from typing import Optional
from datetime import datetime
import pytz
import loguru

logger = loguru.logger.bind(repo="campaign_jobs")

# Asia/Kolkata timezone
ASIA_KOLKATA = pytz.timezone('Asia/Kolkata')

def get_current_time():
    """Get current time in Asia/Kolkata timezone"""
    return datetime.now(ASIA_KOLKATA)


async def ensure_campaign_job(
    db: DB_DEPENDENCY,
    client_id: int,
    lot_id: int,
    campaign_id: int,
    priority: int = 0
) -> CampaignJob:
    """
    Ensure a campaign job exists for the given client_id, lot_id, and campaign_id.
    If job doesn't exist, create a new one with status = 'queue' and action = 'run'.
    
    Args:
        db: Database session
        client_id: Client ID
        lot_id: Data lot ID
        campaign_id: Campaign ID
        priority: Priority of the job (default: 0)
        
    Returns:
        CampaignJob job (existing or newly created)
    """
    try:
        # Try to fetch existing job
        job = db.query(CampaignJob).filter(
            CampaignJob.client_id == client_id,
            CampaignJob.lot_id == lot_id,
            CampaignJob.campaign_id == campaign_id
        ).first()
        
        if job:
            logger.info(f"Found existing campaign job: client_id={client_id}, lot_id={lot_id}, campaign_id={campaign_id}, status={job.status}, priority={job.priority}")
            return job
        
        # Create new job if not exists
        new_job = CampaignJob(
            client_id=client_id,
            lot_id=lot_id,
            campaign_id=campaign_id,
            status='queue',
            priority=priority,
            action='run'
        )
        
        db.add(new_job)
        db.commit()
        db.refresh(new_job)
        
        logger.info(f"Created new campaign job: client_id={client_id}, lot_id={lot_id}, campaign_id={campaign_id}, job_id={new_job.id}, priority={priority}")
        return new_job
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error ensuring campaign job: {e}")
        raise


async def reset_other_campaigns_to_queue(
    db: DB_DEPENDENCY,
    client_id: int,
    campaign_id: int
) -> int:
    """
    Reset all other campaigns (except current one) to 'queue' status for the given client.
    Only resets campaigns that are NOT in 'completed' status.
    Also sets action='stop' for the reset jobs.
    
    Args:
        db: Database session
        client_id: Client ID
        campaign_id: The currently active campaign ID (will NOT be reset)
        
    Returns:
        Number of jobs reset to queue
    """
    try:
        # Update all jobs for this client except the current campaign and completed ones
        updated_count = db.query(CampaignJob).filter(
            CampaignJob.client_id == client_id,
            CampaignJob.campaign_id != campaign_id,
            CampaignJob.status != 'completed'
        ).update(
            {
                'status': 'queue',
                'action': 'stop',
                'updated_at': get_current_time()
            },
            synchronize_session=False
        )
        
        db.commit()
        
        logger.info(f"Reset {updated_count} campaign jobs to 'queue' for client_id={client_id}, excluding campaign_id={campaign_id}")
        return updated_count
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error resetting campaigns to queue: {e}")
        raise


async def set_campaign_status(
    db: DB_DEPENDENCY,
    client_id: int,
    campaign_id: int,
    status: str
) -> bool:
    """
    Set the status of a campaign job.
    
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
        job = db.query(CampaignJob).filter(
            CampaignJob.client_id == client_id,
            CampaignJob.campaign_id == campaign_id
        ).first()
        
        if not job:
            logger.error(f"No campaign job found: client_id={client_id}, campaign_id={campaign_id}")
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
        logger.error(f"Error setting campaign status: {e}")
        raise


async def fetch_next_campaign(
    db: DB_DEPENDENCY,
    client_id: int
) -> Optional[CampaignJob]:
    """
    Fetch the next campaign job to process for a client.
    
    Selection logic:
    1. Only fetch jobs with status='queue' and action='run'
    2. Priority normalization: jobs with priority=0 are converted to max_priority+1 (logically, not in DB)
    3. Higher priority values execute first
    4. For same/normal priority: sort by phase_id (ascending), then lot_id (ascending)
    5. Lower phase_ids always execute before higher phase_ids
    
    Args:
        db: Database session
        client_id: Client ID
        
    Returns:
        CampaignJob to process next, or None if no queued jobs
    """
    try:
        # Fetch all queued jobs with action='run' for this client
        # Join with Campaign table to get phase_id
        jobs = db.query(CampaignJob).join(
            Campaign,
            CampaignJob.campaign_id == Campaign.id
        ).filter(
            CampaignJob.client_id == client_id,
            CampaignJob.status == 'queue',
            CampaignJob.action == 'run',
            Campaign.phase_id.isnot(None)  # Only jobs with valid phase_id
        ).all()
        
        if not jobs:
            logger.info(f"No queued campaign jobs found for client_id={client_id}")
            return None
        
        logger.info(f"Found {len(jobs)} queued campaign jobs for client_id={client_id}")
        
        # Calculate max priority
        max_priority = max([job.priority for job in jobs]) if jobs else 0
        logger.info(f"Max priority among jobs: {max_priority}")
        
        # Get all campaign_ids and fetch their phase_ids in one query
        campaign_ids = [job.campaign_id for job in jobs]
        campaigns = db.query(Campaign).filter(Campaign.id.in_(campaign_ids)).all()
        campaign_phase_map = {c.id: c.phase_id for c in campaigns}
        
        # Calculate effective priority for each job (logical conversion, not DB update)
        job_priorities = []
        for job in jobs:
            # Get phase_id from the map
            phase_id = campaign_phase_map.get(job.campaign_id)
            
            if phase_id is None:
                logger.warning(f"Campaign {job.campaign_id} has no phase_id, skipping")
                continue
            
            # Priority normalization: 0 -> max_priority + 1
            if job.priority == 0:
                effective_priority = max_priority + 1  # Lowest priority
            else:
                effective_priority = job.priority
            
            job_priorities.append({
                'job': job,
                'effective_priority': effective_priority,
                'phase_id': phase_id,
                'lot_id': job.lot_id or 0  # Handle None lot_id
            })
            logger.debug(f"Job campaign_id={job.campaign_id}: priority={job.priority}, effective_priority={effective_priority}, phase_id={phase_id}, lot_id={job.lot_id}")
        
        if not job_priorities:
            logger.info(f"No valid campaign jobs with phase_id found for client_id={client_id}")
            return None
        
        # Sort by:
        # 1. effective_priority (ascending - lower number = higher priority, so higher priority comes first)
        # 2. phase_id (ascending - lower phase_id = earlier phase)
        # 3. lot_id (ascending - lower lot_id first)
        sorted_jobs = sorted(
            job_priorities,
            key=lambda x: (x['effective_priority'], x['phase_id'], x['lot_id'])
        )
        
        # Return the first job
        next_job = sorted_jobs[0]['job']
        logger.info(f"Next campaign job to process: client_id={client_id}, campaign_id={next_job.campaign_id}, lot_id={next_job.lot_id}, effective_priority={sorted_jobs[0]['effective_priority']}, phase_id={sorted_jobs[0]['phase_id']}")
        
        return next_job
        
    except Exception as e:
        logger.error(f"Error fetching next campaign job: {e}")
        raise


async def campaign_heartbeat(
    db: DB_DEPENDENCY,
    client_id: int,
    lot_id: int,
    campaign_id: int,
    status: str
) -> bool:
    """
    Update heartbeat timestamp and status for a campaign job.
    
    Args:
        db: Database session
        client_id: Client ID
        lot_id: Lot ID
        campaign_id: Campaign ID
        status: Status to set
        
    Returns:
        True if update successful, False otherwise
    """
    try:
        job = db.query(CampaignJob).filter(
            CampaignJob.client_id == client_id,
            CampaignJob.lot_id == lot_id,
            CampaignJob.campaign_id == campaign_id
        ).first()
        
        if not job:
            logger.error(f"No campaign job found: client_id={client_id}, lot_id={lot_id}, campaign_id={campaign_id}")
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
        logger.info(f"Heartbeat updated: client_id={client_id}, lot_id={lot_id}, campaign_id={campaign_id}, status={status}")
        return True
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating campaign heartbeat: {e}")
        raise
