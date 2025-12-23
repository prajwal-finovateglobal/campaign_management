"""
Test script for campaign status calculation based on chunk statuses.
This tests the calculate_campaign_status_from_chunks function logic.
"""

class MockChunk:
    """Mock Chunk object for testing"""
    def __init__(self, status):
        self.status = status


def calculate_campaign_status_from_chunks(chunks):
    """
    Calculate campaign status based on chunk statuses for multiple-type campaigns.
    (Copy of the actual function for testing)
    """
    if not chunks:
        return "pending"
    
    # Count chunk statuses
    status_counts = {}
    for chunk in chunks:
        chunk_status = chunk.status or "pending"
        status_counts[chunk_status] = status_counts.get(chunk_status, 0) + 1
    
    total_chunks = len(chunks)
    idle_count = status_counts.get("idle", 0)
    pending_count = status_counts.get("pending", 0)
    finished_count = status_counts.get("finished", 0)
    started_count = status_counts.get("started", 0)
    
    # Apply status rules
    if idle_count == total_chunks:
        return "idle"
    elif finished_count == total_chunks:
        return "finished"
    elif started_count == total_chunks:
        return "started"
    elif pending_count == total_chunks:
        return "pending"
    elif idle_count > 0 and pending_count > 0 and finished_count == 0 and started_count == 0:
        return "partly idle"
    elif finished_count > 0 and (idle_count > 0 or started_count > 0):
        return "partly finished"
    elif started_count > 0 and idle_count > 0:
        return "chunks_started"
    else:
        # Default for mixed states not covered above
        return "mixed"


def test_status_calculation():
    """Test various chunk status combinations"""
    
    print("Testing Campaign Status Calculation\n" + "="*50)
    
    # Test 1: All chunks idle
    print("\n1. All chunks idle:")
    chunks = [MockChunk("idle"), MockChunk("idle"), MockChunk("idle")]
    result = calculate_campaign_status_from_chunks(chunks)
    print(f"   Chunks: ['idle', 'idle', 'idle']")
    print(f"   Expected: 'idle'")
    print(f"   Result: '{result}'")
    print(f"   ✓ PASS" if result == "idle" else f"   ✗ FAIL")
    
    # Test 2: All chunks finished
    print("\n2. All chunks finished:")
    chunks = [MockChunk("finished"), MockChunk("finished")]
    result = calculate_campaign_status_from_chunks(chunks)
    print(f"   Chunks: ['finished', 'finished']")
    print(f"   Expected: 'finished'")
    print(f"   Result: '{result}'")
    print(f"   ✓ PASS" if result == "finished" else f"   ✗ FAIL")
    
    # Test 3: Some idle, some pending
    print("\n3. Some idle, some pending:")
    chunks = [MockChunk("idle"), MockChunk("pending"), MockChunk("idle")]
    result = calculate_campaign_status_from_chunks(chunks)
    print(f"   Chunks: ['idle', 'pending', 'idle']")
    print(f"   Expected: 'partly idle'")
    print(f"   Result: '{result}'")
    print(f"   ✓ PASS" if result == "partly idle" else f"   ✗ FAIL")
    
    # Test 4: Some finished, some idle
    print("\n4. Some finished, some idle:")
    chunks = [MockChunk("finished"), MockChunk("idle"), MockChunk("idle")]
    result = calculate_campaign_status_from_chunks(chunks)
    print(f"   Chunks: ['finished', 'idle', 'idle']")
    print(f"   Expected: 'partly finished'")
    print(f"   Result: '{result}'")
    print(f"   ✓ PASS" if result == "partly finished" else f"   ✗ FAIL")
    
    # Test 5: Some finished, some started
    print("\n5. Some finished, some started:")
    chunks = [MockChunk("finished"), MockChunk("started"), MockChunk("finished")]
    result = calculate_campaign_status_from_chunks(chunks)
    print(f"   Chunks: ['finished', 'started', 'finished']")
    print(f"   Expected: 'partly finished'")
    print(f"   Result: '{result}'")
    print(f"   ✓ PASS" if result == "partly finished" else f"   ✗ FAIL")
    
    # Test 6: Some started, some idle
    print("\n6. Some started, some idle:")
    chunks = [MockChunk("started"), MockChunk("idle"), MockChunk("idle")]
    result = calculate_campaign_status_from_chunks(chunks)
    print(f"   Chunks: ['started', 'idle', 'idle']")
    print(f"   Expected: 'chunks_started'")
    print(f"   Result: '{result}'")
    print(f"   ✓ PASS" if result == "chunks_started" else f"   ✗ FAIL")
    
    # Test 7: All chunks started
    print("\n7. All chunks started:")
    chunks = [MockChunk("started"), MockChunk("started")]
    result = calculate_campaign_status_from_chunks(chunks)
    print(f"   Chunks: ['started', 'started']")
    print(f"   Expected: 'started'")
    print(f"   Result: '{result}'")
    print(f"   ✓ PASS" if result == "started" else f"   ✗ FAIL")
    
    # Test 8: All chunks pending
    print("\n8. All chunks pending:")
    chunks = [MockChunk("pending"), MockChunk("pending"), MockChunk("pending")]
    result = calculate_campaign_status_from_chunks(chunks)
    print(f"   Chunks: ['pending', 'pending', 'pending']")
    print(f"   Expected: 'pending'")
    print(f"   Result: '{result}'")
    print(f"   ✓ PASS" if result == "pending" else f"   ✗ FAIL")
    
    # Test 9: Mixed (started, finished, pending) - edge case
    print("\n9. Mixed statuses (started, finished, pending):")
    chunks = [MockChunk("started"), MockChunk("finished"), MockChunk("pending")]
    result = calculate_campaign_status_from_chunks(chunks)
    print(f"   Chunks: ['started', 'finished', 'pending']")
    print(f"   Expected: 'mixed' (edge case)")
    print(f"   Result: '{result}'")
    print(f"   Note: This is a complex mixed state")
    
    # Test 10: Empty chunks
    print("\n10. No chunks:")
    chunks = []
    result = calculate_campaign_status_from_chunks(chunks)
    print(f"   Chunks: []")
    print(f"   Expected: 'pending'")
    print(f"   Result: '{result}'")
    print(f"   ✓ PASS" if result == "pending" else f"   ✗ FAIL")
    
    print("\n" + "="*50)
    print("Testing complete!")


if __name__ == "__main__":
    test_status_calculation()

