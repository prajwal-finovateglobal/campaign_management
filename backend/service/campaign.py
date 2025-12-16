from database.dependencies import DB_DEPENDENCY
from repo.tables import get_campaign
from service.millis_api import get_campaign_details, create_campaign_in_millis, delete_campaign_in_millis, upload_records_to_millis, get_phones, get_agent, set_caller, start_campaign, stop_campaign_millis, delete_record_millis, get_campaign_info
from service.csv_service import read_csv_data
from models.client import Campaign, Phase
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime
import loguru

logger = loguru.logger

def get_campaign_service(db: DB_DEPENDENCY, campaign_id: Optional[int] = None, phase_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """
    Get campaign data from the database with enriched record counts from Millis.ai API.
    Returns a list of dictionaries with campaign information including record_count.
    """
    logger.info(f"Getting campaign data for campaign_id: {campaign_id}, phase_id: {phase_id}")
    result = get_campaign(db, campaign_id, phase_id)
    
    # Convert ORM objects to dictionaries and collect CIDs
    campaigns = []
    cids_to_fetch = []
    
    for campaign in result:
        campaign_dict = {
            'id': campaign.id,
            'campaign_name': campaign.campaign_name,
            'upsert_time': campaign.upsert_time.isoformat() if campaign.upsert_time else None,
            'phase_id': campaign.phase_id,
            'created_at': campaign.created_at.isoformat() if campaign.created_at else None,
            'cid': campaign.cid,
            'phone_id': campaign.phone_id,
            'agent_id': campaign.agent_id,
            'record_count': None,  # Will be populated from Millis.ai
            'status': None  # Will be populated from Millis.ai
        }
        campaigns.append(campaign_dict)
        
        # Collect CIDs for batch fetching
        if campaign.cid:
            cids_to_fetch.append(campaign.cid)
    
    # Fetch campaign details from Millis.ai API in batch
    if cids_to_fetch:
        logger.info(f"Fetching record counts for {len(cids_to_fetch)} campaigns from Millis.ai")
        millis_campaigns = get_campaign_details(cids_to_fetch)
        
        # Enrich campaigns with record counts and status
        for campaign_dict in campaigns:
            cid = campaign_dict.get('cid')
            if cid and cid in millis_campaigns:
                campaign_dict['record_count'] = millis_campaigns[cid].get('record_count', 0)
                campaign_dict['status'] = millis_campaigns[cid].get('status', 'unknown')
                logger.debug(f"Campaign {campaign_dict['id']} (cid: {cid}) has {campaign_dict['record_count']} records, status: {campaign_dict['status']}")
            else:
                campaign_dict['record_count'] = 0
                campaign_dict['status'] = 'unknown'
                logger.debug(f"Campaign {campaign_dict['id']} (cid: {cid}) not found in Millis.ai or has no CID")
    else:
        logger.info("No CIDs to fetch from Millis.ai")
    
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
    phase_name: str
) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """
    Create a new campaign for a phase.
    
    Process:
    1. Generate campaign name based on phase name and existing campaign count
    2. Create campaign in Millis.ai API
    3. Store campaign details in database
    
    Args:
        db: Database session
        phase_id: Phase ID to create campaign for
        phase_name: Name of the phase
    
    Returns:
        Tuple of (success, error_message, campaign_data)
        - success: Whether operation succeeded
        - error_message: Error message if failed, None if succeeded
        - campaign_data: Dict with created campaign details if succeeded, None if failed
    """
    logger.info(f"Creating new campaign for phase_id: {phase_id}, phase_name: {phase_name}")
    
    try:
        # Verify phase exists
        phase = db.query(Phase).filter(Phase.id == phase_id).first()
        if not phase:
            error_msg = f"Phase with id {phase_id} not found"
            logger.error(error_msg)
            return False, error_msg, None
        
        # Generate campaign name
        campaign_name = generate_campaign_name(phase_name, phase_id, db)
        
        # Create campaign in Millis.ai API
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
    Refresh campaign status from Millis.ai API and update database.
    
    Process:
    1. Get campaign from database by campaign_id
    2. Fetch latest status from Millis.ai API using campaign CID
    3. Update campaign status in database
    
    Args:
        db: Database session
        campaign_id: Campaign ID to refresh status for
    
    Returns:
        Tuple of (success, error_message, campaign_data)
        - success: Whether operation succeeded
        - error_message: Error message if failed, None if succeeded
        - campaign_data: Dict with updated campaign details if succeeded, None if failed
    """
    logger.info(f"Refreshing campaign status for campaign_id: {campaign_id}")
    
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
        
        # Fetch latest campaign details from Millis.ai
        millis_campaigns = get_campaign_details([campaign.cid])
        
        if campaign.cid not in millis_campaigns:
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
        
        # Update campaign status and records_count in database
        try:
            campaign.status = new_status
            campaign.records_count = new_record_count
            db.commit()
            db.refresh(campaign)
            logger.info(f"Campaign {campaign_id} (cid: {campaign.cid}) status and records_count updated in DB: status={new_status}, records_count={new_record_count}")
        except Exception as e:
            db.rollback()
            logger.error(f"Error updating campaign {campaign_id} in database: {e}")
            # Continue and return the updated data even if DB update fails
        
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
    Refresh status for all campaigns (optionally filtered by phase_id) from Millis.ai API.
    
    Process:
    1. Get all campaigns from database (optionally filtered by phase_id)
    2. Fetch latest status from Millis.ai API for all campaign CIDs
    3. Return updated campaign data with new statuses
    
    Args:
        db: Database session
        phase_id: Optional phase ID to filter campaigns
    
    Returns:
        Tuple of (success, error_message, campaigns_data)
        - success: Whether operation succeeded
        - error_message: Error message if failed, None if succeeded
        - campaigns_data: List of updated campaign dictionaries if succeeded, None if failed
    """
    logger.info(f"Refreshing status for all campaigns (phase_id: {phase_id})")
    
    try:
        # Get campaigns from database
        result = get_campaign(db, None, phase_id)
        
        if not result:
            return True, None, []
        
        # Collect all CIDs
        cids_to_fetch = []
        campaigns_map = {}
        
        for campaign in result:
            if campaign.cid:
                cids_to_fetch.append(campaign.cid)
                campaigns_map[campaign.cid] = campaign
        
        if not cids_to_fetch:
            logger.info("No campaigns with CIDs found")
            return True, None, []
        
        # Fetch latest campaign details from Millis.ai
        millis_campaigns = get_campaign_details(cids_to_fetch)
        
        # Build updated campaigns list and update database
        updated_campaigns = []
        for campaign in result:
            campaign_dict = {
                'id': campaign.id,
                'campaign_name': campaign.campaign_name,
                'upsert_time': campaign.upsert_time.isoformat() if campaign.upsert_time else None,
                'phase_id': campaign.phase_id,
                'created_at': campaign.created_at.isoformat() if campaign.created_at else None,
                'cid': campaign.cid,
                'phone_id': campaign.phone_id,
                'agent_id': campaign.agent_id,
                'record_count': None,
                'status': None
            }
            
            if campaign.cid and campaign.cid in millis_campaigns:
                millis_data = millis_campaigns[campaign.cid]
                new_status = millis_data.get('status')
                new_record_count = millis_data.get('record_count', 0)
                
                # Update campaign in database
                try:
                    campaign.status = new_status
                    campaign.records_count = new_record_count
                    campaign_dict['status'] = new_status
                    campaign_dict['record_count'] = new_record_count
                except Exception as e:
                    logger.error(f"Error updating campaign {campaign.id} in database: {e}")
                    # Use values from Millis.ai even if DB update fails
                    campaign_dict['status'] = new_status or 'unknown'
                    campaign_dict['record_count'] = new_record_count or 0
            else:
                campaign_dict['status'] = 'unknown'
                campaign_dict['record_count'] = 0
            
            updated_campaigns.append(campaign_dict)
        
        # Commit all database updates
        try:
            db.commit()
            logger.info(f"Successfully updated {len(updated_campaigns)} campaigns in database")
        except Exception as e:
            db.rollback()
            logger.error(f"Error committing campaign updates to database: {e}")
        
        logger.info(f"Successfully refreshed status for {len(updated_campaigns)} campaigns")
        return True, None, updated_campaigns
        
    except Exception as e:
        error_msg = f"Error refreshing all campaigns status: {str(e)}"
        logger.error(error_msg)
        return False, error_msg, None


def delete_campaign_service(db: DB_DEPENDENCY, campaign_id: int) -> Tuple[bool, Optional[str]]:
    """
    Delete a campaign from both Millis.ai API and database.
    
    Process:
    1. Get campaign from database by campaign_id
    2. Delete campaign from Millis.ai API using campaign CID
    3. Delete campaign from database
    
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
        
        # Format records for Millis.ai API
        # Extract phone from phone, contact_to, or contact_from column (in order of priority)
        formatted_records = []
        for record in csv_data:
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


def set_caller_service(db: DB_DEPENDENCY, campaign_id: int, phone_id: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Set caller phone for a campaign in Millis.ai and update database.
    
    Process:
    1. Get campaign from database by campaign_id
    2. Get phone details from Millis.ai to get agent_id
    3. Set caller in Millis.ai API
    4. Update phone_id and agent_id in database
    
    Args:
        db: Database session
        campaign_id: Campaign ID in database
        phone_id: Phone ID from Millis.ai (e.g., "+911140848678")
    
    Returns:
        Tuple of (success, error_message, agent_id)
        - success: Whether operation succeeded
        - error_message: Error message if failed, None if succeeded
        - agent_id: Agent ID associated with the phone if succeeded, None if failed
    """
    logger.info(f"Setting caller {phone_id} for campaign {campaign_id}")
    
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
        return True, None, agent_id
        
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