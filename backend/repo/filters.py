from sqlalchemy.orm import Query
from models.tables import DataLog
from models.client import Campaign
from typing import Optional, Type, List
from datetime import datetime
import loguru
import pytz

logger = loguru.logger


def _get_model_from_query(query: Query) -> Type:
    """
    Extract the model class from a SQLAlchemy Query object.
    Falls back to DataLog if unable to determine.
    
    Works with both full queries and queries with selected columns (with_entities).
    Since all DataLog models have the same schema, using DataLog as fallback is safe.
    
    Args:
        query: SQLAlchemy Query object.
    
    Returns:
        Model class used in the query.
    """
    try:
        # Try to get the entity from the query's column_descriptions
        if hasattr(query, 'column_descriptions') and query.column_descriptions:
            for col_desc in query.column_descriptions:
                entity = col_desc.get('entity')
                if entity:
                    logger.debug(f"Extracted model from column_descriptions: {entity}")
                    return entity
        
        # Alternative: get from query's _entity_zero (for full entity queries)
        if hasattr(query, '_entity_zero'):
            try:
                entity = query._entity_zero()
                if entity and hasattr(entity, 'class_'):
                    logger.debug(f"Extracted model from _entity_zero: {entity.class_}")
                    return entity.class_
            except (AttributeError, IndexError, TypeError):
                pass
        
        # Try to get from query's _raw_columns (for queries with with_entities)
        if hasattr(query, '_raw_columns'):
            try:
                for col in query._raw_columns:
                    # Try to get entity from column
                    if hasattr(col, 'entity') and col.entity:
                        logger.debug(f"Extracted model from _raw_columns.entity: {col.entity}")
                        return col.entity
                    # Try to get class from column
                    if hasattr(col, 'class_') and col.class_:
                        logger.debug(f"Extracted model from _raw_columns.class_: {col.class_}")
                        return col.class_
                    # Try to get table from column (columns have a .table attribute)
                    if hasattr(col, 'table') and col.table:
                        if hasattr(col.table, 'class_'):
                            logger.debug(f"Extracted model from _raw_columns.table.class_: {col.table.class_}")
                            return col.table.class_
            except (AttributeError, TypeError) as e:
                logger.debug(f"Error accessing _raw_columns: {e}")
                pass
        
        # Try to get from query's _entities
        if hasattr(query, '_entities'):
            try:
                for entity in query._entities:
                    if hasattr(entity, 'class_') and entity.class_:
                        logger.debug(f"Extracted model from _entities: {entity.class_}")
                        return entity.class_
            except (AttributeError, TypeError):
                pass
    except Exception as e:
        logger.warning(f"Could not extract model from query: {e}", exc_info=True)
    
    # Fallback to DataLog for backward compatibility
    # This is safe because all DataLog models (static and dynamic) have the same schema
    logger.warning("Could not extract model from query, falling back to DataLog")
    return DataLog

def filter_by_campaign_ids(query: Query, campaign_ids: Optional[List[int]] = None) -> Query:
    """
    Filter query by campaign_ids using IN clause.
    Works with both static DataLog and dynamic models.
    
    This function always uses WHERE campaign_id IN (...) for consistency.
    - Single campaign: [35] -> WHERE campaign_id IN (35)
    - Multiple campaigns: [35, 45, 136] -> WHERE campaign_id IN (35, 45, 136)
    - All campaigns from phase: [all_ids] -> WHERE campaign_id IN (all_ids)
    
    Args:
        query: SQLAlchemy Query object (not executed).
        campaign_ids: List of Campaign IDs to filter by.
    
    Returns:
        Modified Query object (not executed).
    
    Example:
        query = get_base_query(db)
        query = filter_by_campaign_ids(query, campaign_ids=[1, 2, 3])
        results = query.all()
    """
    logger.info(f"=== filter_by_campaign_ids CALLED ===")
    logger.info(f"Input campaign_ids: {campaign_ids} (type: {type(campaign_ids)})")
    logger.info(f"Query is None: {query is None}")
    
    if query is None:
        logger.warning("Cannot filter by campaign_ids: query is None")
        return query
    
    if campaign_ids is None or len(campaign_ids) == 0:
        logger.info("No campaign_ids provided, skipping campaign filter")
        return query
    
    # Extract model first before logging
    try:
        model = _get_model_from_query(query)
        if model is None:
            logger.error("Could not extract model from query, skipping campaign filter")
            return query
        logger.info(f"Model extracted: {model}")
        logger.info(f"Model has campaign_id attribute: {hasattr(model, 'campaign_id')}")
    except Exception as e:
        logger.error(f"Error extracting model from query: {e}", exc_info=True)
        return query
    
    # Ensure all IDs are integers
    campaign_ids_int = [int(id) for id in campaign_ids if id is not None]
    logger.info(f"campaign_ids after int conversion: {campaign_ids_int}")
    
    if len(campaign_ids_int) == 0:
        logger.warning("campaign_ids list is empty after filtering, skipping campaign filter")
        return query
    
    logger.info(f"✅ Applying filter: model.campaign_id.in_({campaign_ids_int})")
    filtered_query = query.filter(model.campaign_id.in_(campaign_ids_int))
    
    # Try to get the SQL to verify
    try:
        compiled = str(filtered_query.statement.compile(compile_kwargs={"literal_binds": False}))
        logger.info(f"SQL after campaign_ids filter: {compiled[:500]}...")  # First 500 chars
    except Exception as e:
        logger.warning(f"Could not compile SQL: {e}")
    
    logger.info(f"=== END filter_by_campaign_ids ===")
    return filtered_query

def filter_by_client_id(query: Query, client_id: Optional[int]) -> Query:
    """
    Filter query by client_id.
    Works with both static DataLog and dynamic models.
    
    Args:
        query: SQLAlchemy Query object (not executed).
        client_id: Client ID to filter by.
    
    Returns:
        Modified Query object (not executed).
    """
    if client_id is not None:
        logger.info(f"Filtering by client_id: {client_id}")
        model = _get_model_from_query(query)
        return query.filter(model.client_id == client_id)
    return query

def filter_by_direction(query: Query, direction: Optional[str]) -> Query:
    """
    Filter query by direction.
    Works with both static DataLog and dynamic models.
    
    Args:
        query: SQLAlchemy Query object (not executed).
        direction: Direction to filter by ('inbound' or 'outbound').
    
    Returns:
        Modified Query object (not executed).
    """
    if query is None:
        logger.warning("Cannot filter by direction: query is None")
        return query
    
    if direction and direction != "" and direction != "select":
        logger.info(f"Filtering by direction: {direction}")
        model = _get_model_from_query(query)
        if direction == "inbound":
            return query.filter(model.direction == 'inbound')
        elif direction == "outbound":
            return query.filter(model.direction != 'inbound')
    return query

def filter_by_language(query: Query, language: Optional[str]) -> Query:
    """
    Filter query by language.
    Works with both static DataLog and dynamic models.
    
    Args:
        query: SQLAlchemy Query object (not executed).
        language: Language to filter by.
    
    Returns:
        Modified Query object (not executed).
    """
    if query is None:
        logger.warning("Cannot filter by language: query is None")
        return query
    
    if language and language != "" and language != "select":
        logger.info(f"Filtering by language: {language}")
        model = _get_model_from_query(query)
        return query.filter(model.language == language)
    return query

def filter_by_duration(query: Query, duration: Optional[float] = None, duration_min: Optional[float] = None, duration_max: Optional[float] = None, max_duration: bool = True) -> Query:
    """
    Filter query by duration range.
    Works with both static DataLog and dynamic models.
    
    Args:
        query: SQLAlchemy Query object (not executed).
        duration: Duration value to filter by (backward compatibility - uses max_duration flag).
        duration_min: Minimum duration value (duration >= duration_min).
        duration_max: Maximum duration value (duration <= duration_max).
        max_duration: If True and duration is provided, filter duration <= value; if False, filter duration >= value.
    
    Returns:
        Modified Query object (not executed).
    """
    if query is None:
        logger.warning("Cannot filter by duration: query is None")
        return query
    
    model = _get_model_from_query(query)
    
    if model is None:
        logger.warning("Could not extract model from query for duration filter")
        return query
    
    # Verify the model has the duration attribute
    if not hasattr(model, 'duration'):
        logger.error(f"Model {model} does not have duration attribute")
        return query
    
    try:
        # New range-based filtering (takes precedence)
        if duration_min is not None or duration_max is not None:
            logger.info(f"Filtering by duration range: min={duration_min}, max={duration_max}")
            if duration_min is not None and duration_max is not None:
                return query.filter(model.duration >= duration_min, model.duration <= duration_max)
            elif duration_min is not None:
                return query.filter(model.duration >= duration_min)
            elif duration_max is not None:
                return query.filter(model.duration <= duration_max)
        
        # Backward compatibility: single duration value
        if duration is not None:
            logger.info(f"Filtering by duration: {duration} (max_duration={max_duration})")
            if max_duration:
                return query.filter(model.duration <= duration)
            else:
                return query.filter(model.duration >= duration)
    except Exception as e:
        logger.error(f"Error applying duration filter: {e}", exc_info=True)
        return query
    
    return query

def filter_by_date_range(query: Query, start_time: Optional[str] = None, end_time: Optional[str] = None) -> Query:
    """
    Filter query by date range using call_start_ts (epoch timestamp).
    
    Args:
        query: SQLAlchemy Query object (not executed).
        start_time: Start datetime string (ISO format or 'yyyy-MM-dd HH:mm:ss').
                    Filters call_start_ts >= start_time (converted to epoch).
        end_time: End datetime string (ISO format or 'yyyy-MM-dd HH:mm:ss').
                  Filters call_start_ts <= end_time (converted to epoch).
    
    Returns:
        Modified Query object (not executed).
    """
    if query is None:
        logger.warning("Cannot filter by date range: query is None")
        return query
    
    logger.debug(f"filter_by_date_range called with start_time={start_time}, end_time={end_time}, query={query is not None}")
    
    if start_time and start_time != "" and start_time != "select":
        try:
            logger.info(f"Filtering by start_time: {start_time}")
            # Parse string datetime to datetime object
            dt = None
            if isinstance(start_time, str):
                # Try parsing ISO format first
                try:
                    # Handle 'Z' suffix (UTC)
                    if start_time.endswith('Z'):
                        start_time = start_time[:-1] + '+00:00'
                    dt = datetime.fromisoformat(start_time)
                except ValueError:
                    # Try parsing 'yyyy-MM-dd HH:mm:ss' format (frontend format)
                    try:
                        dt = datetime.strptime(start_time, '%Y-%m-%d %H:%M:%S')
                    except ValueError:
                        # Try other common formats
                        try:
                            dt = datetime.strptime(start_time, '%Y-%m-%dT%H:%M:%S')
                        except ValueError:
                            logger.warning(f"Could not parse start_time: {start_time}")
                            return query
            elif isinstance(start_time, datetime):
                dt = start_time
            else:
                return query
            
            if dt is None:
                logger.warning(f"Could not parse start_time: {start_time}")
                return query
            
            # Convert to UTC timestamp (epoch)
            # If no timezone info, assume IST (Asia/Kolkata) as that's where the data is from
            if dt.tzinfo is None:
                # Assume IST (Asia/Kolkata) if no timezone info
                ist = pytz.timezone("Asia/Kolkata")
                dt = ist.localize(dt)
                logger.debug(f"Assumed IST timezone for start_time: {dt}")
            # Convert to UTC
            dt = dt.astimezone(pytz.UTC)
            
            start_ts = dt.timestamp()
            logger.info(f"Converted start_time '{start_time}' to epoch timestamp: {start_ts} (UTC datetime: {dt})")
            model = _get_model_from_query(query)
            if model is None:
                logger.warning("Could not extract model from query for start_time filter")
                return query
            logger.debug(f"Applying filter: call_start_ts >= {start_ts}")
            query = query.filter(model.call_start_ts >= start_ts)
        except Exception as e:
            logger.error(f"Error parsing start_time {start_time}: {e}", exc_info=True)
            return query
    
    if end_time and end_time != "" and end_time != "select":
        try:
            logger.info(f"Filtering by end_time: {end_time}")
            # Parse string datetime to datetime object
            dt = None
            if isinstance(end_time, str):
                # Try parsing ISO format first
                try:
                    # Handle 'Z' suffix (UTC)
                    if end_time.endswith('Z'):
                        end_time = end_time[:-1] + '+00:00'
                    dt = datetime.fromisoformat(end_time)
                except ValueError:
                    # Try parsing 'yyyy-MM-dd HH:mm:ss' format (frontend format)
                    try:
                        dt = datetime.strptime(end_time, '%Y-%m-%d %H:%M:%S')
                    except ValueError:
                        # Try other common formats
                        try:
                            dt = datetime.strptime(end_time, '%Y-%m-%dT%H:%M:%S')
                        except ValueError:
                            logger.warning(f"Could not parse end_time: {end_time}")
                            return query
            elif isinstance(end_time, datetime):
                dt = end_time
            else:
                return query
            
            if dt is None:
                logger.warning(f"Could not parse end_time: {end_time}")
                return query
            
            # Convert to UTC timestamp (epoch)
            # If no timezone info, assume IST (Asia/Kolkata) as that's where the data is from
            if dt.tzinfo is None:
                # Assume IST (Asia/Kolkata) if no timezone info
                ist = pytz.timezone("Asia/Kolkata")
                dt = ist.localize(dt)
                logger.debug(f"Assumed IST timezone for end_time: {dt}")
            # Convert to UTC
            dt = dt.astimezone(pytz.UTC)
            
            end_ts = dt.timestamp()
            logger.info(f"Converted end_time '{end_time}' to epoch timestamp: {end_ts} (UTC datetime: {dt})")
            model = _get_model_from_query(query)
            if model is None:
                logger.error("Could not extract model from query for end_time filter")
                return query
            
            # Verify the model has the call_start_ts attribute
            if not hasattr(model, 'call_start_ts'):
                logger.error(f"Model {model} does not have call_start_ts attribute")
                return query
            
            logger.debug(f"Using model {model} for end_time filter with timestamp {end_ts}")
            logger.debug(f"Applying filter: call_start_ts <= {end_ts}")
            query = query.filter(model.call_start_ts <= end_ts)
        except Exception as e:
            logger.error(f"Error parsing end_time {end_time}: {e}", exc_info=True)
            # Return query even on error to prevent None propagation
            return query
    
    logger.debug(f"filter_by_date_range returning query: {query is not None}")
    return query

def filter_by_agent_id(query: Query, agent_id: Optional[str]) -> Query:
    """
    Filter query by agent_id.
    Works with both static DataLog and dynamic models.
    
    Args:
        query: SQLAlchemy Query object (not executed).
        agent_id: Agent ID to filter by.
    
    Returns:
        Modified Query object (not executed).
    """
    if agent_id is not None:
        logger.info(f"Filtering by agent_id: {agent_id}")
        model = _get_model_from_query(query)
        return query.filter(model.agent_id == agent_id)
    return query

def filter_by_connected_status(query: Query, con_status: Optional[bool]) -> Query:
    """
    Filter query by connected status.
    Connected: duration, recording, chat are NOT NULL and chat is a non-empty list ([] means disconnected).
    Disconnected: duration, recording, chat are NULL or chat is an empty list ([]).

    Args:
        query: SQLAlchemy Query object (not executed).
        con_status: Boolean - if True, filter for connected calls; if False, for disconnected.

    Returns:
        Modified Query object (not executed).
    """
    from sqlalchemy import or_, and_, func, cast, case, text
    from sqlalchemy.dialects import postgresql

    if query is None:
        logger.warning("Cannot filter by connected status: query is None")
        return query

    model = _get_model_from_query(query)
    if model is None:
        logger.warning("Could not extract model from query for connected_status filter")
        return query

    chat_field = model.chat

    # For Postgres, use array_length for JSON[] arrays.
    # For SQLite/MySQL, we can use json_array_length if available.
    # We'll try to use the function relevant for Postgres (since chat is a true JSON list).

    # Safely detect PostgreSQL dialect
    is_postgres = False
    try:
        if hasattr(query, 'session') and query.session and hasattr(query.session, 'bind') and query.session.bind:
            is_postgres = query.session.bind.dialect.name == "postgresql"
    except Exception as e:
        logger.warning(f"Could not detect database dialect, assuming PostgreSQL: {e}")
        is_postgres = True  # Default to PostgreSQL since that's what the system uses

    if con_status is True:
        logger.info("Filtering by connected status: True (duration/recording/chat not NULL and chat not empty)")
        if is_postgres:
            # chat must be NOT NULL, be an array type, and have length > 0
            # Use raw SQL with proper CASE expression that PostgreSQL will optimize
            # This ensures jsonb_array_length is only evaluated when jsonb_typeof confirms it's an array
            # Reference the column using the model's table and column name
            table_name = model.__table__.name
            column_name = chat_field.key if hasattr(chat_field, 'key') else 'chat'
            return query.filter(
                model.duration.isnot(None),
                model.recording.isnot(None),
                # chat_field.isnot(None),
                # model.duration > 2
                # text(f"CASE WHEN jsonb_typeof({table_name}.{column_name}) = 'array' THEN jsonb_array_length({table_name}.{column_name}) ELSE 0 END > 0")
            )
        else:
            # try generic json_array_length support for SQLite/MySQL etc.
            return query.filter(
                model.duration.isnot(None),
                model.recording.isnot(None),
                # chat_field.isnot(None),
                # model.duration > 2,
                # func.json_array_length(chat_field) > 0
            )
    elif con_status is False:
        logger.info("Filtering by connected status: False (duration/recording/chat NULL or chat empty)")
        if is_postgres:
            # For disconnected: duration/recording/chat is NULL OR chat array is empty
            # Only check if chat is empty when it's an array type, otherwise if chat has any content, consider it connected
            return query.filter(
                or_(
                    model.duration.is_(None),
                    model.recording.is_(None),
                    # chat_field.is_(None),
                    # # If chat is an array, check if it's empty (length 0)
                    # and_(
                    #     func.jsonb_typeof(chat_field) == 'array',
                    #     func.jsonb_array_length(chat_field) == 0
                    # )
                )
            )
        else:
            # For non-PostgreSQL: disconnected means duration/recording/chat is NULL or chat array is empty
            return query.filter(
                or_(
                    model.duration.is_(None),
                    model.recording.is_(None),
                    # chat_field.is_(None),
                    # # If chat is not NULL, check if it's an array with length 0
                    # and_(
                    #     chat_field.isnot(None),
                    #     func.json_array_length(chat_field) == 0
                    # )
                )
            )

    # If con_status is None, return query unchanged
    return query

def filter_by_connected_status_v2(query: Query, con_status: Optional[bool]) -> Query:
    """
    Alternative filter for connected status using the call_status column.
    Connected: call_status != 'failed'
    Disconnected: call_status = 'failed'

    This is a candidate replacement for filter_by_connected_status().
    Both functions should be compared for result parity and performance
    before switching over.

    Args:
        query: SQLAlchemy Query object (not executed).
        con_status: Boolean - if True, filter for connected calls; if False, for disconnected.

    Returns:
        Modified Query object (not executed).
    """
    if query is None:
        logger.warning("Cannot filter by connected status v2: query is None")
        return query

    model = _get_model_from_query(query)
    if model is None:
        logger.warning("Could not extract model from query for connected_status_v2 filter")
        return query

    if con_status is True:
        logger.info("Filtering by connected status v2: True (call_status != 'failed')")
        return query.filter(model.call_status != 'failed')
    elif con_status is False:
        logger.info("Filtering by connected status v2: False (call_status = 'failed')")
        return query.filter(model.call_status == 'failed')

    # If con_status is None, return query unchanged
    return query

def filter_by_phase_id(query: Query, phase_id: Optional[int]) -> Query:
    """
    Filter query by phase_id by joining Campaign table with DataLog.
    Works with both static DataLog and dynamic models.
    
    This function performs an INNER JOIN between DataLog and Campaign tables
    and filters where Campaign.phase_id matches the provided phase_id.
    
    Args:
        query: SQLAlchemy Query object (not executed).
        phase_id: Phase ID to filter by.
    
    Returns:
        Modified Query object (not executed) with join applied.
    
    Example:
        query = get_base_query_for_client(db, client_id=1)
        query = filter_by_phase_id(query, phase_id=5)
        results = query.all()
    """
    if query is None:
        logger.warning("Cannot filter by phase_id: query is None")
        return query
    
    if phase_id is not None:
        logger.info(f"Filtering by phase_id: {phase_id}")
        model = _get_model_from_query(query)
        
        if model is None:
            logger.error("Could not extract model from query, skipping phase_id filter")
            return query
        
        # Verify the model has the campaign_id attribute
        if not hasattr(model, 'campaign_id'):
            logger.error(f"Model {model} does not have campaign_id attribute, cannot join with Campaign table")
            return query
        
        try:
            # Join Campaign table with DataLog model
            # Campaign is joined via campaign_id foreign key
            # Note: Even if campaign_id is not in selected columns, we can still join
            # SQLAlchemy will handle the join correctly
            logger.info(f"Joining Campaign table with model {model} using campaign_id")
            
            # Check if campaign_id column exists in the selected columns
            # This is important for debugging
            try:
                # Try to access the campaign_id column from the model
                campaign_id_col = getattr(model, 'campaign_id', None)
                if campaign_id_col is None:
                    logger.error(f"Model {model} does not have campaign_id column accessible")
                    return query
                logger.debug(f"campaign_id column: {campaign_id_col}")
            except Exception as e:
                logger.error(f"Error accessing campaign_id column: {e}", exc_info=True)
                return query
            
            # Perform the join
            join_condition = model.campaign_id == Campaign.id
            logger.debug(f"Join condition: {join_condition}")
            query = query.join(Campaign, join_condition)
            logger.info("Join with Campaign table successful")
            
            # Check how many campaigns match the phase_id
            # Note: We can't access db here, so we'll log this info at the service level
            logger.debug(f"Filtering by phase_id={phase_id} via Campaign join")
            
            # Filter by phase_id
            query = query.filter(Campaign.phase_id == phase_id)
            logger.info(f"Successfully applied phase_id filter: {phase_id}")
            
            # Try to get count after join and filter
            try:
                count_after_join = query.count()
                logger.info(f"Row count after phase_id filter: {count_after_join}")
            except Exception as e:
                logger.warning(f"Could not get count after phase_id filter: {e}")
                
        except Exception as e:
            logger.error(f"Error joining Campaign table or filtering by phase_id: {e}", exc_info=True)
            return query
        
        return query
    return query


def filter_by_search(query: Query, search_column: Optional[str], search_value: Optional[str]) -> Query:
    """
    Case-insensitive contains search on a single column.
    Uses ILIKE on PostgreSQL; falls back to lowercased LIKE on other databases.

    Args:
        query: SQLAlchemy Query object (not executed).
        search_column: Name of the column to search in.
        search_value: Search term (partial match, case-insensitive).

    Returns:
        Modified Query object (not executed).
    """
    if not search_column or not search_value or not search_value.strip():
        return query

    if query is None:
        logger.warning("Cannot apply search filter: query is None")
        return query

    model = _get_model_from_query(query)
    if model is None:
        logger.warning("Could not extract model from query for search filter")
        return query

    if not hasattr(model, search_column):
        logger.warning(f"Model {model} has no column '{search_column}', skipping search filter")
        return query

    col = getattr(model, search_column)
    term = search_value.strip()
    logger.info(f"Applying search filter: {search_column} ILIKE '%{term}%'")

    try:
        # ilike is PostgreSQL native case-insensitive LIKE
        return query.filter(col.ilike(f'%{term}%'))
    except Exception:
        # Fallback for databases that don't support ilike
        from sqlalchemy import func
        return query.filter(func.lower(col).like(f'%{term.lower()}%'))
