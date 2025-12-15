from sqlalchemy import Column, Integer, String, DateTime, Boolean, JSON, Text
from database.session import Base
from sqlalchemy.orm import relationship
from sqlalchemy import ForeignKey

# Import DataLog to ensure it's created before Client relationships are set up
# This must be imported here to avoid circular dependency issues
# Import at module level to ensure DataLog is registered before Client class definition
from models.tables import DataLog  # noqa: F401

class Client(Base):
    __tablename__ = "client"

    id = Column(Integer, primary_key=True, autoincrement=True, nullable=False)
    name = Column(String, nullable=False)
    meta_map = Column(JSON, nullable=False)
    table_name = Column(String, nullable=False)
    
    # Relationships
    phases = relationship('Phase', back_populates='client', cascade='all, delete-orphan')
    # Note: DataLog (dummy_table) doesn't have client_id foreign key, so relationship removed
    # Access data logs through the client's table_name instead


class Phase(Base):
    __tablename__ = "phase"

    id = Column(Integer, primary_key=True, autoincrement=True, nullable=False)
    name = Column(String, nullable=False)
    client_id = Column(Integer, ForeignKey('client.id'), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=True, server_default="CURRENT_TIMESTAMP")
    # Note: status and records_count were mistakenly added to phase table but should not be used
    # They exist in DB but are not part of the model to avoid confusion

    # Relationships
    client = relationship('Client', back_populates='phases')
    campaigns = relationship('Campaign', back_populates='phase', cascade='all, delete-orphan')

class Campaign(Base):
    __tablename__ = "campaign"

    id = Column(Integer, primary_key=True, autoincrement=True, nullable=False)
    campaign_name = Column(String, nullable=True)
    upsert_time = Column(DateTime, nullable=True)
    phase_id = Column(Integer, ForeignKey('phase.id'), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=True, server_default="CURRENT_TIMESTAMP")
    cid = Column(Text, nullable=True)  # Changed from String to Text per DDL
    status = Column(String, nullable=True)  # Campaign status from Millis.ai
    records_count = Column(Integer, nullable=True)  # Record count from Millis.ai
    phone_id = Column(String, nullable=True)  # Phone ID from Millis.ai
    agent_id = Column(String, nullable=True)  # Agent ID from Millis.ai

    # Relationships
    phase = relationship('Phase', back_populates='campaigns')
    # Note: DataLog (dummy_table) doesn't have foreign key on campaign_id, so relationship removed
    # Access data logs through queries filtering by campaign_id instead