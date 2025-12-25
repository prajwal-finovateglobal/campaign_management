from pydantic import BaseModel
from typing import Any, Optional


class TranslateRequest(BaseModel):
    text: str
    target_language: str  # Language code: 'en', 'kn', 'te', 'ta', 'hi', 'ml'


class TranslateResponse(BaseModel):
    success: bool
    translated_text: Optional[str] = None
    message: Optional[str] = None

