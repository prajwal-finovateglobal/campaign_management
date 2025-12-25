import os
import requests
from typing import Tuple, Optional
from loguru import logger

# Google Cloud Translate API configuration
# Support both TRANSLATE_API_KEY and GOOGLE_CLOUD_TRANSLATE_API_KEY for flexibility
GOOGLE_CLOUD_TRANSLATE_API_KEY = os.getenv("TRANSLATE_API_KEY", os.getenv("GOOGLE_CLOUD_TRANSLATE_API_KEY", ""))
GOOGLE_CLOUD_TRANSLATE_API_URL = "https://translation.googleapis.com/language/translate/v2"

# Language code mapping
LANGUAGE_CODES = {
    'english': 'en',
    'kannada': 'kn',
    'telugu': 'te',
    'tamil': 'ta',
    'hindi': 'hi',
    'malayalam': 'ml',
    # Also support direct codes
    'en': 'en',
    'kn': 'kn',
    'te': 'te',
    'ta': 'ta',
    'hi': 'hi',
    'ml': 'ml',
}


def translate_text(text: str, target_language: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Translate text using Google Cloud Translate API.
    
    Args:
        text: Text to translate
        target_language: Target language code (e.g., 'en', 'kn', 'te', 'ta', 'hi', 'ml')
    
    Returns:
        Tuple of (success, translated_text, error_message)
    """
    if not GOOGLE_CLOUD_TRANSLATE_API_KEY:
        error_msg = "TRANSLATE_API_KEY or GOOGLE_CLOUD_TRANSLATE_API_KEY not configured in environment variables"
        logger.error(error_msg)
        return False, None, error_msg
    
    if not text or not text.strip():
        error_msg = "Text to translate cannot be empty"
        logger.error(error_msg)
        return False, None, error_msg
    
    # Normalize language code
    target_lang_lower = target_language.lower().strip()
    target_lang_code = LANGUAGE_CODES.get(target_lang_lower)
    
    if not target_lang_code:
        error_msg = f"Unsupported target language: {target_language}. Supported languages: {list(set(LANGUAGE_CODES.keys()) - {'en', 'kn', 'te', 'ta', 'hi', 'ml'})}"
        logger.error(error_msg)
        return False, None, error_msg
    
    try:
        # Google Cloud Translate API v2 request
        params = {
            'key': GOOGLE_CLOUD_TRANSLATE_API_KEY,
            'q': text,
            'target': target_lang_code,
        }
        
        logger.info(f"Translating text to {target_lang_code} using Google Cloud Translate API")
        logger.debug(f"API URL: {GOOGLE_CLOUD_TRANSLATE_API_URL}")
        logger.debug(f"Text length: {len(text)}, First 50 chars: {text[:50] if len(text) > 50 else text}")
        
        response = requests.post(
            GOOGLE_CLOUD_TRANSLATE_API_URL,
            params=params,
            timeout=30
        )
        
        logger.info(f"API Response status: {response.status_code}")
        
        if response.status_code != 200:
            error_msg = f"Google Cloud Translate API returned status {response.status_code}: {response.text}"
            logger.error(error_msg)
            return False, None, error_msg
        
        result = response.json()
        logger.debug(f"API Response data: {result}")
        
        # Extract translated text from response
        if 'data' in result and 'translations' in result['data'] and len(result['data']['translations']) > 0:
            translated_text = result['data']['translations'][0]['translatedText']
            logger.info(f"Successfully translated text to {target_lang_code}")
            logger.debug(f"Translated text (first 50 chars): {translated_text[:50] if len(translated_text) > 50 else translated_text}")
            return True, translated_text, None
        else:
            error_msg = f"Unexpected response format from Google Cloud Translate API: {result}"
            logger.error(error_msg)
            return False, None, error_msg
        
    except requests.exceptions.RequestException as e:
        error_msg = f"Error calling Google Cloud Translate API: {e}"
        logger.error(error_msg)
        return False, None, error_msg
    except Exception as e:
        error_msg = f"Unexpected error in translate_text: {e}"
        logger.error(error_msg)
        return False, None, error_msg

