#!/bin/bash

# =============================================================================
# Backend Stop Script for AWS Deployment
# =============================================================================
# This script stops the running FastAPI backend server
#
# Usage: bash stop_backend.sh
# =============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "Stopping Backend Server"
echo "=========================================="
echo ""

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BACKEND_DIR="$SCRIPT_DIR/backend"

# Find uvicorn processes
UVICORN_PIDS=$(ps aux | grep "[u]vicorn main:app" | awk '{print $2}')

if [ -z "$UVICORN_PIDS" ]; then
    echo -e "${YELLOW}⚠${NC} No backend server process found running"
    echo -e "${GREEN}✓${NC} Backend server is already stopped"
    exit 0
fi

echo -e "${GREEN}[1/3]${NC} Found backend server process(es):"
for PID in $UVICORN_PIDS; do
    echo -e "  ${GREEN}•${NC} PID: $PID"
done

echo ""
echo -e "${GREEN}[2/3]${NC} Stopping backend server gracefully..."

# Try graceful shutdown first (SIGTERM)
for PID in $UVICORN_PIDS; do
    kill -TERM "$PID" 2>/dev/null
done

# Wait a bit for graceful shutdown
sleep 2

# Check if processes are still running
REMAINING_PIDS=$(ps aux | grep "[u]vicorn main:app" | awk '{print $2}')

if [ -n "$REMAINING_PIDS" ]; then
    echo -e "${YELLOW}⚠${NC} Process(es) still running, forcing shutdown..."
    for PID in $REMAINING_PIDS; do
        kill -KILL "$PID" 2>/dev/null
    done
    sleep 1
fi

echo ""
echo -e "${GREEN}[3/3]${NC} Verifying shutdown..."

# Final check
FINAL_PIDS=$(ps aux | grep "[u]vicorn main:app" | awk '{print $2}')

if [ -z "$FINAL_PIDS" ]; then
    echo -e "${GREEN}✓${NC} Backend server stopped successfully"
    echo ""
    echo "=========================================="
    echo -e "${GREEN}Backend server is now stopped${NC}"
    echo "=========================================="
    exit 0
else
    echo -e "${RED}✗${NC} Failed to stop some processes:"
    for PID in $FINAL_PIDS; do
        echo -e "  ${RED}•${NC} PID: $PID (still running)"
    done
    echo ""
    echo -e "${YELLOW}You may need to stop them manually:${NC}"
    echo "  kill -9 $FINAL_PIDS"
    exit 1
fi

