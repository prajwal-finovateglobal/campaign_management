import pandas as pd
from typing import Optional
import numpy as np
import pytz
from datetime import datetime

def clean_data(data: pd.DataFrame):
    """
    Clean the data.
    """
    # Convert timestamp columns to numeric first (handles string timestamps)
    for col in ['call_start_ts', 'call_end_ts']:
        if col in data.columns:
            # Convert to numeric, coercing errors to NaN
            data[col] = pd.to_numeric(data[col], errors='coerce')

    # Convert the timestamp to India time
    india_tz = pytz.timezone("Asia/Kolkata")

    def convert_timestamp(ts):
        """Convert timestamp to India timezone, handling None/NaN/blank values"""
        if pd.isna(ts) or ts is None:
            return 'Blank'
        try:
            # Ensure it's numeric
            ts = float(ts)
            return datetime.fromtimestamp(ts, tz=pytz.UTC).astimezone(india_tz)
        except (ValueError, TypeError, OSError):
            return 'Blank'

    data['call_start_time'] = data['call_start_ts'].apply(convert_timestamp)
    data['call_end_time'] = data['call_end_ts'].apply(convert_timestamp)
    
    # Replace NaN values with 'blank' for other columns (after timestamp conversion)
    data.replace(to_replace=np.nan, value='blank', inplace=True)
    
    return data
