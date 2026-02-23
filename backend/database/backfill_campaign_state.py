#!/usr/bin/env python3
"""
Backfill cms_campaign_state so every campaign that appears in the Monitor has a real row.
Campaigns with a phase_id but no state row get one with status='idle', so the Monitor
shows IDLE (and chunk counts) instead of "No auto-run data".

Usage:
    cd backend && python database/backfill_campaign_state.py         # interactive
    cd backend && python database/backfill_campaign_state.py --yes  # skip confirmation
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from database.session import SessionLocal
from models.automation import CampaignState
from models.client import Campaign, Phase, Chunk
from repo.auto_run_repo import get_state
import loguru

logger = loguru.logger


class Colors:
    BLUE   = '\033[0;34m'
    GREEN  = '\033[0;32m'
    YELLOW = '\033[1;33m'
    RED    = '\033[0;31m'
    NC     = '\033[0m'


def print_colored(message, color):
    print(f"{color}{message}{Colors.NC}")


def main():
    print_colored("=========================================", Colors.BLUE)
    print_colored("  Backfill cms_campaign_state", Colors.BLUE)
    print_colored("=========================================\n", Colors.BLUE)

    skip_confirmation = '--yes' in sys.argv or '-y' in sys.argv

    print_colored("This will insert a state row for every campaign that:", Colors.YELLOW)
    print("  - has a phase_id (appears in Monitor grid)")
    print("  - does NOT yet have a row in cms_campaign_state")
    print()
    print("New rows will have: status='idle', action='run', gap_seconds=20,")
    print("  current_chunk_index=0, total_chunks=<chunk count>, start_time/end_time=NULL.")
    print("Existing state rows are left unchanged.\n")

    if not skip_confirmation:
        try:
            response = input(f"{Colors.YELLOW}Proceed? (y/n): {Colors.NC}")
            if response.lower() not in ['y', 'yes']:
                print_colored("Cancelled.", Colors.RED)
                return 1
        except (EOFError, KeyboardInterrupt):
            print_colored("\nCancelled.", Colors.RED)
            return 1
    else:
        print_colored("Auto-confirming (--yes)", Colors.GREEN)

    db = SessionLocal()
    try:
        # All campaigns that belong to a phase (can appear in Monitor)
        campaigns = db.query(Campaign).filter(Campaign.phase_id.isnot(None)).order_by(Campaign.id).all()
        print_colored(f"\n>> Found {len(campaigns)} campaigns with a phase.\n", Colors.YELLOW)

        created = 0
        skipped = 0
        errors = 0

        for c in campaigns:
            if get_state(db, c.id) is not None:
                skipped += 1
                continue

            phase = db.query(Phase).filter(Phase.id == c.phase_id).first()
            if not phase:
                logger.warning(f"Campaign {c.id} has phase_id={c.phase_id} but phase not found; skip")
                errors += 1
                continue

            chunk_count = db.query(Chunk).filter(Chunk.campaign_id == c.id).count()

            state = CampaignState(
                campaign_id=c.id,
                client_id=phase.client_id,
                status='idle',
                action='run',
                gap_seconds=20,
                current_chunk_index=0,
                total_chunks=chunk_count,
                start_time=None,
                end_time=None,
            )
            db.add(state)
            created += 1
            print_colored(f"  + campaign_id={c.id} (phase_id={c.phase_id}, client_id={phase.client_id}, chunks={chunk_count})", Colors.GREEN)

        db.commit()
        print()
        print_colored("=========================================", Colors.GREEN)
        print_colored("   Backfill completed", Colors.GREEN)
        print_colored("=========================================\n", Colors.GREEN)
        print_colored(f"  Created: {created} new state row(s)", Colors.GREEN)
        print_colored(f"  Skipped (already had state): {skipped}", Colors.YELLOW)
        if errors:
            print_colored(f"  Errors: {errors}", Colors.RED)
        print()
        print_colored("Monitor will now show these campaigns with status IDLE (and chunk counts) instead of 'No auto-run data'.", Colors.YELLOW)
        return 0

    except Exception as e:
        db.rollback()
        print_colored("\nBackfill failed!", Colors.RED)
        print(f"Error: {str(e)}")
        logger.exception("Backfill error")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
