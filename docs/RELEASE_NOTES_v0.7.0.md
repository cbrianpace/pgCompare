# pgCompare v0.7.0 Release Notes

## Overview

pgCompare v0.7.0 focuses on SQL Server correctness fixes and dependency updates. This release does not introduce repository schema changes.

## Bug Fixes

### SQL Server Binary and Rowversion Handling

SQL Server `binary`, `varbinary`, and `rowversion` columns are now handled correctly during comparison.

Previously, SQL Server binary columns could fall through to PostgreSQL-specific `md5()` syntax, causing source-side queries to fail. SQL Server `rowversion` columns, which the JDBC driver reports as `timestamp`, could also be treated as temporal values instead of binary tokens.

v0.7.0 fixes these cases by:
- Using SQL Server `HASHBYTES('MD5', ...)` for binary comparisons.
- Rendering SQL Server binary hashes as lowercase hex values so they match PostgreSQL `md5()` output.
- Routing SQL Server `timestamp`/`rowversion` metadata to binary handling before temporal casting.

### Locale-Safe SQL Server Number Formatting

SQL Server numeric comparison expressions now pin `FORMAT()` to the `en-US` culture.

Without an explicit culture, SQL Server `FORMAT()` uses the session language. Non-English sessions can emit comma decimal separators, while PostgreSQL `to_char()` emits periods, causing false numeric differences even when source and target data match.

Pinning `en-US` keeps numeric hash input stable across SQL Server session languages while preserving existing output for English sessions.

### Check Mode Clears Rows Deleted on Both Sides

`check` now handles rows that are absent from both source and target.

This can happen when a row is reported by `compare`, then deleted from both systems before `check` runs. The row is now treated as converged and the stale finding is cleared instead of raising an error and leaving the table permanently out of sync.

## Dependency Updates

The following dependencies were updated for the 0.7.0 release:

| Dependency | Previous | Updated |
|------------|----------|---------|
| `net.snowflake:snowflake-jdbc` | 4.0.1 | 4.3.4 |
| `com.microsoft.sqlserver:mssql-jdbc` | 13.2.1.jre11 | 13.6.0.jre11 |
| `com.ibm.db2:jcc` | 12.1.3.0 | 12.1.5.0 |
| `org.postgresql:postgresql` | 42.7.10 | 42.7.13 |
| `org.json:json` | 20251224 | 20260814 |

The Snowflake JDBC update addresses known driver vulnerabilities and is recommended for all users.

## Testing

The golden-master data type casting tests were expanded with SQL Server-specific coverage for:
- Binary hash generation with `HASHBYTES('MD5', ...)`
- `varbinary` dispatch through the generic casting entry point
- SQL Server `rowversion` dispatch to binary handling
- PostgreSQL `timestamp` regression coverage to ensure other platforms remain temporal
- SQL Server numeric formatting with invariant `en-US` culture

## Upgrade Guide

No repository schema changes are required to upgrade from v0.6.0 to v0.7.0.

Recommended upgrade steps:

1. Stop running pgCompare processes.
2. Install the v0.7.0 binaries or container image.
3. Re-run existing comparisons or `check` jobs as needed.
4. For SQL Server comparisons, re-run affected tables that contain numeric, binary, varbinary, or rowversion columns.

## Known Notes

- SQL Server binary support is implemented for hash comparison. Validate representative binary-heavy tables in your environment before relying on it for critical migration signoff.
- Cross-platform floating-point comparison can still require mapping expressions when source and target systems render approximate numeric values differently.
