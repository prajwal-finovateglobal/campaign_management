# Campaign Management System

Complete campaign management platform with data visualization, campaign control, and disposition tree analysis.

## Overview

This system provides:
- **Campaign Management:** Create, start, stop, and monitor campaigns
- **Data Management:** Filter, view, and export campaign data
- **Disposition Tree:** Interactive visualization with save/load functionality
- **Authentication:** Secure login and session management
- **API Integration:** Millis.ai integration for campaign operations

## Tech Stack

### Backend
- FastAPI (Python 3.8+)
- PostgreSQL
- SQLAlchemy ORM
- Millis.ai API integration

### Frontend
- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- ReactFlow

## Quick Start

### Prerequisites

- Python 3.8+
- Node.js 18+
- PostgreSQL database
- npm

### Setup

#### Option 1: Automated Setup (Recommended)

```bash
# Setup both backend and frontend
bash setup_all.sh
```

#### Option 2: Manual Setup

**Backend:**
```bash
bash setup_backend.sh
# Edit backend/.env with your configuration
bash run_backend.sh
```

**Frontend:**
```bash
bash setup_frontend.sh
# Edit frontend/.env.local with your backend URL
bash run_frontend.sh
```

### Configuration

1. **Backend** (`backend/.env`):
   - Database credentials
   - Authentication credentials
   - Millis.ai API key (optional)

2. **Frontend** (`frontend/.env.local`):
   - Backend API URL (`NEXT_PUBLIC_API_URL`)

## Running the Application

### Start Servers

**Backend:**
```bash
bash run_backend.sh
```
Backend runs on `http://localhost:8000`

**Frontend:**
```bash
bash run_frontend.sh
```
Frontend runs on `http://localhost:3000`

### Stop Servers

```bash
# Stop both
bash stop_all.sh

# Or individually
bash stop_backend.sh
bash stop_frontend.sh
```

## Project Structure

```
campaign management/
├── backend/              # FastAPI backend
│   ├── main.py         # Entry point
│   ├── router/         # API routes
│   ├── service/        # Business logic
│   ├── models/         # Database models
│   └── requirements.txt
├── frontend/            # Next.js frontend
│   ├── app/            # Pages
│   ├── components/     # React components
│   ├── lib/           # Utilities
│   └── package.json
├── setup_backend.sh     # Backend setup script
├── setup_frontend.sh    # Frontend setup script
├── run_backend.sh       # Start backend
├── run_frontend.sh      # Start frontend
└── stop_all.sh          # Stop all servers
```

## Key Features

- ✅ Campaign lifecycle management (create, start, stop)
- ✅ Data filtering and export
- ✅ Interactive disposition tree visualization
- ✅ Save/load tree structures
- ✅ Public sharing links (read-only)
- ✅ Authentication and session management
- ✅ Millis.ai API integration

## API Documentation

Once backend is running:
- **Swagger UI:** `http://localhost:8000/docs`
- **ReDoc:** `http://localhost:8000/redoc`

## Deployment

For AWS deployment, see `AWS_DEPLOYMENT_GUIDE.md`

## Shell Scripts

All scripts are located in the project root directory. Make them executable with `chmod +x script_name.sh`

### Setup Scripts (Run Once)

**`setup_backend.sh`**
- Sets up Python backend environment
- Creates virtual environment
- Installs Python dependencies from `requirements.txt`
- Creates `.env` template file
- Creates necessary directories (logs, data)
- **Usage:** `bash setup_backend.sh`

**`setup_frontend.sh`**
- Sets up Next.js frontend environment
- Checks Node.js version (requires 18+)
- Installs npm dependencies
- Creates `.env.local` template file
- Clears Next.js cache
- **Usage:** `bash setup_frontend.sh`

**`setup_all.sh`**
- Runs both backend and frontend setup
- One command to set up everything
- **Usage:** `bash setup_all.sh`

### Run Scripts (Start Servers)

**`run_backend.sh`**
- Starts FastAPI backend server
- Activates virtual environment automatically
- Loads environment variables from `.env`
- Server runs on `http://0.0.0.0:8000`
- **Usage:** `bash run_backend.sh`

**`run_frontend.sh`**
- Starts Next.js frontend server
- Supports three modes: `dev`, `build`, `start`
- Loads environment variables from `.env.local`
- Server runs on `http://localhost:3000`
- **Usage:** 
  - `bash run_frontend.sh` (development mode)
  - `bash run_frontend.sh build` (build for production)
  - `bash run_frontend.sh start` (start production server)

### Stop Scripts (Stop Servers)

**`stop_backend.sh`**
- Stops running backend server
- Finds and kills uvicorn processes
- Graceful shutdown (SIGTERM) then force kill if needed
- **Usage:** `bash stop_backend.sh`

**`stop_frontend.sh`**
- Stops running frontend server
- Finds and kills Next.js processes
- Graceful shutdown (SIGTERM) then force kill if needed
- **Usage:** `bash stop_frontend.sh`

**`stop_all.sh`**
- Stops both backend and frontend servers
- **Usage:** `bash stop_all.sh`

## Quick Workflow

### First Time Setup
```bash
bash setup_all.sh
```

### Configure Environment
1. Edit `backend/.env` with your database and API credentials
2. Edit `frontend/.env.local` with your backend URL

### Start Development
```bash
# Terminal 1
bash run_backend.sh

# Terminal 2
bash run_frontend.sh
```

### Stop Servers
```bash
bash stop_all.sh
```

## Environment Files

- `backend/.env` - Backend configuration
- `frontend/.env.local` - Frontend configuration

**Note:** These files are not committed to git. Create them using the setup scripts or manually.

## Support

For detailed documentation:
- Backend: See `backend/README.md`
- Frontend: See `frontend/README.md`
- AWS Deployment: See `AWS_DEPLOYMENT_GUIDE.md`

