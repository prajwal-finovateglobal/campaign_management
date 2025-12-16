#!/bin/bash

# =============================================================================
# Frontend Stop Script for AWS Deployment
# =============================================================================
# This script stops the running Next.js frontend server
#
# Usage: bash stop_frontend.sh
# =============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "Stopping Frontend Server"
echo "=========================================="
echo ""

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# Find Next.js processes (both dev and production)
NEXT_PIDS=$(ps aux | grep -E "[n]ext dev|[n]ext start|node.*next" | awk '{print $2}')

if [ -z "$NEXT_PIDS" ]; then
    echo -e "${YELLOW}⚠${NC} No frontend server process found running"
    echo -e "${GREEN}✓${NC} Frontend server is already stopped"
    exit 0
fi

echo -e "${GREEN}[1/3]${NC} Found frontend server process(es):"
for PID in $NEXT_PIDS; do
    PROCESS_INFO=$(ps -p "$PID" -o comm=,args= 2>/dev/null | head -1)
    echo -e "  ${GREEN}•${NC} PID: $PID - $PROCESS_INFO"
done

echo ""
echo -e "${GREEN}[2/3]${NC} Stopping frontend server gracefully..."

# Try graceful shutdown first (SIGTERM)
for PID in $NEXT_PIDS; do
    kill -TERM "$PID" 2>/dev/null
done

# Wait a bit for graceful shutdown
sleep 3

# Check if processes are still running
REMAINING_PIDS=$(ps aux | grep -E "[n]ext dev|[n]ext start|node.*next" | awk '{print $2}')

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
FINAL_PIDS=$(ps aux | grep -E "[n]ext dev|[n]ext start|node.*next" | awk '{print $2}')

if [ -z "$FINAL_PIDS" ]; then
    echo -e "${GREEN}✓${NC} Frontend server stopped successfully"
    echo ""
    echo "=========================================="
    echo -e "${GREEN}Frontend server is now stopped${NC}"
    echo "=========================================="
    exit 0
else
    echo -e "${RED}✗${NC} Failed to stop some processes:"
    for PID in $FINAL_PIDS; do
        PROCESS_INFO=$(ps -p "$PID" -o comm=,args= 2>/dev/null | head -1)
        echo -e "  ${RED}•${NC} PID: $PID - $PROCESS_INFO (still running)"
    done
    echo ""
    echo -e "${YELLOW}You may need to stop them manually:${NC}"
    echo "  kill -9 $FINAL_PIDS"
    exit 1
fi

