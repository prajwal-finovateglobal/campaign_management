from sqlalchemy import Column, Integer, BigInteger, String, DateTime, Boolean, JSON, Text, NUMERIC, Time
from database.session import Base
from sqlalchemy.orm import relationship
from sqlalchemy import ForeignKey
from sqlalchemy import text, CheckConstraint, UniqueConstraint


class DataLot(Base):
    """
    Data lots (batches) that go through multiple phases of campaign processing.
    Manages large datasets by breaking them into phases for systematic processing.
    """
    __tablename__ = "cms_data_lots"

    id = Column(Integer, primary_key=True, autoincrement=True, nullable=False)
    name = Column(String(255), nullable=False)
    client_id = Column(Integer, ForeignKey('cms_client.id', ondelete='CASCADE'), nullable=False)
    max_phases = Column(Integer, nullable=False, default=1)
    current_phase_no = Column(Integer, nullable=False, default=1)
    status = Column(String(50), nullable=False, default='active')
    total_records = Column(Integer, nullable=False, default=0)
    created_at = Column(
        DateTime(timezone=True), 
        nullable=False, 
        server_default=text("(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')")
    )
    updated_at = Column(
        DateTime(timezone=True), 
        nullable=False, 
        server_default=text("(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')")
    )
    ended_at = Column(DateTime(timezone=True), nullable=True)

    # Table constraints
    __table_args__ = (
        UniqueConstraint('name', 'client_id', name='uq_data_lots_name_client'),
        CheckConstraint('max_phases > 0', name='chk_max_phases_positive'),
        CheckConstraint('current_phase_no >= 1', name='chk_current_phase_positive'),
        CheckConstraint('current_phase_no <= max_phases', name='chk_current_phase_within_max'),
        CheckConstraint('total_records >= 0', name='chk_total_records_non_negative'),
        CheckConstraint("status IN ('active', 'completed', 'paused', 'cancelled')", name='chk_status_valid'),
    )

    # Relationships
    # campaign_jobs = relationship('CampaignJob', back_populates='data_lot')


class CampaignConfigDefault(Base):
    """
    Default configuration templates for campaign automation per client.
    Only one default can be active per client (enforced by unique index).
    """
    __tablename__ = "cms_campaign_config_defaults"

    id = Column(Integer, primary_key=True, autoincrement=True, nullable=False)
    client_id = Column(Integer, nullable=False)
    name = Column(String, nullable=False)
    attempts = Column(Integer, nullable=False)
    description = Column(Text, nullable=True)
    enable_disposition = Column(Boolean, nullable=False)
    enable_data_cleanup = Column(Boolean, nullable=False)
    enable_auto_iteration = Column(Boolean, nullable=False)
    campaign_priority = Column(Integer, nullable=False)
    disposition_priority = Column(Integer, nullable=False)
    chunk_size = Column(Integer, nullable=False)
    retry_on_failure = Column(Boolean, nullable=False, default=True)
    max_retries = Column(Integer, nullable=False)
    on_failure_action = Column(String(20), default='pause')
    is_active_default = Column(Boolean, nullable=False, default=False)
    created_at = Column(
        DateTime(timezone=True), 
        nullable=False, 
        server_default=text("((timezone('Asia/Kolkata', NOW()))::timestamp AT TIME ZONE 'Asia/Kolkata')")
    )
    updated_at = Column(
        DateTime(timezone=True), 
        nullable=False, 
        server_default=text("((timezone('Asia/Kolkata', NOW()))::timestamp AT TIME ZONE 'Asia/Kolkata')")
    )


class CampaignConfig(Base):
    """
    Active configuration for automated campaigns.
    Each campaign can have only one configuration (enforced by unique index).
    """
    __tablename__ = "cms_campaign_config"

    id = Column(BigInteger, primary_key=True, autoincrement=True, nullable=False)
    client_id = Column(BigInteger, nullable=False)
    campaign_id = Column(BigInteger, nullable=False)
    default_config_id = Column(BigInteger, nullable=True)
    enable_disposition = Column(Boolean, nullable=False)
    enable_data_cleanup = Column(Boolean, nullable=False)
    enable_next_iteration = Column(Boolean, nullable=False)
    campaign_priority = Column(Integer, nullable=False)
    disposition_priority = Column(Integer, nullable=False)
    chunk_size = Column(Integer, nullable=False)
    retry_on_failure = Column(Boolean, nullable=False)
    max_retries = Column(Integer, nullable=False)
    on_failure_action = Column(String(20), nullable=True)
    data_scope = Column(JSON, nullable=False)
    locked_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True), 
        nullable=False, 
        server_default=text("((timezone('Asia/Kolkata', NOW()))::timestamp AT TIME ZONE 'Asia/Kolkata')")
    )
    updated_at = Column(
        DateTime(timezone=True), 
        nullable=False, 
        server_default=text("((timezone('Asia/Kolkata', NOW()))::timestamp AT TIME ZONE 'Asia/Kolkata')")
    )


class CampaignJob(Base):
    """
    Active campaign job execution tracker.
    Only one running campaign per client (enforced by unique index).
    """
    __tablename__ = "cms_campaign_jobs"

    id = Column(BigInteger, primary_key=True, autoincrement=True, nullable=False)
    client_id = Column(BigInteger, nullable=False)
    campaign_id = Column(BigInteger, nullable=False)
    lot_id = Column(Integer, ForeignKey('cms_data_lots.id', ondelete='SET NULL'), nullable=True)
    status = Column(String(20), nullable=False)  # queue, running, completed, failed, paused
    current_stage = Column(String(30), nullable=True)  # disposition, data_cleanup, iteration, etc.
    priority = Column(Integer, nullable=False, default=0)
    action = Column(String(10), nullable=False, default='run')  # run, pause, stop
    heartbeat_at = Column(DateTime(timezone=True), nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True), 
        nullable=False, 
        server_default=text("((timezone('Asia/Kolkata', NOW()))::timestamp AT TIME ZONE 'Asia/Kolkata')")
    )
    updated_at = Column(
        DateTime(timezone=True), 
        nullable=False, 
        server_default=text("((timezone('Asia/Kolkata', NOW()))::timestamp AT TIME ZONE 'Asia/Kolkata')")
    )
    config = Column(JSON, nullable=True)  # Snapshot of configuration at job start

    # Relationships
    # data_lot = relationship('DataLot', back_populates='campaign_jobs')


class DispositionJob(Base):
    """
    Disposition processing jobs for automated campaigns.
    One job per campaign (enforced by unique index).
    """
    __tablename__ = "cms_disposition_jobs"

    id = Column(BigInteger, primary_key=True, autoincrement=True, nullable=False)
    client_id = Column(BigInteger, nullable=False)
    campaign_id = Column(BigInteger, nullable=False)
    status = Column(String(20), nullable=False)  # queue, running, completed, failed
    priority = Column(Integer, nullable=False, default=0)
    action = Column(String(10), nullable=False, default='run')  # run, pause, stop
    cur_idx = Column(BigInteger, nullable=False, default=0)
    total_records = Column(BigInteger, nullable=True)
    processed_records = Column(BigInteger, nullable=False, default=0)
    heartbeat_at = Column(DateTime(timezone=True), nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    retry_count = Column(Integer, nullable=False, default=0)
    created_at = Column(
        DateTime(timezone=True), 
        nullable=False, 
        server_default=text("((timezone('Asia/Kolkata', NOW()))::timestamp AT TIME ZONE 'Asia/Kolkata')")
    )
    updated_at = Column(
        DateTime(timezone=True), 
        nullable=False, 
        server_default=text("((timezone('Asia/Kolkata', NOW()))::timestamp AT TIME ZONE 'Asia/Kolkata')")
    )


class DataManager(Base):
    """
    Data cleanup/management workers for automated campaigns.
    One manager per campaign (enforced by unique index).
    """
    __tablename__ = "cms_data_managers"

    id = Column(BigInteger, primary_key=True, autoincrement=True, nullable=False)
    client_id = Column(BigInteger, nullable=False)
    campaign_id = Column(BigInteger, nullable=False)
    status = Column(String(20), nullable=False)  # queue, running, completed, failed
    priority = Column(Integer, nullable=False, default=0)
    action = Column(String(10), nullable=False, default='run')  # run, pause, stop
    processed_steps = Column(Integer, nullable=False, default=0)
    total_steps = Column(Integer, nullable=True)
    heartbeat_at = Column(DateTime(timezone=True), nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    retry_count = Column(Integer, nullable=False, default=0)
    created_at = Column(
        DateTime(timezone=True), 
        nullable=False, 
        server_default=text("((timezone('Asia/Kolkata', NOW()))::timestamp AT TIME ZONE 'Asia/Kolkata')")
    )
    updated_at = Column(
        DateTime(timezone=True), 
        nullable=False, 
        server_default=text("((timezone('Asia/Kolkata', NOW()))::timestamp AT TIME ZONE 'Asia/Kolkata')")
    )


class CampaignState(Base):
    """
    Tracks the state of backend-driven auto-run loops for multiple-type campaigns.
    One row per campaign (unique on campaign_id).
    The loop reads 'action' to know whether to run, pause, or stop.
    Per-chunk progress is stored as a JSON array in chunk_progress.
    """
    __tablename__ = "cms_campaign_state"

    id = Column(BigInteger, primary_key=True, autoincrement=True, nullable=False)
    campaign_id = Column(
        BigInteger,
        ForeignKey('cms_campaign.id', ondelete='CASCADE'),
        nullable=False,
        unique=True
    )
    client_id = Column(BigInteger, nullable=False)

    # Overall run state
    status = Column(String(20), nullable=False, default='idle')
    # idle, running, paused, stopped, completed

    # Control flag — frontend writes this; loop reads it
    action = Column(String(10), nullable=False, default='run')
    # run, pause, stop

    # Config snapshot at start
    gap_seconds = Column(Integer, nullable=False, default=30)

    # Progress tracking
    current_chunk_index = Column(Integer, nullable=False, default=0)
    total_chunks = Column(Integer, nullable=False, default=0)

    # NOTE: per-chunk progress is stored directly in cms_chunks.auto_run_status
    # and cms_chunks.auto_run_message — no JSON blob needed here.

    # Daily time-window (IST). NULL = no restriction (runs 24x7).
    # Format: datetime.time, e.g. time(9, 30) = 09:30 IST
    start_time = Column(Time, nullable=True)
    end_time   = Column(Time, nullable=True)

    # Timestamps
    started_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("((timezone('Asia/Kolkata', NOW()))::timestamp AT TIME ZONE 'Asia/Kolkata')")
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("((timezone('Asia/Kolkata', NOW()))::timestamp AT TIME ZONE 'Asia/Kolkata')")
    )


class CampaignMonitoring(Base):
    """
    Real-time monitoring and progress tracking for automated campaigns.
    One monitoring record per campaign (enforced by unique index).
    """
    __tablename__ = "cms_campaign_monitoring"

    id = Column(BigInteger, primary_key=True, autoincrement=True, nullable=False)
    client_id = Column(BigInteger, nullable=False)
    campaign_id = Column(BigInteger, nullable=False)
    campaign_status = Column(String(20), nullable=True)
    current_stage = Column(String(30), nullable=True)
    campaign_progress = Column(NUMERIC(5, 2), nullable=True)  # 0.00 to 100.00
    disposition_progress = Column(NUMERIC(5, 2), nullable=True)
    data_manager_progress = Column(NUMERIC(5, 2), nullable=True)
    disposition_cur_idx = Column(BigInteger, nullable=True)
    disposition_processed = Column(BigInteger, nullable=True)
    disposition_total = Column(BigInteger, nullable=True)
    last_updated_at = Column(
        DateTime(timezone=True), 
        nullable=False, 
        server_default=text("((timezone('Asia/Kolkata', NOW()))::timestamp AT TIME ZONE 'Asia/Kolkata')")
    )
