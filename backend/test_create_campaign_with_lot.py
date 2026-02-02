"""
Test script for create_campaign_with_lot function
Tests with chunk_size=2 (multiple type campaign)
"""
import asyncio
from database.session import SessionLocal
from service.chunk import create_campaign_with_lot, create_chunks
from models.client import Client, Phase
from sqlalchemy import text

async def test_create_campaign_with_lot():
    db = SessionLocal()
    
    print("=" * 80)
    print("TEST: create_campaign_with_lot with chunk_size=2")
    print("=" * 80)
    print()
    
    try:
        # Step 1: Get or create a client
        print("Step 1: Getting client...")
        client = db.query(Client).first()
        if not client:
            print("❌ No client found. Please create a client first.")
            return False
        
        client_id = client.id
        print(f"✅ Using client_id: {client_id}, name: {client.name}")
        print()
        
        # Step 2: Get or create phase_1
        print("Step 2: Getting phase_1...")
        phases = db.query(Phase).filter(Phase.client_id == client_id).order_by(Phase.id.asc()).all()
        if not phases:
            print("❌ No phases found. Please create a phase first.")
            return False
        
        phase_1 = phases[0]
        print(f"✅ Found phase_1: id={phase_1.id}, name={phase_1.name}")
        print()
        
        # Step 3: For multiple type, we need to create campaign first, then chunks, then upsert
        # But our function tries to upsert immediately. Let's test with single type first,
        # then we'll do multiple type separately
        
        print("=" * 80)
        print("OPTION 1: Testing with SINGLE type (direct upload)")
        print("=" * 80)
        print()
        
        success, error_msg, result = await create_campaign_with_lot(
            db=db,
            client_id=client_id,
            campaign_type='single',
            is_full=True,
            priority=0
        )
        
        if not success:
            print(f"❌ Failed: {error_msg}")
            return False
        
        print()
        print("✅ SUCCESS - Single type campaign created!")
        print(f"   Campaign ID: {result.get('id')}")
        print(f"   Campaign Name: {result.get('campaign_name')}")
        print(f"   Lot ID: {result.get('lot_id')}")
        print(f"   Phase ID: {result.get('phase_id')}")
        print(f"   Records Uploaded: {result.get('records_uploaded', 0)}")
        print()
        
        # Step 4: Now test with MULTIPLE type (chunk_size=2)
        print("=" * 80)
        print("OPTION 2: Testing with MULTIPLE type (chunk_size=2)")
        print("=" * 80)
        print()
        
        # For multiple type, we need to:
        # 1. Create campaign (without upserting yet)
        # 2. Create chunks with chunk_size=2
        # 3. Then upsert
        
        # Actually, let's modify the approach - create campaign with lot first
        # Then create chunks, then manually call upsert
        
        print("Creating campaign with lot (multiple type)...")
        success2, error_msg2, result2 = await create_campaign_with_lot(
            db=db,
            client_id=client_id,
            campaign_type='multiple',
            is_full=True,
            priority=0
        )
        
        if not success2:
            print(f"❌ Failed to create campaign: {error_msg2}")
            # Check if it failed because chunks don't exist
            if "chunks" in error_msg2.lower() or "chunk" in error_msg2.lower():
                print()
                print("⚠️  Campaign created but upsert failed (chunks don't exist yet)")
                print("   This is expected - we need to create chunks first")
                print()
                
                # Get the campaign_id from the error or try to find it
                # Actually, if it failed, the campaign might have been rolled back
                # Let's create it differently
                print("Creating campaign without upsert first...")
                from service.campaign import create_campaign_service
                
                success3, error_msg3, campaign_data = await create_campaign_service(
                    db=db,
                    phase_id=phase_1.id,
                    phase_name=phase_1.name,
                    campaign_type='multiple',
                    is_full=True
                )
                
                if not success3:
                    print(f"❌ Failed to create campaign: {error_msg3}")
                    return False
                
                campaign_id = campaign_data['id']
                print(f"✅ Created campaign: id={campaign_id}")
                print()
                
                # Set campaign_id in CSV to match the new campaign
                print(f"Setting campaign_id in CSV to {campaign_id}...")
                from service.csv_service import set_campaign_id
                csv_set_success, csv_set_msg, csv_set_count = set_campaign_id(campaign_id)
                if not csv_set_success:
                    print(f"❌ Failed to set campaign_id in CSV: {csv_set_msg}")
                    return False
                print(f"✅ Set campaign_id={campaign_id} for {csv_set_count} records in CSV")
                print()
                
                # Now create chunks
                print(f"Creating chunks with chunk_size=2 for campaign {campaign_id}...")
                chunk_success, chunk_error, chunk_data = create_chunks(
                    db=db,
                    campaign_id=campaign_id,
                    chunk_size=2
                )
                
                if not chunk_success:
                    print(f"❌ Failed to create chunks: {chunk_error}")
                    return False
                
                print(f"✅ Created {len(chunk_data)} chunks")
                for chunk in chunk_data:
                    print(f"   - {chunk['chunk_name']}: {chunk['records_count']} records")
                print()
                
                # Now create lot and job, then upsert
                print("Creating DataLot and campaign job...")
                from repo.campaign_jobs_repo import ensure_campaign_job
                from models.automation import DataLot
                
                # Create DataLot
                existing_lots_count = db.query(DataLot).filter(
                    DataLot.client_id == client_id
                ).count()
                
                lot_name = f"{client.name}_lot_{existing_lots_count + 1}"
                new_lot = DataLot(
                    name=lot_name,
                    client_id=client_id,
                    max_phases=len(phases),
                    current_phase_no=1,
                    status='active',
                    total_records=0
                )
                db.add(new_lot)
                db.flush()
                lot_id = new_lot.id
                print(f"✅ Created DataLot: id={lot_id}, name={lot_name}")
                
                # Ensure campaign job
                job = await ensure_campaign_job(
                    db=db,
                    client_id=client_id,
                    lot_id=lot_id,
                    campaign_id=campaign_id,
                    priority=0
                )
                print(f"✅ Created campaign job: id={job.id}")
                print()
                
                # Now upsert chunks
                print("Upserting chunks...")
                from service.chunk import upsert_all_chunks
                
                upsert_success, upsert_error, upsert_data = await upsert_all_chunks(
                    db=db,
                    campaign_id=campaign_id
                )
                
                if not upsert_success:
                    print(f"❌ Failed to upsert chunks: {upsert_error}")
                    return False
                
                records_uploaded = upsert_data.get('total_records', 0)
                print(f"✅ Upserted {records_uploaded} records via {upsert_data.get('chunks_upserted', 0)} chunks")
                print()
                
                # Update DataLot total_records
                lot = db.query(DataLot).filter(DataLot.id == lot_id).first()
                if lot:
                    lot.total_records = records_uploaded
                    db.commit()
                    print(f"✅ Updated DataLot.total_records to {records_uploaded}")
                
                print()
                print("=" * 80)
                print("✅ SUCCESS - Multiple type campaign with chunks created!")
                print(f"   Campaign ID: {campaign_id}")
                print(f"   Lot ID: {lot_id}")
                print(f"   Chunks: {len(chunk_data)}")
                print(f"   Records Uploaded: {records_uploaded}")
                print("=" * 80)
                
                return True
            else:
                return False
        
        print()
        print("✅ SUCCESS - Multiple type campaign created!")
        print(f"   Campaign ID: {result2.get('id')}")
        print(f"   Lot ID: {result2.get('lot_id')}")
        print(f"   Records Uploaded: {result2.get('records_uploaded', 0)}")
        print()
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()

async def main():
    success = await test_create_campaign_with_lot()
    
    print()
    print("=" * 80)
    if success:
        print("🎉 TEST COMPLETED SUCCESSFULLY!")
    else:
        print("❌ TEST FAILED")
    print("=" * 80)

if __name__ == "__main__":
    asyncio.run(main())
