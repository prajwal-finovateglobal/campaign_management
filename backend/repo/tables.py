# Import models in correct order to ensure SQLAlchemy can resolve relationships
# Import tables.py first to create DataLog, then import client models
from models.tables import DataLog, create_datalog_model
from models.client import Client, Phase, Campaign  # Import all models for relationship resolution
from database.dependencies import DB_DEPENDENCY
from sqlalchemy.orm import Query
from typing import List, Optional, Type
import loguru

logger = loguru.logger

def get_datalog(db: DB_DEPENDENCY):
    """
    Get all data from DataLog table (executes immediately).
    
    Args:
        db: The database session.
    
    Returns:
        List of DataLog objects.
    """
    logger.info("Getting all data from DataLog table")
    try:
        return db.query(DataLog).all()
    except Exception as e:
        logger.error(f"Error getting all data from DataLog table: {e}")
        return []

def get_client(db: DB_DEPENDENCY, client_id: Optional[int] = None):
    """
    Get all data from Client table (executes immediately).
    
    Args:
        db: The database session.
    """
    logger.info("Getting all data from Client table")
    result = db.query(Client)
    if client_id is not None:
        result = result.filter(Client.id == client_id)
    return result.all()

def get_campaign(db: DB_DEPENDENCY, campaign_id: Optional[int] = None, phase_id: Optional[int] = None):
    """
    Get all data from Campaign table (executes immediately).
    
    Args:
        db: The database session.
        campaign_id: Optional campaign ID to filter by.
        phase_id: Optional phase ID to filter by.
    """
    logger.info("Getting all data from Campaign table")
    result = db.query(Campaign)
    if campaign_id is not None:
        result = result.filter(Campaign.id == campaign_id)
    if phase_id is not None:
        result = result.filter(Campaign.phase_id == phase_id)
    return result.all()

def get_base_query(db: DB_DEPENDENCY) -> Query:
    """
    Get a base query object for DataLog table (NOT executed).
    This query can be passed to other functions for filtering.
    
    Args:
        db: The database session.
    
    Returns:
        SQLAlchemy Query object (not executed).
    
    Example:
        query = get_base_query(db)
        query = filter_by_campaign_id(query, campaign_id=1)
        results = query.all()  # Execute only here
    """
    logger.info("Creating base query for DataLog table")
    return db.query(DataLog)

def get_query_with_columns(db: DB_DEPENDENCY, columns: List[str]) -> Query:
    """
    Get a query object with specific columns selected (NOT executed).
    This query can be passed to other functions for filtering.
    
    Args:
        db: The database session.
        columns: List of DataLog attribute names to select.
    
    Returns:
        SQLAlchemy Query object with selected columns (not executed).
    
    Example:
        query = get_query_with_columns(db, ['id', 'direction', 'duration'])
        query = filter_by_campaign_id(query, campaign_id=1)
        results = query.all()  # Execute only here
    """
    # Build a list of column objects from attribute names
    column_objs = [getattr(DataLog, col) for col in columns]
    logger.info(f"Creating query with specific columns: {columns}")
    return db.query(DataLog).with_entities(*column_objs)

def get_specific_columns(db: DB_DEPENDENCY, columns):
    """
    Fetch specific columns from DataLog table (executes immediately).
    DEPRECATED: Use get_query_with_columns() for query builder pattern.

    Args:
        db: The database session.
        columns: List of DataLog attribute names to select.

    Returns:
        List of tuples with requested column values.
    """
    # Build a list of column objects from attribute names
    column_objs = [getattr(DataLog, col) for col in columns]
    logger.info(f"Getting specific columns from DataLog table: {columns}")
    try:
        return db.query(DataLog).with_entities(*column_objs).all()
    except Exception as e:
        logger.error(f"Error getting specific columns from DataLog table: {e}")
        return []


# ============================================================================
# Dynamic Model Functions - For multi-table support
# ============================================================================

def get_datalog_model_for_client(db: DB_DEPENDENCY, client_id: int) -> Optional[Type]:
    """
    Get the DataLog model class for a specific client.
    Looks up the table_name from Client table and returns the appropriate model.
    
    Args:
        db: The database session.
        client_id: Client ID to look up.
    
    Returns:
        DataLog model class for the client's table, or None if client not found.
    
    Example:
        DataLogModel = get_datalog_model_for_client(db, client_id=1)
        if DataLogModel:
            results = db.query(DataLogModel).all()
    """
    logger.info(f"Getting DataLog model for client_id: {client_id}")
    try:
        client = db.query(Client).filter(Client.id == client_id).first()
        if not client:
            logger.warning(f"Client with id {client_id} not found")
            return None
        
        table_name = client.table_name
        logger.info(f"Found table_name '{table_name}' for client_id {client_id}")
        return create_datalog_model(table_name)
    except Exception as e:
        logger.error(f"Error getting DataLog model for client_id {client_id}: {e}")
        return None


def get_datalog_model_for_table(table_name: str) -> Type:
    """
    Get the DataLog model class for a specific table name.
    
    Args:
        table_name: Name of the database table.
    
    Returns:
        DataLog model class for the specified table.
    
    Example:
        DataLogModel = get_datalog_model_for_table("client1_table")
        results = db.query(DataLogModel).all()
    """
    logger.info(f"Getting DataLog model for table: {table_name}")
    return create_datalog_model(table_name)


def get_datalog_by_client(db: DB_DEPENDENCY, client_id: int):
    """
    Get all data from DataLog table for a specific client (executes immediately).
    Automatically resolves the table name from Client table.
    
    Args:
        db: The database session.
        client_id: Client ID to query data for.
    
    Returns:
        List of DataLog objects from the client's table.
    """
    logger.info(f"Getting all data from DataLog table for client_id: {client_id}")
    try:
        DataLogModel = get_datalog_model_for_client(db, client_id)
        if not DataLogModel:
            return []
        return db.query(DataLogModel).all()
    except Exception as e:
        logger.error(f"Error getting data from DataLog table for client_id {client_id}: {e}")
        return []


def get_datalog_by_table(db: DB_DEPENDENCY, table_name: str):
    """
    Get all data from DataLog table for a specific table name (executes immediately).
    
    Args:
        db: The database session.
        table_name: Name of the database table.
    
    Returns:
        List of DataLog objects from the specified table.
    """
    logger.info(f"Getting all data from DataLog table: {table_name}")
    try:
        DataLogModel = get_datalog_model_for_table(table_name)
        return db.query(DataLogModel).all()
    except Exception as e:
        logger.error(f"Error getting data from DataLog table {table_name}: {e}")
        return []


def get_base_query_for_client(db: DB_DEPENDENCY, client_id: int) -> Optional[Query]:
    """
    Get a base query object for DataLog table for a specific client (NOT executed).
    This query can be passed to other functions for filtering.
    
    Args:
        db: The database session.
        client_id: Client ID to get query for.
    
    Returns:
        SQLAlchemy Query object (not executed), or None if client not found.
    
    Example:
        query = get_base_query_for_client(db, client_id=1)
        if query:
            query = filter_by_campaign_id(query, campaign_id=1)
            results = query.all()
    """
    logger.info(f"Creating base query for DataLog table for client_id: {client_id}")
    DataLogModel = get_datalog_model_for_client(db, client_id)
    if not DataLogModel:
        return None
    return db.query(DataLogModel)


def get_base_query_for_table(db: DB_DEPENDENCY, table_name: str) -> Query:
    """
    Get a base query object for DataLog table for a specific table name (NOT executed).
    This query can be passed to other functions for filtering.
    
    Args:
        db: The database session.
        table_name: Name of the database table.
    
    Returns:
        SQLAlchemy Query object (not executed).
    
    Example:
        query = get_base_query_for_table(db, "client1_table")
        query = filter_by_campaign_id(query, campaign_id=1)
        results = query.all()
    """
    logger.info(f"Creating base query for DataLog table: {table_name}")
    DataLogModel = get_datalog_model_for_table(table_name)
    return db.query(DataLogModel)


def get_query_with_columns_for_client(db: DB_DEPENDENCY, client_id: int, columns: List[str]) -> Optional[Query]:
    """
    Get a query object with specific columns selected for a specific client (NOT executed).
    This query can be passed to other functions for filtering.
    
    Args:
        db: The database session.
        client_id: Client ID to get query for.
        columns: List of DataLog attribute names to select.
    
    Returns:
        SQLAlchemy Query object with selected columns (not executed), or None if client not found.
    
    Example:
        query = get_query_with_columns_for_client(db, client_id=1, ['id', 'direction', 'duration'])
        query = filter_by_campaign_id(query, campaign_id=1)
        results = query.all()
    """
    DataLogModel = get_datalog_model_for_client(db, client_id)
    if not DataLogModel:
        return None
    
    # Build a list of column objects from attribute names
    column_objs = [getattr(DataLogModel, col) for col in columns]
    logger.info(f"Creating query with specific columns for client_id {client_id}: {columns}")
    return db.query(DataLogModel).with_entities(*column_objs)


def get_query_with_columns_for_table(db: DB_DEPENDENCY, table_name: str, columns: List[str]) -> Query:
    """
    Get a query object with specific columns selected for a specific table (NOT executed).
    This query can be passed to other functions for filtering.
    
    Args:
        db: The database session.
        table_name: Name of the database table.
        columns: List of DataLog attribute names to select.
    
    Returns:
        SQLAlchemy Query object with selected columns (not executed).
    
    Example:
        query = get_query_with_columns_for_table(db, "client1_table", ['id', 'direction', 'duration'])
        query = filter_by_campaign_id(query, campaign_id=1)
        results = query.all()
    """
    DataLogModel = get_datalog_model_for_table(table_name)
    # Build a list of column objects from attribute names
    column_objs = [getattr(DataLogModel, col) for col in columns]
    logger.info(f"Creating query with specific columns for table {table_name}: {columns}")
    return db.query(DataLogModel).with_entities(*column_objs)
