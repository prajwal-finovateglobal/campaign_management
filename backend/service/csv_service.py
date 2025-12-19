import csv
import os
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import loguru
import io

logger = loguru.logger.bind(service="csv_service")

# Path to data.csv file
DATA_CSV_PATH = Path(__file__).parent.parent / "data" / "data.csv"


def get_existing_columns() -> Optional[List[str]]:
    """
    Read existing CSV file and return column names if file exists.
    
    Returns:
        List of column names if file exists, None otherwise
    """
    if not DATA_CSV_PATH.exists():
        return None
    
    try:
        with open(DATA_CSV_PATH, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            return reader.fieldnames
    except Exception as e:
        logger.error(f"Error reading existing CSV columns: {e}")
        return None


def validate_columns(new_data: List[Dict[str, Any]], existing_columns: Optional[List[str]]) -> Tuple[bool, Optional[str]]:
    """
    Validate that new data columns match existing CSV columns.
    
    Args:
        new_data: List of dictionaries with data to append
        existing_columns: List of existing column names from CSV
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not new_data:
        return False, "No data provided"
    
    # Get columns from new data
    new_columns = set(new_data[0].keys())
    
    # If CSV doesn't exist, validation passes (will create new file)
    if existing_columns is None:
        return True, None
    
    # Convert to sets for comparison
    existing_columns_set = set(existing_columns)
    
    # Check if columns match exactly
    if new_columns != existing_columns_set:
        missing_cols = existing_columns_set - new_columns
        extra_cols = new_columns - existing_columns_set
        
        error_msg = f"Column mismatch. Expected columns: {sorted(existing_columns_set)}, "
        error_msg += f"Got columns: {sorted(new_columns)}"
        
        if missing_cols:
            error_msg += f". Missing columns: {sorted(missing_cols)}"
        if extra_cols:
            error_msg += f". Extra columns: {sorted(extra_cols)}"
        
        return False, error_msg
    
    return True, None


def append_to_csv(data: List[Dict[str, Any]]) -> Tuple[bool, Optional[str]]:
    """
    Append data to existing CSV file or create new file if it doesn't exist.
    
    Logic:
    - If CSV is empty (no data rows), load whatever data is coming (no validation)
    - If CSV has data rows, validate column matching
    - Special case: If meta_data exists (with or without other columns), expand it while keeping other columns
    
    Args:
        data: List of dictionaries to append to CSV
    
    Returns:
        Tuple of (success, error_message)
    """
    if not data:
        return False, "No data provided"
    
    try:
        # Ensure data directory exists
        DATA_CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
        
        # Check if CSV is empty (has no data rows)
        csv_is_empty = is_csv_empty()
        
        # Get existing columns
        existing_columns = get_existing_columns()
        
        # Check if meta_data column exists (with or without other columns like contact_to, phone, etc.)
        incoming_columns = list(data[0].keys())
        has_meta_data = 'meta_data' in incoming_columns
        # Columns to keep along with expanded meta_data (contact_to, phone, etc.)
        keep_columns = ['contact_to', 'phone']
        columns_to_keep = [col for col in keep_columns if col in incoming_columns]
        
        # If meta_data exists, expand it while keeping other columns
        if has_meta_data:
            logger.info(f"meta_data column detected, expanding into separate columns while keeping: {columns_to_keep}")
            expanded_data = []
            all_metadata_keys = set()
            
            # First pass: collect all unique keys from meta_data
            for row in data:
                meta_data = row.get('meta_data')
                if meta_data:
                    # Handle both dict and JSON string
                    if isinstance(meta_data, str):
                        try:
                            import json
                            meta_data = json.loads(meta_data)
                        except (json.JSONDecodeError, ValueError):
                            logger.warning(f"Could not parse meta_data as JSON: {meta_data[:100]}")
                            continue
                    
                    if isinstance(meta_data, dict):
                        all_metadata_keys.update(meta_data.keys())
            
            # Second pass: create expanded rows
            for row in data:
                meta_data = row.get('meta_data')
                expanded_row = {}
                
                # Keep other columns (contact_to, phone, etc.)
                for col in columns_to_keep:
                    expanded_row[col] = row.get(col, None)
                
                # Expand meta_data
                if meta_data:
                    # Parse if string
                    if isinstance(meta_data, str):
                        try:
                            import json
                            meta_data = json.loads(meta_data)
                        except (json.JSONDecodeError, ValueError):
                            pass
                    
                    if isinstance(meta_data, dict):
                        # Add each key as a separate column
                        for key in all_metadata_keys:
                            expanded_row[key] = meta_data.get(key, None)
                    else:
                        # If not a dict, fill all columns with None
                        for key in all_metadata_keys:
                            expanded_row[key] = None
                else:
                    # If no meta_data, fill all columns with None
                    for key in all_metadata_keys:
                        expanded_row[key] = None
                
                expanded_data.append(expanded_row)
            
            # Use expanded data and columns
            data = expanded_data
            incoming_columns = columns_to_keep + list(all_metadata_keys)
            logger.info(f"Expanded meta_data into columns while keeping: {columns_to_keep}. Metadata columns: {sorted(all_metadata_keys)}")
        
        # Only validate columns if CSV has data rows (not empty)
        if not csv_is_empty and existing_columns is not None:
            is_valid, error_msg = validate_columns(data, existing_columns)
            if not is_valid:
                return False, error_msg
            # Use existing columns if CSV has data
            fieldnames = existing_columns
        else:
            # CSV is empty or doesn't exist - use columns from incoming data
            fieldnames = incoming_columns
            logger.info(f"CSV is empty, using columns from incoming data: {fieldnames}")
        
        # Determine if file exists and has content (data rows, not just header)
        file_exists = DATA_CSV_PATH.exists() and not csv_is_empty
        
        # Open file in append mode if it has data, write mode if empty/new
        mode = 'a' if file_exists else 'w'
        
        with open(DATA_CSV_PATH, mode, newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            
            # Write header only if creating new file or overwriting empty file
            if not file_exists:
                writer.writeheader()
            
            # Write data rows
            for row in data:
                # Ensure all columns are present (fill missing with None)
                complete_row = {col: row.get(col, None) for col in fieldnames}
                writer.writerow(complete_row)
        
        logger.info(f"Successfully appended {len(data)} rows to {DATA_CSV_PATH}")
        return True, None
        
    except Exception as e:
        error_msg = f"Error appending to CSV: {str(e)}"
        logger.error(error_msg)
        return False, error_msg


def is_csv_empty() -> bool:
    """
    Check if CSV file is empty or doesn't exist.
    
    Returns:
        True if CSV is empty or doesn't exist, False otherwise
    """
    if not DATA_CSV_PATH.exists():
        return True
    
    try:
        # Check if file has content (more than just header)
        with open(DATA_CSV_PATH, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            # Try to read first row (data row, not header)
            first_row = next(reader, None)
            return first_row is None
    except Exception as e:
        logger.error(f"Error checking if CSV is empty: {e}")
        # If error reading, assume it's empty
        return True


def read_csv_data() -> Tuple[bool, Optional[str], Optional[List[Dict[str, Any]]]]:
    """
    Read all data from CSV file.
    
    Returns:
        Tuple of (success, error_message, data)
        - success: Whether operation succeeded
        - error_message: Error message if failed, None if succeeded
        - data: List of dictionaries with CSV data, None if error
    """
    try:
        if not DATA_CSV_PATH.exists():
            return True, None, []
        
        # Check if CSV is empty
        if is_csv_empty():
            return True, None, []
        
        data = []
        with open(DATA_CSV_PATH, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Convert all values to proper types (handle None/empty strings)
                processed_row = {}
                for key, value in row.items():
                    if value == '' or value is None:
                        processed_row[key] = None
                    else:
                        # Try to parse JSON strings (for meta_data, chat, etc.)
                        # Check if value looks like JSON (starts with { or [)
                        if isinstance(value, str) and (value.strip().startswith('{') or value.strip().startswith('[')):
                            try:
                                import json
                                # Handle CSV-escaped quotes: "" becomes "
                                # CSV wraps JSON strings in quotes and escapes internal quotes as ""
                                value_stripped = value.strip()
                                
                                # Remove outer quotes if CSV wrapped it
                                if value_stripped.startswith('"') and value_stripped.endswith('"'):
                                    value_stripped = value_stripped[1:-1]
                                
                                # Replace CSV-escaped double quotes with single quotes
                                value_stripped = value_stripped.replace('""', '"')
                                
                                processed_row[key] = json.loads(value_stripped)
                            except (json.JSONDecodeError, ValueError) as e:
                                # If not valid JSON, keep as string
                                logger.debug(f"Could not parse JSON for key {key}: {str(e)}")
                                processed_row[key] = value
                        else:
                            # Not a JSON-like string, keep as is
                            processed_row[key] = value
                data.append(processed_row)
        
        logger.info(f"Successfully read {len(data)} rows from {DATA_CSV_PATH}")
        return True, None, data
        
    except Exception as e:
        error_msg = f"Error reading CSV: {str(e)}"
        logger.error(error_msg)
        return False, error_msg, None


def clear_csv() -> Tuple[bool, Optional[str], bool]:
    """
    Clear all data from CSV file (keeps header if exists).
    
    Returns:
        Tuple of (success, message, was_empty)
        - success: Whether operation succeeded
        - message: Success or error message
        - was_empty: Whether CSV was already empty
    """
    try:
        # Check if CSV is already empty
        if is_csv_empty():
            return True, "CSV file is already empty", True
        
        # Get existing columns to preserve header structure
        existing_columns = get_existing_columns()
        
        # Delete the file
        if DATA_CSV_PATH.exists():
            DATA_CSV_PATH.unlink()
            logger.info(f"Deleted CSV file: {DATA_CSV_PATH}")
        
        # Recreate file with header only if we had columns
        if existing_columns:
            DATA_CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
            with open(DATA_CSV_PATH, 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=existing_columns)
                writer.writeheader()
            logger.info(f"Recreated CSV file with header: {DATA_CSV_PATH}")
        
        return True, "Successfully deleted all data from CSV", False
        
    except Exception as e:
        error_msg = f"Error clearing CSV: {str(e)}"
        logger.error(error_msg)
        return False, error_msg, False


def cut_ccd(contact_values: List[str]) -> Tuple[bool, Optional[str], Optional[int]]:
    """
    Delete rows from data.csv that match contact_to or phone values.
    
    Args:
        contact_values: List of contact_to or phone values to match and delete
    
    Returns:
        Tuple of (success, message, rows_deleted)
        - success: Whether operation succeeded
        - message: Success or error message
        - rows_deleted: Number of rows deleted, None if error
    """
    try:
        if not DATA_CSV_PATH.exists():
            return False, "data.csv file does not exist", None
        
        # Check if CSV is empty
        if is_csv_empty():
            return True, "CSV file is already empty. No rows to delete.", 0
        
        # Read all data from CSV
        success, error_msg, csv_data = read_csv_data()
        if not success or csv_data is None:
            error_msg = error_msg or "Failed to read data from CSV"
            logger.error(error_msg)
            return False, error_msg, None
        
        if not csv_data:
            return True, "CSV file is empty. No rows to delete.", 0
        
        # Normalize contact_values (strip whitespace, convert to string)
        normalized_contact_values = {str(val).strip() for val in contact_values if val}
        
        if not normalized_contact_values:
            return False, "No valid contact values provided", None
        
        # Filter out rows that match contact_to or phone
        rows_before = len(csv_data)
        filtered_data = []
        rows_deleted = 0
        
        for row in csv_data:
            # Check if row matches any contact value in contact_to or phone columns
            contact_to = str(row.get('contact_to', '')).strip() if row.get('contact_to') else ''
            phone = str(row.get('phone', '')).strip() if row.get('phone') else ''
            
            # Check if this row should be deleted
            should_delete = False
            if contact_to and contact_to in normalized_contact_values:
                should_delete = True
            elif phone and phone in normalized_contact_values:
                should_delete = True
            
            if not should_delete:
                filtered_data.append(row)
            else:
                rows_deleted += 1
        
        if rows_deleted == 0:
            return True, f"No matching rows found for the provided contact values. {rows_before} rows remain.", 0
        
        # Get existing columns to preserve structure
        existing_columns = get_existing_columns()
        if not existing_columns:
            # If no columns, get from first row
            existing_columns = list(filtered_data[0].keys()) if filtered_data else []
        
        # Write filtered data back to CSV
        DATA_CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(DATA_CSV_PATH, 'w', newline='', encoding='utf-8') as f:
            if existing_columns:
                writer = csv.DictWriter(f, fieldnames=existing_columns)
                writer.writeheader()
                for row in filtered_data:
                    # Ensure all columns exist in row
                    complete_row = {col: row.get(col, '') for col in existing_columns}
                    writer.writerow(complete_row)
        
        logger.info(f"Successfully deleted {rows_deleted} rows from CSV. {len(filtered_data)} rows remain.")
        return True, f"Successfully deleted {rows_deleted} row(s) from data.csv. {len(filtered_data)} row(s) remain.", rows_deleted
        
    except Exception as e:
        error_msg = f"Error cutting CCD from CSV: {str(e)}"
        logger.error(error_msg)
        return False, error_msg, None


def delete_csv_records(records: List[Dict[str, Any]]) -> Tuple[bool, Optional[str], Optional[int]]:
    """
    Delete specific records from data.csv based on multiple identifying fields.
    Uses phone or contact_to as primary identifiers.
    
    Args:
        records: List of record dictionaries to delete (each containing identifying fields)
    
    Returns:
        Tuple of (success, message, rows_deleted)
        - success: Whether operation succeeded
        - message: Success or error message
        - rows_deleted: Number of rows deleted, None if error
    """
    try:
        if not DATA_CSV_PATH.exists():
            return False, "data.csv file does not exist", None
        
        # Check if CSV is empty
        if is_csv_empty():
            return True, "CSV file is already empty. No rows to delete.", 0
        
        if not records:
            return False, "No records provided for deletion", None
        
        # Read all data from CSV
        success, error_msg, csv_data = read_csv_data()
        if not success or csv_data is None:
            error_msg = error_msg or "Failed to read data from CSV"
            logger.error(error_msg)
            return False, error_msg, None
        
        if not csv_data:
            return True, "CSV file is empty. No rows to delete.", 0
        
        # Create a set of identifiers from records to delete
        # Use phone or contact_to as primary identifiers
        identifiers_to_delete = set()
        for record in records:
            phone = str(record.get('phone', '')).strip() if record.get('phone') else None
            contact_to = str(record.get('contact_to', '')).strip() if record.get('contact_to') else None
            
            if phone:
                identifiers_to_delete.add(('phone', phone))
            if contact_to:
                identifiers_to_delete.add(('contact_to', contact_to))
        
        if not identifiers_to_delete:
            return False, "No valid identifiers found in records to delete", None
        
        # Filter out rows that match any identifier
        rows_before = len(csv_data)
        filtered_data = []
        rows_deleted = 0
        
        for row in csv_data:
            should_delete = False
            
            # Check if this row matches any identifier
            row_phone = str(row.get('phone', '')).strip() if row.get('phone') else ''
            row_contact_to = str(row.get('contact_to', '')).strip() if row.get('contact_to') else ''
            
            for id_type, id_value in identifiers_to_delete:
                if id_type == 'phone' and row_phone and row_phone == id_value:
                    should_delete = True
                    break
                elif id_type == 'contact_to' and row_contact_to and row_contact_to == id_value:
                    should_delete = True
                    break
            
            if not should_delete:
                filtered_data.append(row)
            else:
                rows_deleted += 1
        
        if rows_deleted == 0:
            return True, f"No matching rows found to delete. {rows_before} rows remain.", 0
        
        # Get existing columns to preserve structure
        existing_columns = get_existing_columns()
        if not existing_columns:
            # If no columns, get from first row
            existing_columns = list(filtered_data[0].keys()) if filtered_data else []
        
        # Write filtered data back to CSV
        DATA_CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(DATA_CSV_PATH, 'w', newline='', encoding='utf-8') as f:
            if existing_columns:
                writer = csv.DictWriter(f, fieldnames=existing_columns)
                writer.writeheader()
                for row in filtered_data:
                    # Ensure all columns exist in row
                    complete_row = {col: row.get(col, '') for col in existing_columns}
                    writer.writerow(complete_row)
        
        logger.info(f"Successfully deleted {rows_deleted} records from CSV. {len(filtered_data)} rows remain.")
        return True, f"Successfully deleted {rows_deleted} record(s). {len(filtered_data)} rows remain in CSV.", rows_deleted
        
    except Exception as e:
        error_msg = f"Error deleting records from CSV: {str(e)}"
        logger.error(error_msg)
        return False, error_msg, None


def update_csv_records(records: List[Dict[str, Any]]) -> Tuple[bool, Optional[str], Optional[int]]:
    """
    Update specific records in data.csv based on identifying fields.
    Uses phone or contact_to as primary identifiers to match records.
    
    Args:
        records: List of dicts with 'original' and 'updated' record data
    
    Returns:
        Tuple of (success, message, rows_updated)
        - success: Whether operation succeeded
        - message: Success or error message
        - rows_updated: Number of rows updated, None if error
    """
    try:
        if not DATA_CSV_PATH.exists():
            return False, "data.csv file does not exist", None
        
        # Check if CSV is empty
        if is_csv_empty():
            return False, "CSV file is empty. No rows to update.", None
        
        if not records:
            return False, "No records provided for update", None
        
        # Read all data from CSV
        success, error_msg, csv_data = read_csv_data()
        if not success or csv_data is None:
            error_msg = error_msg or "Failed to read data from CSV"
            logger.error(error_msg)
            return False, error_msg, None
        
        if not csv_data:
            return False, "CSV file is empty. No rows to update.", None
        
        # Create a map of records to update
        # Key: tuple of (id_type, id_value), Value: updated record data
        updates_map = {}
        for record_pair in records:
            original = record_pair.get('original', {})
            updated = record_pair.get('updated', {})
            
            if not original or not updated:
                continue
            
            # Use phone or contact_to as identifier
            phone = str(original.get('phone', '')).strip() if original.get('phone') else None
            contact_to = str(original.get('contact_to', '')).strip() if original.get('contact_to') else None
            
            if phone:
                updates_map[('phone', phone)] = updated
            elif contact_to:
                updates_map[('contact_to', contact_to)] = updated
        
        if not updates_map:
            return False, "No valid identifiers found in records to update", None
        
        # Update matching rows
        rows_updated = 0
        updated_data = []
        
        for row in csv_data:
            row_phone = str(row.get('phone', '')).strip() if row.get('phone') else ''
            row_contact_to = str(row.get('contact_to', '')).strip() if row.get('contact_to') else ''
            
            # Check if this row should be updated
            updated_record = None
            if row_phone and ('phone', row_phone) in updates_map:
                updated_record = updates_map[('phone', row_phone)]
            elif row_contact_to and ('contact_to', row_contact_to) in updates_map:
                updated_record = updates_map[('contact_to', row_contact_to)]
            
            if updated_record:
                # Merge the updated values with existing row
                updated_row = {**row, **updated_record}
                updated_data.append(updated_row)
                rows_updated += 1
            else:
                updated_data.append(row)
        
        if rows_updated == 0:
            return True, "No matching rows found to update.", 0
        
        # Get existing columns to preserve structure
        existing_columns = get_existing_columns()
        if not existing_columns:
            # If no columns, get from first row
            existing_columns = list(updated_data[0].keys()) if updated_data else []
        
        # Write updated data back to CSV
        DATA_CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(DATA_CSV_PATH, 'w', newline='', encoding='utf-8') as f:
            if existing_columns:
                writer = csv.DictWriter(f, fieldnames=existing_columns)
                writer.writeheader()
                for row in updated_data:
                    # Ensure all columns exist in row
                    complete_row = {col: row.get(col, '') for col in existing_columns}
                    writer.writerow(complete_row)
        
        logger.info(f"Successfully updated {rows_updated} records in CSV.")
        return True, f"Successfully updated {rows_updated} record(s) in CSV.", rows_updated
        
    except Exception as e:
        error_msg = f"Error updating records in CSV: {str(e)}"
        logger.error(error_msg)
        return False, error_msg, None


def get_unique_campaign_ids() -> Tuple[bool, Optional[str], Optional[List[int]]]:
    """
    Get all unique campaign_id values from data.csv.
    
    Returns:
        Tuple of (success, error_message, campaign_ids)
        - success: Whether operation succeeded
        - error_message: Error message if failed, None if succeeded
        - campaign_ids: List of unique campaign IDs, None if error
    """
    try:
        # Check if CSV exists
        if not DATA_CSV_PATH.exists():
            return True, None, []
        
        # Check if CSV is empty
        if is_csv_empty():
            return True, None, []
        
        # Read all data from CSV
        success, error_msg, data = read_csv_data()
        if not success or data is None:
            error_msg = error_msg or "Failed to read data from CSV"
            logger.error(error_msg)
            return False, error_msg, None
        
        if not data:
            return True, None, []
        
        # Extract unique campaign_ids
        campaign_ids_set = set()
        for record in data:
            campaign_id = record.get('campaign_id')
            if campaign_id is not None and campaign_id != '':
                try:
                    # Convert to int if possible
                    campaign_id_int = int(campaign_id)
                    campaign_ids_set.add(campaign_id_int)
                except (ValueError, TypeError):
                    # Skip invalid campaign_id values
                    continue
        
        campaign_ids = sorted(list(campaign_ids_set))
        logger.info(f"Found {len(campaign_ids)} unique campaign IDs in data.csv: {campaign_ids}")
        
        return True, None, campaign_ids
        
    except Exception as e:
        error_msg = f"Error getting unique campaign IDs: {str(e)}"
        logger.error(error_msg)
        return False, error_msg, None


def set_campaign_id(campaign_id: int) -> Tuple[bool, Optional[str], Optional[int]]:
    """
    Set campaign_id for all records in data.csv.
    
    Process:
    1. Check if CSV exists and has records
    2. Check if campaign_id column exists
    3. If column doesn't exist, add it
    4. Set campaign_id value to all records
    5. Save updated CSV
    
    Args:
        campaign_id: Campaign ID to set for all records
    
    Returns:
        Tuple of (success, message, records_updated)
        - success: Whether operation succeeded
        - message: Success or error message
        - records_updated: Number of records updated, None if error
    """
    try:
        # Check if CSV exists
        if not DATA_CSV_PATH.exists():
            error_msg = "data.csv file does not exist"
            logger.error(error_msg)
            return False, error_msg, None
        
        # Check if CSV is empty (no data rows)
        if is_csv_empty():
            error_msg = "No records exist in data.csv"
            logger.warning(error_msg)
            return False, error_msg, None
        
        # Read all data from CSV
        success, error_msg, data = read_csv_data()
        if not success or data is None:
            error_msg = error_msg or "Failed to read data from CSV"
            logger.error(error_msg)
            return False, error_msg, None
        
        if not data:
            error_msg = "No records exist in data.csv"
            logger.warning(error_msg)
            return False, error_msg, None
        
        # Get existing columns
        existing_columns = get_existing_columns()
        if not existing_columns:
            error_msg = "Could not read CSV columns"
            logger.error(error_msg)
            return False, error_msg, None
        
        # Check if campaign_id column exists
        column_exists = 'campaign_id' in existing_columns
        
        # Add campaign_id to all records
        records_updated = 0
        for record in data:
            record['campaign_id'] = campaign_id
            records_updated += 1
        
        # Prepare fieldnames (add campaign_id if it doesn't exist)
        fieldnames = list(existing_columns)
        if not column_exists:
            fieldnames.append('campaign_id')
            logger.info(f"Adding campaign_id column to CSV")
        
        # Write updated data back to CSV
        DATA_CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(DATA_CSV_PATH, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(data)
        
        action_msg = "Added campaign_id column and set" if not column_exists else "Updated campaign_id for"
        success_msg = f"{action_msg} campaign_id={campaign_id} for {records_updated} records"
        logger.info(success_msg)
        
        return True, success_msg, records_updated
        
    except Exception as e:
        error_msg = f"Error setting campaign_id: {str(e)}"
        logger.error(error_msg)
        return False, error_msg, None


def format_phone_numbers() -> Tuple[bool, Optional[str], Optional[int]]:
    """
    Format phone numbers in CSV from 10 digits to +91 + 10 digits format.
    
    Process:
    1. Read all data from CSV
    2. Find phone number columns (contact_to, phone, contact_from)
    3. Check if all numbers already have +91 prefix
    4. If yes, return message "+91 exists before number"
    5. If no, format 10-digit numbers to +91 + 10 digits
    6. Write updated data back to CSV
    
    Returns:
        Tuple of (success, message, records_updated)
        - success: Whether operation succeeded
        - message: Success or error message
        - records_updated: Number of records updated, None if error
    """
    try:
        # Check if CSV exists
        if not DATA_CSV_PATH.exists():
            error_msg = "data.csv file does not exist"
            logger.error(error_msg)
            return False, error_msg, None
        
        # Check if CSV is empty (no data rows)
        if is_csv_empty():
            error_msg = "No records exist in data.csv"
            logger.warning(error_msg)
            return False, error_msg, None
        
        # Read all data from CSV
        success, error_msg, data = read_csv_data()
        if not success or data is None:
            error_msg = error_msg or "Failed to read data from CSV"
            logger.error(error_msg)
            return False, error_msg, None
        
        if not data:
            error_msg = "No records exist in data.csv"
            logger.warning(error_msg)
            return False, error_msg, None
        
        # Get existing columns
        existing_columns = get_existing_columns()
        if not existing_columns:
            error_msg = "Could not read CSV columns"
            logger.error(error_msg)
            return False, error_msg, None
        
        # Phone number columns to check (in order of priority)
        phone_columns = ['contact_to', 'phone', 'contact_from']
        
        # Find which phone columns exist in CSV
        available_phone_columns = [col for col in phone_columns if col in existing_columns]
        
        if not available_phone_columns:
            error_msg = "No phone number columns found in CSV (contact_to, phone, contact_from)"
            logger.warning(error_msg)
            return False, error_msg, None
        
        # Check if all numbers already have +91 prefix
        all_have_prefix = True
        total_phone_numbers = 0
        numbers_with_prefix = 0
        
        for record in data:
            for col in available_phone_columns:
                phone_value = record.get(col)
                if phone_value is not None and phone_value != '':
                    phone_str = str(phone_value).strip()
                    total_phone_numbers += 1
                    if phone_str.startswith('+91'):
                        numbers_with_prefix += 1
                    else:
                        all_have_prefix = False
        
        # If all numbers already have +91 prefix, return message
        if all_have_prefix and total_phone_numbers > 0:
            message = "+91 exists before number"
            logger.info(message)
            return True, message, 0
        
        # Format phone numbers: 10 digits -> +91 + 10 digits
        records_updated = 0
        for record in data:
            record_updated = False
            for col in available_phone_columns:
                phone_value = record.get(col)
                if phone_value is not None and phone_value != '':
                    phone_str = str(phone_value).strip()
                    
                    # Skip if already has +91 prefix
                    if phone_str.startswith('+91'):
                        continue
                    
                    # Remove any existing country code (91) if present
                    if phone_str.startswith('91') and len(phone_str) == 12:
                        phone_str = phone_str[2:]
                    
                    # Remove any non-digit characters
                    cleaned_phone = ''.join(c for c in phone_str if c.isdigit())
                    
                    # Format: if exactly 10 digits, add +91 prefix
                    if len(cleaned_phone) == 10:
                        formatted_phone = f"+91{cleaned_phone}"
                        record[col] = formatted_phone
                        record_updated = True
                        logger.debug(f"Formatted {col}: {phone_value} -> {formatted_phone}")
            
            if record_updated:
                records_updated += 1
        
        if records_updated == 0:
            message = "No phone numbers found that need formatting"
            logger.info(message)
            return True, message, 0
        
        # Write updated data back to CSV
        DATA_CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(DATA_CSV_PATH, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=existing_columns)
            writer.writeheader()
            writer.writerows(data)
        
        success_msg = f"Successfully formatted phone numbers for {records_updated} records"
        logger.info(success_msg)
        
        return True, success_msg, records_updated
        
    except Exception as e:
        error_msg = f"Error formatting phone numbers: {str(e)}"
        logger.error(error_msg)
        return False, error_msg, None


def upload_csv_file(file_content: bytes) -> Tuple[bool, Optional[str], Optional[int]]:
    """
    Upload CSV file and rewrite all data in data.csv.
    This completely replaces existing data with the uploaded file content.
    
    Args:
        file_content: CSV file content as bytes
    
    Returns:
        Tuple of (success, message, rows_written)
        - success: Whether operation succeeded
        - message: Success or error message
        - rows_written: Number of rows written if succeeded, None if failed
    """
    try:
        # Ensure data directory exists
        DATA_CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
        
        # Decode file content
        try:
            content_str = file_content.decode('utf-8')
        except UnicodeDecodeError:
            # Try with different encodings
            try:
                content_str = file_content.decode('latin-1')
            except UnicodeDecodeError:
                error_msg = "Could not decode CSV file. Please ensure it's UTF-8 encoded."
                logger.error(error_msg)
                return False, error_msg, None
        
        # Parse CSV content
        csv_reader = csv.DictReader(io.StringIO(content_str))
        rows = list(csv_reader)
        
        if not rows:
            error_msg = "CSV file is empty or has no data rows"
            logger.warning(error_msg)
            return False, error_msg, None
        
        # Get column names from first row
        fieldnames = list(rows[0].keys())
        
        # Write to CSV file (this will overwrite existing file)
        with open(DATA_CSV_PATH, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
        
        rows_written = len(rows)
        success_msg = f"Successfully uploaded and replaced CSV data with {rows_written} rows"
        logger.info(success_msg)
        
        return True, success_msg, rows_written
        
    except csv.Error as e:
        error_msg = f"Error parsing CSV file: {str(e)}"
        logger.error(error_msg)
        return False, error_msg, None
    except Exception as e:
        error_msg = f"Error uploading CSV file: {str(e)}"
        logger.error(error_msg)
        return False, error_msg, None
