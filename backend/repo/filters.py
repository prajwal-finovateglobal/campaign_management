from sqlalchemy.orm import Query
from models.tables import DataLog
from models.client import Campaign
from typing import Optional, Type
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

def filter_by_campaign_id(query: Query, campaign_id: Optional[int]) -> Query:
    """
    Filter query by campaign_id.
    Works with both static DataLog and dynamic models.
    
    Args:
        query: SQLAlchemy Query object (not executed).
        campaign_id: Campaign ID to filter by.
    
    Returns:
        Modified Query object (not executed).
    
    Example:
        query = get_base_query(db)
        query = filter_by_campaign_id(query, campaign_id=1)
        results = query.all()
    """
    if query is None:
        logger.warning("Cannot filter by campaign_id: query is None")
        return query
    
    if campaign_id is not None:
        logger.info(f"Filtering by campaign_id: {campaign_id}")
        model = _get_model_from_query(query)
        return query.filter(model.campaign_id == campaign_id)
    return query

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
            if dt.tzinfo is None:
                # Assume UTC if no timezone info
                dt = pytz.UTC.localize(dt)
            else:
                # Convert to UTC
                dt = dt.astimezone(pytz.UTC)
            
            start_ts = dt.timestamp()
            model = _get_model_from_query(query)
            if model is None:
                logger.warning("Could not extract model from query for start_time filter")
                return query
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
            if dt.tzinfo is None:
                # Assume UTC if no timezone info
                dt = pytz.UTC.localize(dt)
            else:
                # Convert to UTC
                dt = dt.astimezone(pytz.UTC)
            
            end_ts = dt.timestamp()
            model = _get_model_from_query(query)
            if model is None:
                logger.error("Could not extract model from query for end_time filter")
                return query
            
            # Verify the model has the call_start_ts attribute
            if not hasattr(model, 'call_start_ts'):
                logger.error(f"Model {model} does not have call_start_ts attribute")
                return query
            
            logger.debug(f"Using model {model} for end_time filter with timestamp {end_ts}")
            query = query.filter(model.call_start_ts <= end_ts)
        except Exception as e:
            logger.error(f"Error parsing end_time {end_time}: {e}", exc_info=True)
            # Return query even on error to prevent None propagation
            return query
    
    logger.debug(f"filter_by_date_range returning query: {query is not None}")
    return query

def filter_by_connected_status(query: Query, con_status: Optional[bool]) -> Query:
    """
    Filter query by connected status (duration is NOT NULL).
    Works with both static DataLog and dynamic models.
    
    Args:
        query: SQLAlchemy Query object (not executed).
        con_status: Boolean - if True, filter for connected calls (duration is NOT NULL).
    
    Returns:
        Modified Query object (not executed).
    """
    if query is None:
        logger.warning("Cannot filter by connected status: query is None")
        return query
    
    if con_status is True:
        logger.info("Filtering by connected status: True (duration is NOT NULL)")
        # Filter out records where duration is NULL
        model = _get_model_from_query(query)
        if model is None:
            logger.warning  ("Could not extract model from query for connected_status filter")
            return query
        return query.filter(model.duration.isnot(None), model.recording.isnot(None))
    elif con_status is False:
        logger.info("Filtering by connected status: False (duration is NULL)")
        model = _get_model_from_query(query)
        if model is None:
            logger.warning("Could not extract model from query for connected_status filter")
            return query
        return query.filter(model.duration.is_(None), model.recording.is_(None))
    
    # If con_status is None, return query unchanged
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

def filter_by_call_id(query: Query, call_id: Optional[str]) -> Query:
    """
    Filter query by call_id.
    Works with both static DataLog and dynamic models.
    
    Args:
        query: SQLAlchemy Query object (not executed).
        call_id: Call ID to filter by.
    
    Returns:
        Modified Query object (not executed).
    """
    if call_id is not None:
        logger.info(f"Filtering by call_id: {call_id}")
        model = _get_model_from_query(query)
        return query.filter(model.call_id == call_id)
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

