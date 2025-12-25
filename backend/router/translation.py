from fastapi import APIRouter, HTTPException
from service.translation import translate_text
from schema.translation import TranslateRequest, TranslateResponse
import loguru

router = APIRouter()
logger = loguru.logger


@router.post("/translate", response_model=TranslateResponse)
def translate(request: TranslateRequest):
    """
    Translate text to target language using Google Cloud Translate API.
    
    Args:
        request: Request containing text and target language
    
    Returns:
        Success response with translated text, or error message
    """
    logger.info(f"Translation request: target_language={request.target_language}, text_length={len(request.text)}")
    
    success, translated_text, error_msg = translate_text(request.text, request.target_language)
    
    if not success:
        raise HTTPException(
            status_code=400,
            detail=error_msg or "Translation failed"
        )
    
    return TranslateResponse(
        success=True,
        translated_text=translated_text,
        message="Translation successful"
    )

