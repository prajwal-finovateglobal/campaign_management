#!/bin/bash

# =============================================================================
# Backend Run Script for AWS Deployment
# =============================================================================
# This script starts the FastAPI backend server
# Make sure to run setup_backend.sh first
#
# Usage: bash run_backend.sh
# =============================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BACKEND_DIR="$SCRIPT_DIR/backend"

echo "=========================================="
echo "Starting Backend Server"
echo "=========================================="
echo ""

# Check if virtual environment exists
if [ ! -d "$BACKEND_DIR/venv" ]; then
    echo -e "${RED}ERROR: Virtual environment not found!${NC}"
    echo -e "${YELLOW}Please run setup_backend.sh first${NC}"
    exit 1
fi

# Check if .env file exists
if [ ! -f "$BACKEND_DIR/.env" ]; then
    echo -e "${YELLOW}WARNING: .env file not found!${NC}"
    echo -e "${YELLOW}Server will start with default configuration${NC}"
fi

# Navigate to backend directory
cd "$BACKEND_DIR" || exit 1

# Activate virtual environment
echo -e "${GREEN}[1/3]${NC} Activating virtual environment..."
source venv/bin/activate

# Check if uvicorn is installed
echo -e "${GREEN}[2/3]${NC} Checking dependencies..."
if ! python3 -c "import uvicorn" 2>/dev/null; then
    echo -e "${RED}ERROR: uvicorn not found!${NC}"
    echo -e "${YELLOW}Please run setup_backend.sh first${NC}"
    exit 1
fi

# Get host and port from .env or use defaults
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"

# Load .env file if it exists
if [ -f ".env" ]; then
    export $(cat .env | grep -v '^#' | xargs)
    HOST="${HOST:-0.0.0.0}"
    PORT="${PORT:-8000}"
fi

echo -e "${GREEN}[3/3]${NC} Starting FastAPI server..."
echo ""
echo "=========================================="
echo -e "${GREEN}Server starting on http://${HOST}:${PORT}${NC}"
echo "=========================================="
echo ""
echo "API Documentation:"
echo "  - Swagger UI: http://${HOST}:${PORT}/docs"
echo "  - ReDoc: http://${HOST}:${PORT}/redoc"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start the server
python3 -m uvicorn main:app --host "$HOST" --port "$PORT" --reload

