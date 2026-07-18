# pgCompare Reference Guide

## Database Schema

pgCompare uses a PostgreSQL repository database to store project configurations, table mappings, comparison results, and server mode job management.

### Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                     pgCompare Schema ERD                                        │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐          ┌──────────────────┐          ┌──────────────────────────┐
│   dc_project     │          │   dc_server      │          │       dc_job             │
├──────────────────┤          ├──────────────────┤          ├──────────────────────────┤
│ *pid             │◄─────────│ server_id        │          │ *job_id                  │
│  project_name    │     │    │ server_name      │     ┌───►│  pid                     │◄───┐
│  project_config  │     │    │ server_host      │     │    │  job_type                │    │
└────────┬─────────┘     │    │ server_pid       │     │    │  status                  │    │
         │               │    │ status           │     │    │  priority                │    │
         │               │    │ registered_at    │     │    │  batch_nbr               │    │
         │1              │    │ last_heartbeat   │     │    │  table_filter            │    │
         │               │    │ current_job_id   │     │    │  target_server_id ───────┼────┤
         │               │    │ server_config    │     │    │  assigned_server_id ─────┼────┤
         │               │    └──────────────────┘     │    │  created_at              │    │
         │               │                             │    │  scheduled_at            │    │
         │               └─────────────────────────────┼────│  started_at              │    │
         │                                             │    │  completed_at            │    │
         ▼N                                            │    │  created_by              │    │
┌──────────────────┐                                   │    │  job_config              │    │
│    dc_table      │                                   │    │  result_summary          │    │
├──────────────────┤                                   │    │  error_message           │    │
│ *tid             │◄──────────────────────────────────┘    └────────────┬─────────────┘    │
│  pid             │                                                     │                  │
│  table_alias     │                                                     │1                 │
│  enabled         │                                                     │                  │
│  batch_nbr       │                                                     ▼N                 │
│  parallel_degree │     ┌──────────────────────────┐     ┌──────────────────────────┐     │
└────────┬─────────┘     │    dc_job_control        │     │    dc_job_progress       │     │
         │               ├──────────────────────────┤     ├──────────────────────────┤     │
         │1              │ *control_id              │     │ *job_id ─────────────────┼─────┘
         │               │  job_id ─────────────────┼────►│ *tid                     │
         │               │  signal                  │     │  table_name              │
         ├───────┬───────│  requested_at            │     │  status                  │
         │       │       │  processed_at            │     │  started_at              │
         │       │       │  requested_by            │     │  completed_at            │
         ▼N      │       └──────────────────────────┘     │  source_cnt              │
┌────────────────┐│                                       │  target_cnt              │
│  dc_table_map  ││                                       │  equal_cnt               │
├────────────────┤│                                       │  not_equal_cnt           │
│ *tid           ││                                       │  missing_source_cnt      │
│ *dest_type     ││                                       │  missing_target_cnt      │
│ *schema_name   ││                                       │  error_message           │
│ *table_name    ││                                       └──────────────────────────┘
│  mod_column    ││
│  table_filter  ││
│  schema_pres...││
│  table_pres... ││
└────────────────┘│
                  │
                  ▼N
         ┌──────────────────────┐
         │  dc_table_column     │
         ├──────────────────────┤
         │ *column_id           │◄───────────┐
         │  tid                 │            │
         │  column_alias        │            │1
         │  enabled             │            │
         └──────────┬───────────┘            │
                    │                        │
                    │1                       │
                    │                        │
                    ▼N                       │
         ┌──────────────────────┐            │
         │ dc_table_column_map  │            │
         ├──────────────────────┤            │
         │  tid                 │            │
         │ *column_id ──────────┼────────────┘
         │ *column_origin       │
         │ *column_name         │
         │  data_type           │
         │  data_class          │
         │  data_length         │
         │  number_precision    │       ┌──────────────────────┐
         │  number_scale        │       │  dc_table_history    │
         │  column_nullable     │       ├──────────────────────┤
         │  column_primarykey   │       │  tid                 │
         │  map_expression      │       │  batch_nbr           │
         │  supported           │       │  start_dt            │
         │  preserve_case       │       │  end_dt              │
         │  map_type            │       │  action_result       │
         └──────────────────────┘       │  row_count           │
                                        └──────────────────────┘

         ┌──────────────────────┐       ┌──────────────────────┐
         │     dc_source        │       │     dc_target        │
         ├──────────────────────┤       ├──────────────────────┤
         │  tid                 │       │  tid                 │
         │  table_name          │       │  table_name          │
         │  batch_nbr           │       │  batch_nbr           │
         │  pk                  │       │  pk                  │
         │  pk_hash             │       │  pk_hash             │
         │  column_hash         │       │  column_hash         │
         │  compare_result      │       │  compare_result      │
         │  thread_nbr          │       │  thread_nbr          │
         └──────────────────────┘       └──────────────────────┘

         ┌──────────────────────┐
         │     dc_result        │
         ├──────────────────────┤
         │ *cid                 │
         │  rid                 │
         │  tid                 │
         │  table_name          │
         │  status              │
         │  compare_start       │
         │  equal_cnt           │
         │  missing_source_cnt  │
         │  missing_target_cnt  │
         │  not_equal_cnt       │
         │  source_cnt          │
         │  target_cnt          │
         │  compare_end         │
         └──────────────────────┘

Legend:
  * = Primary Key column(s)
  ─► = Foreign Key relationship
  1  = One side of relationship
  N  = Many side of relationship
```

---

## Table Reference

### Core Tables

#### dc_project
Stores project configurations for comparison jobs.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| pid | bigint | NO | auto-generated | Project ID (Primary Key) |
| project_name | text | NO | 'default' | Name of the project |
| project_config | jsonb | YES | NULL | Project configuration in JSON format |

#### dc_table
Defines tables to be compared within a project.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| tid | bigint | NO | auto-generated | Table ID (Primary Key) |
| pid | bigint | NO | 1 | Project ID (Foreign Key to dc_project) |
| table_alias | text | YES | NULL | Alias name for the table |
| enabled | boolean | YES | true | Whether table comparison is enabled |
| batch_nbr | integer | YES | 1 | Batch number for grouping |
| parallel_degree | integer | YES | 1 | Degree of parallelism for comparison |

#### dc_table_map
Maps source/target schema and table names for each table definition.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| tid | bigint | NO | - | Table ID (Primary Key, FK to dc_table) |
| dest_type | varchar(20) | NO | 'target' | Destination type: 'source' or 'target' (Primary Key) |
| schema_name | text | NO | - | Schema name (Primary Key) |
| table_name | text | NO | - | Table name (Primary Key) |
| mod_column | varchar(200) | YES | NULL | Modification tracking column |
| table_filter | varchar(200) | YES | NULL | WHERE clause filter for the table |
| schema_preserve_case | boolean | YES | false | Preserve schema name case |
| table_preserve_case | boolean | YES | false | Preserve table name case |

#### dc_table_column
Defines column aliases for table comparisons.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| column_id | bigint | NO | auto-generated | Column ID (Primary Key) |
| tid | bigint | NO | - | Table ID (Foreign Key to dc_table) |
| column_alias | text | NO | - | Alias name for the column |
| enabled | boolean | YES | true | Whether column is included in comparison |

#### dc_table_column_map
Maps column details between source and target systems.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| column_id | bigint | NO | - | Column ID (Primary Key, FK to dc_table_column) |
| column_origin | varchar(10) | NO | 'source' | Origin: 'source' or 'target' (Primary Key) |
| column_name | text | NO | - | Column name (Primary Key) |
| tid | bigint | NO | - | Table ID |
| data_type | text | NO | - | Data type |
| data_class | varchar(20) | YES | 'string' | Data classification |
| data_length | integer | YES | NULL | Data length |
| number_precision | integer | YES | NULL | Numeric precision |
| number_scale | integer | YES | NULL | Numeric scale |
| column_nullable | boolean | YES | true | Whether column allows NULL |
| column_primarykey | boolean | YES | false | Whether column is part of primary key |
| map_expression | text | YES | NULL | Custom mapping expression |
| supported | boolean | YES | true | Whether data type is supported |
| preserve_case | boolean | YES | false | Preserve column name case |
| map_type | varchar(15) | NO | 'column' | Mapping type |

---

### Comparison Tables

#### dc_source
Temporary storage for source database row hashes during comparison.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| tid | bigint | YES | NULL | Table ID |
| table_name | text | YES | NULL | Table name |
| batch_nbr | integer | YES | NULL | Batch number |
| pk | jsonb | YES | NULL | Primary key values as JSON |
| pk_hash | varchar(100) | YES | NULL | Hash of primary key |
| column_hash | varchar(100) | YES | NULL | Hash of row columns |
| compare_result | char(1) | YES | NULL | Comparison result code |
| thread_nbr | integer | YES | NULL | Thread number for parallel processing |

#### dc_target
Temporary storage for target database row hashes during comparison.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| tid | bigint | YES | NULL | Table ID |
| table_name | text | YES | NULL | Table name |
| batch_nbr | integer | YES | NULL | Batch number |
| pk | jsonb | YES | NULL | Primary key values as JSON |
| pk_hash | varchar(100) | YES | NULL | Hash of primary key |
| column_hash | varchar(100) | YES | NULL | Hash of row columns |
| compare_result | char(1) | YES | NULL | Comparison result code |
| thread_nbr | integer | YES | NULL | Thread number for parallel processing |

#### dc_result
Stores comparison results summary for each table.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| cid | serial | NO | auto-generated | Comparison ID (Primary Key) |
| rid | numeric | YES | NULL | Run ID |
| tid | bigint | YES | NULL | Table ID |
| table_name | text | YES | NULL | Table name |
| status | varchar | YES | NULL | Comparison status |
| compare_start | timestamptz | YES | NULL | Comparison start time |
| compare_end | timestamptz | YES | NULL | Comparison end time |
| equal_cnt | integer | YES | NULL | Count of equal rows |
| missing_source_cnt | integer | YES | NULL | Count of rows missing in source |
| missing_target_cnt | integer | YES | NULL | Count of rows missing in target |
| not_equal_cnt | integer | YES | NULL | Count of rows that differ |
| source_cnt | integer | YES | NULL | Total source row count |
| target_cnt | integer | YES | NULL | Total target row count |

#### dc_table_history
Historical record of table comparison operations.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| tid | bigint | NO | - | Table ID |
| batch_nbr | integer | NO | - | Batch number |
| start_dt | timestamptz | NO | - | Operation start time |
| end_dt | timestamptz | YES | NULL | Operation end time |
| action_result | jsonb | YES | NULL | Result details as JSON |
| row_count | bigint | YES | NULL | Number of rows processed |

---

### Server Mode Tables

#### dc_server
Registers pgCompare server instances running in daemon mode.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| server_id | uuid | NO | gen_random_uuid() | Server ID (Primary Key) |
| server_name | text | NO | - | Human-readable server name |
| server_host | text | NO | - | Hostname where server is running |
| server_pid | bigint | NO | - | Process ID of the server |
| status | varchar(20) | NO | 'active' | Server status |
| registered_at | timestamptz | NO | current_timestamp | When server registered |
| last_heartbeat | timestamptz | NO | current_timestamp | Last heartbeat timestamp |
| current_job_id | uuid | YES | NULL | Currently executing job ID |
| server_config | jsonb | YES | NULL | Server configuration |

**Status Values:**
- `active` - Server is active and ready
- `idle` - Server is idle, waiting for work
- `busy` - Server is processing a job
- `offline` - Server has not sent heartbeat recently
- `terminated` - Server has been shut down

#### dc_job
Queue of comparison jobs to be executed by servers.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| job_id | uuid | NO | gen_random_uuid() | Job ID (Primary Key) |
| pid | bigint | NO | - | Project ID (Foreign Key to dc_project) |
| job_type | varchar(20) | NO | 'compare' | Type of job |
| status | varchar(20) | NO | 'pending' | Job status |
| priority | integer | NO | 5 | Priority (1-10, higher = more urgent) |
| batch_nbr | integer | NO | 0 | Batch number to process |
| table_filter | text | YES | NULL | Filter to limit tables |
| target_server_id | uuid | YES | NULL | Specific server to run on (NULL = any) |
| assigned_server_id | uuid | YES | NULL | Server that claimed the job |
| created_at | timestamptz | NO | current_timestamp | When job was created |
| scheduled_at | timestamptz | YES | NULL | When job should start |
| started_at | timestamptz | YES | NULL | When job actually started |
| completed_at | timestamptz | YES | NULL | When job completed |
| created_by | text | YES | NULL | Who created the job |
| job_config | jsonb | YES | NULL | Additional job configuration |
| result_summary | jsonb | YES | NULL | Summary of results |
| error_message | text | YES | NULL | Error message if failed |

**Job Types:**
- `compare` - Full comparison of tables
- `check` - Quick row count check
- `discover` - Discover tables and columns

**Status Values:**
- `pending` - Waiting to be claimed
- `scheduled` - Scheduled for future execution
- `running` - Currently executing
- `paused` - Temporarily paused
- `completed` - Successfully completed
- `failed` - Failed with error
- `cancelled` - Cancelled by user

#### dc_job_control
Control signals for managing running jobs.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| control_id | serial | NO | auto-generated | Control ID (Primary Key) |
| job_id | uuid | NO | - | Job ID (Foreign Key to dc_job) |
| signal | varchar(20) | NO | - | Control signal |
| requested_at | timestamptz | NO | current_timestamp | When signal was sent |
| processed_at | timestamptz | YES | NULL | When signal was processed |
| requested_by | text | YES | NULL | Who sent the signal |

**Signal Values:**
- `pause` - Pause the job after current table
- `resume` - Resume a paused job
- `stop` - Stop gracefully after current table
- `terminate` - Stop immediately

#### dc_job_progress
Tracks progress of running jobs at the table level.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| job_id | uuid | NO | - | Job ID (Primary Key, FK to dc_job) |
| tid | bigint | NO | - | Table ID (Primary Key) |
| table_name | text | NO | - | Table name |
| status | varchar(20) | NO | 'pending' | Table comparison status |
| started_at | timestamptz | YES | NULL | When table comparison started |
| completed_at | timestamptz | YES | NULL | When table comparison completed |
| source_cnt | bigint | YES | 0 | Source row count |
| target_cnt | bigint | YES | 0 | Target row count |
| equal_cnt | bigint | YES | 0 | Count of equal rows |
| not_equal_cnt | bigint | YES | 0 | Count of differing rows |
| missing_source_cnt | bigint | YES | 0 | Rows missing in source |
| missing_target_cnt | bigint | YES | 0 | Rows missing in target |
| error_message | text | YES | NULL | Error message if failed |

**Status Values:**
- `pending` - Waiting to be processed
- `running` - Currently being compared
- `completed` - Successfully completed
- `failed` - Failed with error
- `skipped` - Skipped (e.g., disabled)

---

## Indexes

| Index Name | Table | Columns | Purpose |
|------------|-------|---------|---------|
| dc_result_idx1 | dc_result | table_name, compare_start | Query results by table and time |
| dc_table_history_idx1 | dc_table_history | tid, start_dt | Query history by table and time |
| dc_table_idx1 | dc_table | table_alias | Lookup tables by alias |
| dc_table_column_idx1 | dc_table_column | column_alias, tid, column_id | Lookup columns by alias |
| dc_server_idx1 | dc_server | status, last_heartbeat | Find active servers |
| dc_job_idx1 | dc_job | status, priority DESC, created_at | Claim next job by priority |
| dc_job_idx2 | dc_job | pid, status | Query jobs by project |

---

## Foreign Keys

| Constraint | Table | Column(s) | References | On Delete |
|------------|-------|-----------|------------|-----------|
| dc_table_column_fk | dc_table_column | tid | dc_table(tid) | CASCADE |
| dc_table_column_map_fk | dc_table_column_map | column_id | dc_table_column(column_id) | CASCADE |
| dc_table_map_fk | dc_table_map | tid | dc_table(tid) | CASCADE |
| dc_job_fk1 | dc_job | pid | dc_project(pid) | CASCADE |
| dc_job_control_fk1 | dc_job_control | job_id | dc_job(job_id) | CASCADE |
| dc_job_progress_fk1 | dc_job_progress | job_id | dc_job(job_id) | CASCADE |

---

## Functions

### dc_copy_table(p_pid integer, p_tid integer)
Duplicates a table configuration including all mappings and column definitions.

**Parameters:**
- `p_pid` - Project ID
- `p_tid` - Table ID to copy

**Returns:** The new table ID (bigint)

**Usage:**
```sql
SELECT pgcompare.dc_copy_table(1, 5);
```
