from sqlalchemy import Column, Integer, String, DateTime, Boolean, JSON, Float
from database.session import Base
from sqlalchemy import ForeignKey
from sqlalchemy.orm import relationship
from typing import Type, Dict

# Registry to cache dynamically created model classes
_datalog_model_registry: Dict[str, Type] = {}


def create_datalog_model(table_name: str) -> Type:
    """
    Factory function to create DataLog model for a specific table.
    Uses registry to cache model classes and avoid duplicate creation.
    
    Args:
        table_name: Name of the database table.
    
    Returns:
        SQLAlchemy model class for the specified table.
    
    Example:
        DataLogModel = create_datalog_model("client1_table")
        results = db.query(DataLogModel).all()
    """
    # Map common table name variations to actual table names
    # Handle case where database has incorrect table_name stored
    table_name_mapping = {
        'dummy_data': 'dummy_table',  # Fix for incorrect table_name in client table
    }
    
    # Normalize table name if mapping exists
    actual_table_name = table_name_mapping.get(table_name, table_name)
    
    # Check if model already exists in registry (check both original and mapped name)
    if actual_table_name in _datalog_model_registry:
        return _datalog_model_registry[actual_table_name]
    if table_name in _datalog_model_registry and actual_table_name != table_name:
        # If we have a model for the mapped name, return it
        return _datalog_model_registry[table_name]
    
    # Create dynamic class name based on actual table name
    # Special case: use "DataLog" for "dummy_table" for backward compatibility
    if actual_table_name == "dummy_table":
        class_name = "DataLog"
    else:
        class_name = f"DataLog_{actual_table_name.replace('.', '_').replace('-', '_')}"
    
    # Create the dynamic model class using type() to set the name from the start
    # This ensures SQLAlchemy registers it with the correct name
    DynamicDataLog = type(
        class_name,
        (Base,),
        {
            '__tablename__': actual_table_name,  # Use actual table name, not the mapped input
            '__module__': __name__,
            
            's_no': Column(Integer, primary_key=True, autoincrement=True, nullable=False),
            'call_start_ts': Column(Float, nullable=True),
            'call_end_ts': Column(Float, nullable=True),
            'chat': Column(JSON, nullable=True),
            'provider': Column(String, nullable=True),
            'call_id': Column(String, nullable=True),
            'agent_id': Column(String, nullable=True),
            'duration': Column(Float, nullable=True),
            'meta_data': Column(JSON, nullable=True),
            'recording': Column(String, nullable=True),
            'model': Column(String, nullable=True),
            'cost': Column(Float, nullable=True),
            'json_data': Column(JSON, nullable=True),
            'disposition': Column(String, nullable=True),
            'created_at': Column(DateTime(timezone=True), nullable=True, server_default="CURRENT_TIMESTAMP"),
            'is_disposition_available': Column(Boolean, default=False, nullable=True),
            'transcript': Column(String, nullable=True),
            'is_transcript_available': Column(Boolean, default=False, nullable=True),
            'is_duplicate': Column(Boolean, default=False, nullable=True),
            'campaign_id': Column(Integer, nullable=True),
            'contact_to': Column(String, nullable=True),
            'contact_from': Column(String, nullable=True),
            'direction': Column(String, nullable=True),
            'language': Column(String, nullable=True),
            'session_id': Column(String, nullable=True),
            'call_status': Column(String, nullable=True),
            'error_message': Column(String, nullable=True),
            
            # Relationships - removed since dummy_table has no foreign key constraints
            # Note: dummy_table doesn't have client_id or foreign key on campaign_id
        }
    )
    
    # Cache the model in registry using actual table name
    _datalog_model_registry[actual_table_name] = DynamicDataLog
    # Also cache under original name if different, so lookups work both ways
    if actual_table_name != table_name:
        _datalog_model_registry[table_name] = DynamicDataLog
    
    return DynamicDataLog


# Create DataLog as an alias using the factory function
# This ensures consistency and eliminates code duplication
# DataLog is just create_datalog_model("dummy_table") cached in the registry
DataLog = create_datalog_model("dummy_table")

