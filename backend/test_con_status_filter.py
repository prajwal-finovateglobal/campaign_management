"""
Test: Compare filter_by_connected_status (v1) vs filter_by_connected_status_v2 (v2)
for campaign_id = 221.

Checks:
  - How many records each version returns for connected / disconnected
  - Whether the returned IDs match between v1 and v2
  - How long each query takes
"""

import sys
import time
from pathlib import Path

# ── path setup ──────────────────────────────────────────────────────────────
sys.path.insert(0, str(Path(__file__).parent))

from database.session import SessionLocal
from models.client import Client, Campaign, Phase
from repo.tables import get_datalog_model_for_client
from repo.filters import filter_by_connected_status, filter_by_connected_status_v2

CAMPAIGN_ID = 221


def get_client_id_for_campaign(db, campaign_id: int) -> int | None:
    """Resolve campaign_id → client_id via Campaign → Phase → Client."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        print(f"[ERROR] Campaign {campaign_id} not found.")
        return None
    phase = db.query(Phase).filter(Phase.id == campaign.phase_id).first()
    if not phase:
        print(f"[ERROR] Phase for campaign {campaign_id} not found.")
        return None
    return phase.client_id


def run_filter(label: str, query, filter_fn, con_status: bool):
    """Apply a filter function, time it, and return (count, id_set, elapsed_ms)."""
    start = time.perf_counter()
    filtered = filter_fn(query, con_status)
    model = filtered.column_descriptions[0]["entity"]
    results = filtered.with_entities(model.s_no).all()
    elapsed_ms = (time.perf_counter() - start) * 1000
    ids = {row[0] for row in results}
    return len(ids), ids, elapsed_ms


def compare(label_v1, label_v2, ids_v1, ids_v2):
    only_v1 = ids_v1 - ids_v2
    only_v2 = ids_v2 - ids_v1
    if not only_v1 and not only_v2:
        print(f"    ✅ MATCH — both return identical records")
    else:
        print(f"    ❌ MISMATCH")
        if only_v1:
            print(f"       IDs only in {label_v1} ({len(only_v1)}): {sorted(only_v1)[:20]}")
        if only_v2:
            print(f"       IDs only in {label_v2} ({len(only_v2)}): {sorted(only_v2)[:20]}")


def main():
    db = SessionLocal()
    try:
        # ── resolve client ───────────────────────────────────────────────────
        client_id = get_client_id_for_campaign(db, CAMPAIGN_ID)
        if client_id is None:
            return

        DataLogModel = get_datalog_model_for_client(db, client_id)
        if DataLogModel is None:
            print(f"[ERROR] Could not find DataLog model for client_id={client_id}")
            return

        print(f"\n{'='*60}")
        print(f"  Campaign ID : {CAMPAIGN_ID}")
        print(f"  Client ID   : {client_id}")
        print(f"  Table       : {DataLogModel.__tablename__}")
        print(f"{'='*60}\n")

        # ── base query scoped to campaign ────────────────────────────────────
        def base_query():
            return (
                db.query(DataLogModel)
                .filter(DataLogModel.campaign_id == CAMPAIGN_ID)
            )

        total = base_query().count()
        print(f"  Total records for campaign {CAMPAIGN_ID}: {total}\n")

        # ────────────────────────────────────────────────────────────────────
        # CONNECTED
        # ────────────────────────────────────────────────────────────────────
        print("── CONNECTED (con_status=True) ─────────────────────────────")

        cnt_v1, ids_v1, ms_v1 = run_filter("v1", base_query(), filter_by_connected_status, True)
        print(f"  v1 (duration/recording NOT NULL) : {cnt_v1:>6} records  |  {ms_v1:>8.2f} ms")

        cnt_v2, ids_v2, ms_v2 = run_filter("v2", base_query(), filter_by_connected_status_v2, True)
        print(f"  v2 (call_status != 'failed')     : {cnt_v2:>6} records  |  {ms_v2:>8.2f} ms")

        compare("v1", "v2", ids_v1, ids_v2)

        if ms_v2 < ms_v1:
            print(f"    ⚡ v2 is faster by {ms_v1 - ms_v2:.2f} ms")
        else:
            print(f"    ⚡ v1 is faster by {ms_v2 - ms_v1:.2f} ms")

        # ────────────────────────────────────────────────────────────────────
        # DISCONNECTED
        # ────────────────────────────────────────────────────────────────────
        print("\n── DISCONNECTED (con_status=False) ─────────────────────────")

        cnt_v1, ids_v1, ms_v1 = run_filter("v1", base_query(), filter_by_connected_status, False)
        print(f"  v1 (duration/recording NULL)     : {cnt_v1:>6} records  |  {ms_v1:>8.2f} ms")

        cnt_v2, ids_v2, ms_v2 = run_filter("v2", base_query(), filter_by_connected_status_v2, False)
        print(f"  v2 (call_status = 'failed')      : {cnt_v2:>6} records  |  {ms_v2:>8.2f} ms")

        compare("v1", "v2", ids_v1, ids_v2)

        if ms_v2 < ms_v1:
            print(f"    ⚡ v2 is faster by {ms_v1 - ms_v2:.2f} ms")
        else:
            print(f"    ⚡ v1 is faster by {ms_v2 - ms_v1:.2f} ms")

        # ────────────────────────────────────────────────────────────────────
        # SANITY CHECK: connected + disconnected should sum to total
        # ────────────────────────────────────────────────────────────────────
        print(f"\n── SANITY CHECK ────────────────────────────────────────────")

        con_v1, _, _ = run_filter("v1", base_query(), filter_by_connected_status, True)
        dis_v1, _, _ = run_filter("v1", base_query(), filter_by_connected_status, False)
        print(f"  v1: connected({con_v1}) + disconnected({dis_v1}) = {con_v1 + dis_v1}  (total={total})")

        con_v2, _, _ = run_filter("v2", base_query(), filter_by_connected_status_v2, True)
        dis_v2, _, _ = run_filter("v2", base_query(), filter_by_connected_status_v2, False)
        print(f"  v2: connected({con_v2}) + disconnected({dis_v2}) = {con_v2 + dis_v2}  (total={total})")

        # ────────────────────────────────────────────────────────────────────
        # INSPECT MISMATCHING RECORDS
        # ────────────────────────────────────────────────────────────────────
        print("── MISMATCHING RECORDS (only in v2 connected) ──────────────")

        con_v1, ids_v1_con, _ = run_filter("v1", base_query(), filter_by_connected_status, True)
        con_v2, ids_v2_con, _ = run_filter("v2", base_query(), filter_by_connected_status_v2, True)

        only_in_v2 = ids_v2_con - ids_v1_con   # v2 says connected, v1 says disconnected
        only_in_v1 = ids_v1_con - ids_v2_con   # v1 says connected, v2 says disconnected

        if only_in_v2:
            print(f"\n  Records v2 calls CONNECTED but v1 calls DISCONNECTED ({len(only_in_v2)}):")
            rows = db.query(DataLogModel).filter(DataLogModel.s_no.in_(list(only_in_v2))).all()
            for row in rows:
                print(f"    s_no={row.s_no}  call_status={row.call_status!r}  "
                      f"duration={row.duration!r}  recording={row.recording!r}")
        else:
            print("  No records only in v2.")

        if only_in_v1:
            print(f"\n  Records v1 calls CONNECTED but v2 calls DISCONNECTED ({len(only_in_v1)}):")
            rows = db.query(DataLogModel).filter(DataLogModel.s_no.in_(list(only_in_v1))).all()
            for row in rows:
                print(f"    s_no={row.s_no}  call_status={row.call_status!r}  "
                      f"duration={row.duration!r}  recording={row.recording!r}")
        else:
            print("  No records only in v1.")

        print(f"\n{'='*60}\n")

    finally:
        db.close()


if __name__ == "__main__":
    main()
