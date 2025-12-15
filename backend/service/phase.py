from database.dependencies import DB_DEPENDENCY
from models.client import Phase, Client
from typing import Optional, List, Dict, Any, Tuple
import loguru

logger = loguru.logger

def get_phase_service(db: DB_DEPENDENCY, client_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """
    Get phase data from the database.
    
    Note: Phase status and records_count fields exist in DB but are not used.
    Phase stats should be calculated from campaigns when needed, not stored in phase table.
    
    Returns a list of dictionaries with phase information.
    """
    logger.info(f"Getting phase data for client_id: {client_id}")
    
    query = db.query(Phase)
    if client_id is not None:
        query = query.filter(Phase.client_id == client_id)
    
    result = query.all()
    
    # Convert ORM objects to dictionaries
    phases = []
    for phase in result:
        phase_dict = {
            'id': phase.id,
            'name': phase.name,
            'client_id': phase.client_id,
            # Note: status and records_count exist in DB but are not used in the model
            # They should be calculated from campaigns when needed
            'status': None,
            'records_count': None
        }
        phases.append(phase_dict)
    
    return phases


def create_phase_service(db: DB_DEPENDENCY, client_id: int) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """
    Create a new phase for a client with auto-generated name.
    
    Name generation logic:
    - Fetch client name based on client_id
    - Count existing phases for that client
    - Generate name: {client_name}_phase_{count+1}
    - If no phases exist (count=0), name will be {client_name}_phase_1
    
    Args:
        db: Database session
        client_id: Client ID to create phase for
    
    Returns:
        Tuple of (success, error_message, phase_data)
        - success: Whether operation succeeded
        - error_message: Error message if failed, None if succeeded
        - phase_data: Dict with 'id' and 'name' if succeeded, None if failed
    """
    logger.info(f"Creating new phase for client_id: {client_id}")
    
    try:
        # Fetch client by ID
        client = db.query(Client).filter(Client.id == client_id).first()
        if not client:
            error_msg = f"Client with id {client_id} not found"
            logger.error(error_msg)
            return False, error_msg, None
        
        client_name = client.name
        logger.info(f"Found client: {client_name} (id: {client_id})")
        
        # Count existing phases for this client
        phase_count = db.query(Phase).filter(Phase.client_id == client_id).count()
        logger.info(f"Found {phase_count} existing phases for client {client_name}")
        
        # Generate phase name: {client_name}_phase_{count+1}
        new_phase_number = phase_count + 1
        phase_name = f"{client_name}_phase_{new_phase_number}"
        logger.info(f"Generated phase name: {phase_name}")
        
        # Create new phase
        new_phase = Phase(
            name=phase_name,
            client_id=client_id
        )
        
        db.add(new_phase)
        db.commit()
        db.refresh(new_phase)
        
        logger.info(f"Successfully created phase: {phase_name} (id: {new_phase.id})")
        
        return True, None, {
            'id': new_phase.id,
            'name': new_phase.name,
            'client_id': new_phase.client_id,
            'status': None,  # Phase status not stored in model
            'records_count': None  # Phase records_count not stored in model
        }
        
    except Exception as e:
        db.rollback()
        error_msg = f"Error creating phase: {str(e)}"
        logger.error(error_msg)
        return False, error_msg, None

