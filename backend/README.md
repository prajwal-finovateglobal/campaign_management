# Backend - Campaign Management API

FastAPI backend for campaign management, data processing, and Millis.ai integration.

## Tech Stack

- **Framework:** FastAPI
- **Language:** Python 3.8+
- **Database:** PostgreSQL (SQLAlchemy ORM)
- **Authentication:** Bearer token (session-based)
- **API Integration:** Millis.ai API

## Quick Start

### Prerequisites

- Python 3.8 or higher
- PostgreSQL database
- pip

### Installation

```bash
# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate  # Linux/Mac
# OR
venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt
```

### Configuration

Create `.env` file in the backend directory:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=campaign_db
DB_USER=your_db_user
DB_PASSWORD=your_db_password

# Authentication
AUTH_USERNAME=admin
AUTH_PASSWORD=your_password

# Millis.ai API (optional)
MILLIS_API_KEY=your_api_key

```

### Run Server

```bash
# Activate virtual environment
source venv/bin/activate

# Start server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Server will be available at `http://localhost:8000`

API Documentation:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Project Structure

```
backend/
├── main.py              # FastAPI app entry point
├── Core/
│   └── config.py      # Environment configuration
├── router/             # API route handlers
│   ├── auth.py        # Authentication endpoints
│   ├── campaign.py    # Campaign management
│   ├── client.py      # Client management
│   └── ...
├── service/            # Business logic
│   ├── campaign.py
│   ├── millis_api.py  # Millis.ai integration
│   └── ...
├── models/             # Database models
├── schema/             # Pydantic schemas
├── database/           # Database configuration
└── data/               # Data storage (CSV, JSON)
```

## API Endpoints

### Authentication
- `POST /auth/login` - Login
- `POST /auth/logout` - Logout
- `GET /auth/verify` - Verify token

### Campaigns
- `GET /campaign` - Get campaigns
- `POST /campaign/create` - Create campaign
- `POST /campaign/start` - Start campaign
- `POST /campaign/stop` - Stop campaign
- `DELETE /campaign/{id}` - Delete campaign

### Clients & Phases
- `GET /client` - Get clients
- `GET /phase` - Get phases
- `POST /phase/create` - Create phase

### Data Management
- `POST /show_data` - Filter and view data
- `POST /load_sdtc` - Load data to CSV
- `GET /get_csv_data` - Get CSV data
- `POST /upload_csv` - Upload CSV file

### Disposition Tree
- `POST /disposition-tree/positions/save` - Save structure
- `GET /disposition-tree/positions` - Load structure
- `GET /disposition-tree/{share_id}` - Get shared tree (public)

## Authentication

All endpoints (except `/auth/*` and public shared trees) require Bearer token authentication:

```
Authorization: Bearer <token>
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DB_HOST` | Database host | Yes |
| `DB_PORT` | Database port | Yes |
| `DB_NAME` | Database name | Yes |
| `DB_USER` | Database user | Yes |
| `DB_PASSWORD` | Database password | Yes |
| `AUTH_USERNAME` | Admin username | Yes |
| `AUTH_PASSWORD` | Admin password | Yes |
| `MILLIS_API_KEY` | Millis.ai API key | Yes |

## Deployment

See `../AWS_DEPLOYMENT_GUIDE.md` for detailed AWS deployment instructions.

Quick deployment:
```bash
bash ../setup_backend.sh
bash ../run_backend.sh
```

## Logs

Logs are stored in `logs/app.log` (if `LOG_TO_FILE` is enabled in config).

