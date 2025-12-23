# Import all models to ensure SQLAlchemy can resolve relationships
# IMPORTANT: Import tables.py first to create DataLog before Client references it
from models.tables import DataLog  # This creates DataLog and registers it
from models.client import Client, Phase, Campaign, Chunk  # Now Client can reference DataLog

__all__ = ['Client', 'Phase', 'Campaign', 'Chunk', 'DataLog']

