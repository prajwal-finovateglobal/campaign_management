#!/usr/bin/env python3
"""
Test script for data manager workflow functions.
Tests all data manager repository functions.
"""
import sys
import os
import asyncio
from pathlib import Path

# Add the backend directory to the Python path
backend_path = Path(__file__).parent
sys.path.insert(0, str(backend_path))

from database.session import SessionLocal
from database.dependencies import DB_DEPENDENCY
from models.automation import DataManager
from repo.data_manager_repo import (
    get_data_manager_priorities,
    ensure_data_manager_job,
    get_next_data_manager_job,
    pause_other_data_manager_jobs,
    set_data_manager_job_status,
    data_manager_heartbeat
)
import loguru

logger = loguru.logger.bind(test="data_manager_workflow")


async def test_get_data_manager_priorities(db: DB_DEPENDENCY, client_id: int):
    """Test get_data_manager_priorities function."""
    logger.info("=" * 80)
    logger.info("TEST 1: get_data_manager_priorities")
    logger.info("=" * 80)
    
    try:
        priorities = await get_data_manager_priorities(db, client_id)
        logger.info(f"\n✅ Available priorities for client_id={client_id}: {priorities}")
        return True
        
    except Exception as e:
        logger.error(f"❌ Error in test_get_data_manager_priorities: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_ensure_data_manager_job(db: DB_DEPENDENCY, client_id: int, campaign_ids: list):
    """Test ensure_data_manager_job function."""
    logger.info("\n" + "=" * 80)
    logger.info("TEST 2: ensure_data_manager_job")
    logger.info("=" * 80)
    
    try:
        results = []
        for idx, campaign_id in enumerate(campaign_ids, 1):
            priority = idx  # Use index as priority for testing
            logger.info(f"\nEnsuring job for campaign_id={campaign_id} with priority={priority}...")
            
            job = await ensure_data_manager_job(db, client_id, campaign_id, priority=priority)
            
            logger.info(f"✅ Job ensured: campaign_id={campaign_id}, job_id={job.id}, status={job.status}, priority={job.priority}")
            results.append(True)
        
        return all(results)
        
    except Exception as e:
        logger.error(f"❌ Error in test_ensure_data_manager_job: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_get_next_data_manager_job(db: DB_DEPENDENCY, client_id: int):
    """Test get_next_data_manager_job function."""
    logger.info("\n" + "=" * 80)
    logger.info("TEST 3: get_next_data_manager_job")
    logger.info("=" * 80)
    
    try:
        # Get all queued jobs first
        all_jobs = db.query(DataManager).filter(
            DataManager.client_id == client_id,
            DataManager.status == 'queue',
            DataManager.action == 'run'
        ).all()
        
        logger.info(f"\nAll queued jobs for client_id={client_id}:")
        for job in all_jobs:
            logger.info(f"  Campaign {job.campaign_id}: priority={job.priority}, created_at={job.created_at}")
        
        # Get next job
        next_job = await get_next_data_manager_job(db, client_id)
        
        if next_job:
            logger.info(f"\n✅ Next data manager job to process:")
            logger.info(f"   Campaign ID: {next_job.campaign_id}")
            logger.info(f"   Priority: {next_job.priority}")
            logger.info(f"   Status: {next_job.status}")
            logger.info(f"   Action: {next_job.action}")
            logger.info(f"   Processed Steps: {next_job.processed_steps}")
            return True
        else:
            logger.info(f"\n⚠️  No next job found (no queued jobs)")
            return True  # This is valid - no jobs to process
        
    except Exception as e:
        logger.error(f"❌ Error in test_get_next_data_manager_job: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_pause_other_data_manager_jobs(db: DB_DEPENDENCY, client_id: int, campaign_id: int):
    """Test pause_other_data_manager_jobs function."""
    logger.info("\n" + "=" * 80)
    logger.info("TEST 4: pause_other_data_manager_jobs")
    logger.info("=" * 80)
    
    try:
        # Check current state
        all_jobs = db.query(DataManager).filter(
            DataManager.client_id == client_id
        ).all()
        
        logger.info(f"\nCurrent jobs for client_id={client_id}:")
        for job in all_jobs:
            logger.info(f"  Campaign {job.campaign_id}: status={job.status}, action={job.action}")
        
        # Run the function
        paused_count = await pause_other_data_manager_jobs(db, client_id, campaign_id)
        logger.info(f"\n✅ Paused {paused_count} jobs (excluding campaign_id={campaign_id})")
        
        # Check state after pause
        all_jobs_after = db.query(DataManager).filter(
            DataManager.client_id == client_id
        ).all()
        
        logger.info(f"\nJobs after pause:")
        for job in all_jobs_after:
            logger.info(f"  Campaign {job.campaign_id}: status={job.status}, action={job.action}")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Error in test_pause_other_data_manager_jobs: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_set_data_manager_job_status(db: DB_DEPENDENCY, client_id: int, campaign_id: int):
    """Test set_data_manager_job_status function."""
    logger.info("\n" + "=" * 80)
    logger.info("TEST 5: set_data_manager_job_status")
    logger.info("=" * 80)
    
    try:
        # Get current status
        job = db.query(DataManager).filter(
            DataManager.client_id == client_id,
            DataManager.campaign_id == campaign_id
        ).first()
        
        if not job:
            logger.error(f"❌ No job found for client_id={client_id}, campaign_id={campaign_id}")
            return False
        
        old_status = job.status
        logger.info(f"\nCurrent status: {old_status}")
        
        # Test setting to 'running'
        success = await set_data_manager_job_status(db, client_id, campaign_id, 'running')
        if success:
            logger.info(f"✅ Status changed from '{old_status}' to 'running'")
            
            # Verify
            db.refresh(job)
            logger.info(f"   Verified: status={job.status}, started_at={job.started_at}")
        else:
            logger.error(f"❌ Failed to set status to 'running'")
            return False
        
        # Test setting back to 'queue'
        success = await set_data_manager_job_status(db, client_id, campaign_id, 'queue')
        if success:
            logger.info(f"✅ Status changed from 'running' to 'queue'")
        else:
            logger.error(f"❌ Failed to set status to 'queue'")
            return False
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Error in test_set_data_manager_job_status: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_data_manager_heartbeat(db: DB_DEPENDENCY, client_id: int, campaign_id: int):
    """Test data_manager_heartbeat function."""
    logger.info("\n" + "=" * 80)
    logger.info("TEST 6: data_manager_heartbeat")
    logger.info("=" * 80)
    
    try:
        # Get job
        job = db.query(DataManager).filter(
            DataManager.client_id == client_id,
            DataManager.campaign_id == campaign_id
        ).first()
        
        if not job:
            logger.error(f"❌ No job found for client_id={client_id}, campaign_id={campaign_id}")
            return False
        
        old_heartbeat = job.heartbeat_at
        old_status = job.status
        
        logger.info(f"\nCurrent state:")
        logger.info(f"   Status: {old_status}")
        logger.info(f"   Heartbeat: {old_heartbeat}")
        
        # Test heartbeat update
        success = await data_manager_heartbeat(db, client_id, campaign_id, 'running')
        
        if success:
            # Refresh and verify
            db.refresh(job)
            logger.info(f"\n✅ Heartbeat updated:")
            logger.info(f"   New status: {job.status}")
            logger.info(f"   New heartbeat: {job.heartbeat_at}")
            logger.info(f"   Started at: {job.started_at}")
            return True
        else:
            logger.error(f"❌ Failed to update heartbeat")
            return False
        
    except Exception as e:
        logger.error(f"❌ Error in test_data_manager_heartbeat: {e}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    """Main test function."""
    logger.info("=" * 80)
    logger.info("DATA MANAGER WORKFLOW FUNCTIONS TEST")
    logger.info("=" * 80)
    
    client_id = 4
    campaign_ids = [211, 213, 208]
    
    logger.info(f"\nTesting with:")
    logger.info(f"   Client ID: {client_id}")
    logger.info(f"   Campaign IDs: {campaign_ids}")
    
    db = SessionLocal()
    results = []
    
    try:
        # Test 1: Get priorities
        result1 = await test_get_data_manager_priorities(db, client_id)
        results.append(("get_data_manager_priorities", result1))
        
        # Test 2: Ensure jobs
        result2 = await test_ensure_data_manager_job(db, client_id, campaign_ids)
        results.append(("ensure_data_manager_job", result2))
        
        # Test 3: Get next job
        result3 = await test_get_next_data_manager_job(db, client_id)
        results.append(("get_next_data_manager_job", result3))
        
        # Test 4: Pause other jobs
        result4 = await test_pause_other_data_manager_jobs(db, client_id, campaign_ids[0])
        results.append(("pause_other_data_manager_jobs", result4))
        
        # Test 5: Set status
        result5 = await test_set_data_manager_job_status(db, client_id, campaign_ids[0])
        results.append(("set_data_manager_job_status", result5))
        
        # Test 6: Heartbeat
        result6 = await test_data_manager_heartbeat(db, client_id, campaign_ids[0])
        results.append(("data_manager_heartbeat", result6))
        
        # Summary
        logger.info("\n" + "=" * 80)
        logger.info("TEST SUMMARY")
        logger.info("=" * 80)
        
        for test_name, result in results:
            status = "✅ PASSED" if result else "❌ FAILED"
            logger.info(f"{status}: {test_name}")
        
        all_passed = all(result for _, result in results)
        
        if all_passed:
            logger.info("\n🎉 ALL TESTS PASSED!")
        else:
            logger.error("\n❌ SOME TESTS FAILED!")
        
        return all_passed
        
    except Exception as e:
        logger.error(f"❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
