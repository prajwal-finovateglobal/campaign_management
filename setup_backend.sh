#!/bin/bash

# =============================================================================
# Backend Setup Script for AWS Deployment
# =============================================================================
# This script sets up the Python backend environment on AWS
# Run this script once before starting the backend server
#
# Usage: bash setup_backend.sh
# =============================================================================

set -e  # Exit on any error

echo "=========================================="
echo "Backend Setup Script - "
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BACKEND_DIR="$SCRIPT_DIR/backend"

echo -e "${GREEN}[1/6]${NC} Checking Python installation..."
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}ERROR: Python 3 is not installed. Please install Python 3.8 or higher.${NC}"
    echo -e "${YELLOW}On Mac: Install Xcode Command Line Tools (xcode-select --install) or Python via Homebrew.${NC}"
    exit 1
fi

# Get Python version (capture stderr in case macOS stub redirects there)
PYTHON_VERSION=$(python3 --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
if [ -z "$PYTHON_VERSION" ]; then
    echo -e "${RED}ERROR: Could not detect Python version. On Mac, you may need Xcode Command Line Tools:${NC}"
    echo -e "${YELLOW}  Run: xcode-select --install${NC}"
    echo -e "${YELLOW}  Or install Python via Homebrew: brew install python@3.11${NC}"
    exit 1
fi

PYTHON_MAJOR=$(echo "$PYTHON_VERSION" | cut -d'.' -f1)
PYTHON_MINOR=$(echo "$PYTHON_VERSION" | cut -d'.' -f2)
echo -e "${GREEN}✓${NC} Python version: $PYTHON_VERSION"

# Check Python version (3.8+)
if [ "$PYTHON_MAJOR" -lt 3 ] || ([ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 8 ]); then
    echo -e "${RED}ERROR: Python 3.8 or higher is required. Current version: $PYTHON_VERSION${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}[2/6]${NC} Navigating to backend directory..."
cd "$BACKEND_DIR" || exit 1
echo -e "${GREEN}✓${NC} Current directory: $(pwd)"

echo ""
echo -e "${GREEN}[3/6]${NC} Creating Python virtual environment..."
if [ -d "venv" ]; then
    echo -e "${YELLOW}⚠${NC} Virtual environment already exists. Removing old one..."
    rm -rf venv
fi

python3 -m venv venv
echo -e "${GREEN}✓${NC} Virtual environment created"

echo ""
echo -e "${GREEN}[4/6]${NC} Activating virtual environment and upgrading pip..."
source venv/bin/activate
python3 -m pip install --upgrade pip --quiet
echo -e "${GREEN}✓${NC} Pip upgraded to latest version"

echo ""
echo -e "${GREEN}[5/6]${NC} Installing Python dependencies..."
if [ ! -f "requirements.txt" ]; then
    echo -e "${RED}ERROR: requirements.txt not found in backend directory${NC}"
    exit 1
fi

pip install -r requirements.txt
echo -e "${GREEN}✓${NC} All dependencies installed"

echo ""
echo -e "${GREEN}[6/6]${NC} Checking .env file..."
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠${NC} .env file not found. Creating template..."
    cat > .env << 'ENVEOF'
# Backend Environment Variables
# Update these values with your actual configuration

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=campaign_db
DB_USER=your_db_user
DB_PASSWORD=your_db_password

# Authentication Credentials
AUTH_USERNAME=admin
AUTH_PASSWORD=your_secure_password

# Millis.ai API Configuration (if needed)
MILLIS_API_KEY=your_millis_api_key
MILLIS_API_URL=https://api.millis.ai

# Server Configuration
HOST=0.0.0.0
PORT=8000
ENVEOF
    echo -e "${YELLOW}⚠${NC} Please update .env file with your actual configuration before running the server"
else
    echo -e "${GREEN}✓${NC} .env file found"
fi

echo ""
echo -e "${GREEN}[7/7]${NC} Creating necessary directories..."
mkdir -p logs
mkdir -p data/disposition_shares
echo -e "${GREEN}✓${NC} Directories created"

echo ""
echo "=========================================="
echo -e "${GREEN}✓ Backend setup completed successfully!${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Update backend/.env file with your configuration"
echo "2. Run: bash run_backend.sh"
echo ""
echo "To activate virtual environment manually:"
echo "  cd backend && source venv/bin/activate"
echo ""

