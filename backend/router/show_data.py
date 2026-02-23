from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from database.dependencies import DB_DEPENDENCY
from schema.tables import ShowDataResponse, ShowDataRequest, ExportDataRequest, DataLog
from service.filter_services import filter_data
from pydantic import ValidationError
import loguru
import json
import csv
import io


router = APIRouter()
logger = loguru.logger

@router.post("/show_data")
def show_data(request: ShowDataRequest, db: DB_DEPENDENCY)->ShowDataResponse:
    logger.info(f"=== SHOW_DATA REQUEST RECEIVED ===")
    logger.info(f"Request object: {request}")
    logger.info(f"campaign_ids from request: {request.campaign_ids} (type: {type(request.campaign_ids)})")
    logger.info(f"campaign_id from request: {request.campaign_id}")
    logger.info(f"phase_id from request: {request.phase_id}")
    logger.info(f"=== END REQUEST LOG ===")
    result, total_count = filter_data(db, request)
    
    print(f"Rows received from filter_data: {len(result)} (total matching: {total_count})")
    
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
                continue
    
    print(f"Rows converted to DataLog objects: {len(data_logs)}")
    return ShowDataResponse(
        data=data_logs,
        total_count=total_count,
        page=request.page,
        page_size=request.page_size,
    )


@router.post("/export_data")
def export_data(request: ExportDataRequest, db: DB_DEPENDENCY):
    """
    Export all records matching the given filters as a CSV or JSON file download.
    Fetches every matching row (no pagination) and streams back the file.
    Column-selection and JSON-stringification of objects happen server-side.
    """
    from schema.tables import ShowDataRequest as SDR

    if not request.selected_columns:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="selected_columns cannot be empty")

    # Build a ShowDataRequest with no pagination to get every matching row
    show_req = SDR(
        start_time=request.start_time,
        end_time=request.end_time,
        con_status=request.con_status,
        direction=request.direction,
        language=request.language,
        duration=request.duration,
        duration_min=request.duration_min,
        duration_max=request.duration_max,
        client_id=request.client_id,
        table_name=request.table_name,
        phase_id=request.phase_id,
        campaign_id=request.campaign_id,
        campaign_ids=request.campaign_ids,
        search_column=request.search_column,
        search_value=request.search_value,
        page=1,
        page_size=10_000_000,
    )

    result_dicts, total_count = filter_data(db, show_req)
    logger.info(f"export_data: exporting {total_count} rows as {request.export_format}")

    cols = request.selected_columns
    safe_filename = request.filename.replace('"', '') or 'campaign_data'

    def serialize_value(v):
        if v is None:
            return ''
        if isinstance(v, (dict, list)):
            return json.dumps(v)
        return v

    if request.export_format == 'json':
        rows = [{col: serialize_value(row.get(col)) for col in cols} for row in result_dicts]
        content = json.dumps(rows, indent=2, ensure_ascii=False)
        return StreamingResponse(
            iter([content]),
            media_type='application/json',
            headers={'Content-Disposition': f'attachment; filename="{safe_filename}.json"'},
        )

    # CSV
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=cols, extrasaction='ignore', lineterminator='\n')
    writer.writeheader()
    for row in result_dicts:
        writer.writerow({col: serialize_value(row.get(col)) for col in cols})

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type='text/csv',
        headers={'Content-Disposition': f'attachment; filename="{safe_filename}.csv"'},
    )