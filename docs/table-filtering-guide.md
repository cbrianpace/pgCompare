# Table Filtering Guide

This guide covers techniques for filtering which tables are processed during discovery, comparison, and mapping operations.

## Table of Contents

1. [Overview](#overview)
2. [Command Line Filtering](#command-line-filtering)
3. [Batch Number Filtering](#batch-number-filtering)
4. [Enabling/Disabling Tables](#enablingdisabling-tables)
5. [Schema-Level Filtering](#schema-level-filtering)
6. [Row-Level Filtering (table_filter)](#row-level-filtering-table_filter)
7. [Column Filtering](#column-filtering)
8. [Mapping Import/Export Filters](#mapping-importexport-filters)
9. [Advanced Filtering Strategies](#advanced-filtering-strategies)

---

## Overview

pgCompare provides multiple levels of filtering:

| Level | Method | Use Case |
|-------|--------|----------|
| Table | `--table` option | Process specific table (exact match) |
| Batch | `--batch` option | Group tables for processing |
| Enable/Disable | `enabled` column | Temporarily skip tables |
| Schema | Properties file | Limit schema scope |
| Row | `table_filter` column | Compare subset of rows (delta compares) |
| Column | `enabled` column | Exclude columns from comparison |

---

## Command Line Filtering

### Filter by Table Name

The `--table` option performs **exact match** filtering for compare, check, and discover operations:

```bash
# Compare a single table (exact match)
java -jar pgcompare.jar compare --table orders

# Discover a single table
java -jar pgcompare.jar discover --table customers

# Recheck a single table
java -jar pgcompare.jar check --table orders
```

### Case Sensitivity

Table filtering is case-insensitive by default:

```bash
# These are equivalent
java -jar pgcompare.jar compare --table "ORDERS"
java -jar pgcompare.jar compare --table "orders"
java -jar pgcompare.jar compare --table "Orders"
```

### Wildcards (Export/Import Only)

**Important:** Wildcard patterns using `*` are **only supported** for `export-mapping` and `import-mapping` operations:

```bash
# Export tables starting with "customer" (wildcards supported)
java -jar pgcompare.jar export-mapping --file customer-tables.yaml --table "customer*"

# Import tables ending with "_archive" (wildcards supported)
java -jar pgcompare.jar import-mapping --file mappings.yaml --table "*_archive"
```

**Wildcards are NOT supported for:**
- `compare` - Use batch numbers or run multiple commands
- `check` - Use batch numbers or run multiple commands
- `discover` - Use batch numbers or run multiple commands

### Comparing Multiple Tables

To compare multiple related tables, use batch numbers or run separate commands:

```bash
# Option 1: Run multiple commands
java -jar pgcompare.jar compare --table orders
java -jar pgcompare.jar compare --table order_items
java -jar pgcompare.jar compare --table order_history

# Option 2: Assign tables to a batch and run by batch
java -jar pgcompare.jar compare --batch 2
```

---

## Batch Number Filtering

### Understanding Batches

Batch numbers group tables for organized processing:

| Batch Number | Behavior |
|-------------|----------|
| 0 | Process all tables regardless of batch assignment |
| 1-N | Process only tables assigned to that batch |

### Assigning Batch Numbers

**During Discovery:**

Tables are assigned to batch 1 by default. Modify assignments in the repository:

```sql
-- Assign high-priority tables to batch 1
UPDATE dc_table 
SET batch_nbr = 1 
WHERE table_alias IN ('orders', 'customers', 'products');

-- Assign archive tables to batch 2
UPDATE dc_table 
SET batch_nbr = 2 
WHERE table_alias LIKE '%_archive';

-- Assign remaining tables to batch 3
UPDATE dc_table 
SET batch_nbr = 3 
WHERE batch_nbr = 1 
AND table_alias NOT IN ('orders', 'customers', 'products');
```

**Via YAML Import:**

```yaml
tables:
  - alias: "orders"
    batchNumber: 1
    enabled: true
  - alias: "orders_archive"
    batchNumber: 2
    enabled: true
```

### Running by Batch

```bash
# Process batch 1 only
java -jar pgcompare.jar compare --batch 1

# Process batch 2 only
java -jar pgcompare.jar compare --batch 2

# Process all batches
java -jar pgcompare.jar compare --batch 0
```

### Using Environment Variable

```bash
export PGCOMPARE_BATCH=1
java -jar pgcompare.jar compare

# Override environment variable with command line
java -jar pgcompare.jar compare --batch 2
```

### Batch Strategy Examples

**By Table Size:**
```sql
-- Large tables: batch 1 (run separately with more resources)
UPDATE dc_table SET batch_nbr = 1 WHERE table_alias IN ('event_log', 'audit_trail');

-- Medium tables: batch 2
UPDATE dc_table SET batch_nbr = 2 WHERE table_alias IN ('orders', 'order_items');

-- Small reference tables: batch 3
UPDATE dc_table SET batch_nbr = 3 WHERE table_alias IN ('countries', 'currencies');
```

**By Priority:**
```sql
-- Critical business tables: batch 1
UPDATE dc_table SET batch_nbr = 1 WHERE table_alias IN ('accounts', 'transactions');

-- Secondary tables: batch 2
UPDATE dc_table SET batch_nbr = 2 WHERE batch_nbr != 1;
```

---

## Enabling/Disabling Tables

### Disable Tables Temporarily

Skip tables without removing their configuration:

```sql
-- Disable a specific table
UPDATE dc_table 
SET enabled = false 
WHERE table_alias = 'temp_staging';

-- Disable multiple tables
UPDATE dc_table 
SET enabled = false 
WHERE table_alias LIKE '%_temp';
```

### Re-Enable Tables

```sql
UPDATE dc_table 
SET enabled = true 
WHERE table_alias = 'temp_staging';
```

### Via YAML

```yaml
tables:
  - alias: "active_orders"
    enabled: true
  - alias: "archived_orders"
    enabled: false  # Will be skipped during comparison
```

### Check Disabled Tables

```sql
SELECT table_alias, enabled, batch_nbr 
FROM dc_table 
WHERE enabled = false 
ORDER BY table_alias;
```

---

## Schema-Level Filtering

### Configure in Properties File

Limit discovery to specific schemas:

```properties
# Source schema
source-schema=SALES

# Target schema  
target-schema=sales
```

### Multi-Schema Scenarios

For comparing across different schemas:

**Same schema names:**
```properties
source-schema=PRODUCTION
target-schema=production
```

**Different schema names:**
```properties
source-schema=ORACLE_SALES
target-schema=pg_sales
```

### Discover from Multiple Schemas

Run discovery multiple times with different configurations:

```bash
# Discover SALES schema
export PGCOMPARE_SOURCE_SCHEMA=SALES
export PGCOMPARE_TARGET_SCHEMA=sales
java -jar pgcompare.jar discover

# Discover HR schema (different project)
export PGCOMPARE_SOURCE_SCHEMA=HR
export PGCOMPARE_TARGET_SCHEMA=hr
java -jar pgcompare.jar discover --project 2
```

---

## Row-Level Filtering (table_filter)

The `table_filter` column in `dc_table_map` allows you to specify a SQL WHERE clause condition to limit which rows are compared. This is one of the most powerful features for optimizing comparisons and enabling delta/incremental comparisons.

### Why Use Row-Level Filtering?

| Use Case | Benefit |
|----------|---------|
| **Delta Comparisons** | Compare only recently modified rows instead of entire table |
| **Incremental Validation** | Validate data in time-based slices |
| **Subset Testing** | Test comparison on a sample before full run |
| **Performance** | Dramatically reduce comparison time for large tables |
| **Active Record Focus** | Skip soft-deleted or archived records |

### Basic Syntax

The `table_filter` value should be a SQL condition (without the WHERE keyword - it's added automatically with AND):

```sql
-- Set filter on a table mapping
UPDATE dc_table_map 
SET table_filter = 'status = ''ACTIVE''' 
WHERE tid = (SELECT tid FROM dc_table WHERE table_alias = 'customers')
  AND dest_type = 'source';
```

### Setting Filters on Both Source and Target

**Important:** You typically need to set the filter on BOTH source and target mappings:

```sql
-- Get the tid for the table
SELECT tid FROM dc_table WHERE table_alias = 'orders';
-- Returns: 123

-- Set filter on SOURCE mapping
UPDATE dc_table_map 
SET table_filter = 'order_date >= ''2024-01-01''' 
WHERE tid = 123 AND dest_type = 'source';

-- Set filter on TARGET mapping  
UPDATE dc_table_map 
SET table_filter = 'order_date >= ''2024-01-01''' 
WHERE tid = 123 AND dest_type = 'target';
```

### Delta Comparison Examples

Delta comparisons compare only rows that have changed since a specific point in time. This is invaluable for ongoing replication validation.

**Example 1: Compare Last 7 Days of Changes**

```sql
-- For Oracle source
UPDATE dc_table_map 
SET table_filter = 'modified_date > SYSDATE - 7' 
WHERE tid = 123 AND dest_type = 'source';

-- For PostgreSQL target
UPDATE dc_table_map 
SET table_filter = 'modified_date > CURRENT_DATE - INTERVAL ''7 days''' 
WHERE tid = 123 AND dest_type = 'target';
```

**Example 2: Compare Since Last Successful Run**

```sql
-- Store last run timestamp
-- After successful compare, record: 2024-01-15 10:30:00

-- Next run - Oracle source
UPDATE dc_table_map 
SET table_filter = 'modified_date > TO_TIMESTAMP(''2024-01-15 10:30:00'', ''YYYY-MM-DD HH24:MI:SS'')' 
WHERE tid = 123 AND dest_type = 'source';

-- PostgreSQL target
UPDATE dc_table_map 
SET table_filter = 'modified_date > ''2024-01-15 10:30:00''::timestamp' 
WHERE tid = 123 AND dest_type = 'target';
```

**Example 3: Daily Incremental Comparison**

```sql
-- Compare only today's data (useful for daily validation jobs)

-- Oracle source
UPDATE dc_table_map 
SET table_filter = 'TRUNC(created_date) = TRUNC(SYSDATE)' 
WHERE tid = 123 AND dest_type = 'source';

-- PostgreSQL target
UPDATE dc_table_map 
SET table_filter = 'created_date::date = CURRENT_DATE' 
WHERE tid = 123 AND dest_type = 'target';
```

### Filtering by Record Status

**Compare Only Active Records:**

```sql
UPDATE dc_table_map 
SET table_filter = 'status = ''ACTIVE'' AND deleted_flag = ''N''' 
WHERE tid = 123;  -- Updates both source and target if same filter applies
```

**Compare Specific Regions:**

```sql
-- Source (Oracle)
UPDATE dc_table_map 
SET table_filter = 'region_code IN (''US'', ''CA'', ''MX'')' 
WHERE tid = 123 AND dest_type = 'source';

-- Target (PostgreSQL)
UPDATE dc_table_map 
SET table_filter = 'region_code IN (''US'', ''CA'', ''MX'')' 
WHERE tid = 123 AND dest_type = 'target';
```

### Filtering by Primary Key Range

Useful for comparing large tables in chunks:

```sql
-- Compare first million records
UPDATE dc_table_map 
SET table_filter = 'id BETWEEN 1 AND 1000000' 
WHERE tid = 123;

-- Run comparison
java -jar pgcompare.jar compare --table orders

-- Compare next million
UPDATE dc_table_map 
SET table_filter = 'id BETWEEN 1000001 AND 2000000' 
WHERE tid = 123;

-- Run comparison again
java -jar pgcompare.jar compare --table orders
```

### Database-Specific Syntax

Different databases require different SQL syntax. Set appropriate filters for each side:

| Database | Date Example |
|----------|-------------|
| Oracle | `modified_date > SYSDATE - 7` |
| PostgreSQL | `modified_date > CURRENT_DATE - INTERVAL '7 days'` |
| MySQL/MariaDB | `modified_date > DATE_SUB(NOW(), INTERVAL 7 DAY)` |
| SQL Server | `modified_date > DATEADD(day, -7, GETDATE())` |
| DB2 | `modified_date > CURRENT DATE - 7 DAYS` |
| Snowflake | `modified_date > DATEADD(day, -7, CURRENT_DATE())` |

### Automating Delta Filters

**Script to Update Filters Daily:**

```bash
#!/bin/bash
# update_delta_filters.sh

# Calculate yesterday's date
YESTERDAY=$(date -d "yesterday" +%Y-%m-%d)

# Update source filters (Oracle)
psql -d pgcompare -c "
UPDATE dc_table_map 
SET table_filter = 'modified_date >= TO_DATE(''$YESTERDAY'', ''YYYY-MM-DD'')' 
WHERE dest_type = 'source' 
  AND tid IN (SELECT tid FROM dc_table WHERE batch_nbr = 1);
"

# Update target filters (PostgreSQL)
psql -d pgcompare -c "
UPDATE dc_table_map 
SET table_filter = 'modified_date >= ''$YESTERDAY''::date' 
WHERE dest_type = 'target' 
  AND tid IN (SELECT tid FROM dc_table WHERE batch_nbr = 1);
"

# Run comparison
java -jar pgcompare.jar compare --batch 1
```

**Using Repository View for Dynamic Filters:**

```sql
-- Create a function to generate filter for each table
CREATE OR REPLACE FUNCTION get_delta_filter(p_dest_type text, p_days int)
RETURNS text AS $$
BEGIN
    IF p_dest_type = 'source' THEN
        -- Oracle syntax
        RETURN 'modified_date > SYSDATE - ' || p_days;
    ELSE
        -- PostgreSQL syntax
        RETURN 'modified_date > CURRENT_DATE - INTERVAL ''' || p_days || ' days''';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Apply delta filters to all tables in batch 1
UPDATE dc_table_map tm
SET table_filter = get_delta_filter(tm.dest_type, 7)
WHERE tid IN (SELECT tid FROM dc_table WHERE batch_nbr = 1);
```

### Clearing Filters

To remove filters and compare full tables:

```sql
-- Clear filter for specific table
UPDATE dc_table_map 
SET table_filter = NULL 
WHERE tid = 123;

-- Clear all filters for a project
UPDATE dc_table_map tm
SET table_filter = NULL
FROM dc_table t
WHERE tm.tid = t.tid AND t.pid = 1;
```

### Performance Considerations

1. **Index Support**: Ensure filter columns are indexed on source/target databases
2. **Selectivity**: Highly selective filters dramatically improve performance
3. **Statistics**: Keep database statistics up-to-date for optimal query plans

```sql
-- Example: Ensure modified_date is indexed
-- On Oracle source
CREATE INDEX idx_orders_modified ON orders(modified_date);

-- On PostgreSQL target  
CREATE INDEX idx_orders_modified ON orders(modified_date);
```

### Viewing Current Filters

```sql
-- View all table filters
SELECT 
    t.table_alias,
    tm.dest_type,
    tm.table_filter
FROM dc_table t
JOIN dc_table_map tm ON t.tid = tm.tid
WHERE tm.table_filter IS NOT NULL
ORDER BY t.table_alias, tm.dest_type;
```

---

## Column Filtering

### Disable Specific Columns

Exclude columns from comparison:

```sql
-- Disable audit columns
UPDATE dc_table_column 
SET enabled = false 
WHERE column_alias IN ('created_by', 'modified_by', 'created_date', 'modified_date');

-- Disable for specific table
UPDATE dc_table_column 
SET enabled = false 
WHERE tid = (SELECT tid FROM dc_table WHERE table_alias = 'orders')
AND column_alias = 'internal_notes';
```

### Via YAML

```yaml
columns:
  - alias: "customer_id"
    enabled: true
  - alias: "created_timestamp"
    enabled: false  # Excluded from comparison
  - alias: "modified_by"
    enabled: false  # Excluded from comparison
```

### Column Support Status

The `supported` flag indicates if pgCompare can compare the column data type:

```sql
-- Check unsupported columns
SELECT t.table_alias, tc.column_alias, tcm.data_type, tcm.supported
FROM dc_table t
JOIN dc_table_column tc ON t.tid = tc.tid
JOIN dc_table_column_map tcm ON tc.tid = tcm.tid AND tc.column_id = tcm.column_id
WHERE tcm.supported = false;
```

### Custom Column Expressions (map_expression)

The `map_expression` column in `dc_table_column_map` allows you to define custom SQL expressions that transform column values before comparison. This is essential when:

- Source and target databases store data in different formats
- You need to normalize data for accurate comparison
- Cross-platform data type differences cause false mismatches
- Columns contain data that needs transformation before hashing

#### How map_expression Works

When pgCompare builds the comparison SQL, it uses `map_expression` instead of the raw column name. The expression is executed on the respective database (source or target) and the result is hashed for comparison.

```sql
-- Without map_expression:
SELECT MD5(order_date::text) FROM orders;

-- With map_expression = 'TO_CHAR(order_date, ''YYYYMMDD'')':
SELECT MD5(TO_CHAR(order_date, 'YYYYMMDD')) FROM orders;
```

#### Setting map_expression

```sql
-- Basic syntax
UPDATE dc_table_column_map 
SET map_expression = '<SQL expression>' 
WHERE tid = <table_id> 
  AND column_id = <column_id> 
  AND column_origin = '<source|target>';
```

#### Common Use Cases

**1. Date/Time Formatting**

Normalize date formats across platforms (pgCompare compares dates to the second):

```sql
-- Oracle source: Convert to standard format
UPDATE dc_table_column_map 
SET map_expression = 'TO_CHAR(created_date, ''YYYYMMDDHH24MISS'')' 
WHERE column_name = 'CREATED_DATE' AND column_origin = 'source';

-- PostgreSQL target: Match the format
UPDATE dc_table_column_map 
SET map_expression = 'TO_CHAR(created_date, ''YYYYMMDDHH24MISS'')' 
WHERE column_name = 'created_date' AND column_origin = 'target';
```

**2. Handling NULL Values**

Replace NULLs with a consistent value:

```sql
-- Replace NULL with empty string for comparison
UPDATE dc_table_column_map 
SET map_expression = 'COALESCE(description, '''')' 
WHERE column_name = 'DESCRIPTION';

-- Replace NULL with specific value
UPDATE dc_table_column_map 
SET map_expression = 'COALESCE(status, ''UNKNOWN'')' 
WHERE column_name = 'STATUS';
```

**3. String Normalization**

Handle whitespace and case differences:

```sql
-- Trim leading/trailing whitespace
UPDATE dc_table_column_map 
SET map_expression = 'TRIM(customer_name)' 
WHERE column_name = 'CUSTOMER_NAME';

-- Normalize to uppercase for case-insensitive comparison
UPDATE dc_table_column_map 
SET map_expression = 'UPPER(email_address)' 
WHERE column_name = 'EMAIL_ADDRESS';

-- Trim and uppercase combined
UPDATE dc_table_column_map 
SET map_expression = 'UPPER(TRIM(company_name))' 
WHERE column_name = 'COMPANY_NAME';

-- Remove all whitespace (useful for phone numbers, etc.)
-- PostgreSQL
UPDATE dc_table_column_map 
SET map_expression = 'REGEXP_REPLACE(phone_number, ''\s+'', '''', ''g'')' 
WHERE column_name = 'phone_number' AND column_origin = 'target';

-- Oracle
UPDATE dc_table_column_map 
SET map_expression = 'REGEXP_REPLACE(phone_number, ''\s+'', '''')' 
WHERE column_name = 'PHONE_NUMBER' AND column_origin = 'source';
```

**4. Numeric Precision Handling**

Address floating-point precision differences:

```sql
-- Round to 2 decimal places
UPDATE dc_table_column_map 
SET map_expression = 'ROUND(unit_price, 2)' 
WHERE column_name = 'UNIT_PRICE';

-- Truncate to avoid rounding differences
UPDATE dc_table_column_map 
SET map_expression = 'TRUNC(amount, 2)' 
WHERE column_name = 'AMOUNT' AND column_origin = 'source';

-- Cast to specific numeric format
UPDATE dc_table_column_map 
SET map_expression = 'CAST(quantity AS DECIMAL(10,2))' 
WHERE column_name = 'QUANTITY';
```

**5. Boolean Handling**

Normalize boolean representations across platforms:

```sql
-- Oracle (using 'Y'/'N')
UPDATE dc_table_column_map 
SET map_expression = 'CASE WHEN is_active = ''Y'' THEN ''true'' ELSE ''false'' END' 
WHERE column_name = 'IS_ACTIVE' AND column_origin = 'source';

-- PostgreSQL (using native boolean)
UPDATE dc_table_column_map 
SET map_expression = 'CASE WHEN is_active THEN ''true'' ELSE ''false'' END' 
WHERE column_name = 'is_active' AND column_origin = 'target';
```

**6. JSON/Complex Data Types**

Extract specific values from JSON columns:

```sql
-- PostgreSQL: Extract JSON field
UPDATE dc_table_column_map 
SET map_expression = 'metadata->>''version''' 
WHERE column_name = 'metadata' AND column_origin = 'target';

-- Sort JSON keys for consistent comparison
UPDATE dc_table_column_map 
SET map_expression = 'jsonb_sort_keys(config_data)' 
WHERE column_name = 'config_data' AND column_origin = 'target';
```

**7. Substring/Partial Comparison**

Compare only portions of columns:

```sql
-- Compare first 10 characters only
UPDATE dc_table_column_map 
SET map_expression = 'SUBSTR(long_description, 1, 10)' 
WHERE column_name = 'LONG_DESCRIPTION' AND column_origin = 'source';

UPDATE dc_table_column_map 
SET map_expression = 'SUBSTRING(long_description, 1, 10)' 
WHERE column_name = 'long_description' AND column_origin = 'target';
```

**8. Concatenation for Composite Comparisons**

Combine multiple columns into one comparison value:

```sql
-- Combine first and last name
UPDATE dc_table_column_map 
SET map_expression = 'first_name || '' '' || last_name' 
WHERE column_name = 'FULL_NAME' AND column_origin = 'source';
```

#### Database-Specific Expressions

Different databases require different SQL syntax:

| Function | Oracle | PostgreSQL | MySQL | SQL Server |
|----------|--------|------------|-------|------------|
| Trim | `TRIM(col)` | `TRIM(col)` | `TRIM(col)` | `LTRIM(RTRIM(col))` |
| Upper | `UPPER(col)` | `UPPER(col)` | `UPPER(col)` | `UPPER(col)` |
| Substring | `SUBSTR(col,1,10)` | `SUBSTRING(col,1,10)` | `SUBSTRING(col,1,10)` | `SUBSTRING(col,1,10)` |
| NVL/Coalesce | `NVL(col,'')` | `COALESCE(col,'')` | `IFNULL(col,'')` | `ISNULL(col,'')` |
| Round | `ROUND(col,2)` | `ROUND(col,2)` | `ROUND(col,2)` | `ROUND(col,2)` |
| Date Format | `TO_CHAR(col,'YYYYMMDD')` | `TO_CHAR(col,'YYYYMMDD')` | `DATE_FORMAT(col,'%Y%m%d')` | `FORMAT(col,'yyyyMMdd')` |

#### Viewing Current Expressions

```sql
-- View all map_expressions
SELECT 
    t.table_alias,
    tc.column_alias,
    tcm.column_origin,
    tcm.column_name,
    tcm.map_expression
FROM dc_table t
JOIN dc_table_column tc ON t.tid = tc.tid
JOIN dc_table_column_map tcm ON tc.tid = tcm.tid AND tc.column_id = tcm.column_id
WHERE tcm.map_expression IS NOT NULL
ORDER BY t.table_alias, tc.column_alias, tcm.column_origin;
```

#### Clearing Expressions

```sql
-- Remove expression (use raw column value)
UPDATE dc_table_column_map 
SET map_expression = NULL 
WHERE tid = 123 AND column_id = 5;
```

#### Best Practices

1. **Test expressions independently**: Run the SQL expression directly on each database to verify results before setting map_expression
2. **Match output formats**: Ensure source and target expressions produce identical output formats
3. **Consider performance**: Complex expressions add processing overhead
4. **Document changes**: Keep track of custom expressions for maintenance
5. **Handle NULLs consistently**: Ensure both sides handle NULL the same way

#### Troubleshooting Expression Issues

**Problem: Comparison still shows differences after setting expression**

```sql
-- Verify expressions are set correctly
SELECT column_origin, column_name, map_expression 
FROM dc_table_column_map 
WHERE tid = 123 AND column_id = 5;

-- Test expressions directly on databases
-- Oracle
SELECT TO_CHAR(created_date, 'YYYYMMDDHH24MISS') FROM orders WHERE id = 1;

-- PostgreSQL  
SELECT TO_CHAR(created_date, 'YYYYMMDDHH24MISS') FROM orders WHERE id = 1;
```

**Problem: Expression syntax error**

The expression is executed as-is in the database query. Check:
- Proper escaping of single quotes (`''` in SQL)
- Database-specific function names
- Column name case sensitivity

---

## Mapping Import/Export Filters

### Export with Wildcard Filters

Export specific tables to YAML (wildcards ARE supported here):

```bash
# Export tables starting with "customer"
java -jar pgcompare.jar export-mapping --file customer-tables.yaml --table "customer*"

# Export tables ending with "_archive"
java -jar pgcompare.jar export-mapping --file archive-tables.yaml --table "*_archive"

# Export single table
java -jar pgcompare.jar export-mapping --file orders.yaml --table "orders"

# Export all tables in project 2
java -jar pgcompare.jar export-mapping --file project2.yaml --project 2
```

### Import with Wildcard Filters

Import specific tables from YAML (wildcards ARE supported here):

```bash
# Import only customer tables from a full export
java -jar pgcompare.jar import-mapping --file full-export.yaml --table "customer*"

# Import with overwrite
java -jar pgcompare.jar import-mapping --file updated-mappings.yaml --table "orders" --overwrite
```

---

## Advanced Filtering Strategies

### Strategy 1: Development vs Production

Maintain separate configurations for different environments:

```bash
# Development - compare sample of data using row filters
export PGCOMPARE_CONFIG=dev-config.properties
java -jar pgcompare.jar compare --table orders

# Production - full comparison
export PGCOMPARE_CONFIG=prod-config.properties
java -jar pgcompare.jar compare --batch 0
```

### Strategy 2: Incremental Daily Comparisons

```sql
-- Create a function to update all delta filters
CREATE OR REPLACE FUNCTION update_daily_filters() RETURNS void AS $$
BEGIN
    -- Update source filters (Oracle)
    UPDATE dc_table_map 
    SET table_filter = 'modified_date >= TRUNC(SYSDATE) - 1' 
    WHERE dest_type = 'source';
    
    -- Update target filters (PostgreSQL)
    UPDATE dc_table_map 
    SET table_filter = 'modified_date >= CURRENT_DATE - 1' 
    WHERE dest_type = 'target';
END;
$$ LANGUAGE plpgsql;

-- Run before daily comparison
SELECT update_daily_filters();
```

Run daily:
```bash
java -jar pgcompare.jar compare --batch 0
```

### Strategy 3: Prioritized Comparison Pipeline

```bash
#!/bin/bash

# Step 1: Compare critical tables with full validation
echo "Comparing critical tables..."
java -Xmx4g -jar pgcompare.jar compare --batch 1 --report critical-report.html

# Step 2: Compare secondary tables
echo "Comparing secondary tables..."
java -Xmx2g -jar pgcompare.jar compare --batch 2 --report secondary-report.html

# Step 3: Compare archive tables (can fail without blocking)
echo "Comparing archive tables..."
java -Xmx1g -jar pgcompare.jar compare --batch 3 --report archive-report.html || true

echo "All comparisons complete"
```

### Strategy 4: Table-by-Table Testing

Before running full comparison, test individual tables:

```bash
# Test with smallest tables first
java -jar pgcompare.jar compare --table countries
java -jar pgcompare.jar compare --table currencies

# If successful, run medium tables
java -jar pgcompare.jar compare --table products
java -jar pgcompare.jar compare --table customers

# Finally, run large tables
java -jar pgcompare.jar compare --table orders
java -jar pgcompare.jar compare --table order_items
```

### Strategy 5: Filter by Table Characteristics

```sql
-- Find tables without primary keys (may need special handling)
SELECT t.table_alias
FROM dc_table t
WHERE NOT EXISTS (
    SELECT 1 FROM dc_table_column_map tcm
    JOIN dc_table_column tc ON tcm.tid = tc.tid AND tcm.column_id = tc.column_id
    WHERE tc.tid = t.tid AND tcm.column_primarykey = true
);

-- Disable tables without PKs
UPDATE dc_table t
SET enabled = false
WHERE NOT EXISTS (
    SELECT 1 FROM dc_table_column_map tcm
    JOIN dc_table_column tc ON tcm.tid = tc.tid AND tcm.column_id = tc.column_id  
    WHERE tc.tid = t.tid AND tcm.column_primarykey = true
);
```

---

## Quick Reference

### Command Line Options

| Option | Wildcards | Description |
|--------|-----------|-------------|
| `compare --table "name"` | No | Exact table name only |
| `check --table "name"` | No | Exact table name only |
| `discover --table "name"` | No | Exact table name only |
| `export-mapping --table "pattern*"` | Yes | Supports wildcards |
| `import-mapping --table "pattern*"` | Yes | Supports wildcards |
| `--batch N` | N/A | Filter by batch number |
| `--batch 0` | N/A | All batches |

### SQL Filter Examples

| Purpose | SQL |
|---------|-----|
| Disable table | `UPDATE dc_table SET enabled = false WHERE table_alias = 'x'` |
| Set batch | `UPDATE dc_table SET batch_nbr = 2 WHERE table_alias LIKE '%_archive'` |
| Row filter | `UPDATE dc_table_map SET table_filter = 'status = ''A''' WHERE tid = 123` |
| Delta filter | `UPDATE dc_table_map SET table_filter = 'modified_date > SYSDATE - 7' WHERE tid = 123` |
| Clear filter | `UPDATE dc_table_map SET table_filter = NULL WHERE tid = 123` |
| Disable column | `UPDATE dc_table_column SET enabled = false WHERE column_alias = 'x'` |

### Common Patterns

```bash
# Compare single table (exact match)
java -jar pgcompare.jar compare --table orders

# Compare by batch
java -jar pgcompare.jar compare --batch 1

# Export with wildcards
java -jar pgcompare.jar export-mapping --file export.yaml --table "customer*"

# Import with wildcards and overwrite
java -jar pgcompare.jar import-mapping --file import.yaml --table "*_archive" --overwrite
```
