# Campaign Management - Backend

Backend API for Campaign Management System built with FastAPI, PostgreSQL, and Millis.ai integration.

## Prerequisites

- Python 3.8 or higher
- PostgreSQL database
- Millis.ai API access

## Setup Guide

### 1. Clone the Repository

```bash
git clone <repository-url>
cd campaign_management/backend
```

### 2. Create Virtual Environment

```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Environment Configuration

Create a `.env` file in the `backend` directory with the following variables:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=your_database_name
DB_USER=your_database_user
DB_PASSWORD=your_database_password

MILLIS_API_KEY=your_millis_api_key
```

**Important:** Replace all placeholder values with your actual credentials.


### 5. Run the Server

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`

### 6. API Documentation

Once the server is running, access the interactive API documentation at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Features

- Campaign management (create, update, delete, refresh status)
- Phone and caller management
- Campaign start/stop functionality
- Record management and deletion
- CSV data handling (read, write, upload, delete)
- Millis.ai API integration
- Data filtering and querying

## Troubleshooting

### Database Connection Issues
- Verify PostgreSQL is running
- Check database credentials in `.env`
- Ensure database exists and user has proper permissions

### Millis.ai API Issues
- Verify `MILLIS_API_KEY` is correct in `.env`
- Check API endpoint accessibility
- Review API response logs in console

### Port Already in Use
- Change port: `uvicorn main:app --reload --port 8001`
- Or stop the process using port 8000

## Development

For development with auto-reload:
```bash
uvicorn main:app --reload
```

## License

[Your License Here]
