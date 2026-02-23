#!/usr/bin/env python3
"""
Sync cms_campaign_state from cms_campaign: set status and total_chunks from real data.
- status: map cms_campaign.status (Millis: idle/started/finished) → state.status (idle/stopped/completed)
- total_chunks: set from actual cms_chunks count (fixes 0 where campaign has chunks)

Usage:
    cd backend && ./venv/bin/python database/sync_campaign_state_from_campaign.py
    cd backend && ./venv/bin/python database/sync_campaign_state_from_campaign.py --yes
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from database.session import SessionLocal
from models.automation import CampaignState
from models.client import Campaign, Chunk
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


def millis_status_to_state_status(millis_status: str | None) -> str:
    """Map cms_campaign.status (Millis) → cms_campaign_state.status."""
    if not millis_status:
        return 'idle'
    s = (millis_status or '').strip().lower()
    if s in ('finished', 'completed'):
        return 'completed'
    if s in ('started', 'running'):
        return 'stopped'  # no live auto-run task, so show as stopped
    return 'idle'


def main():
    print_colored("=========================================", Colors.BLUE)
    print_colored("  Sync campaign_state from campaign", Colors.BLUE)
    print_colored("=========================================\n", Colors.BLUE)

    skip_confirmation = '--yes' in sys.argv or '-y' in sys.argv

    print_colored("This will update every row in cms_campaign_state:", Colors.YELLOW)
    print("  - status: from cms_campaign.status (finished→completed, started→stopped, else→idle)")
    print("  - total_chunks: from actual cms_chunks count")
    print()

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
        states = db.query(CampaignState).all()
        print_colored(f"\n>> Found {len(states)} rows in cms_campaign_state.\n", Colors.YELLOW)

        updated = 0
        for state in states:
            campaign = db.query(Campaign).filter(Campaign.id == state.campaign_id).first()
            if not campaign:
                logger.warning(f"Campaign {state.campaign_id} not found; skip")
                continue

            chunk_count = db.query(Chunk).filter(Chunk.campaign_id == state.campaign_id).count()
            new_status = millis_status_to_state_status(campaign.status)

            changed = False
            if state.total_chunks != chunk_count:
                state.total_chunks = chunk_count
                changed = True
            if state.status != new_status:
                state.status = new_status
                changed = True

            if changed:
                updated += 1
                print_colored(
                    f"  campaign_id={state.campaign_id}: status={state.status}, total_chunks={state.total_chunks} (from campaign.status={campaign.status!r})",
                    Colors.GREEN,
                )

        db.commit()
        print()
        print_colored("=========================================", Colors.GREEN)
        print_colored("   Sync completed", Colors.GREEN)
        print_colored("=========================================\n", Colors.GREEN)
        print_colored(f"  Updated: {updated} row(s)", Colors.GREEN)
        print()
        return 0

    except Exception as e:
        db.rollback()
        print_colored("\nSync failed!", Colors.RED)
        print(f"Error: {str(e)}")
        logger.exception("Sync error")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
