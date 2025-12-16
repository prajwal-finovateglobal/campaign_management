#!/bin/bash

# =============================================================================
# Frontend Run Script for AWS Deployment
# =============================================================================
# This script starts the Next.js frontend server
# Make sure to run setup_frontend.sh first
#
# Usage: bash run_frontend.sh [dev|build|start]
#   dev    - Development mode (default)
#   build  - Build for production
#   start  - Start production server (requires build first)
# =============================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# Parse command line argument
MODE="${1:-dev}"

echo "=========================================="
echo "Frontend Server - Mode: $MODE"
echo "=========================================="
echo ""

# Check if node_modules exists
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    echo -e "${RED}ERROR: node_modules not found!${NC}"
    echo -e "${YELLOW}Please run setup_frontend.sh first${NC}"
    exit 1
fi

# Check if .env.local exists
if [ ! -f "$FRONTEND_DIR/.env.local" ]; then
    echo -e "${YELLOW}WARNING: .env.local file not found!${NC}"
    echo -e "${YELLOW}Server will use default API URL (http://localhost:8000)${NC}"
fi

# Navigate to frontend directory
cd "$FRONTEND_DIR" || exit 1

# Load environment variables from .env.local if it exists
if [ -f ".env.local" ]; then
    echo -e "${GREEN}[1/3]${NC} Loading environment variables..."
    export $(cat .env.local | grep -v '^#' | xargs)
    echo -e "${GREEN}✓${NC} Environment variables loaded"
    echo -e "${GREEN}  Backend URL: ${NEXT_PUBLIC_API_URL:-http://localhost:8000}${NC}"
else
    echo -e "${YELLOW}[1/3]${NC} No .env.local file found, using defaults"
fi

echo ""

# Handle different modes
case "$MODE" in
    dev)
        echo -e "${GREEN}[2/3]${NC} Starting development server..."
        echo ""
        echo "=========================================="
        echo -e "${GREEN}Development server starting...${NC}"
        echo "=========================================="
        echo ""
        echo "Frontend will be available at:"
        echo "  http://localhost:8013"
        echo ""
        echo "Press Ctrl+C to stop the server"
        echo ""
        PORT=8013 npm run dev
        ;;
    
    build)
        echo -e "${GREEN}[2/3]${NC} Building for production..."
        echo ""
        npm run build
        echo ""
        echo -e "${GREEN}✓${NC} Build completed successfully!"
        echo ""
        echo "To start the production server, run:"
        echo "  bash run_frontend.sh start"
        ;;
    
    start)
        if [ ! -d ".next" ]; then
            echo -e "${RED}ERROR: Build not found!${NC}"
            echo -e "${YELLOW}Please run 'bash run_frontend.sh build' first${NC}"
            exit 1
        fi
        
        echo -e "${GREEN}[2/3]${NC} Starting production server..."
        echo ""
        echo "=========================================="
        echo -e "${GREEN}Production server starting...${NC}"
        echo "=========================================="
        echo ""
        echo "Frontend will be available at:"
        echo "  http://localhost:8013"
        echo ""
        echo "Press Ctrl+C to stop the server"
        echo ""
        PORT=8013 npm run start
        ;;
    
    *)
        echo -e "${RED}ERROR: Invalid mode '$MODE'${NC}"
        echo ""
        echo "Usage: bash run_frontend.sh [dev|build|start]"
        echo "  dev    - Development mode (default)"
        echo "  build  - Build for production"
        echo "  start  - Start production server"
        exit 1
        ;;
esac

