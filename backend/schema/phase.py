from pydantic import BaseModel
from typing import Optional


class CreatePhaseRequest(BaseModel):
    client_id: int


class CreatePhaseResponse(BaseModel):
    success: bool
    id: Optional[int] = None
    name: Optional[str] = None
    message: Optional[str] = None

