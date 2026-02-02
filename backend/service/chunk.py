from database.dependencies import DB_DEPENDENCY
from models.client import Campaign, Chunk, Phase, Client
from models.automation import DataLot, CampaignJob
from service.csv_service import read_csv_data, get_csv_row_count, format_phone_numbers
from service.campaign import create_campaign_service, upload_csv_records_to_campaign, delete_campaign_service
from service.millis_api import create_campaign_in_millis, delete_campaign_in_millis
from repo.campaign_jobs_repo import ensure_campaign_job
from typing import Tuple, Optional, List, Dict, Any
from datetime import datetime
import loguru
import math

logger = loguru.logger.bind(service="chunk_service")


def calculate_chunks(
    db: DB_DEPENDENCY,
    campaign_id: int,
    chunk_size: int
) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """
    Calculate how many chunks will be created based on campaign data and chunk size.
    Does NOT create any database records - just returns preview.
    
    Args:
        db: Database session
        campaign_id: ID of the parent campaign
        chunk_size: Number of records per chunk
    
    Returns:
        Tuple of (success, error_message, result_data)
    """
    try:
        # Validate chunk size
        if chunk_size <= 0:
            return False, "Chunk size must be greater than 0", None
        
        # Get campaign details
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            return False, f"Campaign with ID {campaign_id} not found", None
        
        # Read CSV data to count records for this campaign
        success, error_msg, csv_data = read_csv_data()
        if not success or csv_data is None:
            return False, error_msg or "Failed to read CSV data", None
        
        # Filter records by campaign_id
        campaign_records = [
            row for row in csv_data 
            if row.get('campaign_id') and str(row.get('campaign_id')) == str(campaign_id)
        ]
        
        total_records = len(campaign_records)
        
        if total_records == 0:
            return False, f"No records found in data.csv for campaign ID {campaign_id}", None
        
        # Calculate number of chunks
        number_of_chunks = math.ceil(total_records / chunk_size)
        
        # Generate preview for each chunk
        chunks_preview = []
        for i in range(number_of_chunks):
            start_idx = i * chunk_size
            end_idx = min((i + 1) * chunk_size, total_records)
            records_in_chunk = end_idx - start_idx
            
            chunk_preview = {
                "chunk_number": i + 1,
                "chunk_name": f"{campaign.campaign_name}_ch{i + 1}",
                "records_range": f"{start_idx + 1}-{end_idx}",
                "records_count": records_in_chunk
            }
            chunks_preview.append(chunk_preview)
        
        result = {
            "campaign_name": campaign.campaign_name,
            "total_records": total_records,
            "chunk_size": chunk_size,
            "number_of_chunks": number_of_chunks,
            "chunks_preview": chunks_preview
        }
        
        logger.info(f"Calculated {number_of_chunks} chunks for campaign {campaign_id} ({total_records} records, chunk size {chunk_size})")
        return True, None, result
        
    except Exception as e:
        error_msg = f"Error calculating chunks: {str(e)}"
        logger.error(error_msg)
        return False, error_msg, None


def create_chunks(
    db: DB_DEPENDENCY,
    campaign_id: int,
    chunk_size: int
) -> Tuple[bool, Optional[str], Optional[List[Dict[str, Any]]]]:
    """
    Create chunk records in cms_chunks table for a campaign.
    Also updates the parent campaign type to 'multiple'.
    
    Args:
        db: Database session
        campaign_id: ID of the parent campaign
        chunk_size: Number of records per chunk
    
    Returns:
        Tuple of (success, error_message, chunks_list)
    """
    try:
        # First, calculate to get the preview
        success, error_msg, calc_result = calculate_chunks(db, campaign_id, chunk_size)
        if not success:
            return False, error_msg, None
        
        # Get campaign
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            return False, f"Campaign with ID {campaign_id} not found", None
        
        # Check if chunks already exist for this campaign
        existing_chunks = db.query(Chunk).filter(Chunk.campaign_id == campaign_id).count()
        if existing_chunks > 0:
            return False, f"Chunks already exist for campaign {campaign_id}. Please delete existing chunks first.", None
        
        # Create chunk records
        created_chunks = []
        chunks_preview = calc_result["chunks_preview"]
        
        for chunk_info in chunks_preview:
            new_chunk = Chunk(
                chunk_name=chunk_info["chunk_name"],
                campaign_id=campaign_id,
                records_count=0,  # Will be set to actual count after upsert
                upsert_time=None,  # Will be set when records are uploaded
                status='pending',  # Initial status
                cid=None,  # Will be set when uploaded to Millis
                phone_id=None,
                agent_id=None
            )
            db.add(new_chunk)
            db.flush()  # Flush to get the ID
            
            created_chunks.append({
                "id": new_chunk.id,
                "chunk_name": new_chunk.chunk_name,
                "campaign_id": new_chunk.campaign_id,
                "records_count": new_chunk.records_count,
                "status": new_chunk.status,
                "cid": new_chunk.cid,
                "phone_id": new_chunk.phone_id,
                "agent_id": new_chunk.agent_id,
                "upload_status": new_chunk.upload_status,
                "created_at": new_chunk.created_at.isoformat() if new_chunk.created_at else None
            })
        
        # Update parent campaign type to 'multiple' and store chunk_size
        campaign.type = 'multiple'
        campaign.chunk_size = chunk_size
        
        db.commit()
        
        logger.info(f"Successfully created {len(created_chunks)} chunks for campaign {campaign_id}")
        return True, None, created_chunks
        
    except Exception as e:
        db.rollback()
        error_msg = f"Error creating chunks: {str(e)}"
        logger.error(error_msg)
        return False, error_msg, None


def get_chunks_by_campaign(
    db: DB_DEPENDENCY,
    campaign_id: int
) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """
    Get all chunks for a specific campaign.
    
    Args:
        db: Database session
        campaign_id: ID of the parent campaign
    
    Returns:
        Tuple of (success, error_message, result_data)
    """
    try:
        # Get campaign
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            return False, f"Campaign with ID {campaign_id} not found", None
        
        # Get all chunks for this campaign
        chunks = db.query(Chunk).filter(Chunk.campaign_id == campaign_id).order_by(Chunk.id).all()
        
        chunks_list = []
        for chunk in chunks:
            chunks_list.append({
                "id": chunk.id,
                "chunk_name": chunk.chunk_name,
                "campaign_id": chunk.campaign_id,
                "records_count": chunk.records_count,
                "status": chunk.status,
                "cid": chunk.cid,
                "phone_id": chunk.phone_id,
                "agent_id": chunk.agent_id,
                "upload_status": chunk.upload_status,
                "created_at": chunk.created_at.isoformat() if chunk.created_at else None
            })
        
        result = {
            "campaign_id": campaign_id,
            "campaign_name": campaign.campaign_name,
            "chunks": chunks_list,
            "total_chunks": len(chunks_list)
        }
        
        logger.info(f"Retrieved {len(chunks_list)} chunks for campaign {campaign_id}")
        return True, None, result
        
    except Exception as e:
        error_msg = f"Error retrieving chunks: {str(e)}"
        logger.error(error_msg)
        return False, error_msg, None


def delete_chunks_by_campaign(
    db: DB_DEPENDENCY,
    campaign_id: int
) -> Tuple[bool, Optional[str], Optional[int]]:
    """
    Delete all chunks for a specific campaign.
    Also updates the parent campaign type back to 'single'.
    
    Args:
        db: Database session
        campaign_id: ID of the parent campaign
    
    Returns:
        Tuple of (success, error_message, deleted_count)
    """
    try:
        # Get campaign
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            return False, f"Campaign with ID {campaign_id} not found", None
        
        # Delete all chunks
        deleted_count = db.query(Chunk).filter(Chunk.campaign_id == campaign_id).delete()
        
        # Update parent campaign type back to 'single' if chunks were deleted
        if deleted_count > 0:
            campaign.type = 'single'
        
        db.commit()
        
        logger.info(f"Deleted {deleted_count} chunks for campaign {campaign_id}")
        return True, None, deleted_count
        
    except Exception as e:
        db.rollback()
        error_msg = f"Error deleting chunks: {str(e)}"
        logger.error(error_msg)
        return False, error_msg, None


async def upsert_all_chunks(
    db: DB_DEPENDENCY,
    campaign_id: int
) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """
    Upsert all chunks of a campaign to Millis.ai.
    For each chunk, creates campaign in Millis.ai and uploads records.
    Updates chunk details (cid, status, records_count) in database.
    
    Args:
        db: Database session
        campaign_id: Parent campaign ID
    
    Returns:
        Tuple of (success, error_message, result_data)
        - success: Whether operation succeeded
        - error_message: Error message if failed, None if succeeded
        - result_data: Dict with upsert results if succeeded, None if failed
    """
    logger.info(f"Upserting all chunks for campaign {campaign_id}")
    
    try:
        from models.client import Campaign, Chunk
        from service.csv_service import read_csv_data
        from service.millis_api import create_campaign_in_millis, upload_records_to_millis
        
        # Get parent campaign
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            return False, f"Campaign {campaign_id} not found", None
        
        # Get all chunks for this campaign
        chunks = db.query(Chunk).filter(Chunk.campaign_id == campaign_id).all()
        
        if not chunks:
            return False, f"No chunks found for campaign {campaign_id}", None
        
        # Read data from data.csv
        csv_success, csv_error, csv_data = read_csv_data()
        if not csv_success or not csv_data:
            error_msg = csv_error or "No records found in data.csv"
            return False, error_msg, None
        
        # Filter records for this campaign (handle both string and int campaign_id)
        campaign_records = []
        for record in csv_data:
            record_campaign_id = record.get('campaign_id')
            # Convert to int for comparison if it's a string
            if record_campaign_id is not None:
                try:
                    if isinstance(record_campaign_id, str):
                        record_campaign_id = int(record_campaign_id)
                    if record_campaign_id == campaign_id:
                        campaign_records.append(record)
                except (ValueError, TypeError):
                    continue
        
        if not campaign_records:
            return False, f"No records found for campaign {campaign_id} in data.csv", None
        
        chunks_upserted = 0
        total_records = 0
        failed_chunks = []
        
        # Process each chunk
        for chunk in chunks:
            try:
                # Create campaign in Millis.ai if not already created
                if not chunk.cid:
                    logger.info(f"Creating campaign in Millis.ai for chunk: {chunk.chunk_name}")
                    millis_success, millis_error, millis_data = await create_campaign_in_millis(chunk.chunk_name)
                    
                    if not millis_success or not millis_data:
                        logger.error(f"Failed to create campaign in Millis.ai for chunk {chunk.chunk_name}: {millis_error}")
                        failed_chunks.append(chunk.chunk_name)
                        continue
                    
                    # Update chunk with CID from Millis.ai
                    chunk.cid = millis_data.get("id")
                    chunk.status = millis_data.get("status", "idle")
                    logger.info(f"Chunk {chunk.chunk_name} created in Millis.ai with CID: {chunk.cid}")
                
                # Determine which records belong to this chunk
                # Chunks are created sequentially, so we need to calculate the range
                chunk_index = chunks.index(chunk)
                chunk_size = chunk.records_count or len(campaign_records) // len(chunks)
                start_idx = chunk_index * chunk_size
                end_idx = start_idx + chunk_size if chunk_index < len(chunks) - 1 else len(campaign_records)
                
                chunk_records = campaign_records[start_idx:end_idx]
                
                if not chunk_records:
                    logger.warning(f"No records for chunk {chunk.chunk_name}")
                    continue
                
                # Format records for Millis.ai API
                formatted_records = []
                for record in chunk_records:
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
                    logger.warning(f"No valid phone numbers in records for chunk {chunk.chunk_name}")
                    failed_chunks.append(chunk.chunk_name)
                    continue
                
                # Upload formatted records to Millis.ai
                logger.info(f"Uploading {len(formatted_records)} formatted records to chunk {chunk.chunk_name} (CID: {chunk.cid})")
                upload_success, upload_error = await upload_records_to_millis(
                    chunk.cid,
                    formatted_records
                )
                
                if not upload_success:
                    logger.error(f"Failed to upload records to chunk {chunk.chunk_name}: {upload_error}")
                    failed_chunks.append(chunk.chunk_name)
                    continue
                
                # Update chunk with records count and upload status
                records_uploaded = len(formatted_records)
                chunk.records_count = records_uploaded
                chunk.upload_status = 'done'  # Mark as done after successful upload
                chunks_upserted += 1
                total_records += records_uploaded
                
                logger.info(f"Successfully upserted {records_uploaded} records to chunk {chunk.chunk_name}, upload_status set to 'done'")
                
            except Exception as e:
                logger.error(f"Error processing chunk {chunk.chunk_name}: {e}")
                failed_chunks.append(chunk.chunk_name)
                continue
        
        # Commit all chunk updates
        db.commit()
        
        result_data = {
            "chunks_upserted": chunks_upserted,
            "total_records": total_records,
            "total_chunks": len(chunks),
            "failed_chunks": failed_chunks if failed_chunks else None
        }
        
        if chunks_upserted == 0:
            return False, "No chunks were successfully upserted", result_data
        
        logger.info(f"Successfully upserted {chunks_upserted}/{len(chunks)} chunks with {total_records} total records")
        return True, None, result_data
        
    except Exception as e:
        db.rollback()
        error_msg = f"Error upserting chunks: {str(e)}"
        logger.error(error_msg)
        return False, error_msg, None


async def upsert_single_chunk(
    db: DB_DEPENDENCY,
    chunk_id: int,
    chunk_index: int,
    chunk_size: int
) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """
    Upsert a single chunk with proper record distribution.
    Records are selected based on: campaign_records[chunk_index * chunk_size : (chunk_index + 1) * chunk_size]
    
    Args:
        db: Database session
        chunk_id: ID of the chunk to upsert
        chunk_index: 0-based index of this chunk (used to calculate record range)
        chunk_size: Number of records per chunk
    
    Returns:
        Tuple of (success, error_message, result_data)
    """
    logger.info(f"Upserting single chunk {chunk_id} at index {chunk_index} with size {chunk_size}")
    
    try:
        from models.client import Campaign, Chunk
        from service.csv_service import read_csv_data
        from service.millis_api import create_campaign_in_millis, upload_records_to_millis
        
        # Get the chunk
        chunk = db.query(Chunk).filter(Chunk.id == chunk_id).first()
        if not chunk:
            return False, f"Chunk {chunk_id} not found", None
        
        # Get parent campaign
        campaign = db.query(Campaign).filter(Campaign.id == chunk.campaign_id).first()
        if not campaign:
            return False, f"Campaign {chunk.campaign_id} not found", None
        
        # Read CSV data
        csv_success, csv_error, csv_data = read_csv_data()
        if not csv_success or not csv_data:
            error_msg = csv_error or "No records found in data.csv"
            return False, error_msg, None
        
        # Filter records for this campaign
        campaign_records = []
        for record in csv_data:
            record_campaign_id = record.get('campaign_id')
            if record_campaign_id is not None:
                try:
                    if isinstance(record_campaign_id, str):
                        record_campaign_id = int(record_campaign_id)
                    if record_campaign_id == chunk.campaign_id:
                        campaign_records.append(record)
                except (ValueError, TypeError):
                    continue
        
        if not campaign_records:
            return False, f"No records found for campaign {chunk.campaign_id} in data.csv", None
        
        logger.info(f"Total records for campaign {chunk.campaign_id}: {len(campaign_records)}")
        
        # Calculate exact record range for this chunk
        start_idx = chunk_index * chunk_size
        end_idx = min((chunk_index + 1) * chunk_size, len(campaign_records))
        
        logger.info(f"Chunk {chunk.chunk_name}: Extracting records from index {start_idx} to {end_idx}")
        
        chunk_records = campaign_records[start_idx:end_idx]
        
        if not chunk_records:
            return False, f"No records for chunk index {chunk_index} (range {start_idx}-{end_idx})", None
        
        logger.info(f"Chunk {chunk.chunk_name}: Got {len(chunk_records)} records for range {start_idx}-{end_idx}")
        
        # Create campaign in Millis.ai if not already created
        if not chunk.cid:
            logger.info(f"Creating campaign in Millis.ai for chunk: {chunk.chunk_name}")
            millis_success, millis_error, millis_data = await create_campaign_in_millis(chunk.chunk_name)
            
            if not millis_success or not millis_data:
                error_msg = f"Failed to create campaign in Millis.ai: {millis_error}"
                logger.error(error_msg)
                return False, error_msg, None
            
            chunk.cid = millis_data.get("id")
            chunk.status = millis_data.get("status", "idle")
            db.commit()
            logger.info(f"Chunk {chunk.chunk_name} created in Millis.ai with CID: {chunk.cid}")
        
        # Format records for Millis.ai API
        formatted_records = []
        for record in chunk_records:
            # Try multiple column names for phone number
            phone = record.get("phone") or record.get("contact_to") or record.get("contact_from") or ""
            if phone:
                phone = str(phone).strip()
                if phone:
                    formatted_record = {
                        "phone": phone,
                        "metadata": {k: v for k, v in record.items() if k not in ["phone", "contact_to", "contact_from"] and v is not None}
                    }
                    formatted_records.append(formatted_record)
        
        if not formatted_records:
            return False, f"No valid phone numbers in records for chunk {chunk.chunk_name}", None
        
        logger.info(f"Uploading {len(formatted_records)} formatted records to chunk {chunk.chunk_name} (CID: {chunk.cid})")
        
        # Upload records to Millis.ai
        upload_success, upload_error = await upload_records_to_millis(chunk.cid, formatted_records)
        
        if not upload_success:
            error_msg = f"Failed to upload records: {upload_error}"
            logger.error(error_msg)
            return False, error_msg, None
        
        # Update chunk with records count and upload status
        records_uploaded = len(formatted_records)
        chunk.records_count = records_uploaded
        chunk.upsert_time = datetime.now()
        chunk.upload_status = 'done'  # Mark as done after successful upload
        db.commit()
        
        logger.info(f"Successfully upserted {records_uploaded} records to chunk {chunk.chunk_name}, upload_status set to 'done'")
        
        result_data = {
            "chunk_id": chunk.id,
            "chunk_name": chunk.chunk_name,
            "cid": chunk.cid,
            "records_uploaded": records_uploaded,
            "status": chunk.status
        }
        
        return True, None, result_data
        
    except Exception as e:
        db.rollback()
        error_msg = f"Error upserting chunk {chunk_id}: {str(e)}"
        logger.error(error_msg)
        return False, error_msg, None


async def start_chunk_service(db: DB_DEPENDENCY, chunk_id: int) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """
    Start a single chunk campaign in Millis.ai.
    
    Validates:
    1. Chunk exists in database
    2. Chunk has a CID
    3. Chunk has a caller set in Millis.ai
    4. Calls Millis.ai API to start the chunk's campaign
    
    Args:
        db: Database session
        chunk_id: Chunk ID in database
    
    Returns:
        Tuple of (success, error_message, result_data)
    """
    logger.info(f"[START_CHUNK] Starting chunk {chunk_id}")
    
    try:
        from service.millis_api import get_campaign_info, start_campaign
        
        # Get chunk from database
        chunk = db.query(Chunk).filter(Chunk.id == chunk_id).first()
        if not chunk:
            error_msg = f"Chunk {chunk_id} not found"
            logger.error(error_msg)
            return False, error_msg, None
        
        logger.info(f"[START_CHUNK] Chunk found: {chunk.chunk_name}, CID: {chunk.cid}")
        
        # Validate CID
        if not chunk.cid:
            error_msg = f"Chunk {chunk.chunk_name} has no CID. Please upsert the chunk first."
            logger.error(error_msg)
            return False, error_msg, None
        
        # Validate caller is set in Millis.ai
        millis_success, millis_error, millis_info = await get_campaign_info(chunk.cid)
        if not millis_success or not millis_info:
            error_msg = millis_error or f"Failed to fetch chunk info from Millis.ai"
            logger.error(error_msg)
            return False, error_msg, None
        
        millis_caller = millis_info.get("caller")
        if not millis_caller:
            error_msg = f"Chunk {chunk.chunk_name} has no caller set. Please set a phone number first."
            logger.error(error_msg)
            return False, error_msg, None
        
        logger.info(f"[START_CHUNK] Caller validated: {millis_caller}")
        
        # Start campaign in Millis.ai
        start_success, start_error = await start_campaign(chunk.cid)
        if not start_success:
            error_msg = start_error or "Failed to start chunk in Millis.ai"
            logger.error(error_msg)
            return False, error_msg, None
        
        logger.info(f"[START_CHUNK] Successfully started chunk {chunk.chunk_name} (CID: {chunk.cid})")
        
        result_data = {
            "chunk_id": chunk.id,
            "chunk_name": chunk.chunk_name,
            "cid": chunk.cid
        }
        
        return True, None, result_data
        
    except Exception as e:
        error_msg = f"Error starting chunk: {str(e)}"
        logger.error(error_msg)
        return False, error_msg, None


async def stop_chunk_service(db: DB_DEPENDENCY, chunk_id: int) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """
    Stop a single chunk campaign in Millis.ai.
    
    Args:
        db: Database session
        chunk_id: Chunk ID in database
    
    Returns:
        Tuple of (success, error_message, result_data)
    """
    logger.info(f"[STOP_CHUNK] Stopping chunk {chunk_id}")
    
    try:
        from service.millis_api import stop_campaign_millis
        
        # Get chunk from database
        chunk = db.query(Chunk).filter(Chunk.id == chunk_id).first()
        if not chunk:
            error_msg = f"Chunk {chunk_id} not found"
            logger.error(error_msg)
            return False, error_msg, None
        
        if not chunk.cid:
            error_msg = f"Chunk {chunk.chunk_name} has no CID"
            logger.error(error_msg)
            return False, error_msg, None
        
        # Stop campaign in Millis.ai
        stop_success, stop_error = await stop_campaign_millis(chunk.cid)
        if not stop_success:
            error_msg = stop_error or "Failed to stop chunk in Millis.ai"
            logger.error(error_msg)
            return False, error_msg, None
        
        logger.info(f"[STOP_CHUNK] Successfully stopped chunk {chunk.chunk_name} (CID: {chunk.cid})")
        
        result_data = {
            "chunk_id": chunk.id,
            "chunk_name": chunk.chunk_name,
            "cid": chunk.cid
        }
        
        return True, None, result_data
        
    except Exception as e:
        error_msg = f"Error stopping chunk: {str(e)}"
        logger.error(error_msg)
        return False, error_msg, None


async def get_chunk_status_service(db: DB_DEPENDENCY, chunk_id: int) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """
    Get current status of a chunk from Millis.ai using the faster /info endpoint.
    Updates the status in the database.
    
    Args:
        db: Database session
        chunk_id: Chunk ID in database
    
    Returns:
        Tuple of (success, error_message, result_data with status)
    """
    logger.info(f"[GET_CHUNK_STATUS] Fetching status for chunk {chunk_id}")
    
    try:
        from service.millis_api import get_campaign_info
        
        # Get chunk from database
        chunk = db.query(Chunk).filter(Chunk.id == chunk_id).first()
        if not chunk:
            error_msg = f"Chunk {chunk_id} not found"
            logger.error(error_msg)
            return False, error_msg, None
        
        if not chunk.cid:
            # If no CID, return pending status
            result_data = {
                "chunk_id": chunk.id,
                "chunk_name": chunk.chunk_name,
                "status": "pending",
                "cid": None
            }
            return True, None, result_data
        
        # Fetch status from Millis.ai using faster /info endpoint
        success, error_msg, millis_data = await get_campaign_info(chunk.cid)
        
        if success and millis_data:
            new_status = millis_data.get('status', 'unknown')
            
            # Update chunk status in database
            chunk.status = new_status
            db.commit()
            
            logger.info(f"[GET_CHUNK_STATUS] Chunk {chunk.chunk_name}: status={new_status} (updated in DB)")
            
            result_data = {
                "chunk_id": chunk.id,
                "chunk_name": chunk.chunk_name,
                "status": new_status,
                "cid": chunk.cid
            }
            
            return True, None, result_data
        else:
            error_msg = error_msg or f"Failed to fetch chunk {chunk.cid} info from Millis.ai"
            logger.warning(error_msg)
            return False, error_msg, None
        
    except Exception as e:
        error_msg = f"Error fetching chunk status: {str(e)}"
        logger.error(error_msg)
        return False, error_msg, None


async def create_campaign_with_lot(
    db: DB_DEPENDENCY,
    client_id: int,
    campaign_type: str = 'single',
    is_full: bool = True,
    idx: Optional[int] = None,
    size: Optional[int] = None,
    priority: int = 0
) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """
    Create campaign with automatic phase_1 assignment, DataLot creation, and record upsert.
    Complete end-to-end flow for first-time CSV uploads.
    
    Process:
    1. Find phase_1 for the client (oldest phase by id)
    2. Format phone numbers in CSV (ensure +91 prefix)
    3. Create campaign in Millis.ai and database
    4. Upsert records from CSV to campaign (handles both single and multiple types)
    5. Check if campaign already has a lot_id in cms_campaign_jobs
    6. If not, create new DataLot (representing this CSV batch)
    7. Update DataLot.total_records with actual uploaded count (only if phase_1)
    8. Ensure campaign job exists with lot_id
    9. Error handling: Mark as failed, delete from Millis.ai, rollback DB
    
    Args:
        db: Database session
        client_id: Client ID
        campaign_type: Type of campaign - 'single' (default) or 'multiple'
        is_full: Whether to use full CSV (default: True)
        idx: Starting index in CSV (required if is_full=False)
        size: Number of records (required if is_full=False)
        priority: Priority for campaign job (default: 0)
    
    Returns:
        Tuple of (success, error_message, campaign_data)
    """
    logger.info(f"=" * 80)
    logger.info(f"CREATING CAMPAIGN WITH LOT - END TO END")
    logger.info(f"Client ID: {client_id}, Type: {campaign_type}")
    logger.info(f"=" * 80)
    
    campaign_id = None
    campaign_cid = None
    lot_id = None
    job = None
    
    try:
        # Step 1: Find phase_1 (first phase for client by id)
        logger.info(f"Step 1: Finding phase_1 for client_id={client_id}")
        phases = db.query(Phase).filter(
            Phase.client_id == client_id
        ).order_by(Phase.id.asc()).all()
        
        if not phases:
            error_msg = f"No phases found for client_id {client_id}. Please create a phase first."
            logger.error(error_msg)
            return False, error_msg, None
        
        phase_1 = phases[0]
        phase_id = phase_1.id
        phase_name = phase_1.name
        is_phase_1 = True  # We're always in phase_1 for this function
        
        logger.info(f"✅ Found phase_1: id={phase_id}, name={phase_name}")
        
        # Step 2: Format phone numbers in CSV (ensure +91 prefix)
        logger.info(f"Step 2: Formatting phone numbers in CSV (ensure +91 prefix)")
        format_success, format_msg, format_count = format_phone_numbers()
        if not format_success:
            logger.warning(f"Phone formatting failed or not needed: {format_msg}")
        else:
            logger.info(f"✅ Phone formatting: {format_msg}")
        
        # Step 3: Create campaign using existing service
        logger.info(f"Step 3: Creating campaign in Millis.ai and database")
        success, error_msg, campaign_data = await create_campaign_service(
            db=db,
            phase_id=phase_id,
            phase_name=phase_name,
            campaign_type=campaign_type,
            is_full=is_full,
            idx=idx,
            size=size
        )
        
        if not success or not campaign_data:
            error_msg = error_msg or "Failed to create campaign"
            logger.error(f"❌ {error_msg}")
            return False, error_msg, None
        
        campaign_id = campaign_data['id']
        campaign_cid = campaign_data.get('cid')
        logger.info(f"✅ Created campaign: id={campaign_id}, cid={campaign_cid}, name={campaign_data.get('campaign_name')}")
        
        # Step 4: Upsert records from CSV
        logger.info(f"Step 4: Upserting records from CSV to campaign")
        records_uploaded = 0
        
        try:
            if campaign_type == 'multiple':
                # For multiple type: create chunks first, then upsert
                # Note: chunks should be created before calling this function
                # But if not, we'll try to upsert anyway
                logger.info(f"Multiple type campaign - using upsert_all_chunks")
                upsert_success, upsert_error, upsert_data = await upsert_all_chunks(db, campaign_id)
                
                if not upsert_success:
                    raise Exception(f"Failed to upsert chunks: {upsert_error}")
                
                records_uploaded = upsert_data.get('total_records', 0) if upsert_data else 0
                logger.info(f"✅ Upserted {records_uploaded} records via chunks")
            else:
                # For single type: upload directly
                logger.info(f"Single type campaign - uploading records directly")
                upsert_success, upsert_error, records_count = await upload_csv_records_to_campaign(db, campaign_id)
                
                if not upsert_success:
                    raise Exception(f"Failed to upload records: {upsert_error}")
                
                records_uploaded = records_count if records_count else 0
                logger.info(f"✅ Upserted {records_uploaded} records")
                
        except Exception as upsert_error:
            # Mark as failed first
            logger.error(f"❌ Upsert failed: {upsert_error}")
            
            # Mark campaign job as failed (if exists)
            if campaign_id:
                try:
                    existing_job = db.query(CampaignJob).filter(
                        CampaignJob.campaign_id == campaign_id
                    ).first()
                    if existing_job:
                        existing_job.status = 'failed'
                        db.commit()
                        logger.info(f"Marked campaign job as 'failed'")
                except Exception as e:
                    logger.warning(f"Could not mark job as failed: {e}")
            
            # Delete from Millis.ai
            if campaign_cid:
                try:
                    logger.info(f"Deleting campaign from Millis.ai: cid={campaign_cid}")
                    await delete_campaign_in_millis(campaign_cid)
                    logger.info(f"✅ Deleted campaign from Millis.ai")
                except Exception as e:
                    logger.error(f"Failed to delete from Millis.ai: {e}")
            
            # Rollback DB (delete campaign, lot, job)
            try:
                if campaign_id:
                    logger.info(f"Rolling back: Deleting campaign from DB: id={campaign_id}")
                    # Delete campaign (this will cascade delete related records)
                    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
                    if campaign:
                        db.delete(campaign)
                        db.commit()
                        logger.info(f"✅ Deleted campaign from DB")
            except Exception as e:
                logger.error(f"Failed to rollback DB: {e}")
                db.rollback()
            
            return False, f"Upsert failed: {str(upsert_error)}", None
        
        # Step 5: Check if campaign already has a lot_id
        logger.info(f"Step 5: Checking for existing lot_id")
        existing_job = db.query(CampaignJob).filter(
            CampaignJob.campaign_id == campaign_id
        ).first()
        
        if existing_job and existing_job.lot_id:
            # Campaign already has a lot - reuse it
            lot_id = existing_job.lot_id
            logger.info(f"✅ Campaign already has lot_id={lot_id}, reusing existing lot")
        else:
            # Create new DataLot (this is a new CSV batch)
            logger.info(f"Creating new DataLot for this CSV batch")
            client = db.query(Client).filter(Client.id == client_id).first()
            if not client:
                error_msg = f"Client with id {client_id} not found"
                logger.error(f"❌ {error_msg}")
                return False, error_msg, None
            
            client_name = client.name
            
            # Count existing lots for this client to generate name
            existing_lots_count = db.query(DataLot).filter(
                DataLot.client_id == client_id
            ).count()
            
            lot_name = f"{client_name}_lot_{existing_lots_count + 1}"
            
            # Count total phases for this client
            total_phases = len(phases)
            
            # Create new DataLot (total_records will be updated after upsert)
            new_lot = DataLot(
                name=lot_name,
                client_id=client_id,
                max_phases=total_phases,
                current_phase_no=1,
                status='active',
                total_records=0  # Will be updated below
            )
            
            db.add(new_lot)
            db.flush()  # Flush to get the ID
            lot_id = new_lot.id
            
            logger.info(f"✅ Created new DataLot: id={lot_id}, name={lot_name}")
        
        # Step 6: Update DataLot.total_records (only if phase_1)
        if is_phase_1 and lot_id and records_uploaded > 0:
            logger.info(f"Step 6: Updating DataLot.total_records (phase_1): {records_uploaded} records")
            try:
                lot = db.query(DataLot).filter(DataLot.id == lot_id).first()
                if lot:
                    lot.total_records = records_uploaded
                    db.commit()
                    logger.info(f"✅ Updated DataLot.total_records to {records_uploaded}")
            except Exception as e:
                logger.warning(f"Could not update DataLot.total_records: {e}")
        
        # Step 7: Ensure campaign job exists
        logger.info(f"Step 7: Ensuring campaign job exists")
        try:
            job = await ensure_campaign_job(
                db=db,
                client_id=client_id,
                lot_id=lot_id,
                campaign_id=campaign_id,
                priority=priority
            )
            logger.info(f"✅ Ensured campaign job exists: job_id={job.id}, status={job.status}")
        except Exception as e:
            logger.error(f"❌ Error ensuring campaign job: {e}")
            raise
        
        # Return enriched campaign data
        result_data = {
            **campaign_data,
            'lot_id': lot_id,
            'phase_id': phase_id,
            'phase_name': phase_name,
            'records_uploaded': records_uploaded
        }
        
        logger.info(f"=" * 80)
        logger.info(f"✅ SUCCESS: Campaign created with lot")
        logger.info(f"Campaign ID: {campaign_id}, Lot ID: {lot_id}, Records: {records_uploaded}")
        logger.info(f"=" * 80)
        
        return True, None, result_data
        
    except Exception as e:
        logger.error(f"=" * 80)
        logger.error(f"❌ ERROR: {str(e)}")
        logger.error(f"=" * 80)
        
        # Error handling: Mark as failed, then rollback
        try:
            # Mark as failed first
            if campaign_id:
                existing_job = db.query(CampaignJob).filter(
                    CampaignJob.campaign_id == campaign_id
                ).first()
                if existing_job:
                    existing_job.status = 'failed'
                    db.commit()
                    logger.info(f"Marked campaign job as 'failed'")
        except Exception as mark_error:
            logger.warning(f"Could not mark as failed: {mark_error}")
        
        # Delete from Millis.ai
        if campaign_cid:
            try:
                logger.info(f"Deleting campaign from Millis.ai: cid={campaign_cid}")
                await delete_campaign_in_millis(campaign_cid)
                logger.info(f"✅ Deleted from Millis.ai")
            except Exception as delete_error:
                logger.error(f"Failed to delete from Millis.ai: {delete_error}")
        
        # Rollback DB
        try:
            if campaign_id:
                campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
                if campaign:
                    db.delete(campaign)
                    db.commit()
                    logger.info(f"✅ Rolled back DB")
        except Exception as rollback_error:
            logger.error(f"Failed to rollback DB: {rollback_error}")
        
        db.rollback()
        error_msg = f"Error creating campaign with lot: {str(e)}"
        logger.error(error_msg)
        import traceback
        traceback.print_exc()
        return False, error_msg, None

