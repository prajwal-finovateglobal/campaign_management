from fastapi import APIRouter, Query, HTTPException
from database.dependencies import DB_DEPENDENCY
from service.campaign import get_campaign_service, create_campaign_service, refresh_campaign_status, refresh_all_campaigns_status, delete_campaign_service, upload_csv_records_to_campaign, set_caller_service, start_campaign_service, stop_campaign_service, delete_record_service
from service.millis_api import get_phones, get_agent
from schema.campaign import CreateCampaignRequest, CreateCampaignResponse, RefreshCampaignStatusResponse, DeleteCampaignResponse, UploadRecordsRequest, UploadRecordsResponse, GetPhonesResponse, GetAgentResponse, SetCallerRequest, SetCallerResponse, StartCampaignRequest, StartCampaignResponse, StopCampaignRequest, StopCampaignResponse, DeleteRecordRequest, DeleteRecordResponse
from typing import Optional
import loguru

router = APIRouter()
logger = loguru.logger


@router.get("/campaign")
def get_all_campaigns(
    campaign_id: Optional[int] = Query(None, description="Filter by campaign ID"),
    phase_id: Optional[int] = Query(None, description="Filter by phase ID"),
    db: DB_DEPENDENCY = None
):
    """
    Get all campaigns, optionally filtered by campaign_id or phase_id.
    """
    logger.info(f"Fetching campaigns with campaign_id: {campaign_id}, phase_id: {phase_id}")
    campaigns = get_campaign_service(db, campaign_id, phase_id)
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
def create_campaign(
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
    logger.info(f"Creating new campaign for phase_id: {request.phase_id}, phase_name: {request.phase_name}")
    
    success, error_msg, campaign_data = create_campaign_service(
        db,
        request.phase_id,
        request.phase_name
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
        message=f"Successfully created campaign: {campaign_data['campaign_name']}"
    )


@router.post("/campaign/{campaign_id}/refresh-status", response_model=RefreshCampaignStatusResponse)
def refresh_campaign_status_endpoint(
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
    
    success, error_msg, campaign_data = refresh_campaign_status(db, campaign_id)
    
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
def refresh_all_campaigns_status_endpoint(
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
    
    success, error_msg, campaigns_data = refresh_all_campaigns_status(db, phase_id)
    
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
def delete_campaign_endpoint(
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
    
    success, error_msg = delete_campaign_service(db, campaign_id)
    
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
def upload_records_to_campaign_endpoint(
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
    
    success, error_msg, records_uploaded = upload_csv_records_to_campaign(db, request.campaign_id)
    
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
def get_phones_endpoint():
    """
    Get all phones from Millis.ai API.
    
    Returns:
        GetPhonesResponse with list of phones
    """
    logger.info("Fetching phones from Millis.ai")
    
    success, error_msg, phones_data = get_phones()
    
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
def get_agent_endpoint(agent_id: str):
    """
    Get agent details from Millis.ai API.
    
    Args:
        agent_id: Agent ID to fetch
    
    Returns:
        GetAgentResponse with agent details
    """
    logger.info(f"Fetching agent {agent_id} from Millis.ai")
    
    success, error_msg, agent_data = get_agent(agent_id)
    
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
def set_caller_endpoint(request: SetCallerRequest, db: DB_DEPENDENCY = None):
    """
    Set caller phone for a campaign in Millis.ai and update database.
    
    Args:
        request: SetCallerRequest with campaign_id and phone_id
        db: Database session
    
    Returns:
        SetCallerResponse with success status and agent_id
    """
    logger.info(f"Setting caller {request.phone_id} for campaign {request.campaign_id}")
    
    success, error_msg, agent_id = set_caller_service(db, request.campaign_id, request.phone_id)
    
    if not success:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "message": error_msg,
                "agent_id": None
            }
        )
    
    return SetCallerResponse(
        success=True,
        message=f"Successfully set caller {request.phone_id} for campaign",
        agent_id=agent_id
    )


@router.post("/campaign/start", response_model=StartCampaignResponse)
def start_campaign_endpoint(request: StartCampaignRequest, db: DB_DEPENDENCY = None):
    """
    Start a campaign in Millis.ai.
    
    Args:
        request: StartCampaignRequest with campaign_id
        db: Database session
    
    Returns:
        StartCampaignResponse with success status
    """
    logger.info(f"Starting campaign {request.campaign_id}")
    
    success, error_msg = start_campaign_service(db, request.campaign_id)
    
    if not success:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "message": error_msg
            }
        )
    
    return StartCampaignResponse(
        success=True,
        message="Successfully started campaign"
    )


@router.post("/campaign/stop", response_model=StopCampaignResponse)
def stop_campaign_endpoint(request: StopCampaignRequest, db: DB_DEPENDENCY = None):
    """
    Stop a campaign in Millis.ai.
    
    Args:
        request: StopCampaignRequest with campaign_id
        db: Database session
    
    Returns:
        StopCampaignResponse with success status
    """
    logger.info(f"Stopping campaign {request.campaign_id}")
    
    success, error_msg = stop_campaign_service(db, request.campaign_id)
    
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
def delete_record_endpoint(request: DeleteRecordRequest, db: DB_DEPENDENCY = None):
    """
    Delete a record from a campaign in Millis.ai.
    
    Args:
        request: DeleteRecordRequest with campaign_id and phone
        db: Database session
    
    Returns:
        DeleteRecordResponse with success status
    """
    logger.info(f"Deleting record {request.phone} from campaign {request.campaign_id}")
    
    success, error_msg = delete_record_service(db, request.campaign_id, request.phone)
    
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