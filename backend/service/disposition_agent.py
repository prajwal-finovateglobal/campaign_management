"""
Disposition Agent - Campaign Orchestrator
Manages sequential processing of disposition jobs for a client
"""

import asyncio
from typing import Tuple, Optional, Dict, Any
from loguru import logger
from database.dependencies import DB_DEPENDENCY
from service.disposition_jobs_service import (
    check_if_busy,
    check_job_alive,
    ensure_job_exists,
    pause_other_campaigns,
    get_current_cursor,
    get_max_cursor,
    get_next_job,
    set_job_status,
    process_disposition
)


async def start_disposition_agent(
    db: DB_DEPENDENCY,
    client_id: int,
    campaign_id: int,
    table_name: str,
    max_cursor: int = 10
) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    """
    Start the disposition agent for a client with safety checks.
    
    This is the main entry point for disposition processing. It includes:
    1. Safety check: Don't interfere with already running healthy jobs
    2. Recovery: Take over if a job is running but dead (heartbeat expired)
    3. Orchestration: Process campaigns sequentially until all are done
    
    Flow:
    ┌─ is_busy?
    │  ├─ YES → is_alive?
    │  │  ├─ YES → LEAVE (already running OK)
    │  │  └─ NO → RUN (take over dead job)
    │  └─ NO → RUN (start fresh)
    
    Args:
        db: Database session
        client_id: Client ID
        campaign_id: Initial campaign ID to process
        table_name: Datalog table name (e.g., "dummy_table")
        max_cursor: Maximum cursor value before campaign is considered complete
        
    Returns:
        Tuple of (success, message, result_data)
    """
    try:
        logger.info(f"=" * 80)
        logger.info(f"DISPOSITION AGENT START")
        logger.info(f"Client: {client_id}, Initial Campaign: {campaign_id}")
        logger.info(f"=" * 80)
        
        # STEP 1: Check if job is BUSY
        logger.info(f"STEP 1: Checking if client {client_id} is busy...")
        success, msg, is_busy = await check_if_busy(db, client_id)
        
        if not success:
            logger.error(f"Failed to check if busy: {msg}")
            return (False, f"Error checking busy status: {msg}", None)
        
        logger.info(f"Is busy: {is_busy}")
        
        # STEP 2: If BUSY, check if ALIVE
        if is_busy:
            logger.info(f"STEP 2: Client is BUSY - checking if job is ALIVE...")
            success, msg, is_alive = await check_job_alive(db, client_id)
            
            if not success:
                logger.error(f"Failed to check if alive: {msg}")
                return (False, f"Error checking alive status: {msg}", None)
            
            logger.info(f"Is alive: {is_alive}")
            
            if is_alive:
                # Job is running and healthy - don't interfere
                logger.info(f"✅ LEAVING: Job is running and healthy - no action needed")
                return (
                    True,
                    "Disposition agent already running and healthy - no action taken",
                    {
                        "action": "skipped",
                        "reason": "already_running_healthy",
                        "client_id": client_id,
                        "is_busy": True,
                        "is_alive": True
                    }
                )
            else:
                # Job exists but is dead - we'll take over
                logger.warning(f"⚠️  Job exists but is DEAD - taking over...")
        else:
            logger.info(f"STEP 2: Client is NOT BUSY - starting fresh...")
        
        # STEP 3: Run the orchestrator loop
        logger.info(f"=" * 80)
        logger.info(f"STEP 3: STARTING ORCHESTRATOR LOOP")
        logger.info(f"=" * 80)
        
        result = await run_orchestrator_loop(
            db,
            client_id,
            campaign_id,
            table_name,
            max_cursor
        )
        
        return result
        
    except Exception as e:
        logger.error(f"Error in disposition agent: {e}")
        import traceback
        traceback.print_exc()
        return (False, f"Error: {str(e)}", None)


async def run_orchestrator_loop(
    db: DB_DEPENDENCY,
    client_id: int,
    initial_campaign_id: int,
    table_name: str,
    max_cursor: int
) -> Tuple[bool, str, Dict[str, Any]]:
    """
    Main orchestrator loop - processes campaigns sequentially.
    
    Flow:
    1. Start with initial_campaign_id
    2. Process disposition until cursor >= max_cursor
    3. Mark as completed
    4. Fetch next campaign by priority
    5. Repeat until no more campaigns
    
    Args:
        db: Database session
        client_id: Client ID
        initial_campaign_id: Starting campaign ID
        table_name: Datalog table name
        max_cursor: Maximum cursor before completion
        
    Returns:
        Tuple of (success, message, result_data)
    """
    try:
        # Initialize
        active_campaign_id = initial_campaign_id
        campaigns_processed = []
        iteration_count = 0
        
        # Ensure initial campaign exists
        logger.info(f"Ensuring campaign {initial_campaign_id} exists...")
        await ensure_job_exists(db, client_id, initial_campaign_id)
        
        # Reset all other campaigns to queue
        logger.info(f"Resetting other campaigns to queue...")
        await pause_other_campaigns(db, client_id, active_campaign_id)
        
        # Set initial campaign to running
        logger.info(f"Setting campaign {active_campaign_id} to 'running'...")
        await set_job_status(db, client_id, active_campaign_id, 'running')
        
        logger.info(f"🚀 Starting orchestrator loop with campaign {active_campaign_id}")
        logger.info(f"=" * 80)
        
        # Main orchestrator loop
        while True:
            iteration_count += 1
            logger.info(f"\n{'='*80}")
            logger.info(f"ITERATION {iteration_count}: Processing campaign {active_campaign_id}")
            logger.info(f"{'='*80}")
            
            # Fetch current cursor
            success, msg, cursor = await get_current_cursor(db, client_id, active_campaign_id)
            if not success:
                logger.error(f"Failed to fetch cursor: {msg}")
                return (False, f"Error fetching cursor: {msg}", None)
            
            logger.info(f"Current cursor: {cursor} / Max cursor: {max_cursor}")
            
            # Check if campaign is complete
            if cursor >= max_cursor:
                logger.info(f"✅ Campaign {active_campaign_id} reached max cursor - marking as COMPLETED")
                
                # Mark current campaign as completed
                await set_job_status(db, client_id, active_campaign_id, 'completed')
                campaigns_processed.append({
                    "campaign_id": active_campaign_id,
                    "final_cursor": cursor,
                    "status": "completed"
                })
                
                # Fetch next campaign
                logger.info(f"Fetching next campaign to process...")
                success, msg, next_campaign_id = await get_next_job(db, client_id)
                
                if not success:
                    logger.error(f"Error fetching next job: {msg}")
                    return (False, f"Error fetching next job: {msg}", None)
                
                if next_campaign_id is None:
                    logger.info(f"🎉 NO MORE CAMPAIGNS - All campaigns processed!")
                    logger.info(f"=" * 80)
                    break
                
                # Switch to next campaign
                logger.info(f"➡️  Switching to next campaign: {next_campaign_id}")
                active_campaign_id = next_campaign_id
                
                # Reset other campaigns to queue
                await pause_other_campaigns(db, client_id, active_campaign_id)
                
                # Set new campaign to running
                await set_job_status(db, client_id, active_campaign_id, 'running')
                
                logger.info(f"✅ Campaign {active_campaign_id} is now RUNNING")
                continue
            
            # Process disposition (this will increment cursor)
            logger.info(f"📊 Processing disposition for campaign {active_campaign_id}...")
            success, msg, result = process_disposition(
                db,
                client_id,
                active_campaign_id,
                table_name
            )
            
            if not success:
                logger.error(f"Failed to process disposition: {msg}")
                return (False, f"Error processing disposition: {msg}", None)
            
            logger.info(f"✅ Disposition processing completed")
            
            # After process_disposition, the campaign should be completed
            # (based on current implementation which sets to completed after 10 iterations)
            # So we continue the loop to check status
        
        # All campaigns processed successfully
        final_result = {
            "client_id": client_id,
            "initial_campaign_id": initial_campaign_id,
            "campaigns_processed": campaigns_processed,
            "total_campaigns": len(campaigns_processed),
            "total_iterations": iteration_count,
            "status": "all_completed"
        }
        
        logger.info(f"=" * 80)
        logger.info(f"ORCHESTRATOR COMPLETE")
        logger.info(f"Processed {len(campaigns_processed)} campaign(s)")
        logger.info(f"Total iterations: {iteration_count}")
        logger.info(f"=" * 80)
        
        return (
            True,
            f"Successfully processed {len(campaigns_processed)} campaign(s)",
            final_result
        )
        
    except Exception as e:
        logger.error(f"Error in orchestrator loop: {e}")
        import traceback
        traceback.print_exc()
        return (False, f"Error: {str(e)}", None)
