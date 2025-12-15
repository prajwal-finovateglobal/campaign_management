from datetime import datetime
from repo.tables import (
    get_query_with_columns,
    get_query_with_columns_for_client,
    get_query_with_columns_for_table
)
from database.dependencies import DB_DEPENDENCY
from typing import Optional, List, Dict, Any
from repo.filters import (
    filter_by_date_range,
    filter_by_connected_status,
    filter_by_direction,
    filter_by_language,
    filter_by_duration,
    filter_by_phase_id,
    filter_by_campaign_id
)
from schema.tables import ShowDataRequest
import loguru
import pytz

logger = loguru.logger.bind(service="filter_data")

# India timezone for human-readable datetime conversion
INDIA_TZ = pytz.timezone("Asia/Kolkata")


def convert_epoch_to_readable(epoch_ts: Optional[float]) -> Optional[str]:
    """
    Convert epoch timestamp to human-readable datetime string in India timezone.
    
    Args:
        epoch_ts: Epoch timestamp (float) or None
    
    Returns:
        ISO format datetime string in India timezone, or None
    """
    if epoch_ts is None:
        return None
    
    try:
        # Convert epoch to UTC datetime
        dt_utc = datetime.fromtimestamp(epoch_ts, tz=pytz.UTC)
        # Convert to India timezone
        dt_india = dt_utc.astimezone(INDIA_TZ)
        # Return ISO format string
        return dt_india.isoformat()
    except (ValueError, TypeError, OSError) as e:
        logger.warning(f"Error converting epoch {epoch_ts} to datetime: {e}")
        return None


def convert_query_results_to_dicts(results: List, columns: List[str]) -> List[Dict[str, Any]]:
    """
    Convert SQLAlchemy query results (tuples) to list of dictionaries.
    Also converts epoch timestamps to human-readable datetime strings.
    
    Args:
        results: List of tuples from query results
        columns: List of column names in the same order as tuples
    
    Returns:
        List of dictionaries with human-readable datetime fields
    """
    result_list = []
    
    for row in results:
        record = {}
        for idx, col_name in enumerate(columns):
            if idx < len(row):
                value = row[idx]
            else:
                value = None
            
            # Convert epoch timestamp to human-readable datetime (only call_start_ts)
            if col_name == 'call_start_ts':
                # Don't include call_start_ts in response, only call_start_time
                record['call_start_time'] = convert_epoch_to_readable(value)
            else:
                # Handle other value types
                if value is None:
                    record[col_name] = None
                elif isinstance(value, (list, dict)):
                    # Keep JSON fields as-is
                    record[col_name] = value
                else:
                    record[col_name] = value
        
        result_list.append(record)
    
    return result_list


def filter_data(db: DB_DEPENDENCY, request: ShowDataRequest) -> List[Dict[str, Any]]:
    """
    Filter data from DataLog table using query builder pattern.
    All filtering happens at database level - no pandas needed.
    
    Args:
        db: Database session
        request: Filter request with start_time, end_time, con_status, direction, language, duration
    
    Returns:
        List of dictionaries with filtered data, including human-readable datetime fields
    """
    logger.info(f"Filtering data with request: {request}")
    
    # Extract filter parameters
    start_time = request.start_time
    end_time = request.end_time
    con_status = request.con_status
    direction = request.direction
    language = request.language
    duration = request.duration
    duration_min = request.duration_min
    duration_max = request.duration_max
    client_id = request.client_id
    table_name = request.table_name
    phase_id = request.phase_id
    campaign_id = request.campaign_id
    logger.info(f"Start time: {start_time}")
    logger.info(f"End time: {end_time}")
    logger.info(f"Connected status: {con_status}")
    logger.info(f"Direction: {direction}")
    logger.info(f"Language: {language}")
    logger.info(f"Duration: {duration}")
    logger.info(f"Duration min: {duration_min}")
    logger.info(f"Duration max: {duration_max}")
    logger.info(f"Client ID: {client_id}")
    logger.info(f"Table name: {table_name}")
    logger.info(f"Phase ID: {phase_id}")
    logger.info(f"Campaign ID: {campaign_id}")
    
    # Define columns to select
    columns = [
        's_no',
        'call_start_ts',  # Keep for conversion to call_start_time
        'chat',
        'contact_to',
        'contact_from',
        'provider',
        'direction',
        'call_id',
        'agent_id',
        'duration',
        'recording',
        'model',
        'language',
        'cost',
        'meta_data'
    ]
    
    # Add campaign_id to columns if filtering by phase_id (needed for join)
    # Even if campaign_id filter is not set, we need it to join with Campaign table for phase filtering
    if phase_id is not None and 'campaign_id' not in columns:
        columns.append('campaign_id')
        logger.info("Added campaign_id to selected columns for phase_id filtering")
    
    # Build query with selected columns (NOT executed yet)
    # Use client_id or table_name if provided, otherwise use default DataLog table
    if client_id is not None:
        logger.info(f"Using client_id {client_id} to get table")
        query = get_query_with_columns_for_client(db, client_id, columns)
        if query is None:
            logger.warning(f"Could not get query for client_id {client_id}, using default table")
            query = get_query_with_columns(db, columns)
    elif table_name is not None:
        logger.info(f"Using table_name {table_name}")
        query = get_query_with_columns_for_table(db, table_name, columns)
        if query is None:
            logger.warning(f"Could not get query for table_name {table_name}, using default table")
            query = get_query_with_columns(db, columns)
    else:
        logger.info("Using default DataLog table")
        query = get_query_with_columns(db, columns)
    
    # Validate query was created successfully
    if query is None:
        logger.error("Failed to create query object")
        return []
    
    # Stack filters (still NOT executed)
    logger.info(f"=== Starting filter chain ===")
    logger.info(f"Query before date_range filter: {query is not None}")
    query = filter_by_date_range(query, start_time, end_time)
    if query is None:
        logger.error("ERROR: filter_by_date_range returned None!")
        return []
    logger.info(f"Query after date_range filter: {query is not None}")
    
    query = filter_by_connected_status(query, con_status)
    if query is None:
        logger.error("ERROR: filter_by_connected_status returned None!")
        return []
    logger.info(f"Query after connected_status filter: {query is not None}")
    
    query = filter_by_direction(query, direction)
    if query is None:
        logger.error("ERROR: filter_by_direction returned None!")
        return []
    logger.info(f"Query after direction filter: {query is not None}")
    
    query = filter_by_language(query, language)
    if query is None:
        logger.error("ERROR: filter_by_language returned None!")
        return []
    logger.info(f"Query after language filter: {query is not None}")
    
    query = filter_by_duration(query, duration, duration_min, duration_max)
    if query is None:
        logger.error("ERROR: filter_by_duration returned None!")
        return []
    logger.info(f"Query after duration filter: {query is not None}")
    
    # Before phase_id filter, check campaign counts for diagnostics
    if phase_id is not None:
        try:
            from models.client import Campaign
            campaign_count = db.query(Campaign).filter(Campaign.phase_id == phase_id).count()
            logger.info(f"Number of campaigns with phase_id={phase_id}: {campaign_count}")
            if campaign_count == 0:
                logger.warning(f"WARNING: No campaigns found with phase_id={phase_id}. This will result in 0 rows due to INNER JOIN.")
            
            # Also check if there are any records with campaign_ids that match these campaigns
            if client_id is not None:
                from repo.tables import get_datalog_model_for_client
                DataLogModel = get_datalog_model_for_client(db, client_id)
                if DataLogModel:
                    campaign_ids = [c.id for c in db.query(Campaign).filter(Campaign.phase_id == phase_id).all()]
                    if campaign_ids:
                        records_with_campaigns = db.query(DataLogModel).filter(DataLogModel.campaign_id.in_(campaign_ids)).count()
                        logger.info(f"Records in table with campaign_ids matching phase_id={phase_id}: {records_with_campaigns}")
        except Exception as e:
            logger.warning(f"Could not check campaign diagnostics: {e}")
    
    query = filter_by_phase_id(query, phase_id)
    logger.info(f"Query after phase_id filter: {query is not None}")
    
    query = filter_by_campaign_id(query, campaign_id)
    logger.info(f"Query after campaign_id filter: {query is not None}")
    
    # Validate query is still valid after filtering
    if query is None:
        logger.error("Query became None after applying filters")
        return []
    
    # Execute query - this is where database query actually runs
    # Log the SQL query for debugging
    try:
        compiled_query = str(query.statement.compile(compile_kwargs={"literal_binds": False}))
        logger.info(f"Generated SQL query:\n{compiled_query}")
    except Exception as e:
        logger.warning(f"Could not compile query SQL: {e}")
    
    # Check query count before executing
    try:
        count_before = query.count()
        logger.info(f"Query count (before all()): {count_before} rows")
    except Exception as e:
        logger.warning(f"Could not get query count: {e}")
        count_before = None
    
    results = query.all()
    logger.info(f"Query executed: {len(results)} rows returned")
    
    if len(results) == 0:
        logger.warning("=== NO DATA RETURNED ===")
        logger.warning("Possible reasons:")
        logger.warning("1. No data matches all the filters")
        logger.warning("2. The join with Campaign table filtered out all rows (INNER JOIN)")
        logger.warning("3. Date range filters are too restrictive")
        logger.warning("4. Phase filter: No records have campaign_id matching campaigns with phase_id={phase_id}")
        logger.warning("5. Other filters (direction, language, duration) are too restrictive")
        
        # Try to diagnose: check if there's data without filters
        try:
            if client_id is not None:
                from repo.tables import get_base_query_for_client
                base_query = get_base_query_for_client(db, client_id)
                if base_query:
                    base_count = base_query.count()
                    logger.info(f"Total rows in table (no filters): {base_count}")
        except Exception as e:
            logger.warning(f"Could not check base count: {e}")
    
    # Convert results to dictionaries with human-readable datetime
    result_dicts = convert_query_results_to_dicts(results, columns)
    
    logger.info(f"Total rows returned: {len(result_dicts)}")
    return result_dicts
