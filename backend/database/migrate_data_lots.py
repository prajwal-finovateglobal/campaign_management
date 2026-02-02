#!/usr/bin/env python3
"""
Data Lots Migration Runner (Python Version)
Alternative to bash script when psql is not available
Date: 2026-01-26
"""

import sys
import os
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import create_engine, text
from Core.config import DB_URL
import loguru

logger = loguru.logger

# Colors for terminal output
class Colors:
    BLUE = '\033[0;34m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    RED = '\033[0;31m'
    NC = '\033[0m'  # No Color

def print_colored(message, color):
    """Print colored message to terminal"""
    print(f"{color}{message}{Colors.NC}")

def read_sql_file(filepath):
    """Read SQL file content"""
    with open(filepath, 'r') as f:
        return f.read()

def execute_sql_file(engine, filepath, description):
    """Execute SQL file using SQLAlchemy engine"""
    print_colored(f">> {description}...", Colors.YELLOW)
    
    try:
        sql_content = read_sql_file(filepath)
        
        # Execute the entire SQL file as a transaction
        # SQLAlchemy will handle the statement separation
        with engine.begin() as conn:
            # Use raw connection for executing multi-statement SQL
            conn.connection.connection.set_isolation_level(0)  # Autocommit mode
            cursor = conn.connection.connection.cursor()
            try:
                cursor.execute(sql_content)
            finally:
                cursor.close()
                conn.connection.connection.set_isolation_level(1)  # Back to transaction mode
        
        print_colored(f"✓ {description} completed", Colors.GREEN)
        return True
        
    except Exception as e:
        print_colored(f"✗ {description} failed: {str(e)}", Colors.RED)
        logger.exception(f"Error in {description}")
        return False

def verify_migration(engine):
    """Verify migration was successful"""
    print_colored("\n========================================", Colors.BLUE)
    print_colored("Verifying Migration Results", Colors.BLUE)
    print_colored("========================================\n", Colors.BLUE)
    
    with engine.connect() as conn:
        # Check cms_data_lots table exists
        print_colored(">> Checking cms_data_lots table...", Colors.YELLOW)
        result = conn.execute(text("""
            SELECT COUNT(*) as table_exists 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'cms_data_lots'
        """))
        count = result.scalar()
        
        if count == 1:
            print_colored("✓ cms_data_lots table exists", Colors.GREEN)
        else:
            print_colored("✗ cms_data_lots table NOT found", Colors.RED)
            return False
        
        # Check lot_id column exists
        print_colored("\n>> Checking lot_id column in cms_campaign_jobs...", Colors.YELLOW)
        result = conn.execute(text("""
            SELECT COUNT(*) 
            FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = 'cms_campaign_jobs'
            AND column_name = 'lot_id'
        """))
        count = result.scalar()
        
        if count == 1:
            print_colored("✓ lot_id column exists in cms_campaign_jobs", Colors.GREEN)
        else:
            print_colored("✗ lot_id column NOT found in cms_campaign_jobs", Colors.RED)
            return False
        
        # Check trigger exists
        print_colored("\n>> Checking trigger...", Colors.YELLOW)
        result = conn.execute(text("""
            SELECT COUNT(*)
            FROM information_schema.triggers
            WHERE event_object_table = 'cms_data_lots'
            AND trigger_name = 'trigger_update_data_lots_updated_at'
        """))
        count = result.scalar()
        
        if count == 1:
            print_colored("✓ Auto-update trigger exists", Colors.GREEN)
        else:
            print_colored("✗ Trigger NOT found", Colors.RED)
            return False
    
    return True

def main():
    """Main migration function"""
    print_colored("=========================================", Colors.BLUE)
    print_colored("   Data Lots Migration Runner (Python)", Colors.BLUE)
    print_colored("=========================================\n", Colors.BLUE)
    
    # Check for --yes flag
    skip_confirmation = '--yes' in sys.argv or '-y' in sys.argv
    
    # Get database directory
    db_dir = Path(__file__).parent
    
    print_colored("Loading database credentials...", Colors.YELLOW)
    print_colored(f"Database: {DB_URL.split('@')[1] if '@' in DB_URL else 'configured'}", Colors.GREEN)
    print_colored("✓ Database credentials loaded\n", Colors.GREEN)
    
    # Warning message
    print_colored("⚠️  WARNING: This will modify your database schema\n", Colors.YELLOW)
    print("The following changes will be made:")
    print("  1. Create cms_data_lots table")
    print("  2. Create auto-update trigger for updated_at")
    print("  3. Add lot_id column to cms_campaign_jobs")
    print()
    
    # Ask for confirmation (skip if --yes flag provided)
    if not skip_confirmation:
        try:
            response = input(f"{Colors.YELLOW}Have you backed up your database? (y/n): {Colors.NC}")
            
            if response.lower() not in ['y', 'yes']:
                print_colored("\nMigration cancelled. Please backup your database first.", Colors.RED)
                print("\nBackup command:")
                print("  pg_dump <connection_string> -F c -f backup_before_migration.dump")
                return 1
        except (EOFError, KeyboardInterrupt):
            print_colored("\n\nMigration cancelled.", Colors.RED)
            return 1
    else:
        print_colored("Auto-confirming migration (--yes flag provided)", Colors.GREEN)
    
    print()
    print_colored("Starting migration...\n", Colors.BLUE)
    
    try:
        # Create engine
        engine = create_engine(DB_URL, echo=False)
        
        # Test connection
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        
        print_colored("✓ Database connection successful\n", Colors.GREEN)
        
        # Execute migrations in order
        migrations = [
            (db_dir / "001_create_data_lots_table.sql", "Step 1: Creating cms_data_lots table"),
            (db_dir / "002_create_updated_at_trigger.sql", "Step 2: Creating updated_at trigger"),
            (db_dir / "003_add_lot_id_to_campaign_jobs.sql", "Step 3: Adding lot_id column to cms_campaign_jobs"),
        ]
        
        for filepath, description in migrations:
            if not filepath.exists():
                print_colored(f"✗ File not found: {filepath}", Colors.RED)
                return 1
            
            if not execute_sql_file(engine, filepath, description):
                print_colored("\nMigration failed! See error above.", Colors.RED)
                return 1
            print()
        
        # Verify migration
        if not verify_migration(engine):
            print_colored("\nMigration verification failed!", Colors.RED)
            return 1
        
        # Success message
        print()
        print_colored("=========================================", Colors.GREEN)
        print_colored("   Migration Completed Successfully!", Colors.GREEN)
        print_colored("=========================================\n", Colors.GREEN)
        
        print_colored("✓ cms_data_lots table created", Colors.GREEN)
        print_colored("✓ Auto-update trigger created", Colors.GREEN)
        print_colored("✓ lot_id column added to cms_campaign_jobs\n", Colors.GREEN)
        
        print_colored("Next steps:", Colors.YELLOW)
        print("  1. Restart your backend application")
        print("  2. Verify models are loaded correctly")
        print("  3. Test creating a data lot")
        print()
        print("Documentation: DATA_LOTS_MIGRATION_README.md")
        print()
        
        return 0
        
    except Exception as e:
        print()
        print_colored("=========================================", Colors.RED)
        print_colored("   Migration Failed!", Colors.RED)
        print_colored("=========================================\n", Colors.RED)
        
        print(f"Error: {str(e)}")
        logger.exception("Migration error")
        print()
        print("If you need to rollback, run:")
        print(f"  python3 {db_dir}/rollback_migration.py")
        print()
        
        return 1

if __name__ == "__main__":
    sys.exit(main())
