#!/usr/bin/env python3
"""
Campaign State Migration Runner
Creates the cms_campaign_state table for backend-driven auto-run loops.
Date: 2026-02-20

Usage:
    python3 migrate_campaign_state.py         # interactive (asks for confirmation)
    python3 migrate_campaign_state.py --yes   # skip confirmation
"""

import sys
import os
from pathlib import Path

# Add parent directory to path so we can import from project
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import create_engine, text
from Core.config import DB_URL
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


def execute_sql_file(engine, filepath, description):
    print_colored(f">> {description}...", Colors.YELLOW)
    try:
        sql_content = Path(filepath).read_text()
        with engine.begin() as conn:
            conn.connection.connection.set_isolation_level(0)
            cursor = conn.connection.connection.cursor()
            try:
                cursor.execute(sql_content)
            finally:
                cursor.close()
                conn.connection.connection.set_isolation_level(1)
        print_colored(f"✓ {description} completed", Colors.GREEN)
        return True
    except Exception as e:
        print_colored(f"✗ {description} failed: {str(e)}", Colors.RED)
        logger.exception(f"Error in {description}")
        return False


def verify_migration(engine):
    print_colored("\n========================================", Colors.BLUE)
    print_colored("Verifying Migration Results", Colors.BLUE)
    print_colored("========================================\n", Colors.BLUE)

    with engine.connect() as conn:
        # Check table exists
        print_colored(">> Checking cms_campaign_state table...", Colors.YELLOW)
        result = conn.execute(text("""
            SELECT COUNT(*) FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = 'cms_campaign_state'
        """))
        if result.scalar() != 1:
            print_colored("✗ cms_campaign_state table NOT found", Colors.RED)
            return False
        print_colored("✓ cms_campaign_state table exists", Colors.GREEN)

        # Check unique constraint on campaign_id
        print_colored("\n>> Checking unique constraint on campaign_id...", Colors.YELLOW)
        result = conn.execute(text("""
            SELECT COUNT(*) FROM information_schema.table_constraints
            WHERE table_schema = 'public'
            AND table_name = 'cms_campaign_state'
            AND constraint_type = 'UNIQUE'
            AND constraint_name = 'uq_campaign_state_campaign_id'
        """))
        if result.scalar() != 1:
            print_colored("✗ Unique constraint NOT found", Colors.RED)
            return False
        print_colored("✓ Unique constraint on campaign_id exists", Colors.GREEN)

        # Check updated_at trigger
        print_colored("\n>> Checking updated_at trigger...", Colors.YELLOW)
        result = conn.execute(text("""
            SELECT COUNT(*) FROM information_schema.triggers
            WHERE event_object_table = 'cms_campaign_state'
            AND trigger_name = 'trigger_update_campaign_state_updated_at'
        """))
        if result.scalar() != 1:
            print_colored("✗ updated_at trigger NOT found", Colors.RED)
            return False
        print_colored("✓ updated_at trigger exists", Colors.GREEN)

    return True


def main():
    print_colored("=========================================", Colors.BLUE)
    print_colored("  Campaign State Migration Runner", Colors.BLUE)
    print_colored("=========================================\n", Colors.BLUE)

    skip_confirmation = '--yes' in sys.argv or '-y' in sys.argv

    db_dir = Path(__file__).parent

    print_colored("Loading database credentials...", Colors.YELLOW)
    print_colored(f"Database: {DB_URL.split('@')[1] if '@' in DB_URL else 'configured'}", Colors.GREEN)
    print_colored("✓ Database credentials loaded\n", Colors.GREEN)

    print_colored("⚠️  WARNING: This will modify your database schema\n", Colors.YELLOW)
    print("The following changes will be made:")
    print("  1. Create cms_campaign_state table")
    print("  2. Add unique constraint on campaign_id")
    print("  3. Add auto-update trigger for updated_at")
    print()

    if not skip_confirmation:
        try:
            response = input(f"{Colors.YELLOW}Have you backed up your database? (y/n): {Colors.NC}")
            if response.lower() not in ['y', 'yes']:
                print_colored("\nMigration cancelled. Please backup your database first.", Colors.RED)
                return 1
        except (EOFError, KeyboardInterrupt):
            print_colored("\n\nMigration cancelled.", Colors.RED)
            return 1
    else:
        print_colored("Auto-confirming migration (--yes flag provided)", Colors.GREEN)

    print()
    print_colored("Starting migration...\n", Colors.BLUE)

    try:
        engine = create_engine(DB_URL, echo=False)

        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print_colored("✓ Database connection successful\n", Colors.GREEN)

        sql_file = db_dir / "004_create_campaign_state_table.sql"
        if not sql_file.exists():
            print_colored(f"✗ File not found: {sql_file}", Colors.RED)
            return 1

        if not execute_sql_file(engine, sql_file, "Creating cms_campaign_state table"):
            print_colored("\nMigration failed! See error above.", Colors.RED)
            return 1

        print()

        if not verify_migration(engine):
            print_colored("\nMigration verification failed!", Colors.RED)
            return 1

        print()
        print_colored("=========================================", Colors.GREEN)
        print_colored("   Migration Completed Successfully!", Colors.GREEN)
        print_colored("=========================================\n", Colors.GREEN)

        print_colored("✓ cms_campaign_state table created", Colors.GREEN)
        print_colored("✓ Unique constraint on campaign_id added", Colors.GREEN)
        print_colored("✓ Auto-update trigger created\n", Colors.GREEN)

        print_colored("Next steps:", Colors.YELLOW)
        print("  1. Restart your backend application")
        print("  2. Verify model is loaded: CampaignState in models/automation.py")
        print()

        return 0

    except Exception as e:
        print()
        print_colored("=========================================", Colors.RED)
        print_colored("   Migration Failed!", Colors.RED)
        print_colored("=========================================\n", Colors.RED)
        print(f"Error: {str(e)}")
        logger.exception("Migration error")
        return 1


if __name__ == "__main__":
    sys.exit(main())
