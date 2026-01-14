from typing import Annotated, Generator
from sqlalchemy.orm import Session
from fastapi import Depends
from sqlalchemy.exc import SQLAlchemyError
from loguru import logger
from .session import SessionLocal

async def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except SQLAlchemyError as e:
        logger.error(f"Database error occurred: {e}")
        db.rollback()
        raise
    except Exception as e:
        logger.error(f"Unexpected error occurred: {e}")
        db.rollback()
        raise
    finally:
        db.close()

DB_DEPENDENCY = Annotated[Session, Depends(get_db)]