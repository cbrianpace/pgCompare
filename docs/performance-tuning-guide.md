# Performance Tuning Guide

This guide covers parameter tuning and optimization strategies for pgCompare across different workloads and environments.

## Table of Contents

1. [Performance Fundamentals](#performance-fundamentals)
2. [Batch Size Tuning](#batch-size-tuning)
3. [Thread Configuration](#thread-configuration)
4. [Hash Method Selection](#hash-method-selection)
5. [Database Sorting Options](#database-sorting-options)
6. [Repository Database Tuning](#repository-database-tuning)
7. [Java Virtual Machine Tuning](#java-virtual-machine-tuning)
8. [Network Optimization](#network-optimization)
9. [Monitoring and Diagnostics](#monitoring-and-diagnostics)
10. [Tuning Profiles](#tuning-profiles)

---

## Performance Fundamentals

### Understanding the Comparison Pipeline

```
Source DB → [Fetch] → [Hash] → [Queue] → [Load] → Repository → [Reconcile] → Results
Target DB → [Fetch] → [Hash] → [Queue] → [Load] → Repository → [Reconcile] → Results
```

### Key Performance Factors

| Factor | Impact | Configuration |
|--------|--------|---------------|
| Fetch Size | Database round-trips | `batch-fetch-size` |
| Commit Size | Repository transactions | `batch-commit-size` |
| Parallelism | CPU utilization | `parallel_degree`, `loader-threads` |
| Hash Method | Database vs Java load | `column-hash-method` |
| Sort Location | Memory vs I/O | `database-sort` |

### Bottleneck Identification

1. **Source/Target Database** - Query execution time
2. **Network** - Data transfer latency
3. **pgCompare Application** - Hash computation, queue processing
4. **Repository Database** - Insert/reconcile operations

---

## Batch Size Tuning

### batch-fetch-size

Controls rows fetched per database round-trip from source/target.

| Value | Use Case |
|-------|----------|
| 1000 | High-latency networks, limited memory |
| 2000 | Default, balanced performance |
| 5000 | Low-latency networks, adequate memory |
| 10000+ | Local/same-datacenter, high memory |

**Configuration:**
```properties
batch-fetch-size=5000
```

**Tuning Guidelines:**

```
Optimal batch-fetch-size ≈ (Available Memory) / (Avg Row Size × Concurrent Threads × 3)
```

**Example:**
- 4GB available memory
- 500 bytes average row size
- 8 concurrent threads
- Optimal: 4GB / (500 × 8 × 3) ≈ 330,000 → Use 10,000 (practical limit)

### batch-commit-size

Controls rows committed per transaction to repository.

| Value | Use Case |
|-------|----------|
| 1000 | High transaction rate, small tables |
| 2000 | Default, balanced |
| 5000 | Large tables, lower transaction overhead |
| 10000 | Very large tables, minimal transactions |

**Configuration:**
```properties
batch-commit-size=5000
```

**Relationship with batch-fetch-size:**

```properties
# Optimal: Match or align values
batch-fetch-size=5000
batch-commit-size=5000

# Alternative: Commit less frequently
batch-fetch-size=5000
batch-commit-size=10000
```

### batch-progress-report-size

Controls progress reporting frequency.

```properties
# Report every 1 million rows (default)
batch-progress-report-size=1000000

# More frequent updates for monitoring
batch-progress-report-size=500000

# Less overhead for very large tables
batch-progress-report-size=5000000
```

---

## Thread Configuration

### parallel_degree (Per-Table)

Number of concurrent comparison threads for a single table.

**IMPORTANT:** To use `parallel_degree > 1`, you **must** also specify a `mod_column` value in `dc_table_map`. The `mod_column` must be a **numeric column** (integer, bigint, etc.) that pgCompare uses to partition the data across threads using modulo arithmetic. Be sure that the column is part of the primary key, allows for equal partitioning of the data, and has an index for best performance.

#### Setting Up Parallel Degree

**Step 1: Set parallel_degree on the table**
```sql
UPDATE dc_table SET parallel_degree = 4 WHERE table_alias = 'large_table';
```

**Step 2: Set mod_column on both source and target mappings**
```sql
-- mod_column must be a numeric column (typically the primary key)
UPDATE dc_table_map 
SET mod_column = 'id' 
WHERE tid = (SELECT tid FROM dc_table WHERE table_alias = 'large_table');
```

#### How mod_column Works

pgCompare uses the `mod_column` to distribute rows across parallel threads:

```sql
-- Thread 0 processes: WHERE MOD(id, 4) = 0
-- Thread 1 processes: WHERE MOD(id, 4) = 1
-- Thread 2 processes: WHERE MOD(id, 4) = 2
-- Thread 3 processes: WHERE MOD(id, 4) = 3
```

This ensures each thread processes a distinct subset of rows without overlap.

#### mod_column Requirements

| Requirement | Description |
|-------------|-------------|
| **Data Type** | Must be numeric (INTEGER, BIGINT, NUMERIC without decimals) |
| **NOT NULL** | Column should not contain NULL values |
| **Distribution** | Values should be evenly distributed for balanced workload |
| **Indexed** | Indexing the column improves query performance |

#### Finding a Suitable mod_column

```sql
-- Check available numeric columns
SELECT tc.column_alias, tcm.data_type, tcm.column_name
FROM dc_table t
JOIN dc_table_column tc ON t.tid = tc.tid
JOIN dc_table_column_map tcm ON tc.tid = tcm.tid AND tc.column_id = tcm.column_id
WHERE t.table_alias = 'large_table'
  AND tcm.data_type IN ('integer', 'bigint', 'int', 'number', 'numeric')
  AND tcm.column_origin = 'source';
```

**Good candidates:**
- Primary key columns (id, order_id, customer_id)
- Surrogate keys
- Sequence-generated columns

**Poor candidates:**
- Columns with many NULLs
- Columns with skewed distributions (e.g., status codes)
- Decimal/float columns

#### Complete Parallel Setup Example

```sql
-- 1. Get the table ID
SELECT tid FROM dc_table WHERE table_alias = 'orders';
-- Returns: 42

-- 2. Set parallel degree
UPDATE dc_table SET parallel_degree = 8 WHERE tid = 42;

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

#### Recommendations

| Table Rows | parallel_degree |
|-----------|-----------------|
| < 100K | 1 |
| 100K - 1M | 2 |
| 1M - 10M | 4 |
| 10M - 100M | 8 |
| > 100M | 8-16 |

### loader-threads (Advanced)

> **Note:** Loader threads are an advanced feature that is not required for most workloads. The default value of `0` is recommended. See the [Advanced Tuning Guide](advanced-tuning-guide.md) for detailed information on when and how to use loader threads.

```properties
# Default (recommended for most workloads)
loader-threads=0
```

---

## Hash Method Selection

### column-hash-method Options

| Method | Description | Best For |
|--------|-------------|----------|
| `database` | Hash computed in source/target DB | Powerful databases, low network bandwidth |
| `hybrid` | Hash computed in pgCompare | Weak databases, high bandwidth |

### Database Method

```properties
column-hash-method=database
```

**Advantages:**
- Reduces data transferred (only hashes)
- Leverages database compute resources

**SQL Generated:**
```sql
-- PostgreSQL
SELECT MD5(col1::text || col2::text) AS hash, pk FROM table;

-- Oracle
SELECT DBMS_CRYPTO.HASH(col1 || col2, 2) AS hash, pk FROM table;
```

### Hybrid Method

```properties
column-hash-method=hybrid
```

**Advantages:**
- Consistent hashing across platforms
- Reduces database load
- Better for cross-platform comparisons

**When to Use Hybrid:**
- Source and target are different database types
- Database servers are resource-constrained
- Network bandwidth is not a bottleneck

### Performance Comparison

| Scenario | database | hybrid |
|----------|----------|--------|
| Same DB type | ✓ Faster | Slower |
| Cross-platform | May differ | ✓ Consistent |
| Weak DB server | High load | ✓ Lower load |
| Slow network | ✓ Less data | More data |

---

## Database Sorting Options

### database-sort

Determines whether row sorting is performed on the source/target databases or in the repository. Only disable database-sort if the overhead is too much on the source/target database resources.  It will be faster and easier on the compare repository to have the source and target databases perform the sorting so data is loaded in order from both sides.

```properties
# Sort on source/target databases (default)
database-sort=true

# Sort in repository
database-sort=false
```

### database-sort=true (Default)

**Advantages:**
- Utilizes source/target database indexes
- Reduces repository memory pressure
- Better for large, indexed tables

**SQL Impact:**
```sql
SELECT hash, pk FROM table ORDER BY pk;
```

### database-sort=false

**Advantages:**
- Reduces source/target database load
- Better when source/target lack indexes
- Useful for remote/cloud databases with high query costs

**Repository Impact:**
- Higher memory usage
- Sorting happens during reconciliation
- Requires adequate repository resources
- Slower compare speeds

### Choosing Sort Location

| Condition | Recommendation |
|-----------|----------------|
| PK indexed on source/target | `database-sort=true` |
| No PK index | `database-sort=false` |
| Source/target CPU constrained | `database-sort=false` |
| Repository memory limited | `database-sort=true` |
| Cloud DB (pay per query) | `database-sort=false` |

---

## Repository Database Tuning

### PostgreSQL Configuration

**Memory Settings:**

```sql
-- For dedicated repository server
ALTER SYSTEM SET shared_buffers = '2GB';
ALTER SYSTEM SET effective_cache_size = '6GB';
ALTER SYSTEM SET work_mem = '256MB';
ALTER SYSTEM SET maintenance_work_mem = '512MB';
```

**Parallelism:**

```sql
ALTER SYSTEM SET max_parallel_workers = 16;
ALTER SYSTEM SET max_parallel_workers_per_gather = 4;
ALTER SYSTEM SET parallel_tuple_cost = 0.001;
ALTER SYSTEM SET parallel_setup_cost = 100;
```

**Write Performance:**

```sql
ALTER SYSTEM SET wal_level = 'minimal';
ALTER SYSTEM SET max_wal_senders = 0;
ALTER SYSTEM SET wal_buffers = '64MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET checkpoint_timeout = 600;
```

**Apply Changes:**
```sql
SELECT pg_reload_conf();
-- Some settings require restart
```

### Connection Settings

```sql
-- Increase connections for parallel operations
ALTER SYSTEM SET max_connections = 200;

-- Connection pooling recommended for production
```

### Staging Table Optimization

pgCompare creates temporary staging tables. Optimize with:

```properties
# Set parallel degree for staging table operations
stage-table-parallel=4
```

### Repository Sizing

| Comparison Size | Recommended Repository |
|-----------------|----------------------|
| < 10M rows | 2 vCPU, 4GB RAM |
| 10M - 100M rows | 4 vCPU, 8GB RAM |
| 100M - 1B rows | 8 vCPU, 16GB RAM |
| > 1B rows | 16+ vCPU, 32GB+ RAM |

---

## Java Virtual Machine Tuning

### Heap Size Configuration

```bash
# Minimum and maximum heap
java -Xms2g -Xmx8g -jar pgcompare.jar compare

# Metaspace (for class metadata)
java -Xms2g -Xmx8g -XX:MaxMetaspaceSize=256m -jar pgcompare.jar compare
```

### Heap Size Guidelines

| Total Data Size | Recommended Heap |
|-----------------|------------------|
| < 10M rows | 512MB - 1GB |
| 10M - 50M rows | 1GB - 2GB |
| 50M - 200M rows | 2GB - 4GB |
| 200M - 500M rows | 4GB - 8GB |
| > 500M rows | 8GB - 16GB |

### Garbage Collection Tuning

**For throughput (large batches):**
```bash
java -Xms4g -Xmx8g \
  -XX:+UseG1GC \
  -XX:MaxGCPauseMillis=200 \
  -jar pgcompare.jar compare
```

**For low latency:**
```bash
java -Xms4g -Xmx8g \
  -XX:+UseZGC \
  -jar pgcompare.jar compare
```

### Thread Stack Size

For many concurrent threads:
```bash
java -Xss512k -Xms4g -Xmx8g -jar pgcompare.jar compare
```

### Complete JVM Configuration Example

```bash
java \
  -Xms4g \
  -Xmx8g \
  -XX:+UseG1GC \
  -XX:MaxGCPauseMillis=200 \
  -XX:+UseStringDeduplication \
  -XX:MaxMetaspaceSize=256m \
  -Djava.net.preferIPv4Stack=true \
  -jar pgcompare.jar compare --batch 0
```

---

## Network Optimization

### Reduce Network Round-Trips

```properties
# Fetch more data per round-trip
batch-fetch-size=10000

# Use database-side hashing
column-hash-method=database
```

### Connection Configuration

**JDBC connection pooling** - pgCompare manages connections internally, but ensure:

```properties
# Use direct connections (not pgBouncer)
repo-host=postgres-direct.example.com
```

### Network Latency Impact

| Latency | Recommended batch-fetch-size |
|---------|------------------------------|
| < 1ms (same datacenter) | 10000+ |
| 1-10ms (same region) | 5000 |
| 10-50ms (cross-region) | 2000 |
| > 50ms (intercontinental) | 1000 |

### SSL Considerations

```properties
# Disable SSL for internal networks
repo-sslmode=disable
source-sslmode=disable
target-sslmode=disable

# Enable SSL for external networks
repo-sslmode=require
source-sslmode=require
target-sslmode=require
```

---

## Monitoring and Diagnostics

### Enable Debug Logging

```properties
log-level=DEBUG
log-destination=/var/log/pgcompare/debug.log
```

### Progress Monitoring

Watch progress during comparison:

```bash
# Monitor log output
tail -f /var/log/pgcompare/debug.log | grep -E "(Progress|Matched|Complete)"
```

### Repository Monitoring

```sql
-- Active connections
SELECT count(*) FROM pg_stat_activity WHERE application_name LIKE 'pgCompare%';

-- Staging table sizes
SELECT 
    relname,
    n_live_tup,
    n_dead_tup,
    pg_size_pretty(pg_total_relation_size(relid)) as size
FROM pg_stat_user_tables
WHERE relname LIKE 'dc_%_stg_%';

-- Lock monitoring
SELECT 
    locktype,
    relation::regclass,
    mode,
    granted
FROM pg_locks
WHERE relation::regclass::text LIKE 'dc_%';
```

### JVM Monitoring

```bash
# Monitor heap usage
jstat -gc $(pgrep -f pgcompare) 5000

# Thread dump
jstack $(pgrep -f pgcompare) > thread-dump.txt

# Heap dump (if OOM suspected)
jmap -dump:format=b,file=heap.hprof $(pgrep -f pgcompare)
```

### Performance Metrics

Track these during comparison:

| Metric | Healthy Range | Action if Outside |
|--------|---------------|-------------------|
| Rows/second | 10K-100K+ | Check network, increase parallelism |
| Memory usage | 50-80% of heap | Adjust heap size |
| CPU usage | 60-90% | Adjust thread count |
| Repository I/O | Sustained writes | Check disk, tune PostgreSQL |

---

## Tuning Profiles

### Profile: Small Tables (< 1M rows)

```properties
# pgcompare-small.properties
batch-fetch-size=2000
batch-commit-size=2000
column-hash-method=database
database-sort=true
observer-throttle=false
```

```bash
java -Xms512m -Xmx1g -jar pgcompare.jar compare
```

### Profile: Medium Tables (1M - 50M rows)

```properties
# pgcompare-medium.properties
batch-fetch-size=5000
batch-commit-size=5000
column-hash-method=database
database-sort=true
observer-throttle=true
observer-throttle-size=1000000
```

```sql
UPDATE dc_table SET parallel_degree = 2 WHERE enabled = true;
UPDATE dc_table_map SET mod_column = 'id' WHERE mod_column IS NULL;
```

```bash
java -Xms1g -Xmx4g -jar pgcompare.jar compare
```

### Profile: Large Tables (50M - 500M rows)

```properties
# pgcompare-large.properties
batch-fetch-size=10000
batch-commit-size=10000
column-hash-method=database
database-sort=true
observer-throttle=true
observer-throttle-size=2000000
observer-vacuum=true
stage-table-parallel=4
```

```sql
UPDATE dc_table SET parallel_degree = 4 WHERE enabled = true;
UPDATE dc_table_map SET mod_column = 'id' WHERE mod_column IS NULL;
```

```bash
java -Xms4g -Xmx8g -XX:+UseG1GC -jar pgcompare.jar compare
```

### Profile: Very Large Tables (> 500M rows)

```properties
# pgcompare-xlarge.properties
batch-fetch-size=20000
batch-commit-size=20000
batch-progress-report-size=5000000
column-hash-method=database
database-sort=true
observer-throttle=true
observer-throttle-size=5000000
observer-vacuum=true
stage-table-parallel=8
```

```sql
UPDATE dc_table SET parallel_degree = 8 WHERE enabled = true;
UPDATE dc_table_map SET mod_column = 'id' WHERE mod_column IS NULL;
```

```bash
java -Xms8g -Xmx16g -XX:+UseG1GC -XX:MaxGCPauseMillis=200 -jar pgcompare.jar compare
```

### Profile: Cross-Platform (Oracle to PostgreSQL)

```properties
# pgcompare-crossplatform.properties
batch-fetch-size=5000
batch-commit-size=5000
column-hash-method=hybrid  # Consistent hashing across platforms
database-sort=true
number-cast=standard       # Avoid notation differences
float-scale=3
observer-throttle=true
```

### Profile: Cloud Database (High Latency)

```properties
# pgcompare-cloud.properties
batch-fetch-size=10000     # Maximize data per round-trip
batch-commit-size=10000
column-hash-method=database
database-sort=false        # Reduce cloud DB query cost
observer-throttle=true
observer-throttle-size=1000000
```

---

## Quick Reference

### Essential Parameters

| Parameter | Default | Tuning Direction |
|-----------|---------|------------------|
| `batch-fetch-size` | 2000 | ↑ for low latency, ↓ for low memory |
| `batch-commit-size` | 2000 | ↑ for throughput, ↓ for safety |
| `parallel_degree` | 1 | ↑ for large tables (per-table, requires mod_column) |
| `column-hash-method` | database | hybrid for cross-platform |
| `database-sort` | true | false if DB constrained |

### Performance Checklist

- [ ] Set appropriate `batch-fetch-size` for network latency
- [ ] Set `parallel_degree` per table for large tables
- [ ] Set `mod_column` to a numeric column when `parallel_degree > 1` (required)
- [ ] Configure JVM heap for data volume
- [ ] Tune repository PostgreSQL settings
- [ ] Enable `observer-throttle` for large tables
- [ ] Monitor progress and adjust as needed

> **Note:** For advanced threading options (loader-threads, message-queue-size), see the [Advanced Tuning Guide](advanced-tuning-guide.md).
