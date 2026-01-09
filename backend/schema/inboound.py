from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

class PrefetchIncommingCallsResponse(BaseModel):
    success: bool = Field(description="Whether the request was processed successfully")
    message: str = Field(description="Response message")
    processed_at: str = Field(description="Processing timestamp")
    data: Optional[Dict[str, Any]] = Field(None, description="Response data")
