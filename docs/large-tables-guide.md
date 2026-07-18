# Handling Large Tables with Parallel Processing

This guide covers strategies for efficiently comparing large tables using pgCompare's parallel threading capabilities.

## Table of Contents

1. [Understanding Parallel Processing](#understanding-parallel-processing)
2. [Thread Architecture](#thread-architecture)
3. [Configuring Parallel Degree](#configuring-parallel-degree)
4. [Observer Thread Configuration](#observer-thread-configuration)
5. [Memory Management](#memory-management)
6. [Staging Table Optimization](#staging-table-optimization)
7. [Initial and Delta Comparisons](#initial-and-delta-comparisons)
8. [Examples and Scenarios](#examples-and-scenarios)
9. [Troubleshooting](#troubleshooting)

---

## Understanding Parallel Processing

pgCompare uses a multi-threaded architecture to efficiently compare large datasets. When comparing tables with millions of rows, parallel processing can significantly reduce comparison time.

### Key Concepts

- **Parallel Degree**: Number of concurrent comparison threads per table
- **Observer Thread**: Thread that reconciles matches and manages staging tables
- **Staging Tables**: Temporary PostgreSQL tables that store hash values during comparison

### When to Use Parallel Processing

| Table Size | Recommended Parallel Degree |
|-----------|---------------------------|
| < 100,000 rows | 1 |
| 100,000 - 1M rows | 2 |
| 1M - 10M rows | 4 |
| 10M - 100M rows | 8 |
| > 100M rows | 8-16 |

---

## Thread Architecture

### Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Thread Manager                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐             │
│   │  Compare    │    │  Compare    │    │  Compare    │             │
│   │  Thread 0   │    │  Thread 1   │    │  Thread N   │  ...        │
│   │  (Source)   │    │  (Source)   │    │  (Source)   │             │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘             │
│          │                   │                   │                  │
│          ▼                   ▼                   ▼                  │
│   ┌─────────────────────────────────────────────────────┐           │
│   │              Staging Table (Source)                 │           │
│   └─────────────────────────┬───────────────────────────┘           │
│                             │                                       │
│                             ▼                                       │
│   ┌─────────────────────────────────────────────────────┐           │
│   │              Observer Thread                        │           │
│   │              (Reconciliation)                       │           │
│   └─────────────────────────┬───────────────────────────┘           │
│                             │                                       │
│   ┌─────────────────────────────────────────────────────┐           │
│   │              Staging Table (Target)                 │           │
│   └─────────────────────────┬───────────────────────────┘           │
│                             │                                       │
│   (Same structure for Target threads)                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Thread Types

1. **Compare Threads (DataComparisonThread)**
   - Execute queries against source/target databases
   - Compute hash values for primary keys and columns
   - Write directly to staging tables

2. **Observer Thread (ObserverThread)**
   - Monitor staging tables for matching hash pairs
   - Remove matched rows from staging tables
   - Perform periodic vacuuming
   - Track reconciliation progress

> **Note:** Loader threads are an advanced feature covered in the [Advanced Tuning Guide](advanced-tuning-guide.md). They are not required for most workloads.

---

## Configuring Parallel Degree

### Per-Table Configuration

Set parallel degree for individual tables in the repository:

```sql
-- Set parallel degree to 4 for a specific table
UPDATE dc_table 
SET parallel_degree = 4 
WHERE table_alias = 'large_orders';
```

### Via YAML Import

```yaml
tables:
  - alias: "large_orders"
    enabled: true
    batchNumber: 1
    parallelDegree: 4
    source:
      schema: "SALES"
      table: "LARGE_ORDERS"
    target:
      schema: "sales"
      table: "large_orders"
```

### Requirements for Parallel Processing

When `parallel_degree > 1`, you **must** specify a `mod_column` in the table mapping. The `mod_column` must be a **numeric column** (INTEGER, BIGINT, NUMERIC without decimals).

```sql
-- Set mod_column for parallel processing (both source and target)
UPDATE dc_table_map 
SET mod_column = 'order_id' 
WHERE tid = 123;
```

#### How mod_column Works

pgCompare uses the mod_column to distribute rows across threads using modulo arithmetic:

```sql
-- With parallel_degree = 4:
-- Thread 0 processes: WHERE MOD(order_id, 4) = 0
-- Thread 1 processes: WHERE MOD(order_id, 4) = 1
-- Thread 2 processes: WHERE MOD(order_id, 4) = 2
-- Thread 3 processes: WHERE MOD(order_id, 4) = 3
```

This ensures each thread processes a distinct subset of rows without overlap.

### mod_column Requirements

| Requirement | Description |
|-------------|-------------|
| **Data Type** | Must be numeric (INTEGER, BIGINT, NUMERIC without decimals) |
| **NOT NULL** | Column should not contain NULL values |
| **Distribution** | Values should be evenly distributed for balanced workload |
| **Indexed** | Indexing the column improves query performance |

### Choosing a Mod Column

**Good candidates:**
- Primary key columns (id, order_id, customer_id)
- Auto-increment/sequence columns
- Surrogate keys

**Poor candidates:**
- Columns with many NULLs
- Columns with skewed distributions (e.g., status codes)
- Decimal/float columns
- Non-numeric columns

#### Finding a Suitable mod_column

```sql
-- Check available numeric columns for a table
SELECT tc.column_alias, tcm.data_type, tcm.column_name
FROM dc_table t
JOIN dc_table_column tc ON t.tid = tc.tid
JOIN dc_table_column_map tcm ON tc.tid = tcm.tid AND tc.column_id = tcm.column_id
WHERE t.table_alias = 'orders'
  AND tcm.data_type IN ('integer', 'bigint', 'int', 'number', 'numeric')
  AND tcm.column_origin = 'source';
```

#### Complete Parallel Setup Example

```sql
-- 1. Get the table ID
SELECT tid FROM dc_table WHERE table_alias = 'orders';
-- Returns: 42

-- 2. Set parallel degree
UPDATE dc_table SET parallel_degree = 4 WHERE tid = 42;

-- 3. Set mod_column on BOTH source and target mappings
UPDATE dc_table_map SET mod_column = 'order_id' WHERE tid = 42;

-- 4. Verify configuration
SELECT 
    t.table_alias,
    t.parallel_degree,
    tm.dest_type,
    tm.mod_column
FROM dc_table t
JOIN dc_table_map tm ON t.tid = tm.tid
WHERE t.tid = 42;
```

---

## Observer Thread Configuration

The observer thread manages the reconciliation process and staging table maintenance.

### Throttling

Throttling prevents staging tables from growing unbounded:

```properties
# Enable throttling (recommended)
observer-throttle=true

# Pause loading after 2M rows in staging
observer-throttle-size=2000000
```

**How it works:**
1. Compare threads insert data into staging tables
2. When row count exceeds `observer-throttle-size`, compare threads pause
3. Observer thread reconciles matches and removes them
4. When staging table shrinks, compare threads resume

### Vacuum Settings

```properties
# Enable vacuum during reconciliation
observer-vacuum=true
```

Benefits of observer vacuum:
- Reclaims space from deleted rows
- Maintains staging table performance
- Prevents table bloat

### Optimizing Observer Performance

For very large tables, tune these PostgreSQL settings in the observer connection:

```sql
-- Applied automatically by pgCompare
SET enable_nestloop='off';
SET work_mem='512MB';
SET maintenance_work_mem='1024MB';
```

---

## Memory Management

### Java Heap Configuration

For large tables, increase Java heap size:

```bash
# Minimum 512MB, Maximum 4GB
java -Xms512m -Xmx4g -jar pgcompare.jar compare --batch 0

# For very large comparisons
java -Xms2g -Xmx8g -jar pgcompare.jar compare --batch 0
```

### Memory Usage Factors

| Factor | Impact |
|--------|--------|
| parallel_degree | Linear increase per thread |
| batch-fetch-size | Memory for fetched result sets |

### Recommended Heap Sizes

| Table Size | Parallel Degree | Recommended Heap |
|-----------|-----------------|------------------|
| < 1M rows | 1-2 | 512MB - 1GB |
| 1M - 10M | 2-4 | 1GB - 2GB |
| 10M - 50M | 4-8 | 2GB - 4GB |
| 50M - 100M | 8 | 4GB - 8GB |
| > 100M | 8-16 | 8GB+ |

---

## Staging Table Optimization

### Staging Table Parallel Degree

Control PostgreSQL parallelism for staging tables:

```properties
# Use 4 parallel workers for staging table operations
stage-table-parallel=4
```

### Repository PostgreSQL Tuning

For optimal staging table performance, configure the repository database:

```sql
-- Recommended settings for large comparisons
ALTER SYSTEM SET shared_buffers = '2048MB';
ALTER SYSTEM SET work_mem = '256MB';
ALTER SYSTEM SET maintenance_work_mem = '512MB';
ALTER SYSTEM SET max_parallel_workers = 16;
ALTER SYSTEM SET max_parallel_workers_per_gather = 4;
ALTER SYSTEM SET effective_cache_size = '6GB';

SELECT pg_reload_conf();
```

### Monitoring Staging Tables

During comparison, you can monitor staging table size:

```sql
-- Check staging table sizes during comparison
SELECT 
    schemaname,
    relname,
    n_live_tup,
    n_dead_tup,
    pg_size_pretty(pg_total_relation_size(relid)) as size
FROM pg_stat_user_tables
WHERE relname LIKE 'dc_%_stg_%'
ORDER BY n_live_tup DESC;
```

---

## Initial and Delta Comparisons

For very large tables, a common strategy is to perform an initial full comparison, then use row filters to compare only new or modified data in subsequent runs. This dramatically reduces comparison time for ongoing validation.

### Strategy Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Day 1: Initial Full Compare                                │
│  - Compare all rows (may take hours for large tables)       │
│  - Record timestamp of comparison completion                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Day 2+: Delta Compare                                      │
│  - Set table_filter to only include rows modified since     │
│    the last comparison                                      │
│  - Compare runs in minutes instead of hours                 │
└─────────────────────────────────────────────────────────────┘
```

### Step 1: Initial Full Comparison

Run the first comparison without any row filter to validate all data:

```sql
-- Ensure no filter is set for initial compare
UPDATE dc_table_map 
SET table_filter = NULL 
WHERE tid = (SELECT tid FROM dc_table WHERE table_alias = 'orders');
```

```bash
# Run full comparison
java -Xms4g -Xmx8g -jar pgcompare.jar compare --table orders

# Record the timestamp when comparison completes
# Example: 2024-01-15 14:30:00
```

### Step 2: Set Up Delta Comparison

After the initial compare, configure a filter to only compare rows modified since the last run:

```sql
-- PostgreSQL source/target
UPDATE dc_table_map 
SET table_filter = 'modified_date > ''2024-01-15 14:30:00''' 
WHERE tid = (SELECT tid FROM dc_table WHERE table_alias = 'orders');

-- Oracle source
UPDATE dc_table_map 
SET table_filter = 'modified_date > TO_DATE(''2024-01-15 14:30:00'', ''YYYY-MM-DD HH24:MI:SS'')' 
WHERE tid = (SELECT tid FROM dc_table WHERE table_alias = 'orders')
AND dest_type = 'source';

-- Snowflake source/target
UPDATE dc_table_map 
SET table_filter = 'modified_date > ''2024-01-15 14:30:00''::TIMESTAMP' 
WHERE tid = (SELECT tid FROM dc_table WHERE table_alias = 'orders');
```

### Step 3: Run Delta Comparison

```bash
# Delta compare runs much faster - only new/modified rows
java -jar pgcompare.jar compare --table orders
```

### Automating Delta Updates

Create a simple workflow to update the filter after each successful comparison:

```sql
-- Before running comparison, update filter to current timestamp
-- This captures rows modified since last run

-- For PostgreSQL
UPDATE dc_table_map 
SET table_filter = 'modified_date > ''' || 
    (CURRENT_TIMESTAMP - INTERVAL '1 day')::text || '''' 
WHERE tid = (SELECT tid FROM dc_table WHERE table_alias = 'orders');

-- For rolling 7-day window
UPDATE dc_table_map 
SET table_filter = 'modified_date > CURRENT_DATE - INTERVAL ''7 days''' 
WHERE tid = (SELECT tid FROM dc_table WHERE table_alias = 'orders');
```

### Splitting Large Tables Across Batches

For extremely large tables, you can register the same table multiple times with different filters, allowing you to split the comparison across batches or run them in parallel on different machines.

#### Example: Split by Date Range

```sql
-- Register table for historical data (batch 1)
INSERT INTO dc_table (pid, table_alias, enabled, batch_nbr, parallel_degree)
VALUES (1, 'orders_historical', true, 1, 4)
RETURNING tid;
-- Returns tid: 100

-- Register same table for recent data (batch 2)
INSERT INTO dc_table (pid, table_alias, enabled, batch_nbr, parallel_degree)
VALUES (1, 'orders_recent', true, 2, 4)
RETURNING tid;
-- Returns tid: 101

-- Set up mappings for historical (orders older than 1 year)
INSERT INTO dc_table_map (tid, dest_type, schema_name, table_name, table_filter)
VALUES 
(100, 'source', 'SALES', 'ORDERS', 'order_date < ADD_MONTHS(SYSDATE, -12)'),
(100, 'target', 'sales', 'orders', 'order_date < CURRENT_DATE - INTERVAL ''1 year''');

-- Set up mappings for recent (orders within last year)
INSERT INTO dc_table_map (tid, dest_type, schema_name, table_name, table_filter)
VALUES 
(101, 'source', 'SALES', 'ORDERS', 'order_date >= ADD_MONTHS(SYSDATE, -12)'),
(101, 'target', 'sales', 'orders', 'order_date >= CURRENT_DATE - INTERVAL ''1 year''');
```

#### Example: Split by Primary Key Range

```sql
-- Register table for first half of data
INSERT INTO dc_table (pid, table_alias, enabled, batch_nbr, parallel_degree)
VALUES (1, 'orders_part1', true, 1, 8)
RETURNING tid;
-- Returns tid: 200

-- Register table for second half
INSERT INTO dc_table (pid, table_alias, enabled, batch_nbr, parallel_degree)
VALUES (1, 'orders_part2', true, 2, 8)
RETURNING tid;
-- Returns tid: 201

-- Set filters by ID range
UPDATE dc_table_map SET table_filter = 'order_id <= 50000000' WHERE tid = 200;
UPDATE dc_table_map SET table_filter = 'order_id > 50000000' WHERE tid = 201;
```

#### Running Split Comparisons

```bash
# Run batches sequentially
java -jar pgcompare.jar compare --batch 1
java -jar pgcompare.jar compare --batch 2

# Or run on separate machines simultaneously
# Machine 1:
java -jar pgcompare.jar compare --table orders_historical

# Machine 2:
java -jar pgcompare.jar compare --table orders_recent
```

### Combining Strategies

For maximum efficiency on very large tables, combine parallel processing with delta comparisons:

```sql
-- Configure table with parallel degree and mod_column
UPDATE dc_table 
SET parallel_degree = 8 
WHERE table_alias = 'orders_recent';

UPDATE dc_table_map 
SET mod_column = 'order_id',
    table_filter = 'modified_date > CURRENT_DATE - INTERVAL ''1 day'''
WHERE tid = (SELECT tid FROM dc_table WHERE table_alias = 'orders_recent');
```

### Best Practices for Delta Comparisons

1. **Ensure timestamp columns are indexed** on both source and target for filter performance
2. **Use consistent timestamp formats** across source and target filters
3. **Add buffer time** to filters (e.g., subtract 1 hour) to catch rows being modified during comparison
4. **Periodically run full comparisons** to catch any data drift not captured by delta filters
5. **Document your filter logic** so team members understand the comparison scope

---

## Examples and Scenarios

### Example 1: 10 Million Row Table

**Configuration:**

```properties
# pgcompare.properties
batch-fetch-size=5000
batch-commit-size=5000
observer-throttle=true
observer-throttle-size=1000000
```

**Table Setup:**

```sql
-- Set parallel degree and mod column
UPDATE dc_table 
SET parallel_degree = 4 
WHERE table_alias = 'transactions';

UPDATE dc_table_map 
SET mod_column = 'transaction_id' 
WHERE tid = (SELECT tid FROM dc_table WHERE table_alias = 'transactions');
```

**Run:**

```bash
java -Xms1g -Xmx4g -jar pgcompare.jar compare --table transactions
```

### Example 2: 100+ Million Row Table

**Configuration:**

```properties
# pgcompare.properties
batch-fetch-size=10000
batch-commit-size=10000
observer-throttle=true
observer-throttle-size=5000000
observer-vacuum=true
```

**Table Setup:**

```sql
-- Set parallel degree and mod column
UPDATE dc_table 
SET parallel_degree = 8 
WHERE table_alias = 'event_log';

UPDATE dc_table_map 
SET mod_column = 'event_id' 
WHERE tid = (SELECT tid FROM dc_table WHERE table_alias = 'event_log');
```

**Run:**

```bash
java -Xms4g -Xmx16g -jar pgcompare.jar compare --table event_log
```

### Example 3: Multiple Large Tables

**Configuration for batch processing:**

```sql
-- Assign tables to batches by size
UPDATE dc_table SET batch_nbr = 1, parallel_degree = 8 
WHERE table_alias IN ('huge_table_1', 'huge_table_2');

UPDATE dc_table SET batch_nbr = 2, parallel_degree = 4 
WHERE table_alias IN ('medium_table_1', 'medium_table_2', 'medium_table_3');

UPDATE dc_table SET batch_nbr = 3, parallel_degree = 1 
WHERE table_alias IN ('small_table_1', 'small_table_2');
```

**Run batches sequentially:**

```bash
# Run huge tables first (batch 1)
java -Xms4g -Xmx16g -jar pgcompare.jar compare --batch 1

# Run medium tables (batch 2)
java -Xms2g -Xmx8g -jar pgcompare.jar compare --batch 2

# Run small tables (batch 3)
java -Xms512m -Xmx2g -jar pgcompare.jar compare --batch 3
```

---

## Troubleshooting

### Problem: "Parallel degree > 1 but no mod_column specified"

**Cause:** Missing mod_column configuration for parallel processing.

**Solution:**
```sql
-- mod_column must be a numeric column
UPDATE dc_table_map 
SET mod_column = 'your_numeric_pk_column' 
WHERE tid = your_tid;
```

### Problem: mod_column set but parallel processing not working

**Cause:** mod_column is not a numeric data type.

**Solution:** Choose a numeric column (INTEGER, BIGINT, etc.):
```sql
-- Check column data types
SELECT column_name, data_type 
FROM dc_table_column_map 
WHERE tid = your_tid AND column_origin = 'source';

-- Set to a numeric column
UPDATE dc_table_map SET mod_column = 'id' WHERE tid = your_tid;
```

### Problem: Out of Memory Error

**Cause:** Insufficient heap for data volume and thread count.

**Solution:**
1. Increase Java heap: `-Xmx8g`
2. Reduce `batch-fetch-size`
3. Reduce `parallel_degree`

### Problem: Staging Tables Growing Too Large

**Cause:** Observer thread can't keep up with data loading.

**Solution:**
```properties
# Enable throttling
observer-throttle=true
observer-throttle-size=1000000

# Enable vacuum
observer-vacuum=true
```

### Problem: Comparison Running Slowly

**Possible causes and solutions:**

1. **Database query performance**
   ```sql
   -- Add indexes on source/target tables
   CREATE INDEX ON source_table (pk_column);
   ```

2. **Repository performance**
   ```sql
   -- Tune PostgreSQL for repository
   ALTER SYSTEM SET work_mem = '256MB';
   ALTER SYSTEM SET max_parallel_workers = 8;
   ```

3. **Network latency**
   - Use databases closer to pgCompare server
   - Consider running pgCompare on the same network segment

4. **Parallelism**
   ```properties
   # Increase batch size
   batch-fetch-size=10000
   ```
   ```sql
   -- Increase parallel degree (requires numeric mod_column)
   UPDATE dc_table SET parallel_degree = 8 WHERE table_alias = 'my_table';
   UPDATE dc_table_map SET mod_column = 'id' WHERE tid = <table_tid>;
   ```

### Problem: Lock Contention in Repository

**Cause:** Multiple threads competing for staging table access.

**Solution:**
```properties
# Use separate staging tables per thread
# (This is done automatically with parallel_degree)

# Reduce commit frequency
batch-commit-size=5000
```

### Monitoring Thread Activity

Check thread status during comparison:

```bash
# Monitor Java threads
jps -l | grep pgcompare
jstack <pid> | grep -E "(compare|observer)"
```

---

## Best Practices Summary

1. **Start conservative**: Begin with `parallel_degree=2` and increase gradually
2. **Monitor resources**: Watch memory, CPU, and database connections
3. **Use throttling**: Always enable `observer-throttle=true` for large tables
4. **Choose good mod_column**: Use numeric primary keys for even distribution
5. **Tune batch sizes**: Match `batch-fetch-size` to network latency
6. **Size heap appropriately**: Allocate based on table size and parallelism
7. **Enable vacuum**: Use `observer-vacuum=true` for long-running comparisons
8. **Test incrementally**: Run on subset first with `--table` option
