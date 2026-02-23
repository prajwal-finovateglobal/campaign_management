#!/usr/bin/env python3
"""
Test script for campaign workflow functions.
Tests all campaign job repository functions.
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
from models.automation import CampaignJob
from models.client import Campaign
from repo.campaign_jobs_repo import (
    reset_other_campaigns_to_queue,
    set_campaign_status,
    fetch_next_campaign,
    campaign_heartbeat
)
import loguru

logger = loguru.logger.bind(test="campaign_workflow")


async def test_reset_other_campaigns_to_queue(db: DB_DEPENDENCY, client_id: int, campaign_id: int):
    """Test reset_other_campaigns_to_queue function."""
    logger.info("=" * 80)
    logger.info("TEST 1: reset_other_campaigns_to_queue")
    logger.info("=" * 80)
    
    try:
        # Check current state
        all_jobs = db.query(CampaignJob).filter(
            CampaignJob.client_id == client_id
        ).all()
        
        logger.info(f"\nCurrent jobs for client_id={client_id}:")
        for job in all_jobs:
            logger.info(f"  Campaign {job.campaign_id}: status={job.status}, action={job.action}")
        
        # Run the function
        reset_count = await reset_other_campaigns_to_queue(db, client_id, campaign_id)
        logger.info(f"\n✅ Reset {reset_count} jobs to queue (excluding campaign_id={campaign_id})")
        
        # Check state after reset
        all_jobs_after = db.query(CampaignJob).filter(
            CampaignJob.client_id == client_id
        ).all()
        
        logger.info(f"\nJobs after reset:")
        for job in all_jobs_after:
            logger.info(f"  Campaign {job.campaign_id}: status={job.status}, action={job.action}")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Error in test_reset_other_campaigns_to_queue: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_set_campaign_status(db: DB_DEPENDENCY, client_id: int, campaign_id: int):
    """Test set_campaign_status function."""
    logger.info("\n" + "=" * 80)
    logger.info("TEST 2: set_campaign_status")
    logger.info("=" * 80)
    
    try:
        # Get current status
        job = db.query(CampaignJob).filter(
            CampaignJob.client_id == client_id,
            CampaignJob.campaign_id == campaign_id
        ).first()
        
        if not job:
            logger.error(f"❌ No job found for client_id={client_id}, campaign_id={campaign_id}")
            return False
        
        old_status = job.status
        logger.info(f"\nCurrent status: {old_status}")
        
        # Test setting to 'running'
        success = await set_campaign_status(db, client_id, campaign_id, 'running')
        if success:
            logger.info(f"✅ Status changed from '{old_status}' to 'running'")
            
            # Verify
            db.refresh(job)
            logger.info(f"   Verified: status={job.status}, started_at={job.started_at}")
        else:
            logger.error(f"❌ Failed to set status to 'running'")
            return False
        
        # Test setting back to 'queue'
        success = await set_campaign_status(db, client_id, campaign_id, 'queue')
        if success:
            logger.info(f"✅ Status changed from 'running' to 'queue'")
        else:
            logger.error(f"❌ Failed to set status to 'queue'")
            return False
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Error in test_set_campaign_status: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_fetch_next_campaign(db: DB_DEPENDENCY, client_id: int):
    """Test fetch_next_campaign function."""
    logger.info("\n" + "=" * 80)
    logger.info("TEST 3: fetch_next_campaign")
    logger.info("=" * 80)
    
    try:
        # Get all queued jobs first
        all_jobs = db.query(CampaignJob).filter(
            CampaignJob.client_id == client_id,
            CampaignJob.status == 'queue',
            CampaignJob.action == 'run'
        ).all()
        
        logger.info(f"\nAll queued jobs for client_id={client_id}:")
        for job in all_jobs:
            campaign = db.query(Campaign).filter(Campaign.id == job.campaign_id).first()
            phase_id = campaign.phase_id if campaign else None
            logger.info(f"  Campaign {job.campaign_id}: priority={job.priority}, phase_id={phase_id}, lot_id={job.lot_id}")
        
        # Fetch next campaign
        next_job = await fetch_next_campaign(db, client_id)
        
        if next_job:
            campaign = db.query(Campaign).filter(Campaign.id == next_job.campaign_id).first()
            phase_id = campaign.phase_id if campaign else None
            logger.info(f"\n✅ Next campaign to process:")
            logger.info(f"   Campaign ID: {next_job.campaign_id}")
            logger.info(f"   Lot ID: {next_job.lot_id}")
            logger.info(f"   Priority: {next_job.priority}")
            logger.info(f"   Phase ID: {phase_id}")
            logger.info(f"   Status: {next_job.status}")
            logger.info(f"   Action: {next_job.action}")
            return True
        else:
            logger.info(f"\n⚠️  No next campaign found (no queued jobs)")
            return True  # This is valid - no jobs to process
        
    except Exception as e:
        logger.error(f"❌ Error in test_fetch_next_campaign: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_campaign_heartbeat(db: DB_DEPENDENCY, client_id: int, campaign_id: int):
    """Test campaign_heartbeat function."""
    logger.info("\n" + "=" * 80)
    logger.info("TEST 4: campaign_heartbeat")
    logger.info("=" * 80)
    
    try:
        # Get job to find lot_id
        job = db.query(CampaignJob).filter(
            CampaignJob.client_id == client_id,
            CampaignJob.campaign_id == campaign_id
        ).first()
        
        if not job:
            logger.error(f"❌ No job found for client_id={client_id}, campaign_id={campaign_id}")
            return False
        
        lot_id = job.lot_id
        old_heartbeat = job.heartbeat_at
        old_status = job.status
        
        logger.info(f"\nCurrent state:")
        logger.info(f"   Status: {old_status}")
        logger.info(f"   Heartbeat: {old_heartbeat}")
        logger.info(f"   Lot ID: {lot_id}")
        
        # Test heartbeat update
        success = await campaign_heartbeat(db, client_id, lot_id, campaign_id, 'running')
        
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
        logger.error(f"❌ Error in test_campaign_heartbeat: {e}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    """Main test function."""
    logger.info("=" * 80)
    logger.info("CAMPAIGN WORKFLOW FUNCTIONS TEST")
    logger.info("=" * 80)
    
    client_id = 4
    campaign_id = 208
    
    logger.info(f"\nTesting with:")
    logger.info(f"   Client ID: {client_id}")
    logger.info(f"   Campaign ID: {campaign_id}")
    
    db = SessionLocal()
    results = []
    
    try:
        # Test 1: Reset other campaigns to queue
        result1 = await test_reset_other_campaigns_to_queue(db, client_id, campaign_id)
        results.append(("reset_other_campaigns_to_queue", result1))
        
        # Test 2: Set campaign status
        result2 = await test_set_campaign_status(db, client_id, campaign_id)
        results.append(("set_campaign_status", result2))
        
        # Test 3: Fetch next campaign
        result3 = await test_fetch_next_campaign(db, client_id)
        results.append(("fetch_next_campaign", result3))
        
        # Test 4: Campaign heartbeat
        result4 = await test_campaign_heartbeat(db, client_id, campaign_id)
        results.append(("campaign_heartbeat", result4))
        
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
