# pgCompare Mapping Export/Import

This document describes the YAML-based export and import functionality for table and column mappings in pgCompare.

## Overview

The mapping export/import feature allows you to:
- Export existing table and column mappings to a human-readable YAML file
- Edit mappings in your favorite text editor
- Import mappings to add new tables or update existing ones
- Filter exports/imports by table name patterns

This is particularly useful for:
- Bulk editing of column mappings
- Backing up mapping configurations
- Copying mappings between projects or environments
- Version controlling your mapping definitions

## Commands

### Export Mappings

```shell
java -jar pgcompare.jar export-mapping [options]
```

**Options:**
- `-p|--project <id>` - Project ID (default: 1)
- `-o|--file <path>` - Output file path (default: `pgcompare-mappings-<pid>.yaml`)
- `-t|--table <pattern>` - Filter tables by name pattern (supports `*` wildcard)

**Examples:**

```shell
# Export all mappings for project 1
java -jar pgcompare.jar export-mapping

# Export to a specific file
java -jar pgcompare.jar export-mapping --file my-mappings.yaml

# Export only tables starting with "customer"
java -jar pgcompare.jar export-mapping --table "customer*"

# Export tables matching a pattern for project 2
java -jar pgcompare.jar export-mapping -p 2 -t "*_staging"
```

### Import Mappings

```shell
java -jar pgcompare.jar import-mapping --file <path> [options]
```

**Options:**
- `-p|--project <id>` - Project ID to import into (default: 1)
- `-o|--file <path>` - Input YAML file path (required)
- `--overwrite` - Replace existing mappings (without this flag, existing tables are skipped)
- `-t|--table <pattern>` - Filter which tables to import (supports `*` wildcard)

**Examples:**

```shell
# Import mappings, adding only new tables
java -jar pgcompare.jar import-mapping --file my-mappings.yaml

# Import and overwrite existing mappings
java -jar pgcompare.jar import-mapping --file my-mappings.yaml --overwrite

# Import only specific tables
java -jar pgcompare.jar import-mapping --file mappings.yaml --table "orders*" --overwrite
```

## YAML File Format

The exported YAML file has a hierarchical structure that mirrors the database schema:

```yaml
version: "1.0"
exportDate: "2025-02-10T12:00:00"
projectId: 1
projectName: "default"
tables:
  - alias: "customer"              # Unique identifier linking source and target
    enabled: true                  # Set to false to skip this table in comparisons
    batchNumber: 1                 # Batch grouping for parallel processing
    parallelDegree: 1              # Degree of parallelism for this table
    source:                        # Source database table location
      schema: "sales"
      table: "customers"
      schemaPreserveCase: false    # Preserve case for schema name
      tablePreserveCase: false     # Preserve case for table name
      modColumn: null              # (Reserved for future use)
      tableFilter: null            # (Reserved for future use)
    target:                        # Target database table location
      schema: "dwh"
      table: "dim_customer"
      schemaPreserveCase: false
      tablePreserveCase: false
    columns:
      - alias: "customer_id"       # Column alias linking source/target columns
        enabled: true              # Set to false to exclude from comparison
        source:
          columnName: "id"
          dataType: "integer"
          dataClass: "integer"
          dataLength: null
          numberPrecision: 10
          numberScale: 0
          nullable: false
          primaryKey: true         # Mark primary key columns
          mapExpression: null      # Custom SQL expression (see below)
          supported: true
          preserveCase: false
          mapType: "column"
        target:
          columnName: "customer_id"
          dataType: "bigint"
          dataClass: "integer"
          # ... similar fields
```

### Field Descriptions

#### Table Level

| Field | Description |
|-------|-------------|
| `alias` | Unique identifier that links source and target tables. Used internally by pgCompare. |
| `enabled` | When `false`, the table is excluded from comparison operations. |
| `batchNumber` | Groups tables for batch processing. Tables in the same batch are processed together. |
| `parallelDegree` | Number of parallel threads to use when processing this table. |

#### Table Location (source/target)

| Field | Description |
|-------|-------------|
| `schema` | Database schema name |
| `table` | Table name within the schema |
| `schemaPreserveCase` | If `true`, schema name is quoted to preserve case |
| `tablePreserveCase` | If `true`, table name is quoted to preserve case |

#### Column Level

| Field | Description |
|-------|-------------|
| `alias` | Unique identifier linking source and target columns |
| `enabled` | When `false`, column is excluded from hash comparison |

#### Column Mapping (source/target)

| Field | Description |
|-------|-------------|
| `columnName` | Actual column name in the database |
| `dataType` | Database-specific data type (e.g., "varchar", "integer") |
| `dataClass` | Normalized data class: "string", "integer", "numeric", "timestamp", etc. |
| `dataLength` | Character/byte length for string types |
| `numberPrecision` | Total digits for numeric types |
| `numberScale` | Decimal places for numeric types |
| `nullable` | Whether the column allows NULL values |
| `primaryKey` | `true` for columns that form the primary key |
| `mapExpression` | Custom SQL expression for value transformation |
| `supported` | `false` if data type is not supported for comparison |
| `preserveCase` | If `true`, column name is quoted to preserve case |

## Using Map Expressions

The `mapExpression` field allows you to apply SQL transformations when comparing column values. This is useful when:

- Column names differ between source and target
- Data types need conversion
- Formatting differs between databases

**Examples:**

```yaml
# Convert timestamp to date for comparison
mapExpression: "DATE(created_at)"

# Trim whitespace
mapExpression: "TRIM(customer_name)"

# Handle NULL values
mapExpression: "COALESCE(status, 'unknown')"

# Case-insensitive comparison
mapExpression: "LOWER(email)"
```

## Unused Fields (Reserved)

The following fields exist in the repository schema but are not currently used. They are included in exports for completeness and future compatibility:

| Table | Field | Status |
|-------|-------|--------|
| `dc_table_column` | `enabled` | Implemented but may not be fully utilized in all code paths |
| `dc_table_map` | `mod_column` | Reserved for modification tracking |
| `dc_table_map` | `table_filter` | Reserved for row filtering during comparison |
| `dc_table_column_map` | `map_type` | Defaults to "column"; other values reserved for future use |

## Workflow Examples

### 1. Initial Setup with Discovery, then Fine-tuning

```shell
# First, discover tables automatically
java -jar pgcompare.jar discover

# Export the discovered mappings
java -jar pgcompare.jar export-mapping --file mappings.yaml

# Edit mappings.yaml in your editor to:
# - Disable tables you don't want to compare
# - Add mapExpressions for columns that need transformation
# - Mark additional columns as primary keys

# Import your changes
java -jar pgcompare.jar import-mapping --file mappings.yaml --overwrite
```

### 2. Copying Mappings Between Projects

```shell
# Export from project 1
java -jar pgcompare.jar export-mapping -p 1 --file prod-mappings.yaml

# Edit the file if needed, then import to project 2
java -jar pgcompare.jar import-mapping -p 2 --file prod-mappings.yaml
```

### 3. Selective Updates

```shell
# Export only order-related tables
java -jar pgcompare.jar export-mapping --table "order*" --file order-mappings.yaml

# Make changes, then import only those tables
java -jar pgcompare.jar import-mapping --file order-mappings.yaml --table "order*" --overwrite
```

## Tips

1. **Always back up before overwriting**: The `--overwrite` flag will delete existing table mappings before importing.

2. **Use table filters**: For large projects, export/import subsets of tables to make files more manageable.

3. **Version control your mappings**: YAML files work well with Git and other version control systems.

4. **Validate before importing**: Review the YAML file structure before importing to avoid errors.

5. **Test with a small subset**: When making significant changes, test with a few tables first before applying to all.

## Note on Null Values

The YAML export omits fields that have null values to keep the file clean and readable. When importing, any omitted fields will use their default values. This is valid YAML/JSON behavior - `null` is a valid value, but omitting null fields produces cleaner output.
