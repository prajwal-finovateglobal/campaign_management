"""
Time Utility Functions for IST Timezone
Handles datetime formatting and duration calculations
"""
from datetime import datetime
from pytz import timezone
from typing import Optional

IST = timezone('Asia/Kolkata')


def format_ist(dt: datetime) -> str:
    """
    Format datetime to IST string.
    
    Args:
        dt: datetime object (can be naive or aware)
    
    Returns:
        Formatted string: "14-Jan-2026 03:30:45 PM IST"
    """
    if dt is None:
        return ""
    
    if dt.tzinfo is None:
        # Naive datetime, assume UTC
        dt = timezone('UTC').localize(dt)
    
    # Convert to IST
    ist_time = dt.astimezone(IST)
    
    # Format: 14-Jan-2026 03:30:45 PM IST
    return ist_time.strftime('%d-%b-%Y %I:%M:%S %p IST')


def format_duration(start_dt: datetime, end_dt: datetime) -> str:
    """
    Calculate and format duration between two datetimes.
    
    Args:
        start_dt: Start datetime
        end_dt: End datetime
    
    Returns:
        Formatted duration: "2h 15m 30s" or "10m 30s" or "45s"
    """
    if start_dt is None or end_dt is None:
        return "0s"
    
    diff = end_dt - start_dt
    total_seconds = int(diff.total_seconds())
    
    if total_seconds < 0:
        return "0s"
    
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60
    
    if hours > 0:
        return f"{hours}h {minutes}m {seconds}s"
    elif minutes > 0:
        return f"{minutes}m {seconds}s"
    else:
        return f"{seconds}s"


def now_ist() -> datetime:
    """
    Get current datetime in IST.
    
    Returns:
        Current datetime in Asia/Kolkata timezone
    """
    return datetime.now(IST)


def current_ist_str() -> str:
    """
    Get current datetime formatted as IST string.
    
    Returns:
        Current time formatted as IST string
    """
    return format_ist(now_ist())
