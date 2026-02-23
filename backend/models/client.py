from sqlalchemy import Column, Integer, String, DateTime, Boolean, JSON, Text
from database.session import Base
from sqlalchemy.orm import relationship
from sqlalchemy import ForeignKey
from sqlalchemy import text
# Import DataLog to ensure it's created before Client relationships are set up
# This must be imported here to avoid circular dependency issues
# Import at module level to ensure DataLog is registered before Client class definition
from models.tables import DataLog  # noqa: F401

class Client(Base):
    __tablename__ = "cms_client"

    id = Column(Integer, primary_key=True, autoincrement=True, nullable=False)
    name = Column(String, nullable=False)
    meta_map = Column(JSON, nullable=False)
    table_name = Column(String, nullable=False)
    
    # Relationships
    phases = relationship('Phase', back_populates='client', cascade='all, delete-orphan')
    # Note: DataLog (dummy_table) doesn't have client_id foreign key, so relationship removed
    # Access data logs through the client's table_name instead


class Phase(Base):
    __tablename__ = "cms_phase"

    id = Column(Integer, primary_key=True, autoincrement=True, nullable=False)
    name = Column(String, nullable=False)
    client_id = Column(Integer, ForeignKey('cms_client.id'), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=True, server_default="CURRENT_TIMESTAMP")
    # Note: status and records_count were mistakenly added to phase table but should not be used
    # They exist in DB but are not part of the model to avoid confusion

    # Relationships
    client = relationship('Client', back_populates='phases')
    campaigns = relationship('Campaign', back_populates='phase', cascade='all, delete-orphan')

class Campaign(Base):
    __tablename__ = "cms_campaign"

    id = Column(Integer, primary_key=True, autoincrement=True, nullable=False)
    campaign_name = Column(String, nullable=True)
    upsert_time = Column(DateTime, nullable=True)
    phase_id = Column(Integer, ForeignKey('cms_phase.id'), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=True, server_default=text("(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')"))
    cid = Column(Text, nullable=True)  # Changed from String to Text per DDL
    status = Column(String, nullable=True)  # Campaign status from Millis.ai
    records_count = Column(Integer, nullable=True)  # Record count from Millis.ai
    phone_id = Column(String, nullable=True)  # Phone ID from Millis.ai
    agent_id = Column(String, nullable=True)  # Agent ID from Millis.ai
    type = Column(String, nullable=True)  # Campaign type
    chunk_size = Column(Integer, nullable=True)  # Chunk size used when creating chunks (for multiple type)
    idx = Column(Integer, nullable=True, default=0)  # Starting index in data.csv for partial upsert (0-based)
    size = Column(Integer, nullable=True, default=0)  # Number of records to upsert from idx
    
    # Time tracking fields for notifications
    started_at = Column(DateTime(timezone=True), nullable=True)  # When campaign was started
    completed_at = Column(DateTime(timezone=True), nullable=True)  # When campaign completed

    # Relationships
    phase = relationship('Phase', back_populates='campaigns')
    chunks = relationship('Chunk', back_populates='campaign', cascade='all, delete-orphan')
    # Note: DataLog (dummy_table) doesn't have foreign key on campaign_id, so relationship removed
    # Access data logs through queries filtering by campaign_id instead


class Chunk(Base):
    __tablename__ = "cms_chunks"

    id = Column(Integer, primary_key=True, autoincrement=True, nullable=False)
    chunk_name = Column(String, nullable=True)
    upsert_time = Column(DateTime, nullable=True)
    campaign_id = Column(Integer, ForeignKey('cms_campaign.id'), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=True, server_default="CURRENT_TIMESTAMP")
    cid = Column(Text, nullable=True)  # Chunk ID from Millis.ai
    status = Column(String, nullable=True)  # Chunk status from Millis.ai
    records_count = Column(Integer, nullable=True)  # Record count from Millis.ai
    phone_id = Column(String, nullable=True)  # Phone ID from Millis.ai
    agent_id = Column(String, nullable=True)  # Agent ID from Millis.ai
    upload_status = Column(String, nullable=True)  # Upload status: 'done' or null

    # Auto-run loop progress (completely separate from Millis.ai status above)
    # Written only by auto_run_service — never by existing chunk/campaign logic
    auto_run_status  = Column(String(30), nullable=True)  # pending|starting|started|waiting_finish|countdown|finished|failed
    auto_run_message = Column(Text, nullable=True)         # human-readable progress message for UI

    # Relationships
    campaign = relationship('Campaign', back_populates='chunks')