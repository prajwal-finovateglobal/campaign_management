"""
Centralized logging configuration for the entire application.
Ensures all loggers respect LOG_LEVEL from .env
"""
import sys
from pathlib import Path
from loguru import logger
from Core.config import settings

# Remove default logger
logger.remove()

# Add console handler with LOG_LEVEL from .env
logger.add(
    sys.stderr,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
    level=settings.LOG_LEVEL,
    colorize=True
)

# Add file handler if enabled
if settings.LOG_TO_FILE:
    log_file_path = Path(__file__).parent.parent / settings.LOG_FILE_PATH
    log_file_path.parent.mkdir(parents=True, exist_ok=True)
    
    logger.add(
        str(log_file_path),
        format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} - {message}",
        level=settings.LOG_LEVEL,
        rotation="10 MB",
        retention="10 days",
        compression="zip",
        enqueue=True  # Async file writing
    )

logger.info(f"Logging configured: level={settings.LOG_LEVEL}, file={settings.LOG_TO_FILE}")
