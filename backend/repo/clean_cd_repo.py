"""
Repository layer for Clean CD and Clear TD functionality.
Handles database operations to separate connected/disconnected records
and identify records to delete based on contact_to matching or campaign association.
"""
from sqlalchemy.orm import Query
from database.dependencies import DB_DEPENDENCY
from repo.tables import get_base_query_for_table, get_datalog_model_for_table
from repo.filters import filter_by_connected_status, filter_by_campaign_ids
from models.client import Campaign, Phase
from typing import List, Dict, Set, Optional, Tuple
import loguru

logger = loguru.logger.bind(repo="clean_cd")


def get_campaign_ids_from_phase(db: DB_DEPENDENCY, phase_id: int) -> List[int]:
    """
    Get all campaign IDs associated with a phase.
    
    Args:
        db: Database session
        phase_id: Phase ID
        
    Returns:
        List of campaign IDs
    """
    try:
        campaigns = db.query(Campaign).filter(Campaign.phase_id == phase_id).all()
        campaign_ids = [c.id for c in campaigns]
        logger.info(f"Found {len(campaign_ids)} campaigns for phase_id={phase_id}: {campaign_ids}")
        return campaign_ids
    except Exception as e:
        logger.error(f"Error fetching campaigns for phase_id={phase_id}: {e}")
        return []


def get_connected_records_for_campaign(
    db: DB_DEPENDENCY,
    model: type,
    campaign_id: int
) -> List[Dict]:
    """
    Get all connected records for a specific campaign.
    Connected: duration, recording, chat are NOT NULL and chat is non-empty.
    
    IMPORTANT: Only returns records for the specified campaign_id.
    
    Args:
        db: Database session
        model: DataLog model class
        campaign_id: Campaign ID to filter by (MUST match)
        
    Returns:
        List of connected records as dictionaries with s_no, contact_to, name, and campaign_id
    """
    try:
        # CRITICAL: Filter by campaign_id FIRST
        query = db.query(model).filter(model.campaign_id == campaign_id)
        # Then filter by connected status
        query = filter_by_connected_status(query, con_status=True)
        records = query.all()
        
        # Convert to dicts with s_no, contact_to, name, and campaign_id
        result = []
        for record in records:
            record_campaign_id = getattr(record, 'campaign_id', None)
            # Double-check campaign_id matches (safety check)
            if record_campaign_id != campaign_id:
                logger.warning(f"WARNING: Record s_no={getattr(record, 's_no', None)} has campaign_id={record_campaign_id}, expected {campaign_id}. Skipping.")
                continue
            
            # Extract name from meta_data JSON field
            meta_data = getattr(record, 'meta_data', None) or {}
            name = meta_data.get('Name', None) if isinstance(meta_data, dict) else None
            
            result.append({
                's_no': getattr(record, 's_no', None),
                'contact_to': getattr(record, 'contact_to', None),
                'name': name,
                'campaign_id': campaign_id  # Explicitly set to ensure consistency
            })
        
        logger.info(f"Campaign {campaign_id}: Found {len(result)} connected records (all verified to belong to this campaign)")
        return result
    except Exception as e:
        logger.error(f"Error getting connected records for campaign_id={campaign_id}: {e}")
        return []


def get_disconnected_records_for_campaign(
    db: DB_DEPENDENCY,
    model: type,
    campaign_id: int
) -> List[Dict]:
    """
    Get all disconnected records for a specific campaign.
    Disconnected: duration IS NULL OR recording IS NULL OR chat IS NULL OR chat is empty.
    
    IMPORTANT: Only returns records for the specified campaign_id.
    
    Args:
        db: Database session
        model: DataLog model class
        campaign_id: Campaign ID to filter by (MUST match)
        
    Returns:
        List of disconnected records as dictionaries with s_no, contact_to, name, and campaign_id
    """
    try:
        # CRITICAL: Filter by campaign_id FIRST
        query = db.query(model).filter(model.campaign_id == campaign_id)
        # Then filter by disconnected status
        query = filter_by_connected_status(query, con_status=False)
        records = query.all()
        
        # Convert to dicts with s_no, contact_to, name, and campaign_id
        result = []
        for record in records:
            record_campaign_id = getattr(record, 'campaign_id', None)
            # Double-check campaign_id matches (safety check)
            if record_campaign_id != campaign_id:
                logger.warning(f"WARNING: Record s_no={getattr(record, 's_no', None)} has campaign_id={record_campaign_id}, expected {campaign_id}. Skipping.")
                continue
            
            # Extract name from meta_data JSON field
            meta_data = getattr(record, 'meta_data', None) or {}
            name = meta_data.get('Name', None) if isinstance(meta_data, dict) else None
            
            result.append({
                's_no': getattr(record, 's_no', None),
                'contact_to': getattr(record, 'contact_to', None),
                'name': name,
                'campaign_id': campaign_id  # Explicitly set to ensure consistency
            })
        
        logger.info(f"Campaign {campaign_id}: Found {len(result)} disconnected records (all verified to belong to this campaign)")
        return result
    except Exception as e:
        logger.error(f"Error getting disconnected records for campaign_id={campaign_id}: {e}")
        return []


def find_records_to_delete(
    connected_records: List[Dict],
    disconnected_records: List[Dict],
    campaign_id: int
) -> List[int]:
    """
    Find disconnected records that have matching contact_to AND name with connected records
    WITHIN THE SAME CAMPAIGN_ID.
    
    IMPORTANT: Uniqueness is determined by BOTH contact_to and name together.
    This is because the same phone number can have different names in call records.
    Only deletes disconnected records that are duplicates of connected records
    within the same campaign_id. Records from different campaigns are never matched.
    
    Args:
        connected_records: List of connected records with contact_to, name, and campaign_id
        disconnected_records: List of disconnected records with contact_to, name, s_no, and campaign_id
        campaign_id: Campaign ID to validate against (for safety)
        
    Returns:
        List of s_no values to delete (only disconnected records from the same campaign_id)
    """
    # Validate that all connected records belong to the same campaign_id
    for record in connected_records:
        record_campaign_id = record.get('campaign_id')
        if record_campaign_id != campaign_id:
            logger.warning(f"WARNING: Connected record has campaign_id={record_campaign_id}, expected {campaign_id}. Skipping this record.")
            continue
    
    # Create a set of (contact_to, name) tuples from connected records (same campaign_id only)
    # This ensures uniqueness is based on BOTH contact_to AND name
    connected_pairs: Set[Tuple[str, str]] = set()
    for record in connected_records:
        record_campaign_id = record.get('campaign_id')
        if record_campaign_id != campaign_id:
            continue  # Skip records from different campaigns
        contact_to = record.get('contact_to')
        name = record.get('name')
        if contact_to is not None and name is not None:
            # Convert to strings for comparison and create tuple
            connected_pairs.add((str(contact_to), str(name)))
    
    logger.info(f"Campaign {campaign_id}: Connected records have {len(connected_pairs)} unique (contact_to, name) pairs")
    
    # Find disconnected records with matching (contact_to, name) pair (same campaign_id only)
    s_nos_to_delete = []
    for record in disconnected_records:
        record_campaign_id = record.get('campaign_id')
        # CRITICAL: Only process records from the same campaign_id
        if record_campaign_id != campaign_id:
            logger.warning(f"WARNING: Disconnected record has campaign_id={record_campaign_id}, expected {campaign_id}. Skipping this record.")
            continue
        
        contact_to = record.get('contact_to')
        name = record.get('name')
        s_no = record.get('s_no')
        
        if contact_to is not None and name is not None and s_no is not None:
            pair = (str(contact_to), str(name))
            if pair in connected_pairs:
                s_nos_to_delete.append(s_no)
                logger.info(f"Campaign {campaign_id}: Found duplicate - disconnected record s_no={s_no} matches connected record with contact_to={contact_to}, name={name}")
            else:
                logger.debug(f"Campaign {campaign_id}: Disconnected record s_no={s_no} with contact_to={contact_to}, name={name} does NOT match any connected record")
        else:
            if contact_to is None:
                logger.debug(f"Campaign {campaign_id}: Disconnected record s_no={s_no} has no contact_to, skipping")
            if name is None:
                logger.debug(f"Campaign {campaign_id}: Disconnected record s_no={s_no} has no name, skipping")
            if s_no is None:
                logger.warning(f"Campaign {campaign_id}: Disconnected record has no s_no, cannot delete")
    
    logger.info(f"Campaign {campaign_id}: Found {len(s_nos_to_delete)} disconnected records to delete (duplicates of connected records within same campaign)")
    return s_nos_to_delete


def delete_records_by_s_nos(
    db: DB_DEPENDENCY,
    model: type,
    s_nos: List[int],
    campaign_id: int
) -> int:
    """
    Delete records by their s_no values, but ONLY if they belong to the specified campaign_id.
    
    IMPORTANT: This adds an extra safety check to ensure we only delete records
    from the intended campaign_id.
    
    Args:
        db: Database session
        model: DataLog model class
        s_nos: List of s_no values to delete
        campaign_id: Campaign ID to verify against (safety check)
        
    Returns:
        Number of records deleted
    """
    if not s_nos:
        logger.info(f"Campaign {campaign_id}: No records to delete")
        return 0
    
    try:
        # CRITICAL: Add campaign_id filter as safety check
        # Only delete records that match both s_no AND campaign_id
        deleted_count = db.query(model).filter(
            model.s_no.in_(s_nos),
            model.campaign_id == campaign_id
        ).delete(synchronize_session=False)
        db.commit()
        
        logger.info(f"Campaign {campaign_id}: Deleted {deleted_count} disconnected duplicate records with s_nos: {s_nos[:10]}..." if len(s_nos) > 10 else f"Campaign {campaign_id}: Deleted {deleted_count} disconnected duplicate records with s_nos: {s_nos}")
        
        # Safety check: verify we deleted the expected number
        if deleted_count != len(s_nos):
            logger.warning(f"Campaign {campaign_id}: Expected to delete {len(s_nos)} records but deleted {deleted_count}. Some records may not belong to this campaign or may have been already deleted.")
        
        return deleted_count
    except Exception as e:
        db.rollback()
        logger.error(f"Campaign {campaign_id}: Error deleting records: {e}")
        raise


# ==================== CLEAR TD FUNCTIONS ====================

def get_phases_from_client(db: DB_DEPENDENCY, client_id: int) -> List[int]:
    """
    Get all phase IDs associated with a client.
    
    Args:
        db: Database session
        client_id: Client ID
        
    Returns:
        List of phase IDs
    """
    try:
        phases = db.query(Phase).filter(Phase.client_id == client_id).all()
        phase_ids = [p.id for p in phases]
        logger.info(f"Found {len(phase_ids)} phases for client_id={client_id}: {phase_ids}")
        return phase_ids
    except Exception as e:
        logger.error(f"Error fetching phases for client_id={client_id}: {e}")
        return []


def get_campaigns_from_phases(db: DB_DEPENDENCY, phase_ids: List[int]) -> List[int]:
    """
    Get all campaign IDs associated with a list of phases.
    
    Args:
        db: Database session
        phase_ids: List of phase IDs
        
    Returns:
        List of campaign IDs
    """
    try:
        if not phase_ids:
            logger.info("No phase IDs provided, returning empty campaign list")
            return []
        
        campaigns = db.query(Campaign).filter(Campaign.phase_id.in_(phase_ids)).all()
        campaign_ids = [c.id for c in campaigns]
        logger.info(f"Found {len(campaign_ids)} campaigns for phase_ids={phase_ids}: {campaign_ids}")
        return campaign_ids
    except Exception as e:
        logger.error(f"Error fetching campaigns for phase_ids={phase_ids}: {e}")
        return []


def get_records_not_in_campaigns(
    db: DB_DEPENDENCY,
    model: type,
    valid_campaign_ids: List[int]
) -> List[int]:
    """
    Get all record s_no values whose campaign_id does NOT belong to the valid campaign list.
    
    Args:
        db: Database session
        model: DataLog model class
        valid_campaign_ids: List of valid campaign IDs
        
    Returns:
        List of s_no values for records not belonging to valid campaigns
    """
    try:
        if not valid_campaign_ids:
            # If no valid campaigns, all records should be deleted
            logger.warning("No valid campaign IDs provided - this would delete ALL records")
            records = db.query(model.s_no).all()
            s_nos = [r[0] for r in records]
            logger.info(f"Found {len(s_nos)} records (all records, no valid campaigns)")
            return s_nos
        
        # Query for records where campaign_id is NULL or NOT in the valid list
        # Use .notin_() instead of ~.in_() for proper NULL handling
        query = db.query(model.s_no).filter(
            (model.campaign_id.is_(None)) | (model.campaign_id.notin_(valid_campaign_ids))
        )
        records = query.all()
        s_nos = [r[0] for r in records]
        
        logger.info(f"Found {len(s_nos)} records not belonging to valid campaigns {valid_campaign_ids}")
        return s_nos
    except Exception as e:
        logger.error(f"Error getting records not in campaigns: {e}")
        return []


def delete_records_by_s_nos_no_campaign_check(
    db: DB_DEPENDENCY,
    model: type,
    s_nos: List[int]
) -> int:
    """
    Delete records by their s_no values without campaign_id check.
    Used for Clear TD where we're deleting records that don't belong to valid campaigns.
    
    Args:
        db: Database session
        model: DataLog model class
        s_nos: List of s_no values to delete
        
    Returns:
        Number of records deleted
    """
    if not s_nos:
        logger.info("No records to delete")
        return 0
    
    try:
        deleted_count = db.query(model).filter(
            model.s_no.in_(s_nos)
        ).delete(synchronize_session=False)
        db.commit()
        
        logger.info(f"Deleted {deleted_count} records with s_nos: {s_nos[:10]}..." if len(s_nos) > 10 else f"Deleted {deleted_count} records with s_nos: {s_nos}")
        
        # Safety check: verify we deleted the expected number
        if deleted_count != len(s_nos):
            logger.warning(f"Expected to delete {len(s_nos)} records but deleted {deleted_count}. Some records may have been already deleted.")
        
        return deleted_count
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting records: {e}")
        raise

