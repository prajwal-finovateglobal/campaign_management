#!/bin/bash

# =============================================================================
# Frontend Setup Script for AWS Deployment
# =============================================================================
# This script sets up the Next.js frontend environment on AWS
# Run this script once before starting the frontend server
#
# Usage: bash setup_frontend.sh
# =============================================================================

set -e  # Exit on any error

echo "=========================================="
echo "Frontend Setup Script - AWS Deployment"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

echo -e "${GREEN}[1/6]${NC} Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}ERROR: Node.js is not installed.${NC}"
    echo -e "${YELLOW}Please install Node.js 18 or higher from https://nodejs.org/${NC}"
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
echo -e "${GREEN}✓${NC} Node.js version: $(node --version)"

# Check Node.js version (18+)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}ERROR: Node.js 18 or higher is required. Current version: $(node --version)${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}[2/6]${NC} Checking npm installation..."
if ! command -v npm &> /dev/null; then
    echo -e "${RED}ERROR: npm is not installed.${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC} npm version: $(npm --version)"

echo ""
echo -e "${GREEN}[3/6]${NC} Navigating to frontend directory..."
cd "$FRONTEND_DIR" || exit 1
echo -e "${GREEN}✓${NC} Current directory: $(pwd)"

echo ""
echo -e "${GREEN}[4/6]${NC} Removing old node_modules (if exists)..."
if [ -d "node_modules" ]; then
    echo -e "${YELLOW}⚠${NC} Removing existing node_modules..."
    rm -rf node_modules
    echo -e "${GREEN}✓${NC} Old node_modules removed"
fi

echo ""
echo -e "${GREEN}[5/6]${NC} Installing npm dependencies..."
if [ ! -f "package.json" ]; then
    echo -e "${RED}ERROR: package.json not found in frontend directory${NC}"
    exit 1
fi

npm install
echo -e "${GREEN}✓${NC} All dependencies installed"

echo ""
echo -e "${GREEN}[5.5/6]${NC} Verifying Next.js installation..."
if [ ! -d "node_modules/next" ]; then
    echo -e "${RED}ERROR: Next.js was not installed properly${NC}"
    exit 1
fi

# Verify next/navigation exists
if [ ! -f "node_modules/next/navigation.d.ts" ]; then
    echo -e "${RED}ERROR: Next.js navigation types not found${NC}"
    echo -e "${YELLOW}Attempting to reinstall Next.js...${NC}"
    npm install next@latest --save
fi
echo -e "${GREEN}✓${NC} Next.js installed successfully"

echo ""
echo -e "${GREEN}[5.6/6]${NC} Clearing Next.js cache..."
rm -rf .next
echo -e "${GREEN}✓${NC} Cache cleared"

echo ""
echo -e "${GREEN}[6/6]${NC} Checking .env.local file..."
if [ ! -f ".env.local" ]; then
    echo -e "${YELLOW}⚠${NC} .env.local file not found. Creating template..."
    cat > .env.local << 'ENVEOF'
# Backend API URL Configuration
# Frontend uses this backend URL for all API calls
NEXT_PUBLIC_API_URL=https://cms-backend.finovateglobal.com
ENVEOF
    echo -e "${GREEN}✓${NC} .env.local created with production backend URL"
else
    echo -e "${GREEN}✓${NC} .env.local file found"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}✓ Frontend setup completed successfully!${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Update frontend/.env.local with your AWS backend URL"
echo "2. Run: bash run_frontend.sh"
echo ""
echo "To build for production:"
echo "  cd frontend && npm run build"
echo ""

