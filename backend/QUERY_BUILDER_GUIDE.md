# Query Builder Pattern Guide

This guide explains how to use the query builder pattern to stack filters across functions and classes without executing queries until the end.

## Key Concepts

1. **Query objects are lazy**: SQLAlchemy Query objects don't execute until you call `.all()`, `.first()`, `.one()`, etc.
2. **Pass queries between functions**: You can pass Query objects around and add filters incrementally.
3. **Execute only when ready**: The query executes only when you explicitly call an execution method.

## Basic Usage

### Step 1: Create a Base Query

```python
from repo.tables import get_base_query, get_query_with_columns

# Get a base query (returns all columns)
query = get_base_query(db)

# OR get a query with specific columns
columns = ['id', 'direction', 'duration', 'campaign_id']
query = get_query_with_columns(db, columns)
```

### Step 2: Add Filters

```python
from repo.filters import (
    filter_by_campaign_id,
    filter_by_direction,
    filter_by_language
)

# Stack filters one by one
query = filter_by_campaign_id(query, campaign_id=1)
query = filter_by_direction(query, direction='inbound')
query = filter_by_language(query, language='en')
```

### Step 3: Execute the Query

```python
# Execute only when all filtering is done
results = query.all()  # <-- Query executes HERE
```

## Passing Queries Between Functions

### Example 1: Function A builds query, Function B adds filters

```python
def function_a(db: DB_DEPENDENCY, campaign_id: int):
    """Builds initial query"""
    query = get_base_query(db)
    query = filter_by_campaign_id(query, campaign_id)
    return query  # Return query (NOT executed)

def function_b(query):
    """Adds more filters to existing query"""
    query = filter_by_direction(query, direction='inbound')
    query = filter_by_language(query, language='en')
    return query  # Return query (NOT executed)

def function_c(query):
    """Executes the query"""
    return query.all()  # Execute here

# Usage:
query = function_a(db, campaign_id=1)
query = function_b(query)
results = function_c(query)
```

### Example 2: Passing queries between classes

```python
class CampaignService:
    def get_campaign_query(self, db: DB_DEPENDENCY, campaign_id: int):
        query = get_base_query(db)
        return filter_by_campaign_id(query, campaign_id)

class FilterService:
    def add_direction(self, query, direction: str):
        return filter_by_direction(query, direction)

class DataService:
    def execute(self, query):
        return query.all()

# Usage:
campaign_service = CampaignService()
filter_service = FilterService()
data_service = DataService()

query = campaign_service.get_campaign_query(db, campaign_id=1)
query = filter_service.add_direction(query, 'inbound')
results = data_service.execute(query)
```

## Available Filter Functions

All filter functions are in `repo/filters.py`:

- `filter_by_campaign_id(query, campaign_id)` - Filter by campaign ID
- `filter_by_client_id(query, client_id)` - Filter by client ID
- `filter_by_direction(query, direction)` - Filter by call direction
- `filter_by_language(query, language)` - Filter by language
- `filter_by_duration(query, duration, max_duration=True)` - Filter by duration
- `filter_by_date_range(query, start_time, end_time)` - Filter by date range
- `filter_by_connected_status(query, con_status)` - Filter by connected status
- `filter_by_agent_id(query, agent_id)` - Filter by agent ID
- `filter_by_call_id(query, call_id)` - Filter by call ID

## Complete Example

```python
from repo.tables import get_base_query
from repo.filters import (
    filter_by_campaign_id,
    filter_by_direction,
    filter_by_language,
    filter_by_date_range
)
from datetime import datetime

def build_filtered_query(db, campaign_id, direction, language, start_date, end_date):
    """Builds a query with multiple filters (NOT executed)"""
    query = get_base_query(db)
    
    # Stack all filters
    query = filter_by_campaign_id(query, campaign_id)
    query = filter_by_direction(query, direction)
    query = filter_by_language(query, language)
    query = filter_by_date_range(query, start_date, end_date)
    
    return query  # Query is NOT executed yet

def get_data(db, campaign_id, direction, language, start_date, end_date):
    """Builds and executes query"""
    query = build_filtered_query(db, campaign_id, direction, language, start_date, end_date)
    return query.all()  # Execute here

# Usage:
results = get_data(
    db, 
    campaign_id=1, 
    direction='inbound', 
    language='en',
    start_date=datetime(2024, 1, 1),
    end_date=datetime(2024, 12, 31)
)
```

## Benefits

1. **Performance**: Filters are applied at the database level, not in Python
2. **Flexibility**: Easy to compose complex queries from simple building blocks
3. **Reusability**: Filter functions can be reused across different parts of your codebase
4. **Testability**: Easy to test individual filter functions
5. **Separation of Concerns**: Query building logic is separated from execution logic

## Important Notes

- **Never call `.all()`, `.first()`, etc. inside filter functions** - these execute the query
- **Always return the query object** from functions that build queries
- **Execute queries only at the final step** when all filtering is complete
- **Query objects are tied to the database session** - make sure the session is still valid when executing

## Migration from Old Pattern

### Old Pattern (executes immediately):
```python
def get_data(db):
    return db.query(DataLog).all()  # Executes immediately
```

### New Pattern (lazy execution):
```python
def get_query(db):
    return db.query(DataLog)  # Returns query, doesn't execute

# Later...
query = get_query(db)
query = filter_by_campaign_id(query, 1)
results = query.all()  # Execute here
```

