from fastapi import APIRouter, Query, HTTPException
from database.dependencies import DB_DEPENDENCY
from service.campaign import get_campaign_service, create_campaign_service, refresh_campaign_status, refresh_all_campaigns_status, delete_campaign_service, upload_csv_records_to_campaign, set_caller_service, start_campaign_service, stop_campaign_service, delete_record_service
from service.clean_cd_service import clean_cd_service, clear_td_service
from service.millis_api import get_phones, get_agent
from schema.campaign import CreateCampaignRequest, CreateCampaignResponse, RefreshCampaignStatusResponse, DeleteCampaignResponse, UploadRecordsRequest, UploadRecordsResponse, GetPhonesResponse, GetAgentResponse, SetCallerRequest, SetCallerResponse, StartCampaignRequest, StartCampaignResponse, StopCampaignRequest, StopCampaignResponse, DeleteRecordRequest, DeleteRecordResponse, UpdateCampaignRangeRequest, UpdateCampaignRangeResponse
from schema.csv import CleanCDRequest, CleanCDResponse, ClearTDRequest, ClearTDResponse
from typing import Optional
import loguru
import requests

router = APIRouter()
logger = loguru.logger


@router.get("/campaign")
async def get_all_campaigns(
    campaign_id: Optional[int] = Query(None, description="Filter by campaign ID"),
    phase_id: Optional[int] = Query(None, description="Filter by phase ID"),
    db: DB_DEPENDENCY = None
):
    """
    Get all campaigns, optionally filtered by campaign_id or phase_id.
    """
    logger.info(f"Fetching campaigns with campaign_id: {campaign_id}, phase_id: {phase_id}")
    campaigns = await get_campaign_service(db, campaign_id, phase_id)
    return {"campaigns": campaigns}


@router.get("/campaign/simple")
def get_campaigns_simple(
    phase_id: Optional[int] = Query(None, description="Filter by phase ID"),
    db: DB_DEPENDENCY = None
):
    """
    Lightweight endpoint to get campaigns - returns only id and campaign_name.
    No record counts or status fetching from Millis.ai API.
    """
    logger.info(f"Fetching simple campaigns for phase_id: {phase_id}")
    from repo.tables import get_campaign
    from models.client import Campaign
    
    result = get_campaign(db, None, phase_id)
    
    campaigns = []
    for campaign in result:
        campaigns.append({
            'id': campaign.id,
            'campaign_name': campaign.campaign_name
        })
    
    return {"campaigns": campaigns}


@router.post("/campaign/create", response_model=CreateCampaignResponse)
async def create_campaign(
    request: CreateCampaignRequest,
    db: DB_DEPENDENCY = None
):
    """
    Create a new campaign for a phase.
    
    Process:
    1. Generates campaign name based on phase name and existing campaign count
    2. Creates campaign in Millis.ai API
    3. Stores campaign details in database
    
    Args:
        request: CreateCampaignRequest with phase_id and phase_name
        db: Database session
    
    Returns:
        CreateCampaignResponse with created campaign details
    """
    logger.info(f"Creating new campaign for phase_id: {request.phase_id}, phase_name: {request.phase_name}, type: {request.campaign_type}")
    
    success, error_msg, campaign_data = await create_campaign_service(
        db,
        request.phase_id,
        request.phase_name,
        request.campaign_type,
        request.is_full,
        request.idx,
        request.size
    )
    
    if not success:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "message": error_msg
            }
        )
    
    return CreateCampaignResponse(
        success=True,
        id=campaign_data['id'],
        campaign_name=campaign_data['campaign_name'],
        cid=campaign_data['cid'],
        status=campaign_data['status'],
        record_count=campaign_data['record_count'],
        phase_id=campaign_data['phase_id'],
        type=campaign_data.get('type', 'single'),
        idx=campaign_data.get('idx'),
        size=campaign_data.get('size'),
        message=f"Successfully created campaign: {campaign_data['campaign_name']}"
    )


@router.post("/campaign/{campaign_id}/refresh-status", response_model=RefreshCampaignStatusResponse)
async def refresh_campaign_status_endpoint(
    campaign_id: int,
    db: DB_DEPENDENCY = None
):
    """
    Refresh campaign status from Millis.ai API.
    
    Fetches the latest status from Millis.ai and returns updated campaign data.
    This allows the UI to stay updated with campaign status changes.
    
    Args:
        campaign_id: Campaign ID to refresh status for
        db: Database session
    
    Returns:
        RefreshCampaignStatusResponse with updated campaign status
    """
    logger.info(f"Refreshing status for campaign_id: {campaign_id}")
    
    success, error_msg, campaign_data = await refresh_campaign_status(db, campaign_id)
    
    if not success:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "message": error_msg
            }
        )
    
    return RefreshCampaignStatusResponse(
        success=True,
        id=campaign_data['id'],
        campaign_name=campaign_data['campaign_name'],
        cid=campaign_data['cid'],
        status=campaign_data['status'],
        record_count=campaign_data['record_count'],
        message=f"Status refreshed: {campaign_data['status']}"
    )


@router.post("/campaign/refresh-all-status")
async def refresh_all_campaigns_status_endpoint(
    phase_id: Optional[int] = Query(None, description="Optional phase ID to filter campaigns"),
    db: DB_DEPENDENCY = None
):
    """
    Refresh status for all campaigns from Millis.ai API.
    
    Optionally filters by phase_id. Updates all campaign statuses and record counts.
    
    Args:
        phase_id: Optional phase ID to filter campaigns
        db: Database session
    
    Returns:
        Response with updated campaigns list
    """
    logger.info(f"Refreshing status for all campaigns (phase_id: {phase_id})")
    
    success, error_msg, campaigns_data = await refresh_all_campaigns_status(db, phase_id)
    
    if not success:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "message": error_msg,
                "campaigns": []
            }
        )
    
    if campaigns_data is None:
        campaigns_data = []
    
    return {
        "success": True,
        "campaigns": campaigns_data,
        "message": f"Successfully refreshed status for {len(campaigns_data)} campaigns"
    }


@router.delete("/campaign/{campaign_id}", response_model=DeleteCampaignResponse)
async def delete_campaign_endpoint(
    campaign_id: int,
    db: DB_DEPENDENCY = None
):
    """
    Delete a campaign from both Millis.ai API and database.
    
    Process:
    1. Deletes campaign from Millis.ai API
    2. Deletes campaign from database
    
    Args:
        campaign_id: Campaign ID to delete
        db: Database session
    
    Returns:
        DeleteCampaignResponse with success status
    """
    logger.info(f"Deleting campaign_id: {campaign_id}")
    
    success, error_msg = await delete_campaign_service(db, campaign_id)
    
    if not success:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "message": error_msg
            }
        )
    
    return DeleteCampaignResponse(
        success=True,
        message=f"Successfully deleted campaign {campaign_id}"
    )


@router.post("/campaign/upload-records", response_model=UploadRecordsResponse)
async def upload_records_to_campaign_endpoint(
    request: UploadRecordsRequest,
    db: DB_DEPENDENCY = None
):
    """
    Upload records from data.csv to a campaign in Millis.ai.
    
    Reads all records from data.csv and uploads them to the specified campaign.
    
    Args:
        request: UploadRecordsRequest with campaign_id
        db: Database session
    
    Returns:
        UploadRecordsResponse with upload status and campaign details
    """
    logger.info(f"Uploading CSV records to campaign_id: {request.campaign_id}")
    
    # Get campaign and phase details for response
    from models.client import Campaign, Phase
    campaign = db.query(Campaign).filter(Campaign.id == request.campaign_id).first()
    if not campaign:
        raise HTTPException(
            status_code=404,
            detail={
                "success": False,
                "message": f"Campaign with id {request.campaign_id} not found"
            }
        )
    
    phase = db.query(Phase).filter(Phase.id == campaign.phase_id).first()
    phase_name = phase.name if phase else "Unknown"
    
    success, error_msg, records_uploaded = await upload_csv_records_to_campaign(db, request.campaign_id)
    
    if not success:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "message": error_msg
            }
        )
    
    return UploadRecordsResponse(
        success=True,
        message=f"Successfully uploaded {records_uploaded} records to campaign",
        records_uploaded=records_uploaded,
        phase_name=phase_name,
        campaign_name=campaign.campaign_name
    )


@router.get("/phones", response_model=GetPhonesResponse)
async def get_phones_endpoint():
    """
    Get all phones from Millis.ai API.
    
    Returns:
        GetPhonesResponse with list of phones
    """
    logger.info("Fetching phones from Millis.ai")
    
    success, error_msg, phones_data = await get_phones()
    
    if not success:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "message": error_msg,
                "phones": None
            }
        )
    
    return GetPhonesResponse(
        success=True,
        phones=phones_data,
        message=f"Successfully fetched {len(phones_data)} phones"
    )


@router.get("/agent/{agent_id}", response_model=GetAgentResponse)
async def get_agent_endpoint(agent_id: str):
    """
    Get agent details from Millis.ai API.
    
    Args:
        agent_id: Agent ID to fetch
    
    Returns:
        GetAgentResponse with agent details
    """
    logger.info(f"Fetching agent {agent_id} from Millis.ai")
    
    success, error_msg, agent_data = await get_agent(agent_id)
    
    if not success:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "message": error_msg,
                "agent": None
            }
        )
    
    return GetAgentResponse(
        success=True,
        agent=agent_data,
        message="Successfully fetched agent"
    )


@router.post("/campaign/set_caller", response_model=SetCallerResponse)
async def set_caller_endpoint(request: SetCallerRequest, db: DB_DEPENDENCY = None):
    """
    Set caller phone for a campaign in Millis.ai and update database.
    
    Args:
        request: SetCallerRequest with campaign_id and phone_id
        db: Database session
    
    Returns:
        SetCallerResponse with success status and agent_id
    """
    logger.info(f"Setting caller {request.phone_id} for campaign {request.campaign_id}")
    
    success, error_msg, result_data = await set_caller_service(db, request.campaign_id, request.phone_id)
    
    if not success:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "message": error_msg,
                "agent_id": None
            }
        )
    
    agent_id = result_data.get('agent_id') if result_data else None
    chunks_updated = result_data.get('chunks_updated') if result_data else None
    total_chunks = result_data.get('total_chunks') if result_data else None
    
    # Create a more detailed message for multiple-type campaigns
    if chunks_updated is not None and total_chunks is not None:
        message = f"Successfully set caller {request.phone_id} for all {chunks_updated} chunks of the campaign"
    else:
        message = f"Successfully set caller {request.phone_id} for campaign"
    
    return SetCallerResponse(
        success=True,
        message=message,
        agent_id=agent_id
    )


@router.post("/campaign/start", response_model=StartCampaignResponse)
async def start_campaign_endpoint(request: StartCampaignRequest, db: DB_DEPENDENCY = None):
    """
    Start a campaign in Millis.ai.
    
    Args:
        request: StartCampaignRequest with campaign_id
        db: Database session
    
    Returns:
        StartCampaignResponse with success status
    """
    logger.info(f"[ROUTER] /campaign/start endpoint called with campaign_id: {request.campaign_id}")
    logger.info(f"[ROUTER] Request details: campaign_id={request.campaign_id}")
    
    success, error_msg = await start_campaign_service(db, request.campaign_id)
    
    if not success:
        logger.error(f"[ROUTER] Campaign start failed: campaign_id={request.campaign_id}, error={error_msg}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "message": error_msg
            }
        )
    
    logger.info(f"[ROUTER] Campaign start successful: campaign_id={request.campaign_id}")
    return StartCampaignResponse(
        success=True,
        message="Successfully started campaign"
    )


@router.post("/campaign/stop", response_model=StopCampaignResponse)
async def stop_campaign_endpoint(request: StopCampaignRequest, db: DB_DEPENDENCY = None):
    """
    Stop a campaign in Millis.ai.
    
    Args:
        request: StopCampaignRequest with campaign_id
        db: Database session
    
    Returns:
        StopCampaignResponse with success status
    """
    logger.info(f"Stopping campaign {request.campaign_id}")
    
    success, error_msg = await stop_campaign_service(db, request.campaign_id)
    
    if not success:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "message": error_msg
            }
        )
    
    return StopCampaignResponse(
        success=True,
        message="Successfully stopped campaign"
    )


@router.delete("/campaign/delete-record", response_model=DeleteRecordResponse)
async def delete_record_endpoint(request: DeleteRecordRequest, db: DB_DEPENDENCY = None):
    """
    Delete a record from a campaign in Millis.ai.
    
    Args:
        request: DeleteRecordRequest with campaign_id and phone
        db: Database session
    
    Returns:
        DeleteRecordResponse with success status
    """
    logger.info(f"Deleting record {request.phone} from campaign {request.campaign_id}")
    
    success, error_msg = await delete_record_service(db, request.campaign_id, request.phone)
    
    if not success:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "message": error_msg
            }
        )
    
    return DeleteRecordResponse(
        success=True,
        message=f"Successfully deleted record {request.phone}"
    )


@router.get("/campaign/launch-status")
def check_launch_status():
    """
    Check the launch status from Avio API health endpoint.
    This endpoint proxies the request to avoid CORS issues.
    
    Returns:
        Health status from Avio API
    """
    logger.info("Checking launch status from Avio API")
    
    try:
        response = requests.get(
            "https://avioapis.finovateglobal.com/health",
            headers={"accept": "application/json"},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            return {
                "success": True,
                "status": data.get("status", "unknown"),
                "data": data
            }
        else:
            return {
                "success": False,
                "status": "error",
                "message": f"Avio API returned status code {response.status_code}",
                "data": None
            }
    except requests.exceptions.RequestException as e:
        logger.error(f"Error checking launch status: {str(e)}")
        return {
            "success": False,
            "status": "error",
            "message": f"Failed to connect to Avio API: {str(e)}",
            "data": None
        }
    except Exception as e:
        logger.error(f"Unexpected error checking launch status: {str(e)}")
        return {
            "success": False,
            "status": "error",
            "message": f"Unexpected error: {str(e)}",
            "data": None
        }


@router.post("/campaign/update-range", response_model=UpdateCampaignRangeResponse)
def update_campaign_range(
    request: UpdateCampaignRangeRequest,
    db: DB_DEPENDENCY = None
):
    """
    Update the idx and size (range) for an existing campaign.
    
    Args:
        request: UpdateCampaignRangeRequest with campaign_id, is_full, idx, and size
        db: Database session
    
    Returns:
        UpdateCampaignRangeResponse with updated range information
    """
    logger.info(f"Updating range for campaign_id: {request.campaign_id}, is_full: {request.is_full}, idx: {request.idx}, size: {request.size}")
    
    try:
        from models.client import Campaign
        from service.csv_service import get_csv_row_count
        
        # Get campaign from database
        campaign = db.query(Campaign).filter(Campaign.id == request.campaign_id).first()
        if not campaign:
            raise HTTPException(
                status_code=404,
                detail={
                    "success": False,
                    "message": f"Campaign with id {request.campaign_id} not found"
                }
            )
        
        # Handle idx and size based on is_full flag
        final_idx = 0
        final_size = 0
        
        if request.is_full:
            # Full mode: get total CSV row count and set idx=0, size=total
            csv_success, csv_error, total_rows = get_csv_row_count()
            if not csv_success:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "success": False,
                        "message": f"Failed to get CSV row count: {csv_error}"
                    }
                )
            final_idx = 0
            final_size = total_rows
            logger.info(f"Full mode: Setting idx=0, size={total_rows}")
        else:
            # Partial mode: validate provided idx and size
            if request.idx is None or request.size is None:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "success": False,
                        "message": "idx and size are required when is_full=False"
                    }
                )
            
            if request.idx < 0:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "success": False,
                        "message": f"idx must be >= 0, got {request.idx}"
                    }
                )
            
            if request.size <= 0:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "success": False,
                        "message": f"size must be > 0, got {request.size}"
                    }
                )
            
            # Get CSV row count to validate range
            csv_success, csv_error, total_rows = get_csv_row_count()
            if not csv_success:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "success": False,
                        "message": f"Failed to get CSV row count: {csv_error}"
                    }
                )
            
            if request.idx >= total_rows:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "success": False,
                        "message": f"idx ({request.idx}) must be less than total CSV rows ({total_rows}). Valid range: 0 to {total_rows - 1}"
                    }
                )
            
            # Auto-adjust size if it exceeds CSV bounds (like Python list slicing)
            if request.idx + request.size > total_rows:
                adjusted_size = total_rows - request.idx
                logger.info(f"Size ({request.size}) exceeds CSV bounds. Auto-adjusting to {adjusted_size} (from index {request.idx} to end of CSV)")
                final_size = adjusted_size
            else:
                final_size = request.size
            
            final_idx = request.idx
            logger.info(f"Partial mode: Setting idx={final_idx}, size={final_size} (records {final_idx} to {final_idx + final_size - 1})")
        
        # Update campaign
        campaign.idx = final_idx
        campaign.size = final_size
        db.commit()
        db.refresh(campaign)
        
        logger.info(f"Successfully updated range for campaign {request.campaign_id}: idx={final_idx}, size={final_size}")
        
        return UpdateCampaignRangeResponse(
            success=True,
            message=f"Successfully updated range: idx={final_idx}, size={final_size}",
            idx=final_idx,
            size=final_size
        )
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        error_msg = f"Error updating campaign range: {str(e)}"
        logger.error(error_msg)
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "message": error_msg
            }
        )

@router.post("/campaign/clean_cd", response_model=CleanCDResponse)
def clean_cd_endpoint(request: CleanCDRequest, db: DB_DEPENDENCY):
    """
    Clean CD: Delete disconnected records that have matching contact_to
    with connected records for the given campaigns.
    
    This operation:
    1. For each campaign_id:
       - Separates records into connected (duration/recording/chat not NULL, chat non-empty)
       - and disconnected (duration/recording/chat NULL or chat empty)
    2. Finds disconnected records whose contact_to matches any connected record's contact_to
    3. Deletes those matched disconnected records by sl_no
    
    Args:
        request: CleanCDRequest with campaign_ids (optional), phase_id (optional), table_name
        db: Database session dependency
        
    Returns:
        CleanCDResponse with deletion summary
    """
    logger.info(f"=== CLEAN CD REQUEST ===")
    logger.info(f"campaign_ids: {request.campaign_ids}")
    logger.info(f"phase_id: {request.phase_id}")
    logger.info(f"client_id: {request.client_id}")
    logger.info(f"table_name: {request.table_name}")
    
    # Validate input
    if not request.table_name:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "table_name is required",
                "success": False,
                "tone": "danger"
            }
        )
    
    if not request.campaign_ids and request.phase_id is None and request.client_id is None:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Either campaign_ids, phase_id, or client_id must be provided",
                "success": False,
                "tone": "danger"
            }
        )
    
    try:
        success, message, total_deleted, per_campaign_deleted, tone = clean_cd_service(
            db=db,
            campaign_ids=request.campaign_ids,
            phase_id=request.phase_id,
            client_id=request.client_id,
            table_name=request.table_name
        )
        
        if not success:
            raise HTTPException(
                status_code=500,
                detail={
                    "error": message,
                    "success": False,
                    "tone": tone
                }
            )
        
        logger.info(f"Clean CD completed successfully: {total_deleted} records deleted")
        return CleanCDResponse(
            success=True,
            message=message,
            total_records_deleted=total_deleted,
            records_deleted_per_campaign=per_campaign_deleted,
            tone=tone
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in clean_cd: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": f"Unexpected error: {str(e)}",
                "success": False,
                "tone": "danger"
            }
        )


@router.post("/campaign/clear_td", response_model=ClearTDResponse)
def clear_td_endpoint(request: ClearTDRequest, db: DB_DEPENDENCY):
    """
    Clear TD (Table Data): Delete all records from the table that do NOT belong
    to campaigns associated with the given client.
    
    This operation:
    1. Fetches all phases associated with the client_id
    2. Fetches all campaigns associated with those phases
    3. Finds all records whose campaign_id does NOT belong to those campaigns
    4. Deletes those records
    
    Args:
        request: ClearTDRequest with client_id and table_name
        db: Database session dependency
        
    Returns:
        ClearTDResponse with deletion summary
    """
    logger.info(f"=== CLEAR TD REQUEST ===")
    logger.info(f"client_id: {request.client_id}")
    logger.info(f"table_name: {request.table_name}")
    
    # Validate input
    if not request.table_name:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "table_name is required",
                "success": False,
                "tone": "danger"
            }
        )
    
    if not request.client_id:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "client_id is required",
                "success": False,
                "tone": "danger"
            }
        )
    
    try:
        success, message, total_deleted, s_nos_deleted, tone = clear_td_service(
            db=db,
            client_id=request.client_id,
            table_name=request.table_name
        )
        
        if not success:
            raise HTTPException(
                status_code=500,
                detail={
                    "error": message,
                    "success": False,
                    "tone": tone
                }
            )
        
        logger.info(f"Clear TD completed successfully: {total_deleted} records deleted")
        return ClearTDResponse(
            success=True,
            message=message,
            total_records_deleted=total_deleted,
            tone=tone
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in clear_td: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail={
                "error": f"Unexpected error: {str(e)}",
                "success": False,
                "tone": "danger"
            }
        )


@router.post("/campaign/{campaign_id}/notify/started")
async def notify_campaign_started_endpoint(campaign_id: int, db: DB_DEPENDENCY = None):
    """
    Send GChat notification for campaign started.
    Used when frontend auto-start begins for multiple-type campaigns.
    """
    logger.info(f"Sending campaign started notification for campaign {campaign_id}")
    
    try:
        from models.client import Campaign, Chunk
        from service.time_utils import now_ist
        from service.notification import notify_campaign_started
        
        # Get campaign from database
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            raise HTTPException(
                status_code=404,
                detail={"success": False, "message": f"Campaign {campaign_id} not found"}
            )
        
        # Track start time
        campaign.started_at = now_ist()
        db.commit()
        
        # Calculate chunk statistics for multiple-type campaigns
        total_chunks = None
        chunks_left = None
        current_chunk_number = None
        
        campaign_type = campaign.type if campaign.type else 'single'
        if campaign_type == 'multiple':
            chunks = db.query(Chunk).filter(Chunk.campaign_id == campaign_id).order_by(Chunk.id).all()
            if chunks:
                total_chunks = len(chunks)
                # Count chunks that are idle or pending (not yet started)
                chunks_left = sum(1 for chunk in chunks if chunk.status in ['idle', 'pending', None])
                
                # Find current chunk number (first chunk that is 'idle', 'pending', or 'started')
                for idx, chunk in enumerate(chunks, start=1):
                    if chunk.status in ['idle', 'pending', 'started', None]:
                        current_chunk_number = idx
                        break
                
                logger.info(f"Campaign {campaign_id} starting: total={total_chunks}, left={chunks_left}, current chunk={current_chunk_number}")
        
        # Send notification
        await notify_campaign_started(
            campaign_name=campaign.campaign_name,
            campaign_id=campaign_id,
            started_at=campaign.started_at,
            total_chunks=total_chunks,
            chunks_left=chunks_left,
            current_chunk_number=current_chunk_number
        )
        
        return {"success": True, "message": "Notification sent successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending started notification: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={"success": False, "message": f"Failed to send notification: {str(e)}"}
        )


@router.post("/campaign/{campaign_id}/notify/paused")
async def notify_campaign_paused_endpoint(campaign_id: int, db: DB_DEPENDENCY = None):
    """
    Send GChat notification for campaign paused.
    Used when frontend auto-start is stopped for multiple-type campaigns.
    """
    logger.info(f"Sending campaign paused notification for campaign {campaign_id}")
    
    try:
        from models.client import Campaign, Chunk
        from service.time_utils import now_ist
        from service.notification import notify_campaign_paused
        
        # Get campaign from database
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            raise HTTPException(
                status_code=404,
                detail={"success": False, "message": f"Campaign {campaign_id} not found"}
            )
        
        # Calculate chunk statistics for multiple-type campaigns
        chunks_done = None
        chunks_left = None
        total_chunks = None
        
        campaign_type = campaign.type if campaign.type else 'single'
        if campaign_type == 'multiple':
            chunks = db.query(Chunk).filter(Chunk.campaign_id == campaign_id).all()
            if chunks:
                total_chunks = len(chunks)
                # Count chunks that are finished or started (in progress or completed)
                chunks_done = sum(1 for chunk in chunks if chunk.status in ['finished', 'started'])
                # Count chunks that are idle or pending (not yet started)
                chunks_left = sum(1 for chunk in chunks if chunk.status in ['idle', 'pending', None])
                logger.info(f"Campaign {campaign_id} chunk progress: {chunks_done}/{total_chunks} done (finished+started), {chunks_left} left (idle+pending)")
        
        # Send notification
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
        
        return {"success": True, "message": "Notification sent successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending paused notification: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={"success": False, "message": f"Failed to send notification: {str(e)}"}
        )


@router.post("/campaign/{campaign_id}/notify/completed")
async def notify_campaign_completed_endpoint(campaign_id: int, db: DB_DEPENDENCY = None):
    """
    Send GChat notification for campaign completed.
    Used when frontend auto-start completes all chunks for multiple-type campaigns.
    """
    logger.info(f"Sending campaign completed notification for campaign {campaign_id}")
    
    try:
        from models.client import Campaign
        from service.time_utils import now_ist
        from service.notification import notify_campaign_completed
        
        # Get campaign from database
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            raise HTTPException(
                status_code=404,
                detail={"success": False, "message": f"Campaign {campaign_id} not found"}
            )
        
        # Track completion time
        completed_at = now_ist()
        campaign.completed_at = completed_at
        db.commit()
        
        # Send notification
        await notify_campaign_completed(
            campaign_name=campaign.campaign_name,
            campaign_id=campaign_id,
            started_at=campaign.started_at,
            completed_at=completed_at
        )
        
        return {"success": True, "message": "Notification sent successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending completed notification: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={"success": False, "message": f"Failed to send notification: {str(e)}"}
        )
