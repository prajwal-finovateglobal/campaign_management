"""
Google Chat Notification Service
Sends campaign lifecycle notifications to Google Chat webhook
"""
import os
import httpx
from typing import Optional, List
from datetime import datetime
import loguru
from dotenv import load_dotenv

from service.time_utils import format_ist, format_duration

# Load environment variables from .env file
load_dotenv()

logger = loguru.logger.bind(service="notifications")

WEBHOOK_URL = os.getenv("WEBHOOK_URL", "")
NOTIFICATIONS_ENABLED = bool(WEBHOOK_URL)

# Log initialization status
if NOTIFICATIONS_ENABLED:
    logger.info(f"🔔 Google Chat Notifications: ✅ Enabled (URL: {WEBHOOK_URL[:50]}...)")
else:
    logger.warning("🔔 Google Chat Notifications: ❌ Disabled (WEBHOOK_URL not set in .env)")


async def send_notification(message: str) -> bool:
    """
    Send notification to Google Chat.
    
    Args:
        message: Formatted message to send
    
    Returns:
        Success status
    """
    if not NOTIFICATIONS_ENABLED:
        logger.debug("Google Chat notifications disabled (no WEBHOOK_URL)")
        return False
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                WEBHOOK_URL,
                json={"text": message},
                headers={"Content-Type": "application/json; charset=UTF-8"},
                timeout=10.0
            )
            
            if response.status_code == 200:
                logger.debug(f"✅ Notification sent successfully")
                return True
            else:
                logger.warning(f"Failed to send notification: {response.status_code}")
                return False
                
    except Exception as e:
        logger.error(f"Error sending notification: {e}")
        return False


async def notify_campaign_started(
    campaign_name: str,
    campaign_id: int,
    started_at: datetime,
    total_chunks: Optional[int] = None,
    chunks_left: Optional[int] = None,
    current_chunk_number: Optional[int] = None
) -> bool:
    """
    Notify campaign started.
    
    Args:
        campaign_name: Name of the campaign
        campaign_id: Campaign ID
        started_at: When campaign was started
        total_chunks: Total number of chunks (optional, for multiple-type campaigns)
        chunks_left: Number of chunks left to start (optional, for multiple-type campaigns)
        current_chunk_number: The chunk number being started (optional, for resuming campaigns)
    
    Returns:
        Success status
    """
    message = f"""🚀 Campaign Started

Campaign: {campaign_name}
Status: Started"""
    
    # Add resume information if this is a resumed campaign (total_chunks > chunks_left)
    if total_chunks is not None and chunks_left is not None and total_chunks > chunks_left:
        chunks_completed = total_chunks - chunks_left
        if current_chunk_number is not None:
            message += f"\nStarting with: Chunk #{current_chunk_number}"
        message += f"\nCompleted: {chunks_completed} chunk{'s' if chunks_completed != 1 else ''}"
    
    message += f"\nStarted: {format_ist(started_at)}"
    
    logger.info(f"Sending campaign started notification: {campaign_name}")
    return await send_notification(message)


async def notify_campaign_paused(
    campaign_name: str,
    campaign_id: int,
    paused_at: datetime,
    started_at: Optional[datetime] = None,
    chunks_done: Optional[int] = None,
    chunks_left: Optional[int] = None,
    total_chunks: Optional[int] = None
) -> bool:
    """
    Notify campaign paused/stopped.
    
    Args:
        campaign_name: Name of the campaign
        campaign_id: Campaign ID
        paused_at: When campaign was paused
        started_at: When campaign was started (optional)
        chunks_done: Number of chunks finished or started (in progress) (optional, for multiple-type campaigns)
        chunks_left: Number of chunks that are idle or pending (not yet started) (optional, for multiple-type campaigns)
        total_chunks: Total number of chunks (optional, for multiple-type campaigns)
    
    Returns:
        Success status
    """
    duration = format_duration(started_at, paused_at) if started_at else "Unknown"
    
    message = f"""⏸️ Campaign Paused

Campaign: {campaign_name}
Status: Paused
Duration: {duration}"""
    
    # Add chunk progress if available (for multiple-type campaigns)
    if total_chunks is not None and total_chunks > 0:
        chunks_done_val = chunks_done if chunks_done is not None else 0
        chunks_left_val = chunks_left if chunks_left is not None else 0
        message += f"\nChunks Done (Started+Finished): {chunks_done_val}/{total_chunks}"
        message += f"\nChunks Left (Idle+Pending): {chunks_left_val}"
    
    message += f"\nPaused: {format_ist(paused_at)}"
    
    logger.info(f"Sending campaign paused notification: {campaign_name}")
    return await send_notification(message)


async def notify_campaign_completed(
    campaign_name: str,
    campaign_id: int,
    started_at: Optional[datetime],
    completed_at: datetime
) -> bool:
    """
    Notify campaign completed.
    
    Args:
        campaign_name: Name of the campaign
        campaign_id: Campaign ID
        started_at: When campaign was started
        completed_at: When campaign completed
    
    Returns:
        Success status
    """
    total_time = format_duration(started_at, completed_at) if started_at else "Unknown"
    
    message = f"""✅ Campaign Completed

Campaign: {campaign_name}
Status: Completed
Total Time: {total_time}
Completed: {format_ist(completed_at)}"""
    
    logger.info(f"Sending campaign completed notification: {campaign_name}")
    return await send_notification(message)


async def notify_campaign_deleted(
    campaign_name: str,
    campaign_id: int,
    chunks_count: int,
    total_records: int,
    deleted_at: datetime
) -> bool:
    """
    Notify campaign deleted.
    
    Args:
        campaign_name: Name of the campaign
        campaign_id: Campaign ID
        chunks_count: Number of chunks deleted
        total_records: Number of records deleted
        deleted_at: When campaign was deleted
    
    Returns:
        Success status
    """
    message = f"""🗑️ Campaign Deleted

Campaign: {campaign_name}
Status: Deleted
Chunks: {chunks_count} chunks deleted
Deleted: {format_ist(deleted_at)}"""
    
    logger.info(f"Sending campaign deleted notification: {campaign_name}")
    return await send_notification(message)


async def notify_campaign_error(
    campaign_name: str,
    campaign_id: int,
    operation: str,
    error: str,
    failed_chunks: Optional[List[str]] = None,
    error_at: Optional[datetime] = None,
    action_required: Optional[str] = None
) -> bool:
    """
    Notify campaign error.
    
    Args:
        campaign_name: Name of the campaign
        campaign_id: Campaign ID
        operation: Operation that failed
        error: Error message
        failed_chunks: List of failed chunk names
        error_at: When error occurred
        action_required: Action required message
    
    Returns:
        Success status
    """
    if error_at is None:
        from service.time_utils import now_ist
        error_at = now_ist()
    
    message = f"""❌ Campaign Error

Campaign: {campaign_name}
Operation: {operation}
Error: {error}"""
    
    if failed_chunks and len(failed_chunks) > 0:
        # Limit to first 5 failed chunks to avoid too long message
        chunks_str = ', '.join(failed_chunks[:5])
        if len(failed_chunks) > 5:
            chunks_str += f", ... ({len(failed_chunks) - 5} more)"
        message += f"\nFailed Chunks: {chunks_str}"
    
    message += f"\nTime: {format_ist(error_at)}"
    
    if action_required:
        message += f"\n\n{action_required}"
    
    logger.info(f"Sending campaign error notification: {campaign_name} - {operation}")
    return await send_notification(message)
