# Data Lots Migration Guide

## Overview
This migration adds support for **Data Lots** - a system to manage large datasets by breaking them into phases for systematic campaign processing.

## Changes
- **New Table**: `cms_data_lots` - manages data lots with multi-phase support
- **Modified Table**: `cms_campaign_jobs` - adds `lot_id` column to link jobs to data lots
- **New Trigger**: Auto-updates `updated_at` timestamp in `cms_data_lots`

---

## Prerequisites

### 1. Backup Database
```bash
# PostgreSQL backup
pg_dump -h <host> -U <user> -d <database> -F c -f backup_before_data_lots_migration.dump

# Or using your backup script
./backup_database.sh
```

### 2. Check for Active Jobs
```sql
-- Verify no active campaign jobs
SELECT id, client_id, campaign_id, status, current_stage
FROM cms_campaign_jobs
WHERE status IN ('running', 'queue')
ORDER BY id DESC;
```

### 3. Verify Prerequisites
```sql
-- Ensure cms_client table exists
SELECT COUNT(*) FROM cms_client;

-- Ensure cms_campaign_jobs table exists
SELECT COUNT(*) FROM cms_campaign_jobs;
```

---

## Migration Steps

### Method 1: Automated Migration (Recommended)

```bash
# Navigate to database directory
cd backend/database

# Run the master migration script
psql -h <host> -U <user> -d <database> -f run_data_lots_migration.sql
```

This will:
1. Create `cms_data_lots` table with all constraints
2. Create auto-update trigger for `updated_at`
3. Add `lot_id` column to `cms_campaign_jobs`
4. Create indexes for better performance
5. Verify all changes

### Method 2: Manual Migration

Run each migration file in order:

```bash
cd backend/database

# Step 1: Create cms_data_lots table
psql -h <host> -U <user> -d <database> -f 001_create_data_lots_table.sql

# Step 2: Create updated_at trigger
psql -h <host> -U <user> -d <database> -f 002_create_updated_at_trigger.sql

# Step 3: Add lot_id to cms_campaign_jobs
psql -h <host> -U <user> -d <database> -f 003_add_lot_id_to_campaign_jobs.sql
```

---

## Verification

### 1. Verify Table Creation
```sql
-- Check cms_data_lots table exists
SELECT * FROM information_schema.tables 
WHERE table_name = 'cms_data_lots';

-- View table structure
\d cms_data_lots
```

### 2. Verify Column Addition
```sql
-- Check lot_id column in cms_campaign_jobs
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'cms_campaign_jobs'
AND column_name = 'lot_id';
```

### 3. Verify Foreign Keys
```sql
-- List all foreign keys
SELECT
    tc.table_name,
    tc.constraint_name,
    kcu.column_name,
    ccu.table_name AS foreign_table
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
AND tc.table_name IN ('cms_data_lots', 'cms_campaign_jobs');
```

### 4. Test Data Lot Creation
```sql
-- Insert a test data lot
INSERT INTO cms_data_lots (name, client_id, max_phases, total_records, status)
VALUES ('Test_Lot_001', 1, 3, 1000, 'active')
RETURNING *;

-- Verify timestamps are in Asia/Kolkata timezone
SELECT 
    id, 
    name, 
    created_at,
    updated_at,
    created_at AT TIME ZONE 'Asia/Kolkata' as created_ist,
    updated_at AT TIME ZONE 'Asia/Kolkata' as updated_ist
FROM cms_data_lots
WHERE name = 'Test_Lot_001';

-- Test auto-update trigger
UPDATE cms_data_lots 
SET current_phase_no = 2 
WHERE name = 'Test_Lot_001';

-- Verify updated_at changed
SELECT id, name, current_phase_no, updated_at 
FROM cms_data_lots 
WHERE name = 'Test_Lot_001';

-- Clean up test data
DELETE FROM cms_data_lots WHERE name = 'Test_Lot_001';
```

---

## Application Updates

### 1. Update SQLAlchemy Models

The models have been updated in `backend/models/automation.py`:

```python
# New DataLot model added
class DataLot(Base):
    __tablename__ = "cms_data_lots"
    # ... fields ...

# CampaignJob model updated with lot_id
class CampaignJob(Base):
    __tablename__ = "cms_campaign_jobs"
    lot_id = Column(Integer, ForeignKey('cms_data_lots.id'))
    # ... other fields ...
```

### 2. Restart Application

```bash
# Stop backend
./stop_backend.sh

# Start backend (this will load the new models)
./run_backend.sh
```

### 3. Verify Models Loaded

Check application logs for SQLAlchemy model registration:
```bash
tail -f backend/logs/app.log | grep -i "data_lot\|DataLot"
```

---

## Usage Examples

### Creating a Data Lot

```python
from models.automation import DataLot
from database.dependencies import DB_DEPENDENCY

# Create a new data lot
new_lot = DataLot(
    name="Campaign_Lot_January_2026",
    client_id=1,
    max_phases=5,
    current_phase_no=1,
    status='active',
    total_records=10000
)
db.add(new_lot)
db.commit()
```

### Linking Campaign Job to Data Lot

```python
from models.automation import CampaignJob

# Create campaign job linked to data lot
campaign_job = CampaignJob(
    client_id=1,
    campaign_id=123,
    lot_id=new_lot.id,  # Link to data lot
    status='queue',
    priority=1
)
db.add(campaign_job)
db.commit()
```

### Querying Campaign Jobs by Data Lot

```python
# Get all campaign jobs for a specific data lot
jobs = db.query(CampaignJob).filter(
    CampaignJob.lot_id == lot_id
).all()

# Get data lot with all its campaign jobs
lot = db.query(DataLot).filter(DataLot.id == lot_id).first()
# jobs = lot.campaign_jobs  # After uncommenting relationships
```

---

## Rollback Instructions

If you need to revert the migration:

```bash
cd backend/database

# Step 1: Remove lot_id column from cms_campaign_jobs
psql -h <host> -U <user> -d <database> -f rollback_002_remove_lot_id_from_campaign_jobs.sql

# Step 2: Drop cms_data_lots table
psql -h <host> -U <user> -d <database> -f rollback_001_drop_data_lots.sql
```

⚠️ **WARNING**: Rollback will delete all data in `cms_data_lots` and remove all `lot_id` references!

---

## Table Schema Reference

### cms_data_lots

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | Auto-increment ID |
| name | VARCHAR(255) | NOT NULL | Lot name/identifier |
| client_id | INTEGER | NOT NULL, FK | Foreign key to cms_client |
| max_phases | INTEGER | NOT NULL, > 0 | Maximum phases allowed |
| current_phase_no | INTEGER | NOT NULL, >= 1 | Current active phase |
| status | VARCHAR(50) | NOT NULL | active, completed, paused, cancelled |
| total_records | INTEGER | NOT NULL, >= 0 | Total records in lot |
| created_at | TIMESTAMP TZ | NOT NULL | Creation timestamp (IST) |
| updated_at | TIMESTAMP TZ | NOT NULL | Last update timestamp (IST) |
| ended_at | TIMESTAMP TZ | NULL | Completion timestamp (IST) |

**Constraints:**
- Unique: `(name, client_id)`
- Check: `current_phase_no <= max_phases`
- FK: `client_id → cms_client.id` (ON DELETE CASCADE)

**Indexes:**
- `idx_data_lots_client_id`
- `idx_data_lots_status`
- `idx_data_lots_created_at`
- `idx_data_lots_current_phase`

---

## Troubleshooting

### Error: Foreign key constraint violation
```sql
-- Check if client_id exists in cms_client
SELECT id FROM cms_client WHERE id = <your_client_id>;
```

### Error: Trigger not working
```sql
-- Check trigger exists
SELECT * FROM information_schema.triggers 
WHERE trigger_name = 'trigger_update_data_lots_updated_at';

-- Recreate trigger if needed
\i 002_create_updated_at_trigger.sql
```

### Error: Column already exists
This is safe - migration uses `IF NOT EXISTS` clauses. The migration is idempotent.

---

## Support

For issues or questions:
1. Check application logs: `backend/logs/app.log`
2. Verify database connection settings in `.env`
3. Review migration script output for errors
4. Check PostgreSQL logs

---

## Migration Files

- `001_create_data_lots_table.sql` - Creates cms_data_lots table
- `002_create_updated_at_trigger.sql` - Creates auto-update trigger
- `003_add_lot_id_to_campaign_jobs.sql` - Adds lot_id column
- `run_data_lots_migration.sql` - Master migration script
- `rollback_001_drop_data_lots.sql` - Rollback data lots table
- `rollback_002_remove_lot_id_from_campaign_jobs.sql` - Rollback lot_id column

---

**Migration Date**: 2026-01-26  
**Database Timezone**: Asia/Kolkata (IST, UTC+5:30)  
**Version**: 1.0.0
