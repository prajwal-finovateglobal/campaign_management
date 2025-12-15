from fastapi import APIRouter, Depends
from database.dependencies import DB_DEPENDENCY
from schema.tables import ShowDataResponse, ShowDataRequest, DataLog
from service.filter_services import filter_data
from pydantic import ValidationError
import loguru


router = APIRouter()
logger = loguru.logger

@router.post("/show_data")
def show_data(request: ShowDataRequest, db: DB_DEPENDENCY)->ShowDataResponse:
    logger.info(f"Showing data with request: {request}")
    result = filter_data(db, request)
    
    print(f"Rows received from filter_data: {len(result)}")
    
    # Convert list of dicts to list of DataLog objects
    # Handle validation errors gracefully to include all valid rows
    data_logs = []
    for idx, record in enumerate(result):
        try:
            data_log = DataLog(**record)
            data_logs.append(data_log)
        except ValidationError as e:
            logger.error(f"Validation error for record {idx}: {e}")
            # Try to create with only valid fields
            try:
                # Remove invalid fields and retry
                valid_record = {k: v for k, v in record.items() if k in DataLog.model_fields}
                data_log = DataLog(**valid_record)
                data_logs.append(data_log)
            except Exception as e2:
                logger.warning(f"Failed to create DataLog for record {idx}: {e2}")
                # Skip this record or include it with minimal data
                continue
    
    print(f"Rows converted to DataLog objects: {len(data_logs)}")
    return ShowDataResponse(data=data_logs)