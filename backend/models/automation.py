from sqlalchemy import Column, Integer, BigInteger, String, DateTime, Boolean, JSON, Text, NUMERIC
from database.session import Base
from sqlalchemy.orm import relationship
from sqlalchemy import ForeignKey
from sqlalchemy import text


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
