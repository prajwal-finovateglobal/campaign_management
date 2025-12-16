#!/bin/bash

# =============================================================================
# Complete Setup Script for AWS Deployment
# =============================================================================
# This script sets up both backend and frontend
# Run this script once before starting the servers
#
# Usage: bash setup_all.sh
# =============================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "=========================================="
echo "Complete Setup - Backend + Frontend"
echo "=========================================="
echo ""

# Run backend setup
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Setting up Backend...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
bash "$SCRIPT_DIR/setup_backend.sh"

echo ""
echo ""

# Run frontend setup
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Setting up Frontend...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
bash "$SCRIPT_DIR/setup_frontend.sh"

echo ""
echo "=========================================="
echo -e "${GREEN}✓ Complete setup finished successfully!${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Update backend/.env with your configuration"
echo "2. Update frontend/.env.local with your AWS backend URL"
echo "3. Start backend: bash run_backend.sh"
echo "4. Start frontend: bash run_frontend.sh"
echo ""

