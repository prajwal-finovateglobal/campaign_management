# Data Lots Migration - Summary

## 📋 Files Created

### Migration Files
1. **001_create_data_lots_table.sql**
   - Creates `cms_data_lots` table with all columns
   - Adds constraints (unique, check, foreign key)
   - Creates indexes for performance
   - Adds table and column comments

2. **002_create_updated_at_trigger.sql**
   - Creates `update_updated_at_column()` function
   - Creates trigger on `cms_data_lots` table
   - Auto-updates `updated_at` to Asia/Kolkata timezone

3. **003_add_lot_id_to_campaign_jobs.sql**
   - Adds `lot_id` column to `cms_campaign_jobs`
   - Creates foreign key constraint to `cms_data_lots`
   - Creates index on `lot_id`
   - Adds column comment

### Rollback Files
4. **rollback_001_drop_data_lots.sql**
   - Drops all indexes on `cms_data_lots`
   - Drops trigger
   - Drops `cms_data_lots` table

5. **rollback_002_remove_lot_id_from_campaign_jobs.sql**
   - Drops index on `lot_id`
   - Drops foreign key constraint
   - Drops `lot_id` column

### Automation Files
6. **run_data_lots_migration.sql**
   - Master SQL script that runs all migrations
   - Includes verification queries
   - Shows results and confirms success

7. **migrate_data_lots.sh**
   - Bash script for easy migration execution
   - Loads credentials from `.env`
   - Asks for confirmation
   - Provides clear success/error messages

### Documentation
8. **DATA_LOTS_MIGRATION_README.md**
   - Complete migration guide
   - Prerequisites and preparation steps
   - Verification queries
   - Usage examples
   - Troubleshooting guide

9. **MIGRATION_SUMMARY.md** (this file)
   - Quick overview of all files
   - Migration checklist

---

## 🗄️ Database Changes

### New Table: `cms_data_lots`

```sql
CREATE TABLE cms_data_lots (
    id                INTEGER PRIMARY KEY AUTO_INCREMENT,
    name              VARCHAR(255) NOT NULL,
    client_id         INTEGER NOT NULL REFERENCES cms_client(id),
    max_phases        INTEGER NOT NULL DEFAULT 1,
    current_phase_no  INTEGER NOT NULL DEFAULT 1,
    status            VARCHAR(50) NOT NULL DEFAULT 'active',
    total_records     INTEGER NOT NULL DEFAULT 0,
    created_at        TIMESTAMP WITH TIME ZONE,
    updated_at        TIMESTAMP WITH TIME ZONE,
    ended_at          TIMESTAMP WITH TIME ZONE
);
```

**Constraints:**
- Unique: `(name, client_id)`
- Check: `max_phases > 0`, `current_phase_no >= 1`, `current_phase_no <= max_phases`
- Check: `total_records >= 0`
- Check: `status IN ('active', 'completed', 'paused', 'cancelled')`

**Indexes:**
- `idx_data_lots_client_id`
- `idx_data_lots_status`
- `idx_data_lots_created_at`
- `idx_data_lots_current_phase`

**Trigger:**
- `trigger_update_data_lots_updated_at` - Auto-updates `updated_at` on UPDATE

### Modified Table: `cms_campaign_jobs`

**Added Column:**
```sql
ALTER TABLE cms_campaign_jobs 
ADD COLUMN lot_id INTEGER REFERENCES cms_data_lots(id) ON DELETE SET NULL;
```

**Added Index:**
- `idx_campaign_jobs_lot_id`

---

## 🔧 Model Changes

### New Model: `DataLot`
File: `backend/models/automation.py`

```python
class DataLot(Base):
    __tablename__ = "cms_data_lots"
    
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    client_id = Column(Integer, ForeignKey('cms_client.id'))
    max_phases = Column(Integer, default=1)
    current_phase_no = Column(Integer, default=1)
    status = Column(String(50), default='active')
    total_records = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True))
    updated_at = Column(DateTime(timezone=True))
    ended_at = Column(DateTime(timezone=True), nullable=True)
```

### Updated Model: `CampaignJob`
File: `backend/models/automation.py`

```python
class CampaignJob(Base):
    __tablename__ = "cms_campaign_jobs"
    
    # ... existing columns ...
    lot_id = Column(Integer, ForeignKey('cms_data_lots.id'), nullable=True)
    # ... other columns ...
```

---

## ✅ Migration Checklist

### Pre-Migration
- [ ] Backup database
- [ ] Verify no active campaign jobs
- [ ] Check cms_client table exists
- [ ] Check cms_campaign_jobs table exists
- [ ] Review migration scripts

### Migration Execution

**Option 1: Automated (Recommended)**
```bash
cd backend/database
./migrate_data_lots.sh
```

**Option 2: Manual**
```bash
cd backend/database
psql $DB_URL -f run_data_lots_migration.sql
```

### Post-Migration
- [ ] Verify table creation
- [ ] Verify column addition
- [ ] Verify foreign keys
- [ ] Verify indexes
- [ ] Verify trigger
- [ ] Test data lot creation
- [ ] Test timestamp auto-update
- [ ] Restart backend application
- [ ] Verify models loaded
- [ ] Test creating data lot via API
- [ ] Test linking campaign job to lot

### Application Updates
- [x] SQLAlchemy models updated
- [ ] Restart backend to load models
- [ ] Update API endpoints (if needed)
- [ ] Update frontend (if needed)
- [ ] Update documentation

---

## 🚀 Quick Start

### 1. Run Migration
```bash
cd backend/database
./migrate_data_lots.sh
```

### 2. Restart Backend
```bash
cd ../..
./stop_backend.sh
./run_backend.sh
```

### 3. Test in Python
```python
from models.automation import DataLot, CampaignJob
from database.session import SessionLocal

db = SessionLocal()

# Create data lot
lot = DataLot(
    name="Test_Lot",
    client_id=1,
    max_phases=3,
    total_records=1000,
    status='active'
)
db.add(lot)
db.commit()

# Link campaign job
job = CampaignJob(
    client_id=1,
    campaign_id=123,
    lot_id=lot.id,
    status='queue'
)
db.add(job)
db.commit()

print(f"Created lot ID: {lot.id}")
print(f"Created job ID: {job.id} linked to lot ID: {job.lot_id}")
```

---

## 📊 Schema Diagram

```
cms_client (1) ────┬────> (N) cms_data_lots
                   │
                   └────> (N) cms_campaign_jobs
                                    ↑
cms_data_lots (1) ──────────────> (N) cms_campaign_jobs
                                  (via lot_id)
```

---

## 🛟 Rollback

If needed, run rollback scripts in reverse order:

```bash
cd backend/database

# Remove lot_id column
psql $DB_URL -f rollback_002_remove_lot_id_from_campaign_jobs.sql

# Drop cms_data_lots table
psql $DB_URL -f rollback_001_drop_data_lots.sql
```

⚠️ **WARNING**: Rollback will delete all data!

---

## 📞 Support

- **Documentation**: DATA_LOTS_MIGRATION_README.md
- **Logs**: backend/logs/app.log
- **Database Logs**: Check PostgreSQL logs

---

**Status**: ✅ Ready to Migrate  
**Date**: 2026-01-26  
**Timezone**: Asia/Kolkata  
**Version**: 1.0.0
