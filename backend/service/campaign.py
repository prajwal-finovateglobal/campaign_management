from database.dependencies import DB_DEPENDENCY
from repo.tables import get_campaign
from service.millis_api import get_campaign_details, create_campaign_in_millis, delete_campaign_in_millis, upload_records_to_millis, get_phones, get_agent, set_caller, start_campaign, stop_campaign_millis, delete_record_millis, get_campaign_info
from service.csv_service import read_csv_data
from models.client import Campaign, Phase
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime
from Core.config import MAX_CONCURRENT_REQUESTS
import asyncio
import loguru

logger = loguru.logger


def calculate_campaign_status_from_chunks(chunks: List) -> str:
    """
    Calculate campaign status based on chunk statuses for multiple-type campaigns.
    
    Logic:
    - If all chunks are idle → "idle"
    - If some chunks are idle and some pending → "partly idle"
    - If some are finished and some are (idle or started) → "partly finished"
    - If some are started and some are idle → "chunks_started"
    - If all chunks are finished → "finished"
    - If all chunks are started → "started"
    - If all chunks are pending → "pending"
    
    Args:
        chunks: List of Chunk ORM objects
    
    Returns:
        Campaign status string
    """
    if not chunks:
        return "pending"
    
    # Count chunk statuses
    status_counts = {}
    for chunk in chunks:
        chunk_status = chunk.status or "pending"
        status_counts[chunk_status] = status_counts.get(chunk_status, 0) + 1
    
    total_chunks = len(chunks)
    idle_count = status_counts.get("idle", 0)
    pending_count = status_counts.get("pending", 0)
    finished_count = status_counts.get("finished", 0)
    started_count = status_counts.get("started", 0)
    
    # Apply status rules
    if idle_count == total_chunks:
        return "idle"
    elif finished_count == total_chunks:
        return "finished"
    elif started_count == total_chunks:
        return "started"
    elif pending_count == total_chunks:
        return "pending"
    elif idle_count > 0 and pending_count > 0 and finished_count == 0 and started_count == 0:
        return "partly idle"
    elif finished_count > 0 and (idle_count > 0 or started_count > 0):
        return "partly finished"
    elif started_count > 0 and idle_count > 0:
        return "chunks_started"
    else:
        # Default for mixed states not covered above
        return "mixed"


async def get_campaign_service(db: DB_DEPENDENCY, campaign_id: Optional[int] = None, phase_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """
    Get campaign data from the database with enriched record counts from Millis.ai API.
    Uses DB data first, only fetches from Millis.ai if records_count is null.
    Returns a list of dictionaries with campaign information including record_count.
    """
    logger.info(f"Getting campaign data for campaign_id: {campaign_id}, phase_id: {phase_id}")
    result = get_campaign(db, campaign_id, phase_id)
    
    # Convert ORM objects to dictionaries and collect CIDs that need fetching
    campaigns = []
    cids_to_fetch = []
    
    for campaign in result:
        # Use DB data first (records_count and status from DB)
        record_count = campaign.records_count if campaign.records_count is not None else None
        status = campaign.status if campaign.status else None
        campaign_type = campaign.type if campaign.type else 'single'
        
        # For multiple-type campaigns, calculate record_count and status from chunks
        if campaign_type == 'multiple':
            from models.client import Chunk
            chunks = db.query(Chunk).filter(Chunk.campaign_id == campaign.id).all()
            if chunks:
                # Sum all chunks' records_count
                chunk_records_sum = sum(chunk.records_count for chunk in chunks if chunk.records_count is not None)
                record_count = chunk_records_sum
                # Calculate status based on chunk statuses
                status = calculate_campaign_status_from_chunks(chunks)
                logger.debug(f"Campaign {campaign.id} (multiple): calculated record_count={record_count}, status={status} from {len(chunks)} chunks")
            else:
                record_count = 0
                status = "pending"
                logger.debug(f"Campaign {campaign.id} (multiple): no chunks found, record_count=0, status=pending")
        
        campaign_dict = {
            'id': campaign.id,
            'campaign_name': campaign.campaign_name,
            'upsert_time': campaign.upsert_time.isoformat() if campaign.upsert_time else None,
            'phase_id': campaign.phase_id,
            'created_at': campaign.created_at.isoformat() if campaign.created_at else None,
            'cid': campaign.cid,
            'phone_id': campaign.phone_id,
            'agent_id': campaign.agent_id,
            'type': campaign_type,  # Campaign type (single/multiple)
            'record_count': record_count,  # Use DB value first, or sum of chunks for multiple type
            'status': status,  # Use DB value first
            'chunk_size': campaign.chunk_size if campaign.chunk_size else None,  # Chunk size for multiple type campaigns
            'idx': campaign.idx,  # Starting index in data.csv for partial upsert
            'size': campaign.size  # Number of records to upsert from idx
        }
        campaigns.append(campaign_dict)
        
        # Only fetch from Millis.ai if records_count is null or not set (and not multiple type)
        if campaign.cid and record_count is None and campaign_type != 'multiple':
            cids_to_fetch.append(campaign.cid)
            logger.debug(f"Campaign {campaign.id} (cid: {campaign.cid}) has null records_count, will fetch from Millis.ai")
    
    # Fetch campaign details from Millis.ai API only for campaigns with null records_count
    if cids_to_fetch:
        logger.info(f"Fetching record counts for {len(cids_to_fetch)} campaigns from Millis.ai (only those with null records_count)")
        millis_campaigns = await get_campaign_details(cids_to_fetch)
        
        # Enrich campaigns with record counts and status from Millis.ai
        for campaign_dict in campaigns:
            cid = campaign_dict.get('cid')
            if cid and cid in millis_campaigns:
                millis_data = millis_campaigns[cid]
                campaign_dict['record_count'] = millis_data.get('record_count', 0)
                campaign_dict['status'] = millis_data.get('status', 'unknown')
                logger.debug(f"Campaign {campaign_dict['id']} (cid: {cid}) fetched from Millis.ai: {campaign_dict['record_count']} records, status: {campaign_dict['status']}")
    else:
        logger.info("All campaigns have records_count in DB, no need to fetch from Millis.ai")
    
    return campaigns


def generate_campaign_name(phase_name: str, phase_id: int, db: DB_DEPENDENCY) -> str:
    """
    Generate campaign name based on phase name and existing campaign count.
    
    Name generation logic:
    - Count existing campaigns for the given phase
    - Generate name: {phase_name}_campaign_{count+1}
    - If count is 0, name will be {phase_name}_campaign_1
    - If count is 1, name will be {phase_name}_campaign_2
    
    Args:
        phase_name: Name of the phase (e.g., "spandana sphoorty_phase_1")
        phase_id: Phase ID to count campaigns for
        db: Database session
    
    Returns:
        Generated campaign name
    """
    logger.info(f"Generating campaign name for phase: {phase_name} (id: {phase_id})")
    
    # Count existing campaigns for this phase
    campaign_count = db.query(Campaign).filter(Campaign.phase_id == phase_id).count()
    logger.info(f"Found {campaign_count} existing campaigns for phase {phase_name}")
    
    # Generate campaign name: {phase_name}_campaign_{count+1}
    new_campaign_number = campaign_count + 1
    campaign_name = f"{phase_name}_campaign_{new_campaign_number}"
    logger.info(f"Generated campaign name: {campaign_name}")
    
    return campaign_name


async def create_campaign_service(
    db: DB_DEPENDENCY,
    phase_id: int,
    phase_name: str,
    campaign_type: str = 'single',
    is_full: bool = True,
    idx: Optional[int] = None,
    size: Optional[int] = None
) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """
    Create a new campaign for a phase.
    
    Process:
    - For 'single' type: Generate name, create in Millis.ai API, store in database
    - For 'multiple' type: Generate name, store in database only (virtual campaign for chunks)
    
    Args:
        db: Database session
        phase_id: Phase ID to create campaign for
        phase_name: Name of the phase
        campaign_type: Type of campaign - 'single' (default) or 'multiple'
    
    Returns:
        Tuple of (success, error_message, campaign_data)
        - success: Whether operation succeeded
        - error_message: Error message if failed, None if succeeded
        - campaign_data: Dict with created campaign details if succeeded, None if failed
    """
    logger.info(f"Creating new campaign for phase_id: {phase_id}, phase_name: {phase_name}, type: {campaign_type}")
    
    try:
        # Verify phase exists
        phase = db.query(Phase).filter(Phase.id == phase_id).first()
        if not phase:
            error_msg = f"Phase with id {phase_id} not found"
            logger.error(error_msg)
            return False, error_msg, None
        
        # Generate campaign name
        campaign_name = generate_campaign_name(phase_name, phase_id, db)
        
        # Handle idx and size based on is_full flag
        final_idx = 0
        final_size = 0
        
        if is_full:
            # Full mode: get total CSV row count and set idx=0, size=total
            from service.csv_service import get_csv_row_count
            csv_success, csv_error, total_rows = get_csv_row_count()
            if not csv_success:
                error_msg = f"Failed to get CSV row count: {csv_error}"
                logger.error(error_msg)
                return False, error_msg, None
            final_idx = 0
            final_size = total_rows
            logger.info(f"Full mode: Setting idx=0, size={total_rows}")
        else:
            # Partial mode: validate provided idx and size
            if idx is None or size is None:
                error_msg = "idx and size are required when is_full=False"
                logger.error(error_msg)
                return False, error_msg, None
            
            if idx < 0:
                error_msg = f"idx must be >= 0, got {idx}"
                logger.error(error_msg)
                return False, error_msg, None
            
            if size <= 0:
                error_msg = f"size must be > 0, got {size}"
                logger.error(error_msg)
                return False, error_msg, None
            
            # Get CSV row count to validate range
            from service.csv_service import get_csv_row_count
            csv_success, csv_error, total_rows = get_csv_row_count()
            if not csv_success:
                error_msg = f"Failed to get CSV row count: {csv_error}"
                logger.error(error_msg)
                return False, error_msg, None
            
            if idx >= total_rows:
                error_msg = f"idx ({idx}) must be less than total CSV rows ({total_rows}). Valid range: 0 to {total_rows - 1}"
                logger.error(error_msg)
                return False, error_msg, None
            
            # Auto-adjust size if it exceeds CSV bounds (like Python list slicing)
            if idx + size > total_rows:
                adjusted_size = total_rows - idx
                logger.info(f"Size ({size}) exceeds CSV bounds. Auto-adjusting to {adjusted_size} (from index {idx} to end of CSV)")
                final_size = adjusted_size
            else:
                final_size = size
            
            final_idx = idx
            logger.info(f"Partial mode: Setting idx={final_idx}, size={final_size} (records {final_idx} to {final_idx + final_size - 1})")
        
        if campaign_type == 'multiple':
            # For multiple type, create virtual campaign in DB only (no Millis.ai call)
            logger.info(f"Creating virtual campaign (multiple type) for chunking: {campaign_name}")
            
            new_campaign = Campaign(
                campaign_name=campaign_name,
                phase_id=phase_id,
                cid=None,  # No CID - chunks will have individual CIDs
                status='pending',  # Virtual campaign status
                records_count=None,  # Will be sum of chunks
                type='single',  # Start as single, will be set to multiple when chunks are created
                idx=final_idx,
                size=final_size,
                upsert_time=datetime.now(),
                created_at=datetime.now()
            )
            
            db.add(new_campaign)
            db.commit()
            db.refresh(new_campaign)
            
            logger.info(f"Successfully created virtual campaign: {campaign_name} (id: {new_campaign.id})")
            
            return True, None, {
                'id': new_campaign.id,
                'campaign_name': new_campaign.campaign_name,
                'cid': None,
                'status': new_campaign.status,
                'record_count': 0,
                'phase_id': new_campaign.phase_id,
                'type': 'single',  # Will change to multiple when chunks are created
                'idx': new_campaign.idx,
                'size': new_campaign.size
            }
        
        else:
            # For single type, create in Millis.ai API
            millis_success, millis_error, millis_data = await create_campaign_in_millis(campaign_name)
            if not millis_success:
                logger.error(f"Failed to create campaign in Millis.ai: {millis_error}")
                return False, millis_error, None
            
            # Extract data from Millis.ai response
            millis_cid = millis_data.get("id")  # This is the campaign ID from Millis.ai
            millis_name = millis_data.get("name")
            millis_status = millis_data.get("status")
            millis_records = millis_data.get("records", [])
            record_count = len(millis_records) if millis_records else 0
            millis_created_at = millis_data.get("created_at")
            
            # Convert created_at timestamp to datetime if available
            created_at_dt = None
            if millis_created_at:
                try:
                    # Millis.ai returns Unix timestamp (seconds)
                    created_at_dt = datetime.fromtimestamp(millis_created_at)
                except (ValueError, TypeError) as e:
                    logger.warning(f"Could not parse created_at timestamp {millis_created_at}: {e}")
            
            # Create campaign record in database
            new_campaign = Campaign(
                campaign_name=millis_name,
                phase_id=phase_id,
                cid=millis_cid,
                status=millis_status,  # Save status from Millis.ai
                records_count=record_count,  # Save record count from Millis.ai
                type='single',
                idx=final_idx,
                size=final_size,
                upsert_time=datetime.now(),
                created_at=created_at_dt if created_at_dt else datetime.now()
            )
            
            db.add(new_campaign)
            db.commit()
            db.refresh(new_campaign)
            
            logger.info(f"Successfully created campaign: {millis_name} (id: {new_campaign.id}, cid: {millis_cid})")
            
            return True, None, {
                'id': new_campaign.id,
                'campaign_name': new_campaign.campaign_name,
                'phase_id': new_campaign.phase_id,
                'cid': new_campaign.cid,
                'status': millis_status,
                'record_count': record_count,
                'type': 'single',
                'idx': new_campaign.idx,
                'size': new_campaign.size,
                'upsert_time': new_campaign.upsert_time.isoformat() if new_campaign.upsert_time else None,
                'created_at': new_campaign.created_at.isoformat() if new_campaign.created_at else None
            }
        
    except Exception as e:
        db.rollback()
        error_msg = f"Error creating campaign: {str(e)}"
        logger.error(error_msg)
        return False, error_msg, None


async def refresh_campaign_status(db: DB_DEPENDENCY, campaign_id: int) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """
    Refresh campaign status and record count from Millis.ai API and update database.
    Uses /campaigns/{cid} endpoint to fetch both status and record count.
    
    Process:
    1. Get campaign from database by campaign_id
    2. Fetch latest status and record count from Millis.ai API
    3. Update campaign status and record count in database
    
    Args:
        db: Database session
        campaign_id: Campaign ID to refresh status for
    
    Returns:
        Tuple of (success, error_message, campaign_data)
        - success: Whether operation succeeded
        - error_message: Error message if failed, None if succeeded
        - campaign_data: Dict with updated campaign details if succeeded, None if failed
    """
    logger.info(f"Refreshing campaign status and record count for campaign_id: {campaign_id}")
    
    try:
        # Get campaign from database
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            error_msg = f"Campaign with id {campaign_id} not found"
            logger.error(error_msg)
            return False, error_msg, None
        
        campaign_type = campaign.type if campaign.type else 'single'
        
        # Handle multiple-type campaigns differently
        if campaign_type == 'multiple':
            # For multiple-type campaigns, calculate status from chunks
            from models.client import Chunk
            chunks = db.query(Chunk).filter(Chunk.campaign_id == campaign_id).all()
            
            if chunks:
                # Calculate status and record count from chunks
                new_status = calculate_campaign_status_from_chunks(chunks)
                new_record_count = sum(chunk.records_count for chunk in chunks if chunk.records_count is not None)
                logger.info(f"Campaign {campaign_id} (multiple): calculated status={new_status}, record_count={new_record_count} from {len(chunks)} chunks")
            else:
                new_status = "pending"
                new_record_count = 0
                logger.info(f"Campaign {campaign_id} (multiple): no chunks found, status=pending, record_count=0")
            
            # Update campaign in database
            try:
                old_status = campaign.status
                campaign.status = new_status
                
                # 🔔 Detect completion and send notification
                if new_status == "finished" and old_status != "finished":
                    from service.time_utils import now_ist
                    from service.notification import notify_campaign_completed
                    
                    campaign.completed_at = now_ist()
                    logger.info(f"Campaign {campaign_id} completed! Sending notification...")
                    
                    # Send notification (async, don't block on failure)
                    try:
                        await notify_campaign_completed(
                            campaign_name=campaign.campaign_name,
                            campaign_id=campaign_id,
                            started_at=campaign.started_at,
                            completed_at=campaign.completed_at
                        )
                    except Exception as notif_error:
                        logger.warning(f"Failed to send completion notification: {notif_error}")
                
                # Note: For multiple-type campaigns, record_count is calculated from chunks, not stored in campaign
                db.commit()
                db.refresh(campaign)
                logger.info(f"Campaign {campaign_id} updated in DB: status={new_status}")
            except Exception as e:
                db.rollback()
                logger.error(f"Error updating campaign {campaign_id} in database: {e}")
                return False, f"Error updating database: {str(e)}", None
            
            return True, None, {
                'id': campaign.id,
                'campaign_name': campaign.campaign_name,
                'cid': campaign.cid,
                'status': new_status,
                'phase_id': campaign.phase_id,
                'record_count': new_record_count
            }
        
        # Handle single-type campaigns: fetch from Millis.ai
        if not campaign.cid:
            error_msg = f"Campaign {campaign_id} has no CID (Millis.ai campaign ID)"
            logger.error(error_msg)
            return False, error_msg, None
        
        # Fetch full campaign data to get both status AND record count
        from service.millis_api import get_campaign_details
        
        millis_campaigns = await get_campaign_details([campaign.cid])
        
        if not millis_campaigns or campaign.cid not in millis_campaigns:
            error_msg = f"Campaign {campaign.cid} not found in Millis.ai"
            logger.warning(error_msg)
            return False, error_msg, None
        
        millis_data = millis_campaigns[campaign.cid]
        new_status = millis_data.get('status')
        new_record_count = millis_data.get('record_count', 0)
        
        if not new_status:
            error_msg = "Status not found in Millis.ai response"
            logger.error(error_msg)
            return False, error_msg, None
        
        # Update campaign status AND record count in database
        try:
            old_status = campaign.status
            campaign.status = new_status
            campaign.records_count = new_record_count
            
            # 🔔 Detect completion and send notification
            if new_status == "finished" and old_status != "finished":
                from service.time_utils import now_ist
                from service.notification import notify_campaign_completed
                
                campaign.completed_at = now_ist()
                logger.info(f"Campaign {campaign_id} completed! Sending notification...")
                
                # Send notification (async, don't block on failure)
                try:
                    await notify_campaign_completed(
                        campaign_name=campaign.campaign_name,
                        campaign_id=campaign_id,
                        started_at=campaign.started_at,
                        completed_at=campaign.completed_at
                    )
                except Exception as notif_error:
                    logger.warning(f"Failed to send completion notification: {notif_error}")
            
            db.commit()
            db.refresh(campaign)
            logger.info(f"Campaign {campaign_id} (cid: {campaign.cid}) updated in DB: status={new_status}, records_count={new_record_count}")
        except Exception as e:
            db.rollback()
            logger.error(f"Error updating campaign {campaign_id} in database: {e}")
            return False, f"Error updating database: {str(e)}", None
        
        return True, None, {
            'id': campaign.id,
            'campaign_name': campaign.campaign_name,
            'cid': campaign.cid,
            'status': new_status,
            'phase_id': campaign.phase_id,
            'record_count': new_record_count
        }
        
    except Exception as e:
        error_msg = f"Error refreshing campaign status: {str(e)}"
        logger.error(error_msg)
        return False, error_msg, None


async def refresh_all_campaigns_status(db: DB_DEPENDENCY, phase_id: Optional[int] = None) -> Tuple[bool, Optional[str], Optional[List[Dict[str, Any]]]]:
    """
    Refresh status and record count for all campaigns (optionally filtered by phase_id) from Millis.ai API.
    Uses /campaigns/{cid} endpoint to fetch both status and record count.
    
    Process:
    1. Get all campaigns from database (optionally filtered by phase_id)
    2. Fetch latest status and record count from Millis.ai API for each campaign
    3. Update campaign status and record count in database
    4. Return updated campaign data with new statuses and record counts
    
    Args:
        db: Database session
        phase_id: Optional phase ID to filter campaigns
    
    Returns:
        Tuple of (success, error_message, campaigns_data)
        - success: Whether operation succeeded
        - error_message: Error message if failed, None if succeeded
        - campaigns_data: List of updated campaign dictionaries if succeeded, None if failed
    """
    logger.info(f"Refreshing status and record count for all campaigns (phase_id: {phase_id})")
    
    try:
        # Get campaigns from database
        result = get_campaign(db, None, phase_id)
        
        if not result:
            return True, None, []
        
        # Fetch latest campaign status from Millis.ai using /info endpoint (faster)
        from service.millis_api import get_campaign_info
        
        # Build updated campaigns list and update database
        updated_campaigns = []
        updated_count = 0
        
        for campaign in result:
            campaign_type = campaign.type if campaign.type else 'single'
            record_count = campaign.records_count
            
            # For multiple-type campaigns, calculate record_count and status from chunks
            if campaign_type == 'multiple':
                from models.client import Chunk
                chunks = db.query(Chunk).filter(Chunk.campaign_id == campaign.id).all()
                if chunks:
                    chunk_records_sum = sum(chunk.records_count for chunk in chunks if chunk.records_count is not None)
                    record_count = chunk_records_sum
                    # Calculate status based on chunk statuses
                    calculated_status = calculate_campaign_status_from_chunks(chunks)
                    # Update campaign status in DB
                    campaign.status = calculated_status
                    logger.debug(f"Campaign {campaign.id} (multiple): calculated record_count={record_count}, status={calculated_status} from {len(chunks)} chunks")
                else:
                    record_count = 0
                    calculated_status = "pending"
                    campaign.status = calculated_status
            
            campaign_dict = {
                'id': campaign.id,
                'campaign_name': campaign.campaign_name,
                'upsert_time': campaign.upsert_time.isoformat() if campaign.upsert_time else None,
                'phase_id': campaign.phase_id,
                'created_at': campaign.created_at.isoformat() if campaign.created_at else None,
                'cid': campaign.cid,
                'phone_id': campaign.phone_id,
                'agent_id': campaign.agent_id,
                'type': campaign_type,
                'record_count': record_count,  # Will be updated from Millis if fetch succeeds (only for single type)
                'status': campaign.status,  # Will be updated from Millis if fetch succeeds
                'chunk_size': campaign.chunk_size if campaign.chunk_size else None  # Chunk size for multiple type campaigns
            }
            
            # Only refresh from Millis.ai for single-type campaigns
            if campaign.cid and campaign_type != 'multiple':
                # Fetch full campaign data to get both status AND record count
                from service.millis_api import get_campaign_details
                millis_campaigns = await get_campaign_details([campaign.cid])
                
                if millis_campaigns and campaign.cid in millis_campaigns:
                    millis_data = millis_campaigns[campaign.cid]
                    new_status = millis_data.get('status')
                    new_record_count = millis_data.get('record_count', 0)
                    
                    if new_status:
                        # Update campaign status AND record count in database
                        try:
                            campaign.status = new_status
                            campaign.records_count = new_record_count
                            campaign_dict['status'] = new_status
                            campaign_dict['record_count'] = new_record_count
                            updated_count += 1
                        except Exception as e:
                            logger.error(f"Error updating campaign {campaign.id} in database: {e}")
                            campaign_dict['status'] = campaign.status or 'unknown'
                            campaign_dict['record_count'] = campaign.records_count
                    else:
                        campaign_dict['status'] = campaign.status or 'unknown'
                        campaign_dict['record_count'] = campaign.records_count if campaign_type != 'multiple' else record_count
                else:
                    logger.warning(f"Failed to fetch data for campaign {campaign.id} (cid: {campaign.cid})")
                    campaign_dict['status'] = campaign.status or 'unknown'
                    campaign_dict['record_count'] = campaign.records_count if campaign_type != 'multiple' else record_count
            else:
                campaign_dict['status'] = campaign.status or 'unknown'
                campaign_dict['record_count'] = campaign.records_count if campaign_type != 'multiple' else record_count
            
            updated_campaigns.append(campaign_dict)
        
        # Commit all database updates
        try:
            db.commit()
            logger.info(f"Successfully updated status and record count for {updated_count} campaigns in database")
        except Exception as e:
            db.rollback()
            logger.error(f"Error committing campaign updates to database: {e}")
        
        logger.info(f"Successfully refreshed status and record count for {len(updated_campaigns)} campaigns")
        return True, None, updated_campaigns
        
    except Exception as e:
        error_msg = f"Error refreshing all campaigns status: {str(e)}"
        logger.error(error_msg)
        return False, error_msg, None


async def delete_campaign_service(db: DB_DEPENDENCY, campaign_id: int) -> Tuple[bool, Optional[str]]:
    """
    Delete a campaign from both Millis.ai API and database.
    For multiple-type campaigns, deletes all chunks and their Millis.ai campaigns.
    
    Process:
    1. Get campaign from database by campaign_id
    2. If campaign is 'multiple' type:
       - Get all chunks
       - Delete each chunk's campaign from Millis.ai
       - Delete all chunks from database
    3. If campaign is 'single' type:
       - Delete campaign from Millis.ai API using campaign CID
    4. Delete campaign from database
    
    Args:
        db: Database session
        campaign_id: Campaign ID to delete
    
    Returns:
        Tuple of (success, error_message)
        - success: Whether operation succeeded
        - error_message: Error message if failed, None if succeeded
    """
    logger.info(f"Deleting campaign with id: {campaign_id}")
    
    try:
        # Get campaign from database
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            error_msg = f"Campaign with id {campaign_id} not found"
            logger.error(error_msg)
            return False, error_msg
        
        campaign_cid = campaign.cid
        campaign_name = campaign.campaign_name
        campaign_type = campaign.type if campaign.type else 'single'
        
        # Handle multiple-type campaigns: delete all chunks
        if campaign_type == 'multiple':
            from models.client import Chunk
            chunks = db.query(Chunk).filter(Chunk.campaign_id == campaign_id).all()
            
            if chunks:
                logger.info(f"Campaign {campaign_id} is multiple-type with {len(chunks)} chunks. Deleting all chunks...")
                
                # 🚀 PARALLEL DELETION: Separate chunks by CID existence
                chunks_with_cid = [chunk for chunk in chunks if chunk.cid]
                chunks_without_cid = [chunk for chunk in chunks if not chunk.cid]
                
                failed_chunks = []
                
                if chunks_without_cid:
                    logger.info(f"⚡ {len(chunks_without_cid)} chunks have no CID, deleting from DB only...")
                    for chunk in chunks_without_cid:
                        db.delete(chunk)
                
                if chunks_with_cid:
                    logger.info(f"⚡ Deleting {len(chunks_with_cid)} chunks from Millis.ai in parallel (max 30 concurrent)...")
                    
                    # 🚀 Create parallel deletion tasks
                    async def delete_chunk_from_millis(chunk):
                        """Delete a single chunk from Millis.ai"""
                        try:
                            logger.debug(f"Deleting chunk {chunk.chunk_name} from Millis.ai (CID: {chunk.cid})")
                            millis_success, millis_error = await delete_campaign_in_millis(chunk.cid)
                            
                            if not millis_success:
                                logger.warning(f"Failed to delete chunk {chunk.chunk_name} from Millis.ai: {millis_error}")
                                return {'success': False, 'chunk': chunk, 'error': millis_error}
                            
                            logger.debug(f"✅ Deleted chunk {chunk.chunk_name} from Millis.ai")
                            return {'success': True, 'chunk': chunk, 'error': None}
                            
                        except Exception as e:
                            error_msg = f"Exception deleting chunk {chunk.chunk_name}: {str(e)}"
                            logger.error(error_msg)
                            return {'success': False, 'chunk': chunk, 'error': str(e)}
                    
                    # Execute deletions in parallel (max 30 concurrent)
                    # Split into batches of 30
                    batch_size = 30
                    for i in range(0, len(chunks_with_cid), batch_size):
                        batch = chunks_with_cid[i:i + batch_size]
                        logger.info(f"📦 Processing deletion batch {i//batch_size + 1}/{(len(chunks_with_cid) + batch_size - 1)//batch_size} ({len(batch)} chunks)...")
                        
                        tasks = [delete_chunk_from_millis(chunk) for chunk in batch]
                        results = await asyncio.gather(*tasks, return_exceptions=True)
                        
                        # Process results
                        for result in results:
                            if isinstance(result, Exception):
                                logger.error(f"❌ Exception in deletion: {result}")
                                # Don't add to failed_chunks, will be handled below
                            elif not result['success']:
                                failed_chunks.append(result['chunk'].chunk_name)
                            
                            # Delete from database regardless of Millis.ai deletion success
                            # (allows cleanup of orphaned records)
                            if isinstance(result, dict) and result.get('chunk'):
                                db.delete(result['chunk'])
                    
                    logger.info(f"✅ Completed parallel deletion of {len(chunks_with_cid)} chunks from Millis.ai")
                
                if failed_chunks:
                    logger.warning(f"⚠️  Failed to delete {len(failed_chunks)} chunks from Millis.ai: {', '.join(failed_chunks[:10])}{'...' if len(failed_chunks) > 10 else ''}")
                    logger.warning(f"💡 Database records will still be deleted to prevent orphaned data")
                
                logger.info(f"✅ Deleted {len(chunks)} chunks from database")
        else:
            # Handle single-type campaigns
            pass
        
        # Delete campaign from Millis.ai if CID exists
        if campaign_cid:
            millis_success, millis_error = await delete_campaign_in_millis(campaign_cid)
            if not millis_success:
                logger.warning(f"Failed to delete campaign from Millis.ai: {millis_error}")
                # Continue with database deletion even if Millis.ai deletion fails
                # This allows cleanup of orphaned database records
        else:
            logger.info(f"Campaign {campaign_id} has no CID, skipping Millis.ai deletion")
        
        # Capture info for notification before deleting
        chunks_count = len(chunks) if campaign_type == 'multiple' and chunks else 0
        total_records = campaign.records_count or 0
        
        # Delete campaign from database
        db.delete(campaign)
        db.commit()
        
        logger.info(f"Successfully deleted campaign {campaign_id} ({campaign_name}) from database")
        
        # 🔔 Send deletion notification
        try:
            from service.time_utils import now_ist
            from service.notification import notify_campaign_deleted
            
            await notify_campaign_deleted(
                campaign_name=campaign_name,
                campaign_id=campaign_id,
                chunks_count=chunks_count,
                total_records=total_records,
                deleted_at=now_ist()
            )
        except Exception as notif_error:
            logger.warning(f"Failed to send deletion notification: {notif_error}")
        
        return True, None
        
    except Exception as e:
        db.rollback()
        error_msg = f"Error deleting campaign: {str(e)}"
        logger.error(error_msg)
        return False, error_msg


async def upload_csv_records_to_campaign(db: DB_DEPENDENCY, campaign_id: int) -> Tuple[bool, Optional[str], Optional[int]]:
    """
    Upload records from data.csv to a campaign in Millis.ai.
    
    Process:
    1. Get campaign from database by campaign_id
    2. Read all records from data.csv
    3. Format records for Millis.ai API (phone and metadata)
    4. Upload records to Millis.ai campaign
    
    Args:
        db: Database session
        campaign_id: Campaign ID to upload records to
    
    Returns:
        Tuple of (success, error_message, records_uploaded)
        - success: Whether operation succeeded
        - error_message: Error message if failed, None if succeeded
        - records_uploaded: Number of records uploaded if succeeded, None if failed
    """
    logger.info(f"Uploading CSV records to campaign_id: {campaign_id}")
    
    try:
        # Get campaign from database
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            error_msg = f"Campaign with id {campaign_id} not found"
            logger.error(error_msg)
            return False, error_msg, None
        
        if not campaign.cid:
            error_msg = f"Campaign {campaign_id} has no CID (Millis.ai campaign ID)"
            logger.error(error_msg)
            return False, error_msg, None
        
        # Read records from CSV
        success, error_msg, csv_data = read_csv_data()
        if not success or csv_data is None:
            error_msg = error_msg or "Failed to read data from CSV"
            logger.error(error_msg)
            return False, error_msg, None
        
        if not csv_data:
            error_msg = "No records found in data.csv"
            logger.warning(error_msg)
            return False, error_msg, None
        
        # Apply idx and size range if specified (for partial upsert)
        idx = campaign.idx if campaign.idx is not None else 0
        size = campaign.size if campaign.size is not None else len(csv_data)
        
        # Validate idx
        if idx < 0 or idx >= len(csv_data):
            error_msg = f"Invalid idx: {idx}. Must be between 0 and {len(csv_data) - 1}"
            logger.error(error_msg)
            return False, error_msg, None
        
        # Auto-adjust size if it exceeds CSV bounds (like Python list slicing)
        if size <= 0:
            error_msg = f"Invalid size: {size}. Must be > 0"
            logger.error(error_msg)
            return False, error_msg, None
        
        if idx + size > len(csv_data):
            adjusted_size = len(csv_data) - idx
            logger.info(f"Size ({size}) exceeds CSV bounds. Auto-adjusting to {adjusted_size} (from index {idx} to end of CSV)")
            size = adjusted_size
        
        # Slice CSV data based on idx and size (Python list slicing behavior)
        records_to_upsert = csv_data[idx:idx + size]
        logger.info(f"Upserting records {idx} to {idx + size - 1} ({len(records_to_upsert)} records) from data.csv")
        
        # Format records for Millis.ai API
        # Extract phone from phone, contact_to, or contact_from column (in order of priority)
        formatted_records = []
        for record in records_to_upsert:
            # Try multiple column names for phone number
            phone = record.get("phone") or record.get("contact_to") or record.get("contact_from") or ""
            if phone:
                # Clean phone number (remove whitespace)
                phone = str(phone).strip()
                if phone:  # Check again after stripping
                    formatted_record = {
                        "phone": phone,
                        "metadata": {k: v for k, v in record.items() if k not in ["phone", "contact_to", "contact_from"] and v is not None}
                    }
                    formatted_records.append(formatted_record)
        
        if not formatted_records:
            error_msg = "No valid phone numbers found in data.csv"
            logger.warning(error_msg)
            return False, error_msg, None
        
        # Upload records to Millis.ai
        millis_success, millis_error = await upload_records_to_millis(campaign.cid, formatted_records)
        if not millis_success:
            logger.error(f"Failed to upload records to Millis.ai: {millis_error}")
            return False, millis_error, None
        
        logger.info(f"Successfully uploaded {len(formatted_records)} records to campaign {campaign_id} (cid: {campaign.cid})")
        return True, None, len(formatted_records)
        
    except Exception as e:
        error_msg = f"Error uploading CSV records to campaign: {str(e)}"
        logger.error(error_msg)
        return False, error_msg, None


async def set_caller_service(db: DB_DEPENDENCY, campaign_id: int, phone_id: str) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """
    Set caller phone for a campaign in Millis.ai and update database.
    For multiple-type campaigns, sets caller for all chunks.
    
    Process:
    1. Get campaign from database by campaign_id
    2. Get phone details from Millis.ai to get agent_id
    3. If campaign is 'single' type:
       - Set caller in Millis.ai API
       - Update phone_id and agent_id in database
    4. If campaign is 'multiple' type:
       - Get all chunks for the campaign
       - Set caller for each chunk in Millis.ai
       - Update phone_id and agent_id in chunks table
       - Update phone_id and agent_id in campaign table
    
    Args:
        db: Database session
        campaign_id: Campaign ID in database
        phone_id: Phone ID from Millis.ai (e.g., "+911140848678")
    
    Returns:
        Tuple of (success, error_message, result_data)
        - success: Whether operation succeeded
        - error_message: Error message if failed, None if succeeded
        - result_data: Dict with agent_id and chunks_updated (for multiple-type campaigns)
    """
    logger.info(f"Setting caller {phone_id} for campaign {campaign_id}")
    
    try:
        # Get campaign from database
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            error_msg = f"Campaign with id {campaign_id} not found"
            logger.error(error_msg)
            return False, error_msg, None
        
        campaign_type = campaign.type if campaign.type else 'single'
        
        # Get phone details to find agent_id
        phones_success, phones_error, phones_data = await get_phones()
        if not phones_success or not phones_data:
            error_msg = phones_error or "Failed to fetch phones from Millis.ai"
            logger.error(error_msg)
            return False, error_msg, None
        
        # Find the phone and its agent_id
        phone_info = None
        for phone in phones_data:
            if phone.get("id") == phone_id:
                phone_info = phone
                break
        
        if not phone_info:
            error_msg = f"Phone {phone_id} not found in Millis.ai"
            logger.error(error_msg)
            return False, error_msg, None
        
        agent_id = phone_info.get("agent_id")
        
        if campaign_type == 'multiple':
            # Handle multiple-type campaign: set caller for all chunks
            from models.client import Chunk
            chunks = db.query(Chunk).filter(Chunk.campaign_id == campaign_id).all()
            
            if not chunks:
                error_msg = f"Campaign {campaign_id} is multiple-type but has no chunks"
                logger.error(error_msg)
                return False, error_msg, None
            
            logger.info(f"Campaign {campaign_id} is multiple-type with {len(chunks)} chunks. Setting caller for all chunks...")
            
            # 🚀 PARALLEL PROCESSING: Separate chunks by validity
            valid_chunks = []
            invalid_chunks = []
            completed_chunks = []
            
            for chunk in chunks:
                # Log chunk details for debugging
                logger.info(f"Checking chunk {chunk.id} ({chunk.chunk_name}): cid={chunk.cid}, status={repr(chunk.status)}")
                
                if not chunk.cid:
                    logger.warning(f"Chunk {chunk.id} ({chunk.chunk_name}) has no CID, skipping")
                    invalid_chunks.append(chunk.chunk_name)
                elif chunk.status and chunk.status.lower() != 'idle':
                    # Skip chunks that are not idle (e.g., completed, processed, running, etc.)
                    logger.info(f"Chunk {chunk.id} ({chunk.chunk_name}) has status '{chunk.status}' (not idle), skipping")
                    completed_chunks.append(chunk.chunk_name)
                else:
                    # Only process chunks with status = 'idle' or status = None/null
                    logger.info(f"Chunk {chunk.id} ({chunk.chunk_name}) is IDLE or null status, will set caller")
                    valid_chunks.append(chunk)
            
            if not valid_chunks:
                # Check if all chunks are not idle
                if len(completed_chunks) > 0 and len(invalid_chunks) == 0:
                    success_msg = f"All {len(completed_chunks)} chunks are not idle (already processed/running). No action needed."
                    logger.info(success_msg)
                    result_data = {
                        'agent_id': agent_id,
                        'chunks_updated': 0,
                        'total_chunks': len(chunks),
                        'skipped_chunks': 0,
                        'completed_chunks': len(completed_chunks),
                        'completed_chunk_names': completed_chunks,
                        'message': success_msg
                    }
                    return True, None, result_data
                else:
                    error_msg = f"No valid chunks with CID found. {len(invalid_chunks)} chunks missing CID, {len(completed_chunks)} chunks already completed."
                    logger.error(error_msg)
                    return False, error_msg, None
            
            # 📊 Progress logging
            logger.info(f"⚡ Processing {len(valid_chunks)} chunks in parallel (max {MAX_CONCURRENT_REQUESTS} concurrent)...")
            if invalid_chunks:
                logger.warning(f"⚠️  Skipping {len(invalid_chunks)} chunks without CID: {', '.join(invalid_chunks[:5])}{'...' if len(invalid_chunks) > 5 else ''}")
            if completed_chunks:
                logger.info(f"⚠️  Skipping {len(completed_chunks)} non-idle chunks: {', '.join(completed_chunks[:5])}{'...' if len(completed_chunks) > 5 else ''}")
            
            try:
                # 🚀 Create all tasks for parallel execution
                tasks = [set_caller(chunk.cid, phone_id) for chunk in valid_chunks]
                
                # Execute all in parallel (semaphore limits to MAX_CONCURRENT_REQUESTS)
                # If any fails, this will raise an exception immediately
                results = await asyncio.gather(*tasks)
                
                # 📊 All succeeded! Update database
                success_count = 0
                for chunk, (millis_success, millis_error) in zip(valid_chunks, results):
                    if millis_success:
                        chunk.phone_id = phone_id
                        chunk.agent_id = agent_id
                        success_count += 1
                    else:
                        # Should not happen if gather succeeds, but handle gracefully
                        logger.error(f"Unexpected: set_caller returned False for chunk {chunk.chunk_name}: {millis_error}")
                        error_msg = f"Failed to set caller for chunk {chunk.chunk_name}: {millis_error}"
                        return False, error_msg, None
                
                # Update parent campaign
                campaign.phone_id = phone_id
                campaign.agent_id = agent_id
                
                db.commit()
                
                # ✅ Success message
                logger.info(f"✅ Successfully set caller {phone_id} (agent_id: {agent_id}) for all {success_count} chunks in parallel!")
                
                result_data = {
                    'agent_id': agent_id,
                    'chunks_updated': success_count,
                    'total_chunks': len(chunks),
                    'skipped_chunks': len(invalid_chunks),
                    'completed_chunks': len(completed_chunks)
                }
                
                if invalid_chunks:
                    logger.warning(f"⚠️  {len(invalid_chunks)} chunks were skipped (no CID)")
                    result_data['skipped_chunk_names'] = invalid_chunks
                
                if completed_chunks:
                    logger.info(f"⚠️  {len(completed_chunks)} chunks were not idle (skipped)")
                    result_data['non_idle_chunk_names'] = completed_chunks
                
                return True, None, result_data
                
            except Exception as e:
                # ❌ Stop on first error and inform frontend
                error_msg = f"Failed to set caller for chunks: {str(e)}"
                logger.error(f"❌ {error_msg}")
                logger.error(f"🛑 Stopped processing due to error. No chunks were updated.")
                return False, error_msg, None
            
        else:
            # Handle single-type campaign
            if not campaign.cid:
                error_msg = f"Campaign {campaign_id} has no CID (Millis.ai campaign ID)"
                logger.error(error_msg)
                return False, error_msg, None
            
            # Check if campaign is idle
            logger.info(f"Checking single campaign {campaign_id} ({campaign.campaign_name}): status={repr(campaign.status)}")
            if campaign.status and campaign.status.lower() != 'idle':
                error_msg = f"Campaign {campaign_id} ({campaign.campaign_name}) has status '{campaign.status}' (not idle). Cannot set caller."
                logger.info(error_msg)
                return False, error_msg, None
        
        # Set caller in Millis.ai
        millis_success, millis_error = await set_caller(campaign.cid, phone_id)
        if not millis_success:
            error_msg = millis_error or "Failed to set caller in Millis.ai"
            logger.error(error_msg)
            return False, error_msg, None
        
        # Update database
        campaign.phone_id = phone_id
        campaign.agent_id = agent_id
        db.commit()
        db.refresh(campaign)
        
        logger.info(f"Successfully set caller {phone_id} (agent_id: {agent_id}) for campaign {campaign_id}")
        return True, None, {
            'agent_id': agent_id,
            'chunks_updated': None,  # Not applicable for single-type campaigns
            'total_chunks': None
        }
        
    except Exception as e:
        db.rollback()
        error_msg = f"Error setting caller: {str(e)}"
        logger.error(error_msg)
        return False, error_msg, None


async def start_campaign_service(db: DB_DEPENDENCY, campaign_id: int) -> Tuple[bool, Optional[str]]:
    """
    Start a campaign in Millis.ai.
    
    For single-type campaigns:
    - Validates CID exists and caller is set
    - Starts the campaign in Millis.ai
    
    For multiple-type campaigns:
    - Starts all chunks in parallel
    - Each chunk must have CID and caller set
    
    Args:
        db: Database session
        campaign_id: Campaign ID in database
    
    Returns:
        Tuple of (success, error_message)
    """
    logger.info(f"[START_CAMPAIGN] Received request to start campaign ID: {campaign_id}")
    
    try:
        # Step 1: Get campaign from database
        logger.info(f"[START_CAMPAIGN] Step 1: Fetching campaign {campaign_id} from database")
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            error_msg = f"Campaign with id {campaign_id} not found"
            logger.error(f"[START_CAMPAIGN] ERROR: {error_msg}")
            return False, error_msg
        
        campaign_type = campaign.type if campaign.type else 'single'
        logger.info(f"[START_CAMPAIGN] Campaign found: name='{campaign.campaign_name}', type='{campaign_type}', cid='{campaign.cid}'")
        
        # Handle multiple-type campaigns: start all chunks
        if campaign_type == 'multiple':
            from models.client import Chunk
            chunks = db.query(Chunk).filter(Chunk.campaign_id == campaign_id).all()
            
            if not chunks:
                error_msg = f"Campaign {campaign_id} is multiple-type but has no chunks"
                logger.error(f"[START_CAMPAIGN] ERROR: {error_msg}")
                return False, error_msg
            
            logger.info(f"[START_CAMPAIGN] Multiple-type campaign with {len(chunks)} chunks. Starting all chunks in parallel...")
            
            # Validate all chunks have CID
            chunks_without_cid = [chunk for chunk in chunks if not chunk.cid]
            if chunks_without_cid:
                error_msg = f"Cannot start campaign: {len(chunks_without_cid)} chunks have no CID. Please upsert all chunks first."
                logger.error(f"[START_CAMPAIGN] ERROR: {error_msg}")
                return False, error_msg
            
            # Start all chunks in parallel
            async def start_single_chunk(chunk):
                """Start a single chunk and validate caller"""
                try:
                    # Validate caller is set
                    millis_success, millis_error, millis_info = await get_campaign_info(chunk.cid)
                    if not millis_success or not millis_info:
                        return {'success': False, 'chunk': chunk.chunk_name, 'error': f"Failed to fetch chunk info: {millis_error}"}
                    
                    millis_caller = millis_info.get("caller")
                    if not millis_caller:
                        return {'success': False, 'chunk': chunk.chunk_name, 'error': "No caller set"}
                    
                    # Start the chunk
                    start_success, start_error = await start_campaign(chunk.cid)
                    if not start_success:
                        return {'success': False, 'chunk': chunk.chunk_name, 'error': start_error}
                    
                    return {'success': True, 'chunk': chunk.chunk_name}
                    
                except Exception as e:
                    return {'success': False, 'chunk': chunk.chunk_name, 'error': str(e)}
            
            # Execute in parallel with max concurrent requests
            batch_size = MAX_CONCURRENT_REQUESTS
            failed_chunks = []
            
            for i in range(0, len(chunks), batch_size):
                batch = chunks[i:i + batch_size]
                logger.info(f"[START_CAMPAIGN] Starting batch {i//batch_size + 1}/{(len(chunks) + batch_size - 1)//batch_size} ({len(batch)} chunks)...")
                
                tasks = [start_single_chunk(chunk) for chunk in batch]
                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                # Check for failures
                for result in results:
                    if isinstance(result, Exception):
                        logger.error(f"[START_CAMPAIGN] Exception starting chunk: {result}")
                        failed_chunks.append(f"Unknown chunk: {str(result)}")
                    elif not result.get('success'):
                        chunk_name = result.get('chunk', 'Unknown')
                        error = result.get('error', 'Unknown error')
                        logger.error(f"[START_CAMPAIGN] Failed to start chunk {chunk_name}: {error}")
                        failed_chunks.append(f"{chunk_name}: {error}")
            
            if failed_chunks:
                error_msg = f"Failed to start {len(failed_chunks)} chunks: {', '.join(failed_chunks[:5])}{'...' if len(failed_chunks) > 5 else ''}"
                logger.error(f"[START_CAMPAIGN] ERROR: {error_msg}")
                return False, error_msg
            
            logger.info(f"[START_CAMPAIGN] SUCCESS: All {len(chunks)} chunks started successfully")
            
        else:
            # Handle single-type campaign
            # Step 2: Validate CID exists
            if not campaign.cid:
                error_msg = f"Campaign {campaign_id} has no CID (Millis.ai campaign ID). Cannot start campaign without CID."
                logger.error(f"[START_CAMPAIGN] ERROR: {error_msg}")
                return False, error_msg
            
            logger.info(f"[START_CAMPAIGN] Step 2: CID validation passed. CID: {campaign.cid}")
            
            # Step 3: Validate caller is set in Millis.ai API
            logger.info(f"[START_CAMPAIGN] Step 3: Fetching campaign info from Millis.ai API to verify caller is set")
            millis_success, millis_error, millis_campaign_info = await get_campaign_info(campaign.cid)
            
            if not millis_success or not millis_campaign_info:
                error_msg = millis_error or f"Campaign {campaign_id} (CID: {campaign.cid}) not found in Millis.ai API"
                logger.error(f"[START_CAMPAIGN] ERROR: {error_msg}")
                return False, error_msg
            
            millis_caller = millis_campaign_info.get("caller")
            
            if not millis_caller:
                error_msg = f"Campaign {campaign_id} (CID: {campaign.cid}) has no caller set in Millis.ai API. Please set a caller phone before starting the campaign."
                logger.error(f"[START_CAMPAIGN] ERROR: {error_msg}")
                return False, error_msg
            
            logger.info(f"[START_CAMPAIGN] Step 3: Caller validation passed. Caller: {millis_caller}")
            
            # Step 4: Call Millis.ai API to start campaign
            logger.info(f"[START_CAMPAIGN] Step 4: Calling Millis.ai API to start campaign CID: {campaign.cid}")
            millis_success, millis_error = await start_campaign(campaign.cid)
            
            if not millis_success:
                error_msg = millis_error or "Failed to start campaign in Millis.ai"
                logger.error(f"[START_CAMPAIGN] ERROR: {error_msg}")
                return False, error_msg
            
            logger.info(f"[START_CAMPAIGN] SUCCESS: Campaign {campaign_id} (CID: {campaign.cid}) started successfully")
        
        # 🔔 Track start time in database for completion notification later
        from service.time_utils import now_ist
        campaign.started_at = now_ist()
        db.commit()
        logger.info(f"[START_CAMPAIGN] Tracked start time: {campaign.started_at}")
        
        # 🔔 Send start notification
        try:
            from service.notification import notify_campaign_started
            await notify_campaign_started(
                campaign_name=campaign.campaign_name,
                campaign_id=campaign_id,
                started_at=campaign.started_at
            )
        except Exception as notif_error:
            logger.warning(f"Failed to send start notification: {notif_error}")
        
        return True, None
        
    except Exception as e:
        error_msg = f"Error starting campaign: {str(e)}"
        logger.error(f"[START_CAMPAIGN] EXCEPTION: {error_msg}")
        logger.exception(f"[START_CAMPAIGN] Full exception traceback for campaign {campaign_id}")
        return False, error_msg


async def stop_campaign_service(db: DB_DEPENDENCY, campaign_id: int) -> Tuple[bool, Optional[str]]:
    """
    Stop a campaign in Millis.ai.
    
    For single-type campaigns:
    - Stops the campaign in Millis.ai
    
    For multiple-type campaigns:
    - Stops all chunks in parallel
    
    Args:
        db: Database session
        campaign_id: Campaign ID in database
    
    Returns:
        Tuple of (success, error_message)
    """
    logger.info(f"[STOP_CAMPAIGN] Stopping campaign {campaign_id}")
    
    try:
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            error_msg = f"Campaign with id {campaign_id} not found"
            logger.error(error_msg)
            return False, error_msg
        
        campaign_type = campaign.type if campaign.type else 'single'
        logger.info(f"[STOP_CAMPAIGN] Campaign type: {campaign_type}")
        
        # Handle multiple-type campaigns: stop all chunks
        if campaign_type == 'multiple':
            from models.client import Chunk
            chunks = db.query(Chunk).filter(Chunk.campaign_id == campaign_id).all()
            
            if not chunks:
                error_msg = f"Campaign {campaign_id} is multiple-type but has no chunks"
                logger.error(f"[STOP_CAMPAIGN] ERROR: {error_msg}")
                return False, error_msg
            
            logger.info(f"[STOP_CAMPAIGN] Multiple-type campaign with {len(chunks)} chunks. Stopping all chunks in parallel...")
            
            # Filter chunks with CID
            chunks_with_cid = [chunk for chunk in chunks if chunk.cid]
            
            if not chunks_with_cid:
                logger.warning(f"[STOP_CAMPAIGN] No chunks with CID found. Nothing to stop.")
            else:
                # Stop all chunks in parallel
                async def stop_single_chunk(chunk):
                    """Stop a single chunk"""
                    try:
                        stop_success, stop_error = await stop_campaign_millis(chunk.cid)
                        if not stop_success:
                            return {'success': False, 'chunk': chunk.chunk_name, 'error': stop_error}
                        return {'success': True, 'chunk': chunk.chunk_name}
                    except Exception as e:
                        return {'success': False, 'chunk': chunk.chunk_name, 'error': str(e)}
                
                # Execute in parallel with max concurrent requests
                batch_size = MAX_CONCURRENT_REQUESTS
                failed_chunks = []
                
                for i in range(0, len(chunks_with_cid), batch_size):
                    batch = chunks_with_cid[i:i + batch_size]
                    logger.info(f"[STOP_CAMPAIGN] Stopping batch {i//batch_size + 1}/{(len(chunks_with_cid) + batch_size - 1)//batch_size} ({len(batch)} chunks)...")
                    
                    tasks = [stop_single_chunk(chunk) for chunk in batch]
                    results = await asyncio.gather(*tasks, return_exceptions=True)
                    
                    # Check for failures
                    for result in results:
                        if isinstance(result, Exception):
                            logger.error(f"[STOP_CAMPAIGN] Exception stopping chunk: {result}")
                            failed_chunks.append(f"Unknown chunk: {str(result)}")
                        elif not result.get('success'):
                            chunk_name = result.get('chunk', 'Unknown')
                            error = result.get('error', 'Unknown error')
                            logger.warning(f"[STOP_CAMPAIGN] Failed to stop chunk {chunk_name}: {error}")
                            failed_chunks.append(f"{chunk_name}: {error}")
                
                if failed_chunks:
                    logger.warning(f"[STOP_CAMPAIGN] {len(failed_chunks)} chunks failed to stop: {', '.join(failed_chunks[:5])}{'...' if len(failed_chunks) > 5 else ''}")
                    # Don't return error - partial stop is acceptable
                
                logger.info(f"[STOP_CAMPAIGN] Successfully stopped {len(chunks_with_cid) - len(failed_chunks)}/{len(chunks_with_cid)} chunks")
        
        else:
            # Handle single-type campaign
            if not campaign.cid:
                error_msg = f"Campaign {campaign_id} has no CID (Millis.ai campaign ID)"
                logger.error(error_msg)
                return False, error_msg
            
            millis_success, millis_error = await stop_campaign_millis(campaign.cid)
            if not millis_success:
                error_msg = millis_error or "Failed to stop campaign in Millis.ai"
                logger.error(error_msg)
                return False, error_msg
            
            logger.info(f"[STOP_CAMPAIGN] Successfully stopped campaign {campaign_id}")
        
        # 🔔 Send pause notification
        try:
            from service.time_utils import now_ist
            from service.notification import notify_campaign_paused
            
            # Calculate chunk statistics for multiple-type campaigns
            chunks_done = None
            chunks_left = None
            total_chunks = None
            
            if campaign_type == 'multiple':
                from models.client import Chunk
                chunks = db.query(Chunk).filter(Chunk.campaign_id == campaign_id).all()
                if chunks:
                    total_chunks = len(chunks)
                    # Count chunks that are finished or started (in progress or completed)
                    chunks_done = sum(1 for chunk in chunks if chunk.status in ['finished', 'started'])
                    # Count chunks that are idle or pending (not yet started)
                    chunks_left = sum(1 for chunk in chunks if chunk.status in ['idle', 'pending', None])
                    logger.info(f"Campaign {campaign_id} chunk progress: {chunks_done}/{total_chunks} done (finished+started), {chunks_left} left (idle+pending)")
            
            paused_at = now_ist()
            await notify_campaign_paused(
                campaign_name=campaign.campaign_name,
                campaign_id=campaign_id,
                paused_at=paused_at,
                started_at=campaign.started_at,
                chunks_done=chunks_done,
                chunks_left=chunks_left,
                total_chunks=total_chunks
            )
        except Exception as notif_error:
            logger.warning(f"Failed to send pause notification: {notif_error}")
        
        return True, None
        
    except Exception as e:
        error_msg = f"Error stopping campaign: {str(e)}"
        logger.error(error_msg)
        return False, error_msg


async def delete_record_service(db: DB_DEPENDENCY, campaign_id: int, phone: str) -> Tuple[bool, Optional[str]]:
    """
    Delete a record from a campaign in Millis.ai.
    
    Args:
        db: Database session
        campaign_id: Campaign ID in database
        phone: Phone number to delete
    
    Returns:
        Tuple of (success, error_message)
    """
    logger.info(f"Deleting record {phone} from campaign {campaign_id}")
    
    try:
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            error_msg = f"Campaign with id {campaign_id} not found"
            logger.error(error_msg)
            return False, error_msg
        
        if not campaign.cid:
            error_msg = f"Campaign {campaign_id} has no CID (Millis.ai campaign ID)"
            logger.error(error_msg)
            return False, error_msg
        
        millis_success, millis_error = await delete_record_millis(campaign.cid, phone)
        if not millis_success:
            error_msg = millis_error or "Failed to delete record in Millis.ai"
            logger.error(error_msg)
            return False, error_msg
        
        logger.info(f"Successfully deleted record {phone} from campaign {campaign_id}")
        return True, None
        
    except Exception as e:
        error_msg = f"Error deleting record: {str(e)}"
        logger.error(error_msg)
        return False, error_msg