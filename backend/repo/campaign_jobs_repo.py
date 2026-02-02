"""
Repository layer for Campaign Jobs.
Handles database operations for cms_campaign_jobs table.
"""
from database.dependencies import DB_DEPENDENCY
from models.automation import CampaignJob
from typing import Optional
import loguru

logger = loguru.logger.bind(repo="campaign_jobs")


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
