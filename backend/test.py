"""
Script to migrate all records from capri_data table to dummy_table.
Extracts json_data and other fields, transforms them, and inserts into dummy_table.
"""

from sqlalchemy import Table, Column, Integer, Float, String, Boolean, DateTime, Text, JSON, ForeignKey, MetaData, func, insert, text
from datetime import datetime
from database.session import engine, SessionLocal
from loguru import logger

# Define the dummy_table structure matching the exact database schema
metadata = MetaData()

dummy_table = Table(
    'dummy_table',
    metadata,
    Column('id', Integer, primary_key=True, autoincrement=True, nullable=False),
    Column('call_start_ts', Float, nullable=True),
    Column('call_end_ts', Float, nullable=True),
    Column('chat', JSON, nullable=True),  # jsonb in DB
    Column('provider', Text, nullable=True),
    Column('call_id', Text, nullable=True),
    Column('agent_id', Text, nullable=True),
    Column('duration', Float, nullable=True),
    Column('meta_data', JSON, nullable=True),  # jsonb in DB
    Column('recording', Text, nullable=True),
    Column('model', Text, nullable=True),
    Column('cost', Float, nullable=True, quote=True),  # Quoted in DB as "cost"
    Column('json_data', JSON, nullable=True),  # jsonb in DB
    Column('disposition', Text, nullable=True),
    Column('created_at', DateTime(timezone=True), server_default=func.now(), nullable=True),
    Column('is_disposition_available', Boolean, server_default="false", nullable=True),
    Column('transcript', Text, nullable=True),
    Column('is_transcript_available', Boolean, server_default="false", nullable=True),
    Column('is_duplicate', Boolean, server_default="false", nullable=True),
    Column('client_id', Integer, nullable=False),  # Foreign key removed from actual DB
    Column('campaign_id', Integer, nullable=False),  # Foreign key removed from actual DB
    Column('contact_to', String, nullable=True),  # varchar in DB
    Column('contact_from', String, nullable=True),  # varchar in DB
    Column('direction', String, nullable=True),  # varchar in DB
    Column('language', String, nullable=True, quote=True),  # Quoted in DB as "language"
    Column('session_id', String, nullable=True),  # varchar in DB
    Column('call_status', String, nullable=True),  # varchar in DB
    Column('error_message', String, nullable=True),  # varchar in DB
)


def query_sql(query: str):
    """Execute a SQL query and return all results."""
    with SessionLocal() as db:
        result = db.execute(text(query))
        return result.fetchall()


def check_and_add_missing_columns():
    """Check if dummy_table has all required columns and add missing ones."""
    logger.info("Checking dummy_table structure...")
    
    # Get current columns in the table
    with engine.connect() as conn:
        # Query to get all column names
        result = conn.execute(text("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'dummy_table'
            ORDER BY ordinal_position;
        """))
        existing_columns = {row[0]: row[1] for row in result.fetchall()}
        
        logger.info(f"Existing columns in dummy_table: {list(existing_columns.keys())}")
        
        # Required columns that should exist
        required_columns = {
            'client_id': 'INTEGER NOT NULL',
            'campaign_id': 'INTEGER NOT NULL',
        }
        
        # Check and add missing columns
        for col_name, col_def in required_columns.items():
            if col_name not in existing_columns:
                logger.warning(f"Column {col_name} is missing. Adding it...")
                try:
                    # Check if table has existing rows
                    count_result = conn.execute(text("SELECT COUNT(*) FROM dummy_table"))
                    row_count = count_result.scalar()
                    logger.info(f"Table has {row_count} existing rows")
                    
                    # Add the column as nullable first
                    if col_name == 'client_id':
                        if row_count > 0:
                            # Table has data, add as nullable first, then update, then set NOT NULL
                            conn.execute(text("""
                                ALTER TABLE dummy_table 
                                ADD COLUMN client_id INTEGER;
                            """))
                            # Update existing rows with default value
                            conn.execute(text("""
                                UPDATE dummy_table 
                                SET client_id = 1 
                                WHERE client_id IS NULL;
                            """))
                            # Now set as NOT NULL
                            conn.execute(text("""
                                ALTER TABLE dummy_table 
                                ALTER COLUMN client_id SET NOT NULL;
                            """))
                        else:
                            # No data, can add directly as NOT NULL
                            conn.execute(text("""
                                ALTER TABLE dummy_table 
                                ADD COLUMN client_id INTEGER NOT NULL DEFAULT 1;
                            """))
                            conn.execute(text("""
                                ALTER TABLE dummy_table 
                                ALTER COLUMN client_id DROP DEFAULT;
                            """))
                        
                        # Skip adding foreign key constraint (removed from actual DB)
                        logger.info("Skipping foreign key constraint for client_id (not required)")
                            
                    elif col_name == 'campaign_id':
                        if row_count > 0:
                            # Table has data, add as nullable first, then update, then set NOT NULL
                            conn.execute(text("""
                                ALTER TABLE dummy_table 
                                ADD COLUMN campaign_id INTEGER;
                            """))
                            # Update existing rows with default value
                            conn.execute(text("""
                                UPDATE dummy_table 
                                SET campaign_id = 1 
                                WHERE campaign_id IS NULL;
                            """))
                            # Now set as NOT NULL
                            conn.execute(text("""
                                ALTER TABLE dummy_table 
                                ALTER COLUMN campaign_id SET NOT NULL;
                            """))
                        else:
                            # No data, can add directly as NOT NULL
                            conn.execute(text("""
                                ALTER TABLE dummy_table 
                                ADD COLUMN campaign_id INTEGER NOT NULL DEFAULT 1;
                            """))
                            conn.execute(text("""
                                ALTER TABLE dummy_table 
                                ALTER COLUMN campaign_id DROP DEFAULT;
                            """))
                        
                        # Skip adding foreign key constraint (removed from actual DB)
                        logger.info("Skipping foreign key constraint for campaign_id (not required)")
                    
                    conn.commit()
                    logger.info(f"Successfully added column {col_name}")
                except Exception as e:
                    logger.error(f"Error adding column {col_name}: {e}")
                    conn.rollback()
                    raise
            else:
                logger.info(f"Column {col_name} already exists")
        
        # Verify all columns exist now
        result = conn.execute(text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'dummy_table';
        """))
        final_columns = [row[0] for row in result.fetchall()]
        logger.info(f"Final columns in dummy_table: {final_columns}")
        
        return final_columns

import numpy as np
import json

def transform_json_data(json_data_item, language, created_at, transcript, contact_to, contact_from, direction):
    """
    Transform a single json_data record into the format required for dummy_table.
    
    Args:
        json_data_item: The json_data dictionary from capri_data (may be dict or JSON string)
        language: Language from capri_data
        created_at: Created timestamp from capri_data
        transcript: Transcript from capri_data
        contact_to: Contact to from capri_data
        contact_from: Contact from from capri_data
        direction: Direction from capri_data
    
    Returns:
        Dictionary with transformed data ready for insertion
    """
    if not json_data_item:
        return None
    
    # Ensure json_data_item is a dict (should already be parsed in main loop, but double-check)
    if isinstance(json_data_item, str):
        try:
            json_data_item = json.loads(json_data_item)
        except (json.JSONDecodeError, TypeError):
            logger.warning(f"Could not parse json_data_item as JSON in transform function")
            return None
    
    # Calculate cost from cost_breakdown
    cost = 0.0
    if isinstance(json_data_item.get('cost_breakdown'), list):
        cost = sum([j.get('credit', 0) for j in json_data_item.get('cost_breakdown', [])])
    
    # Get call_end_ts - try different possible paths
    call_end_ts = None
    if 'call_metrics' in json_data_item and isinstance(json_data_item['call_metrics'], dict):
        call_end_ts = json_data_item['call_metrics'].get('call_end_ts')
    elif 'call_end_ts' in json_data_item:
        call_end_ts = json_data_item['call_end_ts']
    
    # Determine if transcript is available
    is_transcript_available = bool(transcript)
    
    # Determine if disposition is available
    disposition = json_data_item.get('disposition')
    is_disposition_available = bool(disposition)
    
    # Extract voip information
    voip = json_data_item.get('voip', {})
    if isinstance(voip, dict):
        provider = voip.get('provider')
        # Use contact_to/contact_from from query if available, otherwise from json_data
        final_contact_to = contact_to if contact_to else voip.get('to')
        final_contact_from = contact_from if contact_from else voip.get('from')
        final_direction = direction if direction else voip.get('direction')
    else:
        provider = None
        final_contact_to = contact_to
        final_contact_from = contact_from
        final_direction = direction
    
    # Extract agent_config information
    agent_config = json_data_item.get('agent_config', {})
    if isinstance(agent_config, dict):
        llm = agent_config.get('llm', {})
        model = llm.get('model') if isinstance(llm, dict) else None
        final_language = language if language else agent_config.get('language')
    else:
        model = None
        final_language = language
    
    # Extract recording URL
    recording = None
    recording_data = json_data_item.get('recording')
    if isinstance(recording_data, dict):
        recording = recording_data.get('recording_url')
    elif isinstance(recording_data, str):
        recording = recording_data
    
    # Handle chat field - ensure it's a dict/list or None, not a string
    chat = json_data_item.get('chat')
    if chat is None:
        chat = None
    elif isinstance(chat, str):
        if chat.lower() == 'null' or chat.strip() == '':
            chat = None
        else:
            try:
                chat = json.loads(chat)
            except (json.JSONDecodeError, AttributeError):
                chat = None
    # If chat is already a dict/list, keep it as is
    
    # Handle meta_data field - ensure it's a dict or None, not a string
    meta_data = json_data_item.get('metadata')
    if meta_data is None:
        meta_data = None
    elif isinstance(meta_data, str):
        if meta_data.lower() == 'null' or meta_data.strip() == '':
            meta_data = None
        else:
            try:
                meta_data = json.loads(meta_data)
            except (json.JSONDecodeError, AttributeError):
                meta_data = None
    # If meta_data is already a dict, keep it as is
    
    return {
        'call_start_ts': json_data_item.get('ts'),
        'call_end_ts': call_end_ts,
        'chat': chat,
        'provider': provider,
        'call_id': json_data_item.get('call_id'),
        'agent_id': json_data_item.get('agent_id'),
        'duration': json_data_item.get('duration'),
        'meta_data': meta_data,
        'recording': recording,
        'model': model,
        'cost': cost,
        'json_data': json_data_item,  # Keep as dict for JSON column
        'disposition': disposition,
        'created_at': created_at if created_at else datetime.now(),
        'is_disposition_available': is_disposition_available,
        'transcript': transcript,
        'is_transcript_available': is_transcript_available,
        'is_duplicate': False,
        'client_id': 1,  # Random client_id between 1-9
        'campaign_id': np.random.randint(1, 20),  # Random campaign_id between 1-19
        'contact_to': final_contact_to,
        'contact_from': final_contact_from,
        'direction': final_direction,
        'language': final_language,
        'session_id': json_data_item.get('session_id'),
        'call_status': json_data_item.get('call_status'),
        'error_message': json_data_item.get('error_message'),
    }


def main():
    """Main function to migrate data from capri_data to dummy_table."""
    try:
        logger.info("Starting data migration from capri_data to dummy_table...")
        
        # Check and add missing columns to dummy_table
        check_and_add_missing_columns()
        
        # Query all records from capri_data
        logger.info("Querying capri_data table...")
        data = query_sql('''
            SELECT json_data, language, created_at, transcript, contact_to, contact_from, direction 
            FROM capri_data;
        ''')
        
        logger.info(f"Found {len(data)} records in capri_data")
        
        # Extract json_data from query results
        json_data_list = [i[0] for i in data]
        
        # Transform all records
        logger.info("Transforming records...")
        transformed_records = []
        
        for idx, row in enumerate(data):
            json_data_item = row[0]
            language = row[1]
            created_at = row[2]
            transcript = row[3]
            contact_to = row[4]
            contact_from = row[5]
            direction = row[6]
            
            # Handle case where json_data might be a string from PostgreSQL JSONB
            if isinstance(json_data_item, str):
                try:
                    json_data_item = json.loads(json_data_item)
                except (json.JSONDecodeError, TypeError):
                    logger.warning(f"Row {idx + 1}: Could not parse json_data as JSON, skipping...")
                    continue
            
            if json_data_item:
                transformed = transform_json_data(
                    json_data_item,
                    language,
                    created_at,
                    transcript,
                    contact_to,
                    contact_from,
                    direction
                )
                if transformed:
                    # Ensure client_id is always present and valid
                    if 'client_id' not in transformed or transformed['client_id'] is None:
                        transformed['client_id'] = np.random.randint(1, 10)
                    # Ensure campaign_id is always present and valid
                    if 'campaign_id' not in transformed or transformed['campaign_id'] is None:
                        transformed['campaign_id'] = np.random.randint(1, 20)
                    transformed_records.append(transformed)
            else:
                logger.warning(f"Row {idx + 1} has no json_data, skipping...")
        
        logger.info(f"Transformed {len(transformed_records)} records")
        
        # Validate that all records have required fields
        required_fields = ['client_id', 'campaign_id']
        for idx, record in enumerate(transformed_records):
            for field in required_fields:
                if field not in record or record[field] is None:
                    logger.error(f"Record {idx + 1} is missing required field: {field}")
                    logger.error(f"Record keys: {list(record.keys())}")
                    raise ValueError(f"Record {idx + 1} is missing required field: {field}")
        
        # Insert records in batches
        batch_size = 1000
        total_inserted = 0
        
        logger.info(f"Inserting records in batches of {batch_size}...")
        
        with engine.connect() as conn:
            for i in range(0, len(transformed_records), batch_size):
                batch = transformed_records[i:i + batch_size]
                
                # Ensure all records in batch have client_id and campaign_id
                for j, record in enumerate(batch):
                    if 'client_id' not in record or record['client_id'] is None:
                        record['client_id'] = np.random.randint(1, 10)
                        logger.warning(f"Batch {i // batch_size + 1}, record {j}: Added missing client_id = {record['client_id']}")
                    if 'campaign_id' not in record or record['campaign_id'] is None:
                        record['campaign_id'] = np.random.randint(1, 20)
                        logger.warning(f"Batch {i // batch_size + 1}, record {j}: Added missing campaign_id = {record['campaign_id']}")
                
                # Log first record structure for debugging
                if batch:
                    logger.info(f"Batch {i // batch_size + 1} first record keys: {list(batch[0].keys())}")
                    logger.info(f"Batch {i // batch_size + 1} first record client_id: {batch[0].get('client_id')}")
                    logger.info(f"Batch {i // batch_size + 1} first record campaign_id: {batch[0].get('campaign_id')}")
                    
                    # Verify client_id is actually in the dictionary (not just a get() that returns None)
                    if 'client_id' not in batch[0]:
                        logger.error(f"CRITICAL: 'client_id' key not found in batch[0]!")
                        logger.error(f"Available keys: {list(batch[0].keys())}")
                        raise ValueError("client_id key missing from dictionary")
                    if batch[0]['client_id'] is None:
                        logger.error(f"CRITICAL: 'client_id' is None in batch[0]!")
                        raise ValueError("client_id value is None")
                
                # Create insert statement - SQLAlchemy will infer columns from dictionary keys
                stmt = insert(dummy_table)
                
                # Compile the statement to see what SQL will be generated (for debugging)
                if i == 0:  # Only log for first batch
                    compiled = stmt.compile(compile_kwargs={"literal_binds": False})
                    logger.debug(f"Generated SQL (first batch): {compiled}")
                
                result = conn.execute(stmt, batch)
                conn.commit()
                total_inserted += result.rowcount
                logger.info(f"Inserted batch {i // batch_size + 1}: {result.rowcount} rows (Total: {total_inserted}/{len(transformed_records)})")
        
        logger.info(f"Migration completed successfully! Total records inserted: {total_inserted}")
        
    except Exception as e:
        logger.error(f"Error during migration: {e}")
        raise


if __name__ == "__main__":
    main()

