import os
from pathlib import Path
from dotenv import load_dotenv
from urllib.parse import quote_plus
from pydantic_settings import BaseSettings

# Load .env from project root
project_root = Path(__file__).parent.parent
env_path = project_root / ".env"

load_dotenv(dotenv_path=env_path)

DB_HOST: str = os.getenv("DB_HOST")
DB_PORT: str = os.getenv("DB_PORT")
DB_NAME: str = os.getenv("DB_NAME")
DB_USER: str = os.getenv("DB_USER")
DB_PASSWORD: str = os.getenv("DB_PASSWORD")


if not all([DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD]):
    raise ValueError("Missing environment variables")

encoded_password = quote_plus(DB_PASSWORD)

DB_URL = f"postgresql://{DB_USER}:{encoded_password}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# Millis.ai API Configuration
MILLIS_API_KEY: str = os.getenv("MILLIS_API_KEY", "")
MILLIS_API_BASE_URL: str = "https://api-west.millis.ai"

# Request Limiting Configuration
MAX_CONCURRENT_REQUESTS: int = int(os.getenv("MAX_CONCURRENT_REQUESTS", "50"))  # Max 50 parallel requests
HTTP_CONNECTION_POOL_SIZE: int = 100  # Max concurrent connections in pool
HTTP_TIMEOUT: float = 30.0  # Request timeout in seconds

# Authentication Configuration
# Supports multiple env variable names for flexibility:
# Priority: AUTH_USER > AUTH_USERNAME > USER (to avoid conflicts with system USER variable)
AUTH_USER: str = os.getenv("AUTH_USER", os.getenv("AUTH_USERNAME", os.getenv("USER", "")))
AUTH_PASSWORD: str = os.getenv("AUTH_PASSWORD", os.getenv("PASSWORD", ""))

# Logging Configuration
LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO").upper()  # DEBUG, INFO, WARNING, ERROR, CRITICAL
LOG_TO_FILE: bool = os.getenv("LOG_TO_FILE", "true").lower() in ("true", "1", "yes")
LOG_FILE_PATH: str = os.getenv("LOG_FILE_PATH", "logs/app.log")

# Campaign Automation Configuration
ALIVE_PERIOD: int = int(os.getenv("ALIVE_PERIOD", "300"))  # Time in seconds to consider a job alive (default: 5 minutes)


class Settings(BaseSettings):
    LOG_LEVEL: str = LOG_LEVEL
    LOG_TO_FILE: bool = LOG_TO_FILE
    LOG_FILE_PATH: str = LOG_FILE_PATH

    model_config = {
        'extra': 'allow'
    }

settings = Settings()