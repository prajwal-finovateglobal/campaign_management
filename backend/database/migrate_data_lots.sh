#!/bin/bash

# Data Lots Migration Runner
# Automated script to run the data lots migration
# Date: 2026-01-26

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}   Data Lots Migration Runner${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

# Check if .env file exists
if [ ! -f "$SCRIPT_DIR/../.env" ]; then
    echo -e "${RED}Error: .env file not found in backend directory${NC}"
    echo "Please ensure .env file exists with database configuration"
    exit 1
fi

# Load database credentials from .env
echo -e "${YELLOW}Loading database credentials from .env...${NC}"

# Source the .env file to load variables
if [ -f "$SCRIPT_DIR/../.env" ]; then
    # Export variables from .env
    export $(grep -v '^#' "$SCRIPT_DIR/../.env" | xargs)
fi

# Construct DB_URL from individual components
DB_HOST=${DB_HOST:-""}
DB_PORT=${DB_PORT:-""}
DB_NAME=${DB_NAME:-""}
DB_USER=${DB_USER:-""}
DB_PASSWORD=${DB_PASSWORD:-""}

if [ -z "$DB_HOST" ] || [ -z "$DB_PORT" ] || [ -z "$DB_NAME" ] || [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ]; then
    echo -e "${RED}Error: Missing database credentials in .env file${NC}"
    echo "Required variables: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD"
    exit 1
fi

# Construct PostgreSQL connection string
DB_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

echo -e "${GREEN}✓ Database credentials loaded${NC}"
echo ""

# Ask for confirmation
echo -e "${YELLOW}⚠️  WARNING: This will modify your database schema${NC}"
echo ""
echo "The following changes will be made:"
echo "  1. Create cms_data_lots table"
echo "  2. Create auto-update trigger for updated_at"
echo "  3. Add lot_id column to cms_campaign_jobs"
echo ""
echo -e "${YELLOW}Have you backed up your database? (y/n)${NC}"
read -r response

if [ "$response" != "y" ] && [ "$response" != "Y" ]; then
    echo -e "${RED}Migration cancelled. Please backup your database first.${NC}"
    echo ""
    echo "Backup command:"
    echo "  pg_dump <connection_string> -F c -f backup_before_migration.dump"
    exit 1
fi

echo ""
echo -e "${BLUE}Starting migration...${NC}"
echo ""

# Run the migration
if psql "$DB_URL" -f "$SCRIPT_DIR/run_data_lots_migration.sql"; then
    echo ""
    echo -e "${GREEN}=========================================${NC}"
    echo -e "${GREEN}   Migration Completed Successfully!${NC}"
    echo -e "${GREEN}=========================================${NC}"
    echo ""
    echo -e "${GREEN}✓ cms_data_lots table created${NC}"
    echo -e "${GREEN}✓ Auto-update trigger created${NC}"
    echo -e "${GREEN}✓ lot_id column added to cms_campaign_jobs${NC}"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "  1. Restart your backend application"
    echo "  2. Verify models are loaded correctly"
    echo "  3. Test creating a data lot"
    echo ""
    echo "Documentation: DATA_LOTS_MIGRATION_README.md"
    echo ""
else
    echo ""
    echo -e "${RED}=========================================${NC}"
    echo -e "${RED}   Migration Failed!${NC}"
    echo -e "${RED}=========================================${NC}"
    echo ""
    echo "Please check the error messages above."
    echo ""
    echo "If you need to rollback:"
    echo "  psql $DB_URL -f $SCRIPT_DIR/rollback_002_remove_lot_id_from_campaign_jobs.sql"
    echo "  psql $DB_URL -f $SCRIPT_DIR/rollback_001_drop_data_lots.sql"
    echo ""
    exit 1
fi
