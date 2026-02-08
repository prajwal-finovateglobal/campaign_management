#!/usr/bin/env python3
"""
Test script for process_campaign function.
Tests the logic to process chunks for a campaign by starting them in Millis.ai.
"""
import sys
import os
import asyncio
from pathlib import Path

# Add the backend directory to the Python path
backend_path = Path(__file__).parent / "backend"
sys.path.insert(0, str(backend_path))

from database.session import SessionLocal
from database.dependencies import DB_DEPENDENCY
from models.client import Campaign, Chunk
from models.automation import CampaignJob
from service.millis_api import start_campaign
import loguru
from sqlalchemy.exc import SQLAlchemyError
import time
from datetime import datetime

logger = loguru.logger.bind(test="process_campaign")


async def process_campaign(db: DB_DEPENDENCY, campaign_id: int) -> tuple[bool, str]:
    """
    Process a campaign by starting it in Millis.ai.
    Handles both single and multiple type campaigns.

    Args:
        db: Database session (DB_DEPENDENCY)
        campaign_id: The campaign ID to process

    Returns:
        Tuple of (success, message)
    """
    logger.info(f"Starting process_campaign for campaign_id: {campaign_id}")

    try:

        # Verify campaign exists
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            return False, f"Campaign with ID {campaign_id} not found"

        campaign_type = campaign.type if campaign.type else 'single'
        logger.info(f"Found campaign: {campaign.campaign_name} (type: {campaign_type})")

        # Handle single type campaigns
        if campaign_type == 'single':
            logger.info(f"Processing single type campaign {campaign_id}")
            
            if not campaign.cid:
                return False, f"Campaign {campaign_id} has no CID (Millis.ai campaign ID)"
            
            # Start the campaign in Millis.ai
            logger.info(f"Starting campaign {campaign.campaign_name} (CID: {campaign.cid}) in Millis.ai")
            success, error_msg = await start_campaign(campaign.cid)
            
            if success:
                logger.info(f"✅ Successfully started campaign {campaign_id} in Millis.ai")
                campaign.status = "started"
                db.commit()
                return True, f"Campaign {campaign_id} started successfully"
            else:
                logger.error(f"❌ Failed to start campaign {campaign_id}: {error_msg}")
                return False, f"Failed to start campaign: {error_msg}"

        # Handle multiple type campaigns (process chunks)
        logger.info(f"Processing multiple type campaign {campaign_id}")

        # Fetch all chunks where campaign_id = campaign_id and status != "finished"
        chunks = db.query(Chunk).filter(
            Chunk.campaign_id == campaign_id,
            Chunk.status != "finished"
        ).all()

        if not chunks:
            logger.info(f"No unfinished chunks found for campaign {campaign_id}")
            # Set campaign status to finished anyway
            campaign.status = "finished"
            db.commit()
            return True, f"No chunks to process. Campaign {campaign_id} marked as finished"

        logger.info(f"Found {len(chunks)} unfinished chunks to process")

        processed_chunks = 0
        failed_chunks = 0

        # Process each chunk
        for chunk in chunks:
            try:
                logger.info(f"Processing chunk: {chunk.chunk_name} (ID: {chunk.id}, CID: {chunk.cid})")

                # Step 1: Check current chunk status (like frontend does)
                # Frontend calls: api.get(`/chunk/${chunk.id}/status`)
                logger.info(f"Checking current status of chunk {chunk.chunk_name}")
                current_status = chunk.status  # We already filtered for != "finished" but let's log it
                logger.info(f"Current chunk status: {current_status}")

                # Step 2: Verify chunk has a CID (like frontend validates)
                if not chunk.cid:
                    logger.error(f"Chunk {chunk.chunk_name} has no CID, skipping")
                    failed_chunks += 1
                    continue

                # Step 3: Hit chunk to millis (start the campaign in Millis.ai)
                # This matches frontend's: api.post(`/chunk/${chunk.id}/start`)
                logger.info(f"Starting chunk {chunk.chunk_name} in Millis.ai")
                success, error_msg = await start_campaign(chunk.cid)

                if success:
                    logger.info(f"Successfully started chunk {chunk.chunk_name} in Millis.ai")

                    # Step 4: Update chunk status to "finished" (frontend updates UI progress)
                    chunk.status = "finished"
                    processed_chunks += 1
                    logger.info(f"Updated chunk {chunk.chunk_name} status to 'finished'")
                else:
                    logger.error(f"Failed to start chunk {chunk.chunk_name}: {error_msg}")
                    failed_chunks += 1
                    continue

                # Step 5: Update campaign status to "partly finished"
                # This matches frontend's progress updates
                campaign.status = "partly finished"
                db.commit()
                logger.info(f"Updated campaign {campaign_id} status to 'partly finished'")

                # Step 6: Sleep for 5 seconds after processing each chunk (like frontend countdown)
                logger.info(f"Sleeping for 5 seconds after processing chunk {chunk.chunk_name}")
                time.sleep(5)

            except Exception as e:
                logger.error(f"Error processing chunk {chunk.chunk_name}: {str(e)}")
                failed_chunks += 1
                continue

        # After complete, update campaign status to "finished"
        campaign.status = "finished"
        db.commit()
        logger.info(f"All chunks processed. Updated campaign {campaign_id} status to 'finished'")

        # Step 7: Send campaign completed notification (like frontend does)
        # Frontend calls: api.post(`/campaign/${campaign.id}/notify/completed`)
        try:
            logger.info("Sending campaign completed notification...")
            from service.notification import notify_campaign_completed
            await notify_campaign_completed(
                campaign_name=campaign.campaign_name,
                campaign_id=campaign_id,
                started_at=campaign.started_at,  # Use campaign's started_at if available
                completed_at=datetime.now()
            )
            logger.info("✅ Campaign completed notification sent")
        except Exception as notif_error:
            logger.error(f"Failed to send completed notification: {notif_error}")
            # Don't fail the whole process if notification fails

        result_message = f"Processed {processed_chunks} chunks successfully, {failed_chunks} failed"
        return True, result_message

    except Exception as e:
        logger.error(f"Error in process_campaign: {str(e)}")
        raise  # Re-raise to be handled by main()


async def main():
    """Main test function - processes all campaign jobs."""
    logger.info("=" * 80)
    logger.info("PROCESSING ALL CAMPAIGN JOBS")
    logger.info("=" * 80)

    # Create database session with proper lifecycle management
    db = SessionLocal()
    try:
        # Fetch all campaign jobs (optionally filter by status='queue')
        campaign_jobs = db.query(CampaignJob).order_by(
            CampaignJob.priority.desc(),
            CampaignJob.created_at.asc()
        ).all()
        
        if not campaign_jobs:
            logger.info("No campaign jobs found in database")
            return True, "No campaign jobs to process"
        
        logger.info(f"Found {len(campaign_jobs)} campaign job(s) to process")
        logger.info("=" * 80)
        
        results = []
        successful = 0
        failed = 0
        
        # Process each campaign job
        for idx, job in enumerate(campaign_jobs, 1):
            logger.info("")
            logger.info(f"{'=' * 80}")
            logger.info(f"PROCESSING CAMPAIGN JOB {idx}/{len(campaign_jobs)}")
            logger.info(f"{'=' * 80}")
            logger.info(f"Job ID: {job.id}")
            logger.info(f"Client ID: {job.client_id}")
            logger.info(f"Campaign ID: {job.campaign_id}")
            logger.info(f"Lot ID: {job.lot_id}")
            logger.info(f"Status: {job.status}")
            logger.info(f"Priority: {job.priority}")
            logger.info(f"Action: {job.action}")
            logger.info(f"{'=' * 80}")
            
            # Skip if action is 'stop' or 'pause'
            if job.action in ['stop', 'pause']:
                logger.info(f"⏸️  Skipping job {job.id} - action is '{job.action}'")
                results.append({
                    'job_id': job.id,
                    'campaign_id': job.campaign_id,
                    'status': 'skipped',
                    'message': f"Action is '{job.action}'"
                })
                continue
            
            # Skip if already completed or failed
            if job.status in ['completed', 'failed']:
                logger.info(f"⏭️  Skipping job {job.id} - status is '{job.status}'")
                results.append({
                    'job_id': job.id,
                    'campaign_id': job.campaign_id,
                    'status': 'skipped',
                    'message': f"Status is '{job.status}'"
                })
                continue
            
            try:
                # Process the campaign
                success, message = await process_campaign(db, job.campaign_id)

        if success:
                    logger.info(f"✅ Campaign {job.campaign_id} processed successfully: {message}")
                    successful += 1
                    results.append({
                        'job_id': job.id,
                        'campaign_id': job.campaign_id,
                        'status': 'success',
                        'message': message
                    })
        else:
                    logger.error(f"❌ Campaign {job.campaign_id} failed: {message}")
                    failed += 1
                    results.append({
                        'job_id': job.id,
                        'campaign_id': job.campaign_id,
                        'status': 'failed',
                        'message': message
                    })
                
                # Commit after each campaign
                db.commit()
                
            except Exception as e:
                logger.error(f"❌ Error processing campaign {job.campaign_id}: {str(e)}")
                failed += 1
                results.append({
                    'job_id': job.id,
                    'campaign_id': job.campaign_id,
                    'status': 'error',
                    'message': str(e)
                })
                db.rollback()
                continue
        
        # Summary
        logger.info("")
        logger.info("=" * 80)
        logger.info("PROCESSING SUMMARY")
        logger.info("=" * 80)
        logger.info(f"Total Jobs: {len(campaign_jobs)}")
        logger.info(f"✅ Successful: {successful}")
        logger.info(f"❌ Failed: {failed}")
        logger.info(f"⏭️  Skipped: {len(campaign_jobs) - successful - failed}")
        logger.info("=" * 80)
        
        # Print detailed results
        logger.info("")
        logger.info("DETAILED RESULTS:")
        for result in results:
            status_icon = {
                'success': '✅',
                'failed': '❌',
                'error': '❌',
                'skipped': '⏭️'
            }.get(result['status'], '❓')
            
            logger.info(f"{status_icon} Job {result['job_id']} (Campaign {result['campaign_id']}): {result['status']} - {result['message']}")
        
        return successful > 0, f"Processed {successful} successfully, {failed} failed"

    except SQLAlchemyError as e:
        logger.error(f"Database error occurred: {e}")
        db.rollback()
        return False, f"Database error: {str(e)}"
    except Exception as e:
        logger.error(f"Unexpected error occurred: {e}")
        db.rollback()
        return False, f"Unexpected error: {str(e)}"
    finally:
        db.close()


if __name__ == "__main__":
    # Run the test
    asyncio.run(main())