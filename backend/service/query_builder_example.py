"""
Example demonstrating the query builder pattern.

This shows how to:
1. Create a base query
2. Pass queries between functions
3. Stack filters incrementally
4. Execute only when all filtering is done
"""

from datetime import datetime
from sqlalchemy.orm import Query
from database.dependencies import DB_DEPENDENCY
from repo.tables import get_base_query, get_query_with_columns
from repo.filters import (
    filter_by_campaign_id,
    filter_by_client_id,
    filter_by_direction,
    filter_by_language,
    filter_by_duration,
    filter_by_date_range,
    filter_by_connected_status,
    filter_by_agent_id
)
from typing import Optional
import loguru

logger = loguru.logger.bind(service="query_builder_example")


def build_campaign_query(db: DB_DEPENDENCY, campaign_id: Optional[int]) -> Query:
    """
    Example: Build a query filtered by campaign_id.
    This query can be passed to other functions for further filtering.
    
    Args:
        db: Database session
        campaign_id: Campaign ID to filter by
    
    Returns:
        Query object (NOT executed)
    """
    # Start with base query
    query = get_base_query(db)
    
    # Apply campaign filter
    query = filter_by_campaign_id(query, campaign_id)
    
    # Return query (NOT executed yet)
    return query


def add_direction_filter(query: Query, direction: Optional[str]) -> Query:
    """
    Example: Add direction filter to an existing query.
    This function receives a query and returns a modified query.
    
    Args:
        query: Existing query object
        direction: Direction to filter by
    
    Returns:
        Modified Query object (NOT executed)
    """
    return filter_by_direction(query, direction)


def build_complex_query(
    db: DB_DEPENDENCY,
    campaign_id: Optional[int] = None,
    client_id: Optional[int] = None,
    direction: Optional[str] = None,
    language: Optional[str] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None
) -> Query:
    """
    Example: Build a complex query with multiple filters.
    All filters are stacked, but query is NOT executed.
    
    Args:
        db: Database session
        campaign_id: Optional campaign filter
        client_id: Optional client filter
        direction: Optional direction filter
        language: Optional language filter
        start_time: Optional start time filter
        end_time: Optional end time filter
    
    Returns:
        Query object with all filters applied (NOT executed)
    
    Usage:
        query = build_complex_query(db, campaign_id=1, direction='inbound')
        results = query.all()  # Execute here
    """
    # Start with base query
    query = get_base_query(db)
    
    # Stack filters one by one
    query = filter_by_campaign_id(query, campaign_id)
    query = filter_by_client_id(query, client_id)
    query = filter_by_direction(query, direction)
    query = filter_by_language(query, language)
    query = filter_by_date_range(query, start_time, end_time)
    
    # Return query (NOT executed)
    return query


def execute_query_example(db: DB_DEPENDENCY):
    """
    Example: Complete workflow showing query building and execution.
    """
    # Step 1: Build query in one function
    query = build_campaign_query(db, campaign_id=1)
    
    # Step 2: Add more filters in another function
    query = add_direction_filter(query, direction='inbound')
    
    # Step 3: Add more filters directly
    query = filter_by_language(query, language='en')
    
    # Step 4: Execute only when all filtering is done
    results = query.all()  # <-- Query executes HERE
    
    logger.info(f"Retrieved {len(results)} records")
    return results


def pass_query_between_classes_example(db: DB_DEPENDENCY):
    """
    Example: How queries can be passed between classes/functions.
    """
    class CampaignService:
        def get_campaign_query(self, db: DB_DEPENDENCY, campaign_id: int) -> Query:
            """Returns a query filtered by campaign (NOT executed)"""
            query = get_base_query(db)
            return filter_by_campaign_id(query, campaign_id)
    
    class FilterService:
        def add_filters(self, query: Query, direction: str, language: str) -> Query:
            """Adds filters to existing query (NOT executed)"""
            query = filter_by_direction(query, direction)
            query = filter_by_language(query, language)
            return query
    
    class DataService:
        def execute(self, query: Query):
            """Executes the query"""
            return query.all()
    
    # Usage:
    campaign_service = CampaignService()
    filter_service = FilterService()
    data_service = DataService()
    
    # Build query in one class
    query = campaign_service.get_campaign_query(db, campaign_id=1)
    
    # Add filters in another class
    query = filter_service.add_filters(query, direction='inbound', language='en')
    
    # Execute in another class
    results = data_service.execute(query)
    
    return results


def query_with_specific_columns_example(db: DB_DEPENDENCY):
    """
    Example: Using query builder with specific columns.
    """
    columns = ['id', 'direction', 'duration', 'language', 'campaign_id']
    
    # Start with query that selects specific columns
    query = get_query_with_columns(db, columns)
    
    # Add filters
    query = filter_by_campaign_id(query, campaign_id=1)
    query = filter_by_direction(query, direction='inbound')
    
    # Execute - returns tuples (not full objects)
    results = query.all()
    
    return results


def conditional_filtering_example(db: DB_DEPENDENCY, campaign_id: Optional[int], use_direction: bool):
    """
    Example: Conditional filtering based on business logic.
    """
    query = get_base_query(db)
    
    # Always filter by campaign if provided
    if campaign_id:
        query = filter_by_campaign_id(query, campaign_id)
    
    # Conditionally add direction filter
    if use_direction:
        query = filter_by_direction(query, direction='inbound')
    
    # Execute
    return query.all()

