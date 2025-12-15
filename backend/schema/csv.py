from pydantic import BaseModel
from typing import List, Dict, Any, Optional


class LoadDataRequest(BaseModel):
    data: List[Dict[str, Any]]


class LoadDataResponse(BaseModel):
    success: bool
    message: str
    rows_added: int
    expected_columns: Optional[List[str]] = None


class DeletePCDResponse(BaseModel):
    success: bool
    message: str
    was_empty: bool
    tone: str  # "positive", "neutral", or "danger"


class GetCSVDataResponse(BaseModel):
    success: bool
    data: List[Dict[str, Any]]
    total_rows: int
    message: Optional[str] = None


class SetCampaignIdRequest(BaseModel):
    campaign_id: int


class SetCampaignIdResponse(BaseModel):
    success: bool
    message: str
    records_updated: Optional[int] = None


class GetCampaignIdsResponse(BaseModel):
    success: bool
    campaign_ids: List[int]
    message: Optional[str] = None


class FormatPhoneNumbersResponse(BaseModel):
    success: bool
    message: str
    records_updated: Optional[int] = None

class UploadCSVResponse(BaseModel):
    success: bool
    message: str
    rows_written: Optional[int] = None


class CutCCDRequest(BaseModel):
    contact_values: List[str]  # List of contact_to or phone values to delete


class CutCCDResponse(BaseModel):
    success: bool
    message: str
    rows_deleted: Optional[int] = None
    tone: str  # "positive", "neutral", or "danger"

