from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Union, List, Dict, Any
class ShowDataRequest(BaseModel):
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    con_status: Optional[bool] = None
    direction: Optional[str] = None
    language: Optional[str] = None
    duration: Optional[float] = None  # Keep for backward compatibility
    duration_min: Optional[float] = None
    duration_max: Optional[float] = None
    client_id: Optional[int] = None
    table_name: Optional[str] = None
    phase_id: Optional[int] = None
    campaign_id: Optional[int] = None  # Keep for backward compatibility (single campaign)
    campaign_ids: Optional[List[int]] = None  # New: support multiple campaigns

class DataLog(BaseModel):
    s_no: Optional[int] = None
    call_start_time: Optional[str] = None  # Converted from call_start_ts
    chat: Optional[Union[dict, list, str]] = None  # Can be dict, list, or string (JSON)
    provider: Optional[str] = None
    contact_to: Optional[str] = None
    contact_from: Optional[str] = None
    direction: Optional[str] = None
    call_id: Optional[str] = None
    agent_id: Optional[str] = None
    duration: Optional[float] = None
    recording: Optional[str] = None
    model: Optional[str] = None
    language: Optional[str] = None
    cost: Optional[float] = None
    meta_data: Optional[Union[dict, list, str]] = None  # Can be dict, list, or string (JSON)

class ShowDataResponse(BaseModel):
    data: List[DataLog]

class UpdateTableNameRequest(BaseModel):
    table_name: str

class UpdateTableNameResponse(BaseModel):
    success: bool
    message: str
    table_name: str

class GetTableNameResponse(BaseModel):
    success: bool
    table_name: str