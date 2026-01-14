import os
import sys
from pathlib import Path

# Add parent directory to path to allow imports when running directly
parent_dir = Path(__file__).parent.parent
if str(parent_dir) not in sys.path:
    sys.path.insert(0, str(parent_dir))

from dotenv import load_dotenv

# Load .env from project root
env_path = parent_dir / ".env"
load_dotenv(dotenv_path=env_path)

from fastapi import Depends
from sqlalchemy.orm import Session
from typing import Annotated, Generator
from sqlalchemy import create_engine, MetaData
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker, declarative_base
from Core.config import DB_URL
from Core.logging_config import logger  # Use centralized logging

Base = declarative_base()

engine = create_engine(DB_URL, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

metadata = MetaData()
metadata.reflect(bind=engine)

try:
    with engine.connect() as conn:
        logger.info("Database connected successfully")
except SQLAlchemyError as e:
    logger.error(f"Database connection failed: {e}")
    raise e