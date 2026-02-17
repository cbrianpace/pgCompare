# Advanced Tuning Guide

This guide covers advanced configuration options for pgCompare that are typically not required for most workloads. These settings should only be used after confirming a specific bottleneck through monitoring and testing.

## Table of Contents

1. [Loader Threads](#loader-threads)
2. [Message Queue Configuration](#message-queue-configuration)
3. [When to Use Advanced Threading](#when-to-use-advanced-threading)
4. [Diagnosing Bottlenecks](#diagnosing-bottlenecks)
5. [Advanced Thread Configuration Examples](#advanced-thread-configuration-examples)

---

## Loader Threads

> **Important:** In most circumstances, loader threads (`loader-threads > 0`) do not provide significant performance benefits and add complexity. The default value of `0` is recommended for the vast majority of workloads. Only consider enabling loader threads after confirming a bottleneck in staging table inserts.

### What Are Loader Threads?

Loader threads decouple the data fetching process from repository loading by introducing an intermediate queue:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Compare Thread │ ──► │  Message Queue  │ ──► │  Loader Thread  │
│  (Fetch & Hash) │     │  (Blocking)     │     │  (Insert to DB) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

Without loader threads (default, `loader-threads=0`):
- Compare threads fetch data, compute hashes, and insert directly into staging tables
- Simpler architecture with lower memory overhead
- Sufficient for most workloads

With loader threads (`loader-threads > 0`):
- Compare threads place hash data into blocking queues
- Multiple loader threads consume from queues in parallel
- Loader threads batch-insert records into staging tables
- Adds complexity and memory overhead

### Enabling Loader Threads

```properties
loader-threads=8
```

Or via environment variable:
```bash
export PGCOMPARE_LOADER_THREADS=8
```

### Configuration Options

| Property | Default | Description |
|----------|---------|-------------|
| `loader-threads` | 0 | Number of loader threads per side (source/target) |
| `message-queue-size` | 1000 | Size of blocking queue between compare and loader threads |

### Impact Analysis

| loader-threads | Benefits | Costs |
|---------------|----------|-------|
| 0 | Simpler, lower memory, recommended default | N/A |
| 2-4 | May help if staging inserts are bottleneck | Moderate memory, added complexity |
| 8 | Faster loading (rare cases) | Higher memory, more connections |
| 16+ | Maximum throughput (very rare cases) | High resource usage |

---

## Message Queue Configuration

Message queues are only used when `loader-threads > 0`. They buffer data between compare threads and loader threads.

### message-queue-size

```properties
message-queue-size=1000
```

### Queue Space Warning

If you see log messages indicating threads are **waiting for queue space**, you need to increase `message-queue-size`. This blocking condition slows down comparison as producer threads (compare threads) wait for consumer threads (loader threads) to free up queue slots.

```properties
# If seeing "waiting for queue space" messages
message-queue-size=2000
```

### Memory Usage Warning

Each queued message holds row data in memory. Larger queue sizes consume significantly more heap memory.

**Calculate memory impact:**
```
Queue Memory = message-queue-size × average_row_size × number_of_parallel_threads
```

**Example:**
- message-queue-size = 2000
- average_row_size = 500 bytes
- parallel_degree = 4

Memory per side = 2000 × 500 × 4 = 4MB per side (8MB total for source + target)

For very large queues (10,000+) with many threads, memory can grow significantly. Monitor JVM heap usage and increase `-Xmx` if needed.

### Tuning Guidelines

```properties
# For memory-constrained environments
message-queue-size=500

# Default
message-queue-size=1000

# If seeing "waiting for queue space" messages
message-queue-size=2000

# For extreme throughput (with adequate memory)
message-queue-size=5000
```

---

## When to Use Advanced Threading

### You Probably DON'T Need Loader Threads If:

- Table sizes are under 100 million rows
- Comparison completes in acceptable time with default settings
- Repository database is not showing high CPU/IO during staging inserts
- Network latency to source/target is the primary bottleneck

### You MIGHT Benefit from Loader Threads If:

- Tables exceed 100+ million rows AND comparison is slow
- Monitoring shows compare threads spending significant time waiting on staging inserts
- Repository database is the confirmed bottleneck (not source/target databases)
- You have tested with `loader-threads=0` first and confirmed it's not sufficient

### Decision Flowchart

```
Is comparison slow?
    │
    ├─► No ──► Keep loader-threads=0
    │
    └─► Yes ──► Where is the bottleneck?
                    │
                    ├─► Source/Target DB ──► Tune queries, add indexes
                    │
                    ├─► Network ──► Increase batch-fetch-size
                    │
                    ├─► pgCompare CPU ──► Increase parallel_degree
                    │
                    └─► Repository inserts ──► Consider loader-threads > 0
```

---

## Diagnosing Bottlenecks

Before enabling loader threads, identify where time is being spent.

### Monitor Repository Database

```sql
-- Check for waiting queries during comparison
SELECT 
    pid,
    state,
    wait_event_type,
    wait_event,
    query
FROM pg_stat_activity
WHERE application_name LIKE 'pgCompare%'
AND state != 'idle';

-- Check staging table insert rate
SELECT 
    relname,
    n_tup_ins,
    n_tup_upd,
    n_tup_del
FROM pg_stat_user_tables
WHERE relname LIKE 'dc_%_stg_%';
```

### Monitor JVM Thread Activity

```bash
# Get thread dump during comparison
jstack $(pgrep -f pgcompare) | grep -A 5 "compare\|loader"
```

### Check Log Output

Enable debug logging to see timing information:

```properties
log-level=DEBUG
```

Look for patterns indicating where time is spent:
- Long fetch times → Source/target database bottleneck
- Long insert times → Repository bottleneck (may benefit from loader threads)
- Queue full messages → Increase message-queue-size

---

## Advanced Thread Configuration Examples

### Example: Confirmed Repository Bottleneck

After monitoring confirms staging table inserts are the bottleneck:

```properties
# Enable loader threads
loader-threads=8
message-queue-size=2000

# Other settings
batch-fetch-size=10000
batch-commit-size=10000
observer-throttle=true
observer-throttle-size=2000000
```

```bash
java -Xms4g -Xmx8g -jar pgcompare.jar compare --batch 0
```

### Example: Very Large Tables (500M+ rows)

Only if default settings are insufficient:

```properties
loader-threads=16
message-queue-size=4000
batch-fetch-size=20000
batch-commit-size=20000
observer-throttle=true
observer-throttle-size=5000000
observer-vacuum=true
```

```sql
-- Set high parallel degree with mod_column
UPDATE dc_table SET parallel_degree = 8 WHERE table_alias = 'huge_table';
UPDATE dc_table_map SET mod_column = 'id' WHERE tid = (SELECT tid FROM dc_table WHERE table_alias = 'huge_table');
```

```bash
java -Xms8g -Xmx16g -XX:+UseG1GC -jar pgcompare.jar compare --table huge_table
```

### Thread Configuration Matrix

| Scenario | parallel_degree | loader-threads | message-queue-size |
|----------|-----------------|----------------|-------------------|
| Default (recommended) | 1-8 | 0 | N/A |
| Repository bottleneck confirmed | 4-8 | 4-8 | 1000-2000 |
| Extreme (very rare) | 8-16 | 8-16 | 2000-4000 |

---

## Summary

- **Start simple**: Use `loader-threads=0` (default) for all workloads initially
- **Monitor first**: Identify the actual bottleneck before adding complexity
- **Test incrementally**: If you enable loader threads, start with `loader-threads=4` and increase gradually
- **Watch memory**: Larger queues and more threads require more heap memory
- **Document findings**: Record what settings work for your specific workload
