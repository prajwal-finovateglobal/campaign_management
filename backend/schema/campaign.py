from pydantic import BaseModel
from typing import Optional


class CreateCampaignRequest(BaseModel):
    phase_id: int
    phase_name: str
    campaign_type: str = 'single'  # 'single' or 'multiple'
    is_full: bool = True  # True for full upsert (idx=0, size=total), False for partial
    idx: Optional[int] = None  # Starting index in data.csv (0-based), required if is_full=False
    size: Optional[int] = None  # Number of records to upsert, required if is_full=False


class CreateCampaignResponse(BaseModel):
    success: bool
    id: Optional[int] = None
    campaign_name: Optional[str] = None
    cid: Optional[str] = None
    status: Optional[str] = None
    record_count: Optional[int] = None
    phase_id: Optional[int] = None
    type: Optional[str] = None
    idx: Optional[int] = None
    size: Optional[int] = None
    message: Optional[str] = None


class RefreshCampaignStatusResponse(BaseModel):
    success: bool
    id: Optional[int] = None
    campaign_name: Optional[str] = None
    cid: Optional[str] = None
    status: Optional[str] = None
    record_count: Optional[int] = None
    message: Optional[str] = None


class DeleteCampaignResponse(BaseModel):
    success: bool
    message: Optional[str] = None


class UploadRecordsRequest(BaseModel):
    campaign_id: int


class UploadRecordsResponse(BaseModel):
    success: bool
    message: Optional[str] = None
    records_uploaded: Optional[int] = None
    phase_name: Optional[str] = None
    campaign_name: Optional[str] = None


class GetPhonesResponse(BaseModel):
    success: bool
    phones: Optional[list] = None
    message: Optional[str] = None


class GetAgentResponse(BaseModel):
    success: bool
    agent: Optional[dict] = None
    message: Optional[str] = None


class SetCallerRequest(BaseModel):
    campaign_id: int
    phone_id: str


class SetCallerResponse(BaseModel):
    success: bool
    message: Optional[str] = None
    agent_id: Optional[str] = None


class StartCampaignRequest(BaseModel):
    campaign_id: int


class StartCampaignResponse(BaseModel):
    success: bool
    message: Optional[str] = None


class StopCampaignRequest(BaseModel):
    campaign_id: int


class StopCampaignResponse(BaseModel):
    success: bool
    message: Optional[str] = None


class DeleteRecordRequest(BaseModel):
    campaign_id: int
    phone: str


class DeleteRecordResponse(BaseModel):
    success: bool
    message: Optional[str] = None


class UpdateCampaignRangeRequest(BaseModel):
    campaign_id: int
    is_full: bool = True  # True for full upsert (idx=0, size=total), False for partial
    idx: Optional[int] = None  # Starting index in data.csv (0-based), required if is_full=False
    size: Optional[int] = None  # Number of records to upsert, required if is_full=False


class UpdateCampaignRangeResponse(BaseModel):
    success: bool
    message: Optional[str] = None
    idx: Optional[int] = None
    size: Optional[int] = None

