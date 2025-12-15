from fastapi import APIRouter, HTTPException
from database.dependencies import DB_DEPENDENCY
from service.client import get_client_table_name, get_client_service
from schema.client import ClientTableNameResponse
from typing import Optional
import loguru

router = APIRouter()
logger = loguru.logger


@router.get("/client/{client_id}/table-name", response_model=ClientTableNameResponse)
def get_client_table_name_endpoint(client_id: int, db: DB_DEPENDENCY):
    """
    Get the table_name associated with a specific client.
    
    Args:
        client_id: The ID of the client
        db: Database session
    
    Returns:
        ClientTableNameResponse with client_id and table_name
    """
    logger.info(f"Fetching table_name for client_id: {client_id}")
    table_name = get_client_table_name(db, client_id)
    
    if table_name is None:
        raise HTTPException(status_code=404, detail=f"Client with id {client_id} not found")
    
    return ClientTableNameResponse(client_id=client_id, table_name=table_name)


@router.get("/client")
def get_all_clients(db: DB_DEPENDENCY):
    """
    Get all clients with their information including table_name.
    """
    logger.info("Fetching all clients")
    clients = get_client_service(db)
    return {"clients": clients}

