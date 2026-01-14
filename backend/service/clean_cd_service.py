"""
Service layer for Clean CD and Clear TD functionality.
Orchestrates the cleaning process across multiple campaigns.
"""
from database.dependencies import DB_DEPENDENCY
from repo.clean_cd_repo import (
    get_campaign_ids_from_phase,
    get_connected_records_for_campaign,
    get_disconnected_records_for_campaign,
    find_records_to_delete,
    delete_records_by_s_nos,
    get_phases_from_client,
    get_campaigns_from_phases,
    get_records_not_in_campaigns,
    delete_records_by_s_nos_no_campaign_check
)
from repo.tables import get_datalog_model_for_table
from typing import List, Dict, Tuple, Optional
import loguru

logger = loguru.logger.bind(service="clean_cd")


def clean_cd_service(
    db: DB_DEPENDENCY,
    campaign_ids: Optional[List[int]],
    phase_id: Optional[int],
    client_id: Optional[int],
    table_name: str
) -> Tuple[bool, str, int, Dict[int, int], str]:
    """
    Clean CD service: Delete disconnected records that have matching contact_to
    with connected records for the given campaigns.
    
    Priority order for determining campaigns to process:
    1. campaign_ids (if provided)
    2. phase_id (if provided and campaign_ids is not)
    3. client_id (if provided and neither campaign_ids nor phase_id is)
    
    Args:
        db: Database session
        campaign_ids: List of campaign IDs (optional)
        phase_id: Phase ID (optional, used if campaign_ids not provided)
        client_id: Client ID (optional, used if campaign_ids and phase_id not provided)
        table_name: Table name to operate on
        
    Returns:
        Tuple of (success, message, total_deleted, per_campaign_deleted, tone)
    """
    try:
        # Step 1: Determine which campaigns to process
        if campaign_ids and len(campaign_ids) > 0:
            campaigns_to_process = campaign_ids
            logger.info(f"Mode: Campaign-specific | Using provided campaign_ids: {campaign_ids}")
        elif phase_id is not None:
            campaigns_to_process = get_campaign_ids_from_phase(db, phase_id)
            if not campaigns_to_process:
                return (
                    False,
                    f"No campaigns found for phase_id={phase_id}",
                    0,
                    {},
                    "danger"
                )
            logger.info(f"Mode: Phase-level | Using campaigns from phase_id={phase_id}: {campaigns_to_process}")
        elif client_id is not None:
            # Client-level mode: Get all campaigns for the client
            logger.info(f"Mode: Client-level | Fetching all campaigns for client_id={client_id}")
            phase_ids = get_phases_from_client(db, client_id)
            if not phase_ids:
                return (
                    False,
                    f"No phases found for client_id={client_id}",
                    0,
                    {},
                    "danger"
                )
            logger.info(f"Found {len(phase_ids)} phases for client_id={client_id}: {phase_ids}")
            
            campaigns_to_process = get_campaigns_from_phases(db, phase_ids)
            if not campaigns_to_process:
                return (
                    False,
                    f"No campaigns found for client_id={client_id}",
                    0,
                    {},
                    "danger"
                )
            logger.info(f"Found {len(campaigns_to_process)} campaigns for client: {campaigns_to_process}")
        else:
            return (
                False,
                "Either campaign_ids, phase_id, or client_id must be provided",
                0,
                {},
                "danger"
            )
        
        # Step 2: Get the model for the table
        try:
            model = get_datalog_model_for_table(table_name)
            logger.info(f"Using model for table: {table_name}")
        except Exception as e:
            logger.error(f"Error getting model for table {table_name}: {e}")
            return (
                False,
                f"Invalid table name: {table_name}",
                0,
                {},
                "danger"
            )
        
        # Step 3: Process each campaign
        total_deleted = 0
        per_campaign_deleted: Dict[int, int] = {}
        
        for campaign_id in campaigns_to_process:
            logger.info(f"=== Processing campaign_id={campaign_id} ===")
            
            try:
                # Get connected records
                connected_records = get_connected_records_for_campaign(
                    db, model, campaign_id
                )
                
                # Get disconnected records
                disconnected_records = get_disconnected_records_for_campaign(
                    db, model, campaign_id
                )
                
                # Find records to delete (disconnected with matching contact_to within same campaign_id)
                s_nos_to_delete = find_records_to_delete(
                    connected_records,
                    disconnected_records,
                    campaign_id  # Pass campaign_id for validation
                )
                
                # Delete the records (with campaign_id safety check)
                deleted_count = 0
                if s_nos_to_delete:
                    logger.info(f"Campaign {campaign_id}: About to delete {len(s_nos_to_delete)} disconnected duplicate records")
                    deleted_count = delete_records_by_s_nos(
                        db, model, s_nos_to_delete, campaign_id  # Pass campaign_id for safety check
                    )
                else:
                    logger.info(f"Campaign {campaign_id}: No disconnected duplicate records found to delete")
                
                per_campaign_deleted[campaign_id] = deleted_count
                total_deleted += deleted_count
                
                logger.info(f"Campaign {campaign_id}: Deleted {deleted_count} records")
                
            except Exception as e:
                logger.error(f"Error processing campaign_id={campaign_id}: {e}")
                # Continue with other campaigns even if one fails
                per_campaign_deleted[campaign_id] = 0
                continue
        
        # Step 4: Prepare response
        if total_deleted > 0:
            message = f"Successfully deleted {total_deleted} disconnected record(s) across {len(campaigns_to_process)} campaign(s)"
            tone = "positive"
        else:
            message = f"No records found to delete for {len(campaigns_to_process)} campaign(s)"
            tone = "neutral"
        
        logger.info(f"Clean CD completed: {total_deleted} total records deleted")
        return (True, message, total_deleted, per_campaign_deleted, tone)
        
    except Exception as e:
        logger.error(f"Error in clean_cd_service: {e}")
        return (
            False,
            f"Error cleaning CD: {str(e)}",
            0,
            {},
            "danger"
        )


def clear_td_service(
    db: DB_DEPENDENCY,
    client_id: int,
    table_name: str
) -> Tuple[bool, str, int, List[int], str]:
    """
    Clear TD service: Delete all records from the table that do not belong
    to campaigns associated with the given client.
    
    Process:
    1. Fetch all phases associated with the client_id
    2. Fetch all campaigns associated with those phases
    3. Find all records whose campaign_id does NOT belong to those campaigns
    4. Delete those records
    
    Args:
        db: Database session
        client_id: Client ID
        table_name: Table name to operate on
        
    Returns:
        Tuple of (success, message, total_deleted, s_nos_deleted, tone)
    """
    try:
        logger.info(f"=== CLEAR TD SERVICE START ===")
        logger.info(f"client_id: {client_id}, table_name: {table_name}")
        
        # Step 1: Get the model for the table
        try:
            model = get_datalog_model_for_table(table_name)
            logger.info(f"Using model for table: {table_name}")
        except Exception as e:
            logger.error(f"Error getting model for table {table_name}: {e}")
            return (
                False,
                f"Invalid table name: {table_name}",
                0,
                [],
                "danger"
            )
        
        # Step 2: Fetch all phases associated with the client
        phase_ids = get_phases_from_client(db, client_id)
        if not phase_ids:
            return (
                False,
                f"No phases found for client_id={client_id}",
                0,
                [],
                "danger"
            )
        
        logger.info(f"Found {len(phase_ids)} phases for client_id={client_id}: {phase_ids}")
        
        # Step 3: Fetch all campaigns associated with those phases
        valid_campaign_ids = get_campaigns_from_phases(db, phase_ids)
        if not valid_campaign_ids:
            logger.warning(f"No campaigns found for phases {phase_ids}")
            # This is a dangerous situation - we would delete ALL records
            return (
                False,
                f"No campaigns found for client's phases. Cannot proceed with deletion.",
                0,
                [],
                "danger"
            )
        
        logger.info(f"Found {len(valid_campaign_ids)} valid campaigns: {valid_campaign_ids}")
        
        # Step 4: Find all records NOT belonging to these campaigns
        s_nos_to_delete = get_records_not_in_campaigns(
            db, model, valid_campaign_ids
        )
        
        if not s_nos_to_delete:
            logger.info("No records found to delete - all records belong to valid campaigns")
            return (
                True,
                f"No records found to delete. All records belong to campaigns of client_id={client_id}",
                0,
                [],
                "neutral"
            )
        
        logger.info(f"Found {len(s_nos_to_delete)} records to delete")
        
        # Step 5: Delete those records
        deleted_count = delete_records_by_s_nos_no_campaign_check(
            db, model, s_nos_to_delete
        )
        
        # Step 6: Prepare response
        if deleted_count > 0:
            message = f"Successfully deleted {deleted_count} record(s) that don't belong to client_id={client_id}'s campaigns"
            tone = "positive"
        else:
            message = f"No records were deleted"
            tone = "neutral"
        
        logger.info(f"Clear TD completed: {deleted_count} total records deleted")
        return (True, message, deleted_count, s_nos_to_delete[:100], tone)  # Return first 100 s_nos for logging
        
    except Exception as e:
        logger.error(f"Error in clear_td_service: {e}")
        import traceback
        traceback.print_exc()
        return (
            False,
            f"Error clearing TD: {str(e)}",
            0,
            [],
            "danger"
        )

