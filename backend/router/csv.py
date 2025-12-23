from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from service.csv_service import append_to_csv, get_existing_columns, clear_csv, read_csv_data, set_campaign_id, get_unique_campaign_ids, format_phone_numbers, upload_csv_file, cut_ccd, delete_csv_records, update_csv_records
from schema.csv import LoadDataRequest, LoadDataResponse, DeletePCDResponse, GetCSVDataResponse, SetCampaignIdRequest, SetCampaignIdResponse, GetCampaignIdsResponse, FormatPhoneNumbersResponse, UploadCSVResponse, CutCCDRequest, CutCCDResponse, DeleteCSVRecordsRequest, DeleteCSVRecordsResponse, UpdateCSVRecordsRequest, UpdateCSVRecordsResponse, AddCSVRecordsRequest, AddCSVRecordsResponse
from typing import Optional
import loguru

router = APIRouter()
logger = loguru.logger


@router.post("/load_sdtc", response_model=LoadDataResponse)
def load_sdtc(request: LoadDataRequest):
    """
    Load selected data to data.csv file.
    Appends data to existing CSV if columns match, otherwise returns error with expected columns.
    
    Args:
        request: Request containing data to append
    
    Returns:
        Success response with rows added, or error with expected columns
    """
    logger.info(f"Loading {len(request.data)} rows to data.csv")
    
    if not request.data:
        raise HTTPException(
            status_code=400,
            detail="No data provided"
        )
    
    # Get existing columns for error reporting
    existing_columns = get_existing_columns()
    
    # Attempt to append data
    success, error_msg = append_to_csv(request.data)
    
    if not success:
        # Return error with expected columns
        expected_cols = list(existing_columns) if existing_columns else []
        raise HTTPException(
            status_code=400,
            detail={
                "error": error_msg,
                "expected_columns": expected_cols,
                "received_columns": list(request.data[0].keys()) if request.data else []
            }
        )
    
    return LoadDataResponse(
        success=True,
        message=f"Successfully loaded {len(request.data)} rows to data.csv",
        rows_added=len(request.data),
        expected_columns=list(existing_columns) if existing_columns else list(request.data[0].keys())
    )


@router.delete("/delete_pcd", response_model=DeletePCDResponse)
def delete_pcd():
    """
    Delete all data from data.csv file.
    Preserves header structure if CSV had columns.
    Returns message if CSV is already empty.
    
    Returns:
        Success response with deletion status and tone
    """
    logger.info("Deleting all data from data.csv")
    
    try:
        success, message, was_empty = clear_csv()
        
        if not success:
            raise HTTPException(
                status_code=500,
                detail={
                    "error": message,
                    "success": False,
                    "tone": "danger"
                }
            )
        
        # Determine tone based on result
        tone = "neutral" if was_empty else "positive"
        
        return DeletePCDResponse(
            success=True,
            message=message,
            was_empty=was_empty,
            tone=tone
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in delete_pcd: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": f"Unexpected error: {str(e)}",
                "success": False,
                "tone": "danger"
            }
        )


@router.get("/get_csv_data", response_model=GetCSVDataResponse)
def get_csv_data():
    """
    Get all data from data.csv file.
    
    Returns:
        Response with all CSV data
    """
    logger.info("Reading data from data.csv")
    
    success, error_msg, data = read_csv_data()
    
    if not success:
        raise HTTPException(
            status_code=500,
            detail={
                "error": error_msg,
                "success": False
            }
        )
    
    if data is None:
        data = []
    
    return GetCSVDataResponse(
        success=True,
        data=data,
        total_rows=len(data),
        message=f"Successfully retrieved {len(data)} rows from data.csv" if data else "CSV file is empty"
    )


@router.post("/set_campaign_id", response_model=SetCampaignIdResponse)
def set_campaign_id_endpoint(request: SetCampaignIdRequest):
    """
    Set campaign_id for all records in data.csv.
    
    Process:
    1. Checks if data.csv exists and has records
    2. Checks if campaign_id column exists
    3. If column doesn't exist, adds it
    4. Sets campaign_id value to all records
    
    Args:
        request: SetCampaignIdRequest with campaign_id
    
    Returns:
        SetCampaignIdResponse with success status and records updated count
    """
    logger.info(f"Setting campaign_id={request.campaign_id} for all records in data.csv")
    
    success, message, records_updated = set_campaign_id(request.campaign_id)
    
    if not success:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "message": message,
                "records_updated": None
            }
        )
    
    return SetCampaignIdResponse(
        success=True,
        message=message,
        records_updated=records_updated
    )


@router.get("/get_campaign_ids", response_model=GetCampaignIdsResponse)
def get_campaign_ids():
    """
    Get all unique campaign_id values from data.csv.
    
    Returns:
        GetCampaignIdsResponse with list of unique campaign IDs
    """
    logger.info("Getting unique campaign IDs from data.csv")
    
    success, error_msg, campaign_ids = get_unique_campaign_ids()
    
    if not success:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "message": error_msg,
                "campaign_ids": []
            }
        )
    
    if campaign_ids is None:
        campaign_ids = []
    
    return GetCampaignIdsResponse(
        success=True,
        campaign_ids=campaign_ids,
        message=f"Found {len(campaign_ids)} unique campaign IDs" if campaign_ids else "No campaign IDs found in data.csv"
    )


@router.post("/format_phone_numbers", response_model=FormatPhoneNumbersResponse)
def format_phone_numbers_endpoint():
    """
    Format phone numbers in CSV from 10 digits to +91 + 10 digits format.
    
    Process:
    1. Reads all data from data.csv
    2. Finds phone number columns (contact_to, phone, contact_from)
    3. Checks if all numbers already have +91 prefix
    4. If yes, returns message "+91 exists before number"
    5. If no, formats 10-digit numbers to +91 + 10 digits
    6. Writes updated data back to CSV
    
    Returns:
        FormatPhoneNumbersResponse with success status and records updated count
    """
    logger.info("Formatting phone numbers in data.csv")
    
    success, message, records_updated = format_phone_numbers()
    
    if not success:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "message": message,
                "records_updated": None
            }
        )
    
    return FormatPhoneNumbersResponse(
        success=True,
        message=message,
        records_updated=records_updated
    )


@router.post("/upload_csv", response_model=UploadCSVResponse)
async def upload_csv_endpoint(file: UploadFile = File(...)):
    """
    Upload CSV file and rewrite all data in data.csv.
    This completely replaces existing data with the uploaded file content.
    
    WARNING: This will erase all previous campaign data in the CSV file.
    
    Args:
        file: CSV file to upload
    
    Returns:
        UploadCSVResponse with success status, message, and rows written
    """
    logger.info(f"Uploading CSV file: {file.filename}")
    
    # Validate file type
    if not file.filename or not file.filename.endswith('.csv'):
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "message": "Invalid file type. Please upload a CSV file.",
                "rows_written": None
            }
        )
    
    try:
        # Read file content
        file_content = await file.read()
        
        # Upload and rewrite CSV
        success, message, rows_written = upload_csv_file(file_content)
        
        if not success:
            raise HTTPException(
                status_code=400,
                detail={
                    "success": False,
                    "message": message,
                    "rows_written": None
                }
            )
        
        return UploadCSVResponse(
            success=True,
            message=message,
            rows_written=rows_written
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading CSV: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "message": f"Error uploading CSV file: {str(e)}",
                "rows_written": None
            }
        )


@router.post("/cut_ccd", response_model=CutCCDResponse)
def cut_ccd_endpoint(request: CutCCDRequest):
    """
    Delete rows from data.csv that match contact_to or phone values from displayed data.
    
    WARNING: This will permanently delete matching rows from data.csv.
    
    Args:
        request: CutCCDRequest with list of contact_to or phone values
    
    Returns:
        CutCCDResponse with success status, message, rows deleted, and tone
    """
    logger.info(f"Cutting CCD: deleting rows matching {len(request.contact_values)} contact values")
    
    try:
        if not request.contact_values:
            raise HTTPException(
                status_code=400,
                detail={
                    "success": False,
                    "message": "No contact values provided",
                    "rows_deleted": None,
                    "tone": "danger"
                }
            )
        
        success, message, rows_deleted = cut_ccd(request.contact_values)
        
        if not success:
            raise HTTPException(
                status_code=500,
                detail={
                    "success": False,
                    "message": message,
                    "rows_deleted": None,
                    "tone": "danger"
                }
            )
        
        # Determine tone based on result
        if rows_deleted == 0:
            tone = "neutral"
        else:
            tone = "positive"
        
        return CutCCDResponse(
            success=True,
            message=message,
            rows_deleted=rows_deleted,
            tone=tone
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in cut_ccd: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "message": f"Unexpected error: {str(e)}",
                "rows_deleted": None,
                "tone": "danger"
            }
        )


@router.post("/delete_csv_records", response_model=DeleteCSVRecordsResponse)
def delete_csv_records_endpoint(request: DeleteCSVRecordsRequest):
    """
    Delete specific records from data.csv based on identifying fields (phone, contact_to).
    
    WARNING: This will permanently delete matching records from data.csv.
    
    Args:
        request: DeleteCSVRecordsRequest with list of records to delete
    
    Returns:
        DeleteCSVRecordsResponse with success status, message, and rows deleted
    """
    logger.info(f"Deleting {len(request.records)} records from data.csv")
    
    try:
        if not request.records:
            raise HTTPException(
                status_code=400,
                detail={
                    "success": False,
                    "message": "No records provided",
                    "rows_deleted": None
                }
            )
        
        success, message, rows_deleted = delete_csv_records(request.records)
        
        if not success:
            raise HTTPException(
                status_code=500,
                detail={
                    "success": False,
                    "message": message,
                    "rows_deleted": None
                }
            )
        
        return DeleteCSVRecordsResponse(
            success=True,
            message=message,
            rows_deleted=rows_deleted
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in delete_csv_records: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "message": f"Unexpected error: {str(e)}",
                "rows_deleted": None
            }
        )


@router.post("/update_csv_records", response_model=UpdateCSVRecordsResponse)
def update_csv_records_endpoint(request: UpdateCSVRecordsRequest):
    """
    Update specific records in data.csv based on identifying fields (phone, contact_to).
    
    Args:
        request: UpdateCSVRecordsRequest with list of records to update (each with 'original' and 'updated' dicts)
    
    Returns:
        UpdateCSVRecordsResponse with success status, message, and rows updated
    """
    logger.info(f"Updating {len(request.records)} records in data.csv")
    
    try:
        if not request.records:
            raise HTTPException(
                status_code=400,
                detail={
                    "success": False,
                    "message": "No records provided",
                    "rows_updated": None
                }
            )
        
        success, message, rows_updated = update_csv_records(request.records)
        
        if not success:
            raise HTTPException(
                status_code=500,
                detail={
                    "success": False,
                    "message": message,
                    "rows_updated": None
                }
            )
        
        return UpdateCSVRecordsResponse(
            success=True,
            message=message,
            rows_updated=rows_updated
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in update_csv_records: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "message": f"Unexpected error: {str(e)}",
                "rows_updated": None
            }
        )


@router.post("/add_csv_records", response_model=AddCSVRecordsResponse)
def add_csv_records_endpoint(request: AddCSVRecordsRequest):
    """
    Add new records to data.csv.
    
    Args:
        request: AddCSVRecordsRequest with list of new records to add
    
    Returns:
        AddCSVRecordsResponse with success status, message, and rows added
    """
    logger.info(f"Adding {len(request.records)} new records to data.csv")
    
    try:
        if not request.records:
            raise HTTPException(
                status_code=400,
                detail={
                    "success": False,
                    "message": "No records provided",
                    "rows_added": None
                }
            )
        
        success, error_msg = append_to_csv(request.records)
        
        if not success:
            raise HTTPException(
                status_code=400,
                detail={
                    "success": False,
                    "message": error_msg or "Failed to add records",
                    "rows_added": None
                }
            )
        
        return AddCSVRecordsResponse(
            success=True,
            message=f"Successfully added {len(request.records)} new record(s) to CSV.",
            rows_added=len(request.records)
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in add_csv_records: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "message": f"Unexpected error: {str(e)}",
                "rows_added": None
            }
        )


@router.get("/get_csv_preview")
def get_csv_preview(
    limit: int = Query(5, description="Number of records to preview"),
    campaign_id: Optional[int] = Query(None, description="Filter by campaign ID")
):
    """
    Get a preview of records from data.csv.
    Optionally filter by campaign_id and limit the number of records returned.
    
    Args:
        limit: Number of records to return (default: 5)
        campaign_id: Optional campaign ID to filter records
    
    Returns:
        Preview records from data.csv
    """
    logger.info(f"Fetching CSV preview with limit={limit}, campaign_id={campaign_id}")
    
    try:
        import pandas as pd
        from pathlib import Path
        
        # Use the same path pattern as csv_service.py
        csv_path = Path(__file__).parent.parent / "data" / "data.csv"
        
        if not csv_path.exists():
            raise HTTPException(
                status_code=404,
                detail="data.csv file not found"
            )
        
        # Read CSV
        df = pd.read_csv(csv_path)
        
        total_records_in_csv = len(df)
        logger.info(f"Total records in CSV: {total_records_in_csv}")
        
        # Filter by campaign_id if provided
        if campaign_id is not None:
            if 'campaign_id' not in df.columns:
                logger.warning(f"campaign_id column not found in CSV. Available columns: {df.columns.tolist()}")
            else:
                # Convert campaign_id column to int for comparison
                df['campaign_id'] = pd.to_numeric(df['campaign_id'], errors='coerce')
                
                # Log unique campaign_ids in CSV for debugging BEFORE filtering
                unique_ids = df['campaign_id'].dropna().unique().tolist()
                logger.info(f"Unique campaign_ids in CSV: {unique_ids}")
                
                original_count = len(df)
                df = df[df['campaign_id'] == campaign_id]
                filtered_count = len(df)
                logger.info(f"Filtered from {original_count} to {filtered_count} records for campaign_id={campaign_id}")
        
        # Limit records
        df = df.head(limit)
        
        # Replace NaN values with None (for JSON serialization)
        df = df.fillna('')
        
        # Convert to dict
        records = df.to_dict('records')
        
        return {
            "success": True,
            "records": records,
            "total_count": len(records),
            "total_in_csv": total_records_in_csv,
            "campaign_id": campaign_id
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching CSV preview: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching CSV preview: {str(e)}"
        )

