from fastapi import APIRouter, Query, HTTPException
from database.dependencies import DB_DEPENDENCY
from service.phase import get_phase_service, create_phase_service
from schema.phase import CreatePhaseRequest, CreatePhaseResponse
from typing import Optional
import loguru

router = APIRouter()
logger = loguru.logger


@router.get("/phase")
def get_all_phases(
    client_id: Optional[int] = Query(None, description="Filter by client ID"),
    db: DB_DEPENDENCY = None
):
    """
    Get all phases, optionally filtered by client_id.
    """
    logger.info(f"Fetching phases with client_id: {client_id}")
    phases = get_phase_service(db, client_id)
    return {"phases": phases}


@router.post("/phase/create", response_model=CreatePhaseResponse)
def create_phase(
    request: CreatePhaseRequest,
    db: DB_DEPENDENCY = None
):
    """
    Create a new phase for a client.
    
    Automatically generates phase name based on:
    - Client name from client_id
    - Count of existing phases for that client
    - Format: {client_name}_phase_{count+1}
    
    Args:
        request: CreatePhaseRequest with client_id
        db: Database session
    
    Returns:
        CreatePhaseResponse with created phase id and name
    """
    logger.info(f"Creating new phase for client_id: {request.client_id}")
    
    success, error_msg, phase_data = create_phase_service(db, request.client_id)
    
    if not success:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "message": error_msg
            }
        )
    
    return CreatePhaseResponse(
        success=True,
        id=phase_data['id'],
        name=phase_data['name'],
        message=f"Successfully created phase: {phase_data['name']}"
    )

