# pgCompare User Guide

## Table of Contents

1. [Introduction](#introduction)
2. [Installation](#installation)
3. [Quick Start](#quick-start)
4. [Command Reference](#command-reference)
5. [Configuration](#configuration)
6. [Table Discovery](#table-discovery)
7. [Running Comparisons](#running-comparisons)
8. [Rechecking Discrepancies](#rechecking-discrepancies)
9. [Mapping Import/Export](#mapping-importexport)
10. [HTML Reports](#html-reports)
11. [Projects](#projects)
12. [Viewing Results](#viewing-results)
13. [SQL Fix Generation](#sql-fix-generation)
14. [Supported Databases](#supported-databases)
15. [Signal Handling](#signal-handling)

---

## Introduction

pgCompare is a Java-based data comparison tool designed to validate data consistency between source and target databases. It uses hash-based comparisons to efficiently identify discrepancies in large datasets with minimal database overhead.

### Use Cases

- **Data Migration Validation**: Compare data during or after migrating from Oracle, DB2, MariaDB, MySQL, MSSQL, or Snowflake to PostgreSQL
- **Logical Replication Verification**: Validate data consistency across replicated databases
- **Active-Active Configuration Testing**: Regularly verify data synchronization between database nodes

### How It Works

1. pgCompare computes hash values for primary keys and non-key columns
2. Hashes are stored in a PostgreSQL repository database
3. Comparisons are performed using parallel threads for optimal performance
4. Discrepancies are identified and stored for review or remediation

---

## Installation

### Prerequisites

- Java 21 or later
- Maven 3.9 or later
- PostgreSQL 15 or later (for the repository database)
- JDBC drivers for your source/target databases

### Build from Source

```bash
git clone --depth 1 git@github.com:CrunchyData/pgCompare.git
cd pgCompare
mvn clean install
```

### Verify Installation

```bash
java -jar target/pgcompare.jar --version
```

Expected output:
```
Version: 0.5.0.0
```

---

## Quick Start

### Step 1: Create Configuration File

Create `pgcompare.properties` in your working directory:

```properties
# Repository Database
repo-host=localhost
repo-port=5432
repo-dbname=pgcompare
repo-user=pgcompare
repo-password=your_password
repo-schema=pgcompare
repo-sslmode=prefer

# Source Database (Oracle example)
source-type=oracle
source-host=oracle-server.example.com
source-port=1521
source-dbname=ORCL
source-user=source_user
source-password=source_password
source-schema=HR

# Target Database (PostgreSQL)
target-type=postgres
target-host=postgres-server.example.com
target-port=5432
target-dbname=mydb
target-user=target_user
target-password=target_password
target-schema=hr
```

### Step 2: Initialize Repository

```bash
java -jar pgcompare.jar init
```

### Step 3: Discover Tables

```bash
java -jar pgcompare.jar discover
```

### Step 4: Run Comparison

```bash
java -jar pgcompare.jar compare --batch 0
```

### Step 5: Review Results

```bash
java -jar pgcompare.jar check --batch 0 --report comparison-report.html
```

---

## Command Reference

### Syntax

```bash
java -jar pgcompare.jar <action> [options]
```

### Actions

| Action | Description |
|--------|-------------|
| `init` | Initialize the repository database schema |
| `discover` | Discover and map tables from source and target schemas |
| `compare` | Perform data comparison between source and target |
| `check` | Recompare out-of-sync rows from previous comparison |
| `copy-table` | Copy pgCompare metadata for a table |
| `export-mapping` | Export table/column mappings to YAML file |
| `import-mapping` | Import table/column mappings from YAML file |

### Options

| Option | Short | Description |
|--------|-------|-------------|
| `--batch <number>` | `-b` | Specify batch number (0 = all batches) |
| `--file <path>` | `-o` | File path for export/import operations |
| `--overwrite` | | Overwrite existing mappings during import |
| `--project <id>` | `-p` | Project ID for multi-project environments |
| `--report <file>` | `-r` | Generate HTML report to specified file |
| `--table <name>` | `-t` | Limit operation to specified table (wildcards supported for export/import only) |
| `--fix` | `-f` | Generate SQL statements to fix discrepancies (experimental) |
| `--help` | `-h` | Display help information |
| `--version` | `-v` | Display version information |

---

## Configuration

### Configuration Sources

pgCompare supports three configuration sources with the following precedence (highest to lowest):

1. **dc_project table** - Settings stored in the repository database
2. **Environment variables** - Prefixed with `PGCOMPARE_`
3. **Properties file** - Default: `pgcompare.properties` in current directory

### Environment Variable Format

Convert property names to environment variables:
- Replace `-` with `_`
- Convert to uppercase
- Prefix with `PGCOMPARE_`

**Examples:**
```bash
# Property: batch-fetch-size=5000
export PGCOMPARE_BATCH_FETCH_SIZE=5000
```

### Custom Configuration File Location

```bash
export PGCOMPARE_CONFIG=/path/to/custom-config.properties
java -jar pgcompare.jar compare
```

### System Properties

| Property | Default | Description |
|----------|---------|-------------|
| `batch-fetch-size` | 2000 | Number of rows fetched per database round-trip |
| `batch-commit-size` | 2000 | Number of rows committed per batch |
| `batch-progress-report-size` | 1000000 | Rows between progress reports |
| `column-hash-method` | database | Hash computation location: `database` or `hybrid` |
| `database-sort` | true | Sort rows on source/target database |
| `float-scale` | 3 | Scale for low-precision number casting |
| `log-level` | INFO | Logging verbosity: DEBUG, INFO, WARNING, SEVERE |
| `log-destination` | stdout | Log output location |
| `number-cast` | notation | Number format: `notation` (scientific) or `standard` |
| `observer-throttle` | true | Enable throttling to prevent staging table overflow |
| `observer-throttle-size` | 2000000 | Rows before throttle activates |
| `observer-vacuum` | true | Vacuum staging tables during checkpoints |
| `stage-table-parallel` | 0 | Parallel degree for staging tables |

> **Note:** For advanced threading options (loader-threads, message-queue-size), see the [Advanced Tuning Guide](advanced-tuning-guide.md).

### Repository Properties

| Property | Description |
|----------|-------------|
| `repo-host` | Repository PostgreSQL server hostname |
| `repo-port` | Repository PostgreSQL server port |
| `repo-dbname` | Repository database name |
| `repo-user` | Repository database username |
| `repo-password` | Repository database password |
| `repo-schema` | Repository schema name |
| `repo-sslmode` | SSL mode: `disable`, `prefer`, `require` |

### Source/Target Properties

| Property | Description |
|----------|-------------|
| `source-type` | Database type: `postgres`, `oracle`, `db2`, `mariadb`, `mysql`, `mssql`, `snowflake` |
| `source-host` | Database server hostname |
| `source-port` | Database server port |
| `source-dbname` | Database name (or service name for Oracle) |
| `source-user` | Database username |
| `source-password` | Database password |
| `source-schema` | Schema containing tables to compare |
| `source-sslmode` | SSL mode for connection |
| `source-warehouse` | Snowflake virtual warehouse (Snowflake only) |

Replace `source-` with `target-` for target database properties.

---

## Table Discovery

### Automatic Discovery

The discover action scans source and target schemas to create table and column mappings:

```bash
java -jar pgcompare.jar discover
```

This will:
1. Query metadata from both databases
2. Match tables by name
3. Match columns by name
4. Create mappings in the repository

### Discover Specific Tables

```bash
# Discover a single table
java -jar pgcompare.jar discover --table "orders"
```

### Manual Table Registration

For complex scenarios, insert mappings directly into repository tables. Note that `tid` and `column_id` are auto-generated, so use `RETURNING` to capture them for subsequent inserts:

**Step 1: dc_table** - Create table definition and capture generated tid
```sql
-- Insert table and get the auto-generated tid
INSERT INTO dc_table (pid, table_alias, enabled, batch_nbr, parallel_degree)
VALUES (1, 'customer_orders', true, 1, 4)
RETURNING tid;
-- Returns: tid = 123 (example)
```

**Step 2: dc_table_map** - Create source/target table locations using the returned tid
```sql
-- Source mapping (use tid from Step 1)
INSERT INTO dc_table_map (tid, dest_type, schema_name, table_name)
VALUES (123, 'source', 'SALES', 'CUSTOMER_ORDERS');

-- Target mapping  
INSERT INTO dc_table_map (tid, dest_type, schema_name, table_name)
VALUES (123, 'target', 'sales', 'customer_orders');
```

**Step 3: dc_table_column** - Create column definition and capture generated column_id
```sql
-- Insert column and get the auto-generated column_id
INSERT INTO dc_table_column (tid, column_alias, enabled)
VALUES (123, 'customer_id', true)
RETURNING column_id;
-- Returns: column_id = 1 (example)
```

**Step 4: dc_table_column_map** - Create column mappings for source and target
```sql
-- Source column mapping (use tid and column_id from previous steps)
INSERT INTO dc_table_column_map (
    tid, column_id, column_origin, column_name, 
    data_type, data_class, column_primarykey
)
VALUES (123, 1, 'source', 'CUSTOMER_ID', 'NUMBER', 'integer', true);

-- Target column mapping
INSERT INTO dc_table_column_map (
    tid, column_id, column_origin, column_name, 
    data_type, data_class, column_primarykey
)
VALUES (123, 1, 'target', 'customer_id', 'bigint', 'integer', true);
```

**Complete Example with Variables (psql)**
```sql
-- Using psql variables to chain inserts
\set pid 1

INSERT INTO dc_table (pid, table_alias, enabled, batch_nbr, parallel_degree)
VALUES (:pid, 'customer_orders', true, 1, 4)
RETURNING tid AS new_tid \gset

INSERT INTO dc_table_map (tid, dest_type, schema_name, table_name)
VALUES (:new_tid, 'source', 'SALES', 'CUSTOMER_ORDERS');

INSERT INTO dc_table_map (tid, dest_type, schema_name, table_name)
VALUES (:new_tid, 'target', 'sales', 'customer_orders');

INSERT INTO dc_table_column (tid, column_alias, enabled)
VALUES (:new_tid, 'customer_id', true)
RETURNING column_id AS new_col_id \gset

INSERT INTO dc_table_column_map (tid, column_id, column_origin, column_name, data_type, data_class, column_primarykey)
VALUES (:new_tid, :new_col_id, 'source', 'CUSTOMER_ID', 'NUMBER', 'integer', true);

INSERT INTO dc_table_column_map (tid, column_id, column_origin, column_name, data_type, data_class, column_primarykey)
VALUES (:new_tid, :new_col_id, 'target', 'customer_id', 'bigint', 'integer', true);
```

---

## Running Comparisons

### Basic Comparison

Compare all discovered tables:

```bash
java -jar pgcompare.jar compare --batch 0
```

### Compare Specific Batch

```bash
# Compare only batch 1
java -jar pgcompare.jar compare --batch 1

# Compare batch 2
java -jar pgcompare.jar compare --batch 2
```

### Compare Specific Table

```bash
java -jar pgcompare.jar compare --table "orders"
```

### Generate Report During Comparison

```bash
java -jar pgcompare.jar compare --batch 0 --report results.html
```

### Using Environment Variable for Batch

```bash
export PGCOMPARE_BATCH=1
java -jar pgcompare.jar compare
```

### Understanding Batch Numbers

Batch numbers allow grouping tables for organized comparisons:

| Batch | Purpose |
|-------|---------|
| 0 | Process all tables regardless of batch assignment |
| 1-N | Process only tables assigned to that batch number |

Assign batch numbers during discovery or via the `dc_table.batch_nbr` column.

---

## Rechecking Discrepancies

### Recheck All Out-of-Sync Rows

```bash
java -jar pgcompare.jar check --batch 0
```

### Recheck with Report Generation

```bash
java -jar pgcompare.jar check --batch 0 --report recheck-results.html
```

### Recheck Specific Table

```bash
java -jar pgcompare.jar check --table "orders" --report orders-recheck.html
```

### Generate Fix SQL Statements (Experimental)

```bash
java -jar pgcompare.jar check --batch 0 --fix --report fix-statements.html
```

The `--fix` option generates INSERT, UPDATE, and DELETE statements to synchronize the target with the source.

---

## Mapping Import/Export

### Export Mappings to YAML

Export all table/column mappings:

```bash
java -jar pgcompare.jar export-mapping --file mappings.yaml
```

Export specific tables:

```bash
# Export tables starting with "customer"
java -jar pgcompare.jar export-mapping --file customer-mappings.yaml --table "customer*"

# Export single table
java -jar pgcompare.jar export-mapping --file orders.yaml --table "orders"
```

### YAML Format Example

```yaml
version: "1.0"
exportDate: "2025-01-15T10:30:00"
projectId: 1
projectName: "Migration Project"
tables:
  - alias: "customer_orders"
    enabled: true
    batchNumber: 1
    parallelDegree: 4
    source:
      schema: "SALES"
      table: "CUSTOMER_ORDERS"
      schemaPreserveCase: false
      tablePreserveCase: false
    target:
      schema: "sales"
      table: "customer_orders"
      schemaPreserveCase: false
      tablePreserveCase: false
    columns:
      - alias: "customer_id"
        enabled: true
        source:
          columnName: "CUSTOMER_ID"
          dataType: "NUMBER"
          dataClass: "integer"
          primaryKey: true
          nullable: false
          preserveCase: false
        target:
          columnName: "customer_id"
          dataType: "bigint"
          dataClass: "integer"
          primaryKey: true
          nullable: false
          preserveCase: false
      - alias: "order_date"
        enabled: true
        source:
          columnName: "ORDER_DATE"
          dataType: "DATE"
          dataClass: "date"
          primaryKey: false
          mapExpression: "TO_CHAR(ORDER_DATE, 'YYYYMMDDHH24MISS')"
        target:
          columnName: "order_date"
          dataType: "timestamp"
          dataClass: "date"
```

### Import Mappings from YAML

Import mappings (skip existing):

```bash
java -jar pgcompare.jar import-mapping --file mappings.yaml
```

Import with overwrite:

```bash
java -jar pgcompare.jar import-mapping --file mappings.yaml --overwrite
```

Import specific tables:

```bash
java -jar pgcompare.jar import-mapping --file mappings.yaml --table "customer*"
```

### Use Cases for Import/Export

1. **Version Control**: Export mappings to YAML and track changes in Git
2. **Environment Promotion**: Export from dev, import to test/production
3. **Backup/Restore**: Save mappings before schema changes
4. **Manual Customization**: Export, edit YAML, import with `--overwrite`

---

## HTML Reports

### Generate Report During Comparison

```bash
java -jar pgcompare.jar compare --batch 0 --report comparison-report.html
```

### Generate Report During Recheck

```bash
java -jar pgcompare.jar check --batch 0 --report recheck-report.html
```

### Report Contents

The HTML report includes:

1. **Job Summary**
   - Tables processed
   - Total elapsed time
   - Rows per second throughput
   - Total rows compared
   - Out-of-sync row count

2. **Table Summary**
   - Per-table comparison status
   - Row counts (equal, not equal, missing source, missing target)
   - Elapsed time per table

3. **Check Results** (for recheck operations)
   - Primary key values
   - Comparison status
   - Detailed results

4. **Fix SQL** (when `--fix` is enabled)
   - Generated INSERT/UPDATE/DELETE statements
   - Primary key for each fix

---

## Projects

Projects allow maintaining multiple comparison configurations in a single repository.

### Create a New Project

```sql
INSERT INTO dc_project (project_name, project_config)
VALUES ('Migration Project', '{"batch-fetch-size": "5000", "observer-throttle": "true"}');
```

### Use a Specific Project

```bash
java -jar pgcompare.jar discover --project 2
java -jar pgcompare.jar compare --project 2 --batch 0
```

### Store Project-Specific Configuration

Configuration can be stored in the `project_config` column as JSON:

```sql
UPDATE dc_project 
SET project_config = '{"batch-fetch-size": "5000", "batch-commit-size": "5000", "observer-throttle": "true"}'
WHERE pid = 2;
```

### List Projects

```sql
SELECT pid, project_name, project_config 
FROM dc_project 
ORDER BY pid;
```

---

## Viewing Results

### Summary from Last Run

```sql
WITH mr AS (SELECT max(rid) rid FROM dc_result)
SELECT 
    compare_start, 
    table_name, 
    status, 
    equal_cnt + not_equal_cnt + missing_source_cnt + missing_target_cnt AS total_cnt,
    equal_cnt, 
    not_equal_cnt, 
    missing_source_cnt + missing_target_cnt AS missing_cnt
FROM dc_result r
JOIN mr ON (mr.rid = r.rid)
ORDER BY table_name;
```

### Out-of-Sync Rows

```sql
SELECT 
    COALESCE(s.table_name, t.table_name) AS table_name,
    CASE
        WHEN s.compare_result = 'n' THEN 'out-of-sync'
        WHEN s.compare_result = 'm' THEN 'missing target'
        WHEN t.compare_result = 'm' THEN 'missing source'
    END AS compare_result,
    COALESCE(s.pk, t.pk) AS primary_key
FROM dc_source s
FULL OUTER JOIN dc_target t ON s.pk = t.pk AND s.tid = t.tid;
```

### Detailed Results by Table

```sql
SELECT 
    t.table_alias,
    r.compare_start,
    r.compare_end,
    r.status,
    r.source_cnt,
    r.target_cnt,
    r.equal_cnt,
    r.not_equal_cnt,
    r.missing_source_cnt,
    r.missing_target_cnt
FROM dc_result r
JOIN dc_table t ON r.tid = t.tid
WHERE t.table_alias = 'orders'
ORDER BY r.compare_start DESC
LIMIT 10;
```

### View Primary Keys for Out-of-Sync Rows

```sql
SELECT 
    table_name,
    pk,
    compare_result,
    batch_nbr
FROM dc_source
WHERE compare_result IN ('n', 'm')
ORDER BY table_name, pk;
```

---

## SQL Fix Generation

### Overview

The SQL fix generation feature (experimental) creates INSERT, UPDATE, and DELETE statements to synchronize the target database with the source.

### Enable Fix Generation

```bash
java -jar pgcompare.jar check --batch 0 --fix
```

### Generated Statement Types

| Source State | Target State | Generated SQL |
|-------------|-------------|---------------|
| Row exists | Row missing | INSERT INTO target |
| Row missing | Row exists | DELETE FROM target |
| Row exists | Row exists (different) | UPDATE target |

### Example Output

```
Fix SQL Statements:
===================

Table: orders (3 statements)
  PK: {"order_id": 12345}
      INSERT INTO sales.orders (order_id, customer_id, amount) VALUES (12345, 100, 250.00);

  PK: {"order_id": 12346}
      UPDATE sales.orders SET amount = 300.00, status = 'shipped' WHERE order_id = 12346;

  PK: {"order_id": 12347}
      DELETE FROM sales.orders WHERE order_id = 12347;

Total Fix SQL Statements: 3
```

### Limitations

- Feature is experimental - review generated SQL before execution
- Complex data types may not be handled correctly
- Large-scale fixes should be batched manually
- Always test fix statements in non-production first

---

## Supported Databases

### Database Types

| Database | Source | Target | Type Value |
|----------|--------|--------|------------|
| PostgreSQL | Yes | Yes | `postgres` |
| Oracle | Yes | Yes | `oracle` |
| IBM DB2 | Yes | Yes | `db2` |
| MariaDB | Yes | Yes | `mariadb` |
| MySQL | Yes | Yes | `mysql` |
| Microsoft SQL Server | Yes | Yes | `mssql` |
| Snowflake | Yes | Yes | `snowflake` |

### Connection Examples

**Oracle:**
```properties
source-type=oracle
source-host=oracle-server.example.com
source-port=1521
source-dbname=ORCL
source-user=hr
source-password=password
source-schema=HR
```

**PostgreSQL:**
```properties
target-type=postgres
target-host=postgres-server.example.com
target-port=5432
target-dbname=mydb
target-user=postgres
target-password=password
target-schema=public
target-sslmode=prefer
```

**Snowflake:**
```properties
source-type=snowflake
source-host=account.snowflakecomputing.com
source-dbname=MYDB
source-user=snowflake_user
source-password=password
source-schema=PUBLIC
source-warehouse=COMPUTE_WH
```

**DB2:**
```properties
source-type=db2
source-host=db2-server.example.com
source-port=50000
source-dbname=SAMPLE
source-user=db2inst1
source-password=password
source-schema=DB2INST1
```

### Known Limitations

1. **Date/Timestamps**: Compared only to the second (format: DDMMYYYYHH24MISS)
2. **Unsupported Types**: blob, long, longraw, bytea
3. **Boolean**: Cross-platform comparison limitations
4. **Floating Point**: Low-precision types (float, real) cannot be compared to high-precision types (double)
5. **Float Scale**: All low-precision types cast using scale of 3 (1 for Snowflake)
6. **Float Casting**: Use `number-cast` option to switch between `standard` and `notation` formats

---

## Next Steps

- [Handling Large Tables](large-tables-guide.md) - Parallel processing and optimization
- [Table Filtering Guide](table-filtering-guide.md) - Advanced filtering techniques
- [Performance Tuning](performance-tuning-guide.md) - Optimizing for your workload
- [Quick Reference](quick-reference.md) - Command cheat sheet

---

## Signal Handling

pgCompare supports Unix signals for shutdown and dynamic configuration reload:

### Graceful Shutdown (SIGINT/Ctrl+C)
Send SIGINT (Ctrl+C) to gracefully stop a running comparison. The current table comparison will complete before the application exits.

```shell
# Use Ctrl+C if running in foreground
# Or send SIGINT
kill -INT <pid>
```

### Immediate Termination (SIGTERM)
Send SIGTERM to immediately cancel all running queries and terminate. Use this when you need to stop immediately without waiting for the current table to complete.

```shell
# Find the pgCompare process
ps aux | grep pgcompare

# Send SIGTERM for immediate termination
kill -TERM <pid>
# or simply
kill <pid>
```

### Configuration Reload (SIGHUP)
Send SIGHUP to reload the properties file without stopping the application. This allows dynamic adjustment of certain parameters during long-running comparisons.

```shell
# Reload configuration
kill -HUP <pid>
```

**Dynamically reloadable properties:**
- `batch-fetch-size`, `batch-commit-size`, `batch-progress-report-size`
- `loader-threads`, `message-queue-size`
- `observer-throttle`, `observer-throttle-size`, `observer-vacuum`
- `log-level`, `float-scale`, `database-sort`

**Note:** Connection properties (repo-*, source-*, target-*) cannot be reloaded at runtime.
