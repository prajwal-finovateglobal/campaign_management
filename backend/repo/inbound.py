# Import models in correct order to ensure SQLAlchemy can resolve relationships
# Import tables.py first to create DataLog, then import client models
from models.tables import DataLog, create_datalog_model
from models.client import Client, Phase, Campaign  # Import all models for relationship resolution
from database.dependencies import DB_DEPENDENCY
from sqlalchemy.orm import Query
from typing import List, Optional, Type, Dict, Any
import loguru
from repo.tables import get_base_query_for_table, get_datalog_model_for_table
logger = loguru.logger

import json


with open('data/db_table.json', 'r') as f:
    db_table = json.load(f)
    table_name = db_table['table_name']

def get_query_metadata(db: DB_DEPENDENCY, from_number: str) -> dict:
    # Get the correct model for this table
    DataLogModel = get_datalog_model_for_table(table_name)
    # Select only the specific columns we need
    columns = ['s_no', 'meta_data', 'contact_to', 'session_id', 'agent_id']
    column_objs = [getattr(DataLogModel, col) for col in columns]
    query = db.query(DataLogModel).with_entities(*column_objs)
    # Use the correct model's contact_to attribute, not the static DataLog model
    query = query.filter(DataLogModel.contact_to == from_number)
    # Order by s_no descending to get the latest record first (s_no is the primary key)
    query = query.order_by(DataLogModel.s_no.desc())
    return query
