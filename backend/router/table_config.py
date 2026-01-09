from fastapi import APIRouter, HTTPException
from service.table_config import get_table_name, update_table_name
from schema.tables import UpdateTableNameRequest, UpdateTableNameResponse, GetTableNameResponse
import loguru

router = APIRouter()
logger = loguru.logger


@router.get("/table-name", response_model=GetTableNameResponse)
def get_table_name_endpoint():
    """
    Get the current table_name from db_table.json.
    
    Returns:
        GetTableNameResponse with the current table_name
    """
    logger.info("Getting table_name from db_table.json")
    
    success, error_msg, table_name = get_table_name()
    
    if not success:
        raise HTTPException(
            status_code=404 if "not found" in error_msg.lower() else 500,
            detail=error_msg
        )
    
    return GetTableNameResponse(
        success=True,
        table_name=table_name
    )


@router.put("/table-name", response_model=UpdateTableNameResponse)
def update_table_name_endpoint(request: UpdateTableNameRequest):
    """
    Update the table_name in db_table.json.
    
    Args:
        request: Request containing the new table_name
    
    Returns:
        UpdateTableNameResponse with success status and updated table_name
    """
    logger.info(f"Updating table_name to: {request.table_name}")
    
    success, error_msg, table_name = update_table_name(request.table_name)
    
    if not success:
        raise HTTPException(
            status_code=400 if "cannot be empty" in error_msg.lower() else 500,
            detail=error_msg
        )
    
    return UpdateTableNameResponse(
        success=True,
        message=f"Table name updated successfully to: {table_name}",
        table_name=table_name
    )

