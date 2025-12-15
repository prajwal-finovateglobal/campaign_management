from database.dependencies import DB_DEPENDENCY
from repo.tables import get_client
from typing import Optional, List, Dict, Any
import loguru

logger = loguru.logger

def get_client_service(db: DB_DEPENDENCY, client_id: Optional[int] = None) -> List[Dict[str, Any]] | None:
    """
    Get client data from the database.
    Returns a list of dictionaries with client information.
    """
    logger.info(f"Getting client data for client_id: {client_id}")
    result = get_client(db, client_id)
    
    # Convert ORM objects to dictionaries
    clients = []
    for client in result:
        client_dict = {
            'id': client.id,
            'name': client.name,
            'meta_map': client.meta_map,
            'table_name': client.table_name
        }
        clients.append(client_dict)
    
    return clients

def get_client_table_name(db: DB_DEPENDENCY, client_id: int) -> Optional[str]:
    """
    Get table_name for a specific client by client_id.
    
    Args:
        db: Database session
        client_id: Client ID to look up
    
    Returns:
        Table name string if client exists, None otherwise
    """
    logger.info(f"Getting table_name for client_id: {client_id}")
    try:
        result = get_client(db, client_id)
        if result and len(result) > 0:
            # result is a list of Client ORM objects
            client = result[0]
            table_name = client.table_name
            logger.info(f"Found table_name '{table_name}' for client_id {client_id}")
            return table_name
        else:
            logger.warning(f"Client with id {client_id} not found")
            return None
    except Exception as e:
        logger.error(f"Error getting table_name for client_id {client_id}: {e}")
        return None