from fastapi import APIRouter, HTTPException, UploadFile, File
from service.csv_service import append_to_csv, get_existing_columns, clear_csv, read_csv_data, set_campaign_id, get_unique_campaign_ids, format_phone_numbers, upload_csv_file, cut_ccd
from schema.csv import LoadDataRequest, LoadDataResponse, DeletePCDResponse, GetCSVDataResponse, SetCampaignIdRequest, SetCampaignIdResponse, GetCampaignIdsResponse, FormatPhoneNumbersResponse, UploadCSVResponse, CutCCDRequest, CutCCDResponse
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

