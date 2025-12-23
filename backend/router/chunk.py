from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from database.dependencies import DB_DEPENDENCY
from service.chunk import calculate_chunks, create_chunks, get_chunks_by_campaign, delete_chunks_by_campaign, upsert_all_chunks, upsert_single_chunk
from schema.chunk import (
    CalculateChunksRequest, CalculateChunksResponse,
    CreateChunksRequest, CreateChunksResponse,
    GetChunksResponse,
    UpsertAllChunksRequest, UpsertAllChunksResponse,
    UpsertSingleChunkRequest, UpsertSingleChunkResponse
)
import loguru
import json
import asyncio

router = APIRouter()
logger = loguru.logger


@router.post("/chunk/calculate", response_model=CalculateChunksResponse)
def calculate_chunks_endpoint(request: CalculateChunksRequest, db: DB_DEPENDENCY):
    """
    Calculate how many chunks will be created for a campaign based on chunk size.
    This is a preview endpoint - it does NOT create any database records.
    
    Args:
        request: Contains campaign_id and chunk_size
        db: Database session
    
    Returns:
        Preview of chunks that will be created
    """
    logger.info(f"Calculating chunks for campaign {request.campaign_id} with chunk size {request.chunk_size}")
    
    success, error_msg, result = calculate_chunks(db, request.campaign_id, request.chunk_size)
    
    if not success:
        raise HTTPException(status_code=400, detail=error_msg or "Failed to calculate chunks")
    
    return CalculateChunksResponse(
        success=True,
        campaign_name=result["campaign_name"],
        total_records=result["total_records"],
        chunk_size=result["chunk_size"],
        number_of_chunks=result["number_of_chunks"],
        chunks_preview=result["chunks_preview"]
    )


@router.post("/chunk/create", response_model=CreateChunksResponse)
def create_chunks_endpoint(request: CreateChunksRequest, db: DB_DEPENDENCY):
    """
    Create chunk records in the database for a campaign.
    Updates the parent campaign type to 'multiple'.
    
    Args:
        request: Contains campaign_id and chunk_size
        db: Database session
    
    Returns:
        List of created chunks
    """
    logger.info(f"Creating chunks for campaign {request.campaign_id} with chunk size {request.chunk_size}")
    
    success, error_msg, chunks = create_chunks(db, request.campaign_id, request.chunk_size)
    
    if not success:
        raise HTTPException(status_code=400, detail=error_msg or "Failed to create chunks")
    
    return CreateChunksResponse(
        success=True,
        message=f"Successfully created {len(chunks)} chunks",
        chunks_created=len(chunks),
        chunks=chunks
    )


@router.get("/chunk/campaign/{campaign_id}", response_model=GetChunksResponse)
def get_chunks_endpoint(campaign_id: int, db: DB_DEPENDENCY):
    """
    Get all chunks for a specific campaign.
    
    Args:
        campaign_id: ID of the parent campaign
        db: Database session
    
    Returns:
        List of all chunks for the campaign
    """
    logger.info(f"Fetching chunks for campaign {campaign_id}")
    
    success, error_msg, result = get_chunks_by_campaign(db, campaign_id)
    
    if not success:
        raise HTTPException(status_code=404, detail=error_msg or "Failed to retrieve chunks")
    
    return GetChunksResponse(
        success=True,
        campaign_id=result["campaign_id"],
        campaign_name=result["campaign_name"],
        chunks=result["chunks"],
        total_chunks=result["total_chunks"]
    )


@router.delete("/chunk/{chunk_id}")
def delete_single_chunk_endpoint(chunk_id: int, db: DB_DEPENDENCY):
    """
    Delete a single chunk by chunk_id.
    Also deletes the campaign in Millis.ai if the chunk has a CID.
    
    Args:
        chunk_id: ID of the chunk to delete
        db: Database session
    
    Returns:
        Success message
    """
    logger.info(f"Deleting chunk {chunk_id}")
    
    from models.client import Chunk
    from service.millis_api import delete_campaign_in_millis
    
    # Get the chunk
    chunk = db.query(Chunk).filter(Chunk.id == chunk_id).first()
    if not chunk:
        raise HTTPException(status_code=404, detail=f"Chunk {chunk_id} not found")
    
    chunk_name = chunk.chunk_name
    cid = chunk.cid
    
    # Delete from Millis.ai if it has a CID
    if cid:
        logger.info(f"Deleting chunk {chunk_name} from Millis.ai (CID: {cid})")
        millis_success, millis_error = delete_campaign_in_millis(cid)
        if not millis_success:
            logger.warning(f"Failed to delete chunk from Millis.ai: {millis_error}")
            # Continue with DB deletion even if Millis deletion fails
    
    # Delete from database
    db.delete(chunk)
    db.commit()
    
    logger.info(f"Successfully deleted chunk {chunk_name} (ID: {chunk_id})")
    
    return {
        "success": True,
        "message": f"Successfully deleted chunk: {chunk_name}"
    }


@router.delete("/chunk/campaign/{campaign_id}")
def delete_chunks_endpoint(campaign_id: int, db: DB_DEPENDENCY):
    """
    Delete all chunks for a specific campaign.
    Updates the parent campaign type back to 'single'.
    
    Args:
        campaign_id: ID of the parent campaign
        db: Database session
    
    Returns:
        Success message with count of deleted chunks
    """
    logger.info(f"Deleting chunks for campaign {campaign_id}")
    
    success, error_msg, deleted_count = delete_chunks_by_campaign(db, campaign_id)
    
    if not success:
        raise HTTPException(status_code=400, detail=error_msg or "Failed to delete chunks")
    
    return {
        "success": True,
        "message": f"Successfully deleted {deleted_count} chunks",
        "deleted_count": deleted_count
    }


@router.get("/chunk/upsert-all-stream")
async def upsert_all_chunks_stream(campaign_id: int, db: DB_DEPENDENCY):
    """
    Upsert all chunks of a campaign to Millis.ai with streaming progress updates.
    Sends real-time progress as Server-Sent Events.
    
    Args:
        request: Contains campaign_id
        db: Database session
    
    Returns:
        Streaming response with progress updates
    """
    logger.info(f"Starting streaming upsert for campaign {campaign_id}")
    
    async def generate_progress():
        try:
            from models.client import Campaign, Chunk
            from service.csv_service import read_csv_data
            from service.millis_api import create_campaign_in_millis, upload_records_to_millis
            
            # Get parent campaign
            campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
            if not campaign:
                yield f"data: {json.dumps({'error': f'Campaign {campaign_id} not found'})}\n\n"
                return
            
            # Get all chunks
            chunks = db.query(Chunk).filter(Chunk.campaign_id == campaign_id).all()
            if not chunks:
                yield f"data: {json.dumps({'error': f'No chunks found for campaign {campaign_id}'})}\n\n"
                return
            
            # Read CSV data
            csv_success, csv_error, csv_data = read_csv_data()
            if not csv_success or not csv_data:
                error_msg = csv_error or 'No records found in data.csv'
                yield f"data: {json.dumps({'error': error_msg})}\n\n"
                return
            
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
                yield f"data: {json.dumps({'error': f'No records found for campaign {campaign_id} in data.csv'})}\n\n"
                return
            
            chunks_upserted = 0
            total_records = 0
            failed_chunks = []
            
            # Process each chunk
            for idx, chunk in enumerate(chunks):
                chunk_progress = {
                    'chunk_name': chunk.chunk_name,
                    'chunk_index': idx + 1,
                    'total_chunks': len(chunks),
                    'status': 'creating',
                    'message': f'Creating campaign in Millis.ai...'
                }
                yield f"data: {json.dumps(chunk_progress)}\n\n"
                await asyncio.sleep(0.1)  # Small delay for UI update
                
                try:
                    # Create campaign in Millis.ai if not already created
                    if not chunk.cid:
                        logger.info(f"Creating campaign in Millis.ai for chunk: {chunk.chunk_name}")
                        millis_success, millis_error, millis_data = create_campaign_in_millis(chunk.chunk_name)
                        
                        if not millis_success or not millis_data:
                            logger.error(f"Failed to create campaign: {millis_error}")
                            failed_chunks.append(chunk.chunk_name)
                            chunk_progress['status'] = 'failed'
                            chunk_progress['message'] = f'Failed to create: {millis_error}'
                            yield f"data: {json.dumps(chunk_progress)}\n\n"
                            continue
                        
                        chunk.cid = millis_data.get("id")
                        chunk.status = millis_data.get("status", "idle")
                        db.commit()
                        logger.info(f"Chunk {chunk.chunk_name} created with CID: {chunk.cid}")
                    
                    # Determine records for this chunk
                    chunk_index = chunks.index(chunk)
                    chunk_size = chunk.records_count or len(campaign_records) // len(chunks)
                    start_idx = chunk_index * chunk_size
                    end_idx = start_idx + chunk_size if chunk_index < len(chunks) - 1 else len(campaign_records)
                    chunk_records = campaign_records[start_idx:end_idx]
                    
                    if not chunk_records:
                        logger.warning(f"No records for chunk {chunk.chunk_name}")
                        chunk_progress['status'] = 'skipped'
                        chunk_progress['message'] = 'No records to upsert'
                        yield f"data: {json.dumps(chunk_progress)}\n\n"
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
                        chunk_progress['status'] = 'failed'
                        chunk_progress['message'] = 'No valid phone numbers found'
                        yield f"data: {json.dumps(chunk_progress)}\n\n"
                        failed_chunks.append(chunk.chunk_name)
                        continue
                    
                    # Update status to upserting
                    chunk_progress['status'] = 'upserting'
                    chunk_progress['message'] = f'Upserting {len(formatted_records)} records...'
                    yield f"data: {json.dumps(chunk_progress)}\n\n"
                    await asyncio.sleep(0.1)
                    
                    # Upload formatted records
                    logger.info(f"Uploading {len(formatted_records)} formatted records to chunk {chunk.chunk_name}")
                    upload_success, upload_error = upload_records_to_millis(chunk.cid, formatted_records)
                    
                    if not upload_success:
                        logger.error(f"Failed to upload: {upload_error}")
                        failed_chunks.append(chunk.chunk_name)
                        chunk_progress['status'] = 'failed'
                        chunk_progress['message'] = f'Failed to upsert: {upload_error}'
                        yield f"data: {json.dumps(chunk_progress)}\n\n"
                        continue
                    
                    # Update chunk in database
                    chunk.records_count = len(formatted_records)
                    db.commit()
                    chunks_upserted += 1
                    total_records += len(formatted_records)
                    
                    # Update status to finished
                    chunk_progress['status'] = 'finished'
                    chunk_progress['message'] = f'Successfully upserted {len(formatted_records)} records'
                    chunk_progress['records_count'] = len(formatted_records)
                    yield f"data: {json.dumps(chunk_progress)}\n\n"
                    logger.info(f"Successfully upserted chunk {chunk.chunk_name}")
                    
                except Exception as e:
                    logger.error(f"Error processing chunk {chunk.chunk_name}: {e}")
                    failed_chunks.append(chunk.chunk_name)
                    chunk_progress['status'] = 'failed'
                    chunk_progress['message'] = f'Error: {str(e)}'
                    yield f"data: {json.dumps(chunk_progress)}\n\n"
                    continue
            
            # Send final summary
            summary = {
                'status': 'complete',
                'chunks_upserted': chunks_upserted,
                'total_records': total_records,
                'total_chunks': len(chunks),
                'failed_chunks': failed_chunks if failed_chunks else None,
                'message': f'Upserted {chunks_upserted}/{len(chunks)} chunks with {total_records} total records'
            }
            yield f"data: {json.dumps(summary)}\n\n"
            
        except Exception as e:
            logger.error(f"Error in streaming upsert: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
    
    return StreamingResponse(generate_progress(), media_type="text/event-stream")


@router.post("/chunk/upsert-all", response_model=UpsertAllChunksResponse)
def upsert_all_chunks_endpoint(request: UpsertAllChunksRequest, db: DB_DEPENDENCY):
    """
    Upsert all chunks of a campaign to Millis.ai (non-streaming version).
    Creates campaigns in Millis.ai and uploads records for all chunks.
    
    Args:
        request: Contains campaign_id
        db: Database session
    
    Returns:
        Result of upsert operation with counts and any failed chunks
    """
    logger.info(f"Upserting all chunks for campaign {request.campaign_id}")
    
    success, error_msg, result = upsert_all_chunks(db, request.campaign_id)
    
    if not success:
        raise HTTPException(status_code=400, detail=error_msg or "Failed to upsert chunks")
    
    message = f"Successfully upserted {result['chunks_upserted']} out of {result['total_chunks']} chunks with {result['total_records']} total records"
    if result.get('failed_chunks'):
        message += f". Failed chunks: {', '.join(result['failed_chunks'])}"
    
    return UpsertAllChunksResponse(
        success=True,
        message=message,
        chunks_upserted=result["chunks_upserted"],
        total_records=result["total_records"],
        failed_chunks=result.get("failed_chunks")
    )


@router.post("/chunk/upsert-single", response_model=UpsertSingleChunkResponse)
def upsert_single_chunk_endpoint(request: UpsertSingleChunkRequest, db: DB_DEPENDENCY):
    """
    Upsert a single chunk with proper record distribution.
    This endpoint is called in a loop from the frontend to ensure equal distribution.
    
    Args:
        request: Contains chunk_id, chunk_index, and chunk_size
        db: Database session
    
    Returns:
        UpsertSingleChunkResponse with upsert results
    """
    logger.info(f"Upserting chunk {request.chunk_id} at index {request.chunk_index} with size {request.chunk_size}")
    
    success, error_msg, result = upsert_single_chunk(
        db,
        request.chunk_id,
        request.chunk_index,
        request.chunk_size
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=error_msg or "Failed to upsert chunk")
    
    return UpsertSingleChunkResponse(
        success=True,
        message=f"Successfully upserted chunk with {result['records_uploaded']} records",
        chunk_id=result["chunk_id"],
        chunk_name=result["chunk_name"],
        cid=result["cid"],
        records_uploaded=result["records_uploaded"],
        status=result["status"]
    )

