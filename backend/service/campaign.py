from database.dependencies import DB_DEPENDENCY
from repo.tables import get_campaign
from service.millis_api import get_campaign_details, create_campaign_in_millis, delete_campaign_in_millis, upload_records_to_millis, get_phones, get_agent, set_caller, start_campaign, stop_campaign_millis, delete_record_millis, get_campaign_info
from service.csv_service import read_csv_data
from models.client import Campaign, Phase
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime
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


def get_campaign_service(db: DB_DEPENDENCY, campaign_id: Optional[int] = None, phase_id: Optional[int] = None) -> List[Dict[str, Any]]:
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
        millis_campaigns = get_campaign_details(cids_to_fetch)
        
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


def create_campaign_service(
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
            millis_success, millis_error, millis_data = create_campaign_in_millis(campaign_name)
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


def refresh_campaign_status(db: DB_DEPENDENCY, campaign_id: int) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
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
                campaign.status = new_status
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
        
        millis_campaigns = get_campaign_details([campaign.cid])
        
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
            campaign.status = new_status
            campaign.records_count = new_record_count
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


def refresh_all_campaigns_status(db: DB_DEPENDENCY, phase_id: Optional[int] = None) -> Tuple[bool, Optional[str], Optional[List[Dict[str, Any]]]]:
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
                millis_campaigns = get_campaign_details([campaign.cid])
                
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


def delete_campaign_service(db: DB_DEPENDENCY, campaign_id: int) -> Tuple[bool, Optional[str]]:
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
                
                failed_chunks = []
                for chunk in chunks:
                    # Delete chunk from Millis.ai if it has a CID
                    if chunk.cid:
                        logger.info(f"Deleting chunk {chunk.chunk_name} from Millis.ai (CID: {chunk.cid})")
                        millis_success, millis_error = delete_campaign_in_millis(chunk.cid)
                        if not millis_success:
                            logger.warning(f"Failed to delete chunk {chunk.chunk_name} from Millis.ai: {millis_error}")
                            failed_chunks.append(chunk.chunk_name)
                            # Continue with deletion even if Millis deletion fails
                    
                    # Delete chunk from database
                    db.delete(chunk)
                
                if failed_chunks:
                    logger.warning(f"Failed to delete {len(failed_chunks)} chunks from Millis.ai: {', '.join(failed_chunks)}")
                
                logger.info(f"Deleted {len(chunks)} chunks from database")
        else:
            # Handle single-type campaigns
            pass
        
        # Delete campaign from Millis.ai if CID exists
        if campaign_cid:
            millis_success, millis_error = delete_campaign_in_millis(campaign_cid)
            if not millis_success:
                logger.warning(f"Failed to delete campaign from Millis.ai: {millis_error}")
                # Continue with database deletion even if Millis.ai deletion fails
                # This allows cleanup of orphaned database records
        else:
            logger.info(f"Campaign {campaign_id} has no CID, skipping Millis.ai deletion")
        
        # Delete campaign from database
        db.delete(campaign)
        db.commit()
        
        logger.info(f"Successfully deleted campaign {campaign_id} ({campaign_name}) from database")
        return True, None
        
    except Exception as e:
        db.rollback()
        error_msg = f"Error deleting campaign: {str(e)}"
        logger.error(error_msg)
        return False, error_msg


def upload_csv_records_to_campaign(db: DB_DEPENDENCY, campaign_id: int) -> Tuple[bool, Optional[str], Optional[int]]:
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
        millis_success, millis_error = upload_records_to_millis(campaign.cid, formatted_records)
        if not millis_success:
            logger.error(f"Failed to upload records to Millis.ai: {millis_error}")
            return False, millis_error, None
        
        logger.info(f"Successfully uploaded {len(formatted_records)} records to campaign {campaign_id} (cid: {campaign.cid})")
        return True, None, len(formatted_records)
        
    except Exception as e:
        error_msg = f"Error uploading CSV records to campaign: {str(e)}"
        logger.error(error_msg)
        return False, error_msg, None


def set_caller_service(db: DB_DEPENDENCY, campaign_id: int, phone_id: str) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
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
        phones_success, phones_error, phones_data = get_phones()
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
            
            failed_chunks = []
            success_count = 0
            
            for chunk in chunks:
                if not chunk.cid:
                    logger.warning(f"Chunk {chunk.id} ({chunk.chunk_name}) has no CID, skipping")
                    failed_chunks.append(chunk.chunk_name)
                    continue
                
                # Set caller for this chunk in Millis.ai
                millis_success, millis_error = set_caller(chunk.cid, phone_id)
                if not millis_success:
                    logger.error(f"Failed to set caller for chunk {chunk.chunk_name}: {millis_error}")
                    failed_chunks.append(chunk.chunk_name)
                    continue
                
                # Update chunk in database
                chunk.phone_id = phone_id
                chunk.agent_id = agent_id
                success_count += 1
                logger.info(f"✓ Set caller for chunk {chunk.chunk_name} (CID: {chunk.cid})")
            
            # Update parent campaign
            campaign.phone_id = phone_id
            campaign.agent_id = agent_id
            
            db.commit()
            
            if failed_chunks:
                error_msg = f"Set caller for {success_count}/{len(chunks)} chunks. Failed: {', '.join(failed_chunks)}"
                logger.warning(error_msg)
                if success_count == 0:
                    return False, error_msg, None
                # Partial success
                return True, None, {
                    'agent_id': agent_id,
                    'chunks_updated': success_count,
                    'total_chunks': len(chunks)
                }
            
            logger.info(f"Successfully set caller {phone_id} (agent_id: {agent_id}) for all {len(chunks)} chunks of campaign {campaign_id}")
            return True, None, {
                'agent_id': agent_id,
                'chunks_updated': success_count,
                'total_chunks': len(chunks)
            }
            
        else:
            # Handle single-type campaign
            if not campaign.cid:
                error_msg = f"Campaign {campaign_id} has no CID (Millis.ai campaign ID)"
                logger.error(error_msg)
                return False, error_msg, None
        
        # Set caller in Millis.ai
        millis_success, millis_error = set_caller(campaign.cid, phone_id)
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


def start_campaign_service(db: DB_DEPENDENCY, campaign_id: int) -> Tuple[bool, Optional[str]]:
    """
    Start a campaign in Millis.ai.
    
    This function validates that:
    1. Campaign exists in database
    2. Campaign has a CID (Millis.ai campaign ID)
    3. Campaign has a caller set in Millis.ai API (fetched from /campaigns/{cid}/info endpoint)
    4. Then calls Millis.ai API to start the campaign
    
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
        
        logger.info(f"[START_CAMPAIGN] Campaign found: name='{campaign.campaign_name}', cid='{campaign.cid}', phone_id='{campaign.phone_id}', agent_id='{campaign.agent_id}'")
        
        # Step 2: Validate CID exists
        if not campaign.cid:
            error_msg = f"Campaign {campaign_id} has no CID (Millis.ai campaign ID). Cannot start campaign without CID."
            logger.error(f"[START_CAMPAIGN] ERROR: {error_msg}")
            return False, error_msg
        
        logger.info(f"[START_CAMPAIGN] Step 2: CID validation passed. CID: {campaign.cid}")
        
        # Step 3: Validate caller is set in Millis.ai API (CRITICAL CHECK - Check from API, not DB)
        logger.info(f"[START_CAMPAIGN] Step 3: Fetching campaign info from Millis.ai API to verify caller is set")
        millis_success, millis_error, millis_campaign_info = get_campaign_info(campaign.cid)
        
        if not millis_success or not millis_campaign_info:
            error_msg = millis_error or f"Campaign {campaign_id} (CID: {campaign.cid}) not found in Millis.ai API"
            logger.error(f"[START_CAMPAIGN] ERROR: {error_msg}")
            return False, error_msg
        
        # Log all available fields from Millis.ai API for debugging
        logger.info(f"[START_CAMPAIGN] Millis.ai campaign info fields: {list(millis_campaign_info.keys())}")
        logger.debug(f"[START_CAMPAIGN] Full Millis.ai campaign info: {millis_campaign_info}")
        
        # Check for caller in Millis.ai API response
        # Millis.ai API returns caller as "caller" field
        millis_caller = millis_campaign_info.get("caller")
        
        # Also log DB values for reference
        db_phone_id = campaign.phone_id
        db_agent_id = campaign.agent_id
        
        logger.info(f"[START_CAMPAIGN] Caller check - Millis.ai API: caller={millis_caller}, DB: phone_id={db_phone_id}, agent_id={db_agent_id}")
        
        # Validate caller is set in Millis.ai API
        if not millis_caller:
            error_msg = f"Campaign {campaign_id} (CID: {campaign.cid}) has no caller set in Millis.ai API. Please set a caller phone before starting the campaign. Campaign cannot make calls without a caller."
            logger.error(f"[START_CAMPAIGN] ERROR: {error_msg}")
            logger.error(f"[START_CAMPAIGN] Millis.ai campaign info: {millis_campaign_info}")
            logger.error(f"[START_CAMPAIGN] DB campaign data - phone_id: {db_phone_id}, agent_id: {db_agent_id}")
            return False, error_msg
        
        logger.info(f"[START_CAMPAIGN] Step 3: Caller validation passed (from Millis.ai API). Caller: {millis_caller}")
        
        # Warn if DB and API are out of sync
        if millis_caller != db_phone_id:
            logger.warning(f"[START_CAMPAIGN] WARNING: Caller mismatch - Millis.ai API caller: {millis_caller}, DB phone_id: {db_phone_id}. Using caller from Millis.ai API.")
        
        # Step 4: Call Millis.ai API to start campaign
        logger.info(f"[START_CAMPAIGN] Step 4: Calling Millis.ai API to start campaign CID: {campaign.cid}")
        millis_success, millis_error = start_campaign(campaign.cid)
        
        if not millis_success:
            error_msg = millis_error or "Failed to start campaign in Millis.ai"
            logger.error(f"[START_CAMPAIGN] ERROR: {error_msg}")
            logger.error(f"[START_CAMPAIGN] Campaign {campaign_id} (CID: {campaign.cid}) failed to start in Millis.ai")
            return False, error_msg
        
        logger.info(f"[START_CAMPAIGN] SUCCESS: Campaign {campaign_id} (CID: {campaign.cid}) started successfully in Millis.ai")
        logger.info(f"[START_CAMPAIGN] Campaign caller details - Millis.ai API caller: {millis_caller}, DB phone_id: {db_phone_id}, DB agent_id: {db_agent_id}")
        return True, None
        
    except Exception as e:
        error_msg = f"Error starting campaign: {str(e)}"
        logger.error(f"[START_CAMPAIGN] EXCEPTION: {error_msg}")
        logger.exception(f"[START_CAMPAIGN] Full exception traceback for campaign {campaign_id}")
        return False, error_msg


def stop_campaign_service(db: DB_DEPENDENCY, campaign_id: int) -> Tuple[bool, Optional[str]]:
    """
    Stop a campaign in Millis.ai.
    
    Args:
        db: Database session
        campaign_id: Campaign ID in database
    
    Returns:
        Tuple of (success, error_message)
    """
    logger.info(f"Stopping campaign {campaign_id}")
    
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
        
        millis_success, millis_error = stop_campaign_millis(campaign.cid)
        if not millis_success:
            error_msg = millis_error or "Failed to stop campaign in Millis.ai"
            logger.error(error_msg)
            return False, error_msg
        
        logger.info(f"Successfully stopped campaign {campaign_id}")
        return True, None
        
    except Exception as e:
        error_msg = f"Error stopping campaign: {str(e)}"
        logger.error(error_msg)
        return False, error_msg


def delete_record_service(db: DB_DEPENDENCY, campaign_id: int, phone: str) -> Tuple[bool, Optional[str]]:
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
        
        millis_success, millis_error = delete_record_millis(campaign.cid, phone)
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