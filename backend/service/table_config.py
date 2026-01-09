import json
from pathlib import Path
from typing import Tuple, Optional
import loguru

logger = loguru.logger

# Path to db_table.json file
DB_TABLE_JSON_PATH = Path(__file__).parent.parent / "data" / "db_table.json"


def get_table_name() -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Read table_name from db_table.json file.
    
    Returns:
        Tuple of (success, error_message, table_name)
        - success: Whether operation succeeded
        - error_message: Error message if failed, None if succeeded
        - table_name: Table name if succeeded, None if failed
    """
    try:
        if not DB_TABLE_JSON_PATH.exists():
            error_msg = "db_table.json file not found"
            logger.error(error_msg)
            return False, error_msg, None
        
        with open(DB_TABLE_JSON_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
            table_name = data.get('table_name')
            
            if not table_name:
                error_msg = "table_name not found in db_table.json"
                logger.error(error_msg)
                return False, error_msg, None
            
            logger.info(f"Read table_name: {table_name}")
            return True, None, table_name
            
    except json.JSONDecodeError as e:
        error_msg = f"Invalid JSON file: {str(e)}"
        logger.error(error_msg)
        return False, error_msg, None
    except Exception as e:
        error_msg = f"Error reading db_table.json: {str(e)}"
        logger.error(error_msg)
        return False, error_msg, None


def update_table_name(new_table_name: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Update table_name in db_table.json file.
    
    Args:
        new_table_name: New table name to set
    
    Returns:
        Tuple of (success, error_message, table_name)
        - success: Whether operation succeeded
        - error_message: Error message if failed, None if succeeded
        - table_name: Updated table name if succeeded, None if failed
    """
    try:
        # Ensure data directory exists
        DB_TABLE_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
        
        # Validate table_name is not empty
        if not new_table_name or not new_table_name.strip():
            error_msg = "table_name cannot be empty"
            logger.error(error_msg)
            return False, error_msg, None
        
        # Read existing data if file exists, otherwise create new structure
        data = {}
        if DB_TABLE_JSON_PATH.exists():
            try:
                with open(DB_TABLE_JSON_PATH, 'r', encoding='utf-8') as f:
                    data = json.load(f)
            except json.JSONDecodeError:
                # If file is corrupted, start fresh
                logger.warning("db_table.json is corrupted, creating new file")
                data = {}
        
        # Update table_name
        data['table_name'] = new_table_name.strip()
        
        # Write to JSON file
        with open(DB_TABLE_JSON_PATH, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
        
        logger.info(f"Updated table_name to: {new_table_name}")
        return True, None, new_table_name
        
    except Exception as e:
        error_msg = f"Error updating db_table.json: {str(e)}"
        logger.error(error_msg)
        return False, error_msg, None

