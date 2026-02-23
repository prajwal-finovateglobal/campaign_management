#!/usr/bin/env python3
"""
Auto-Run Columns Migration Runner
Migrates cms_chunks and cms_campaign_state for Option B (per-chunk progress).
Date: 2026-02-20

Usage:
    python3 migrate_auto_run_columns.py         # interactive
    python3 migrate_auto_run_columns.py --yes   # skip confirmation
"""

import sys
from pathlib import Path

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
        # Check auto_run_status column on cms_chunks
        print_colored(">> Checking auto_run_status column on cms_chunks...", Colors.YELLOW)
        result = conn.execute(text("""
            SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name    = 'cms_chunks'
            AND column_name   = 'auto_run_status'
        """))
        if result.scalar() != 1:
            print_colored("✗ auto_run_status column NOT found", Colors.RED)
            return False
        print_colored("✓ auto_run_status column exists on cms_chunks", Colors.GREEN)

        # Check auto_run_message column on cms_chunks
        print_colored("\n>> Checking auto_run_message column on cms_chunks...", Colors.YELLOW)
        result = conn.execute(text("""
            SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name    = 'cms_chunks'
            AND column_name   = 'auto_run_message'
        """))
        if result.scalar() != 1:
            print_colored("✗ auto_run_message column NOT found", Colors.RED)
            return False
        print_colored("✓ auto_run_message column exists on cms_chunks", Colors.GREEN)

        # Check chunk_progress is gone from cms_campaign_state
        print_colored("\n>> Checking chunk_progress removed from cms_campaign_state...", Colors.YELLOW)
        result = conn.execute(text("""
            SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name    = 'cms_campaign_state'
            AND column_name   = 'chunk_progress'
        """))
        if result.scalar() != 0:
            print_colored("✗ chunk_progress column still exists (should be dropped)", Colors.RED)
            return False
        print_colored("✓ chunk_progress column removed from cms_campaign_state", Colors.GREEN)

    return True


def main():
    print_colored("=========================================", Colors.BLUE)
    print_colored("  Auto-Run Columns Migration Runner", Colors.BLUE)
    print_colored("=========================================\n", Colors.BLUE)

    skip_confirmation = '--yes' in sys.argv or '-y' in sys.argv
    db_dir = Path(__file__).parent

    print_colored("Loading database credentials...", Colors.YELLOW)
    print_colored(f"Database: {DB_URL.split('@')[1] if '@' in DB_URL else 'configured'}", Colors.GREEN)
    print_colored("✓ Database credentials loaded\n", Colors.GREEN)

    print_colored("⚠️  WARNING: This will modify your database schema\n", Colors.YELLOW)
    print("The following changes will be made:")
    print("  1. Add auto_run_status column to cms_chunks")
    print("  2. Add auto_run_message column to cms_chunks")
    print("  3. Drop chunk_progress column from cms_campaign_state")
    print()

    if not skip_confirmation:
        try:
            response = input(f"{Colors.YELLOW}Have you backed up your database? (y/n): {Colors.NC}")
            if response.lower() not in ['y', 'yes']:
                print_colored("\nMigration cancelled.", Colors.RED)
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

        sql_file = db_dir / "005_add_auto_run_columns.sql"
        if not sql_file.exists():
            print_colored(f"✗ File not found: {sql_file}", Colors.RED)
            return 1

        if not execute_sql_file(engine, sql_file, "Applying auto-run column changes"):
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

        print_colored("✓ auto_run_status added to cms_chunks", Colors.GREEN)
        print_colored("✓ auto_run_message added to cms_chunks", Colors.GREEN)
        print_colored("✓ chunk_progress dropped from cms_campaign_state\n", Colors.GREEN)

        print_colored("Next steps:", Colors.YELLOW)
        print("  1. Restart your backend application")
        print("  2. Verify Chunk model has auto_run_status and auto_run_message")
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
