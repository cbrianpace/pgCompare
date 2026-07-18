# pgCompare v0.6.0 Release Notes

## New Features

### Server Mode
pgCompare can now run as a daemon server that polls a work queue for jobs. This enables:

- **Multi-server deployment**: Run multiple pgCompare instances that automatically pick up work
- **Work queue scheduling**: Submit compare, check, or discover jobs via the UI or external tools
- **Job control signals**: Pause, resume, stop, or terminate running jobs gracefully
- **Real-time progress tracking**: Monitor job progress at the table level

#### Usage
```shell
# Start pgCompare in server mode
java -jar pgcompare.jar server --name my-server-01

# Server mode only requires repository connection info in properties file
# Source/target database connections are loaded from project configuration
```

#### Command Line Options
- `-n|--name <server name>`: Set the server name (default: pgcompare-server)

### UI Enhancements

#### Dashboard Overview
- Real-time server status monitoring with heartbeat tracking
- Running, pending, and completed job overview
- Quick access to job details and progress

#### Job Scheduling & Management
- Schedule compare, check, or discover jobs from the UI
- Target specific servers or let any available server pick up work
- Set job priority (1-10) for queue ordering
- Optional scheduled start time for deferred execution
- Real-time job progress with per-table status

#### Job Control
- **Pause**: Temporarily halt a running job (preserves progress)
- **Resume**: Continue a paused job
- **Stop**: Gracefully stop a job (completes current table)
- **Terminate**: Immediately stop a job

#### Navigation & Search
- Search/filter projects and tables in the navigation tree
- Breadcrumb navigation component
- Connection status indicator with auto-refresh

#### Data Management
- Bulk operations for enabling/disabling multiple tables
- Export data to CSV or JSON format
- Pagination for large result sets

#### User Experience
- Toast notifications replace browser alerts
- Loading skeletons for better perceived performance
- Keyboard shortcuts support

### Signal Handling & Graceful Shutdown
pgCompare now properly handles OS signals for clean shutdown and query cancellation:

- **SIGINT (Ctrl+C)**: Graceful shutdown - completes the current table comparison before exiting
- **SIGTERM**: Immediate termination - cancels all running database queries and exits
- **SIGHUP**: Reload configuration from properties file without restart

Active database statements are tracked and can be cancelled on demand, preventing orphaned queries on the source/target databases during forced shutdowns.

## Database Schema Changes

**Note:** Drop and recreate the repository to upgrade to 0.6.0.

New tables for server mode:
- `dc_server`: Server registration and heartbeat tracking
- `dc_work_queue`: Job queue with priority scheduling
- `dc_job_control`: Control signals for running jobs
- `dc_job_progress`: Per-table progress tracking

## API Endpoints

New REST API endpoints:
- `GET /api/servers`: List registered servers
- `GET /api/jobs`: List jobs with filtering
- `POST /api/jobs`: Submit a new job
- `GET /api/jobs/{id}`: Get job details
- `DELETE /api/jobs/{id}`: Delete a completed/failed job
- `POST /api/jobs/{id}/control`: Send control signal (pause/resume/stop/terminate)
- `GET /api/jobs/{id}/progress`: Get job progress with per-table status
- `GET /api/health`: Check database connection status

## Configuration

### Server Mode Properties
Server mode only requires repository connection properties:
```properties
repo-host=localhost
repo-port=5432
repo-dbname=pgcompare
repo-schema=pgcompare
repo-user=postgres
repo-password=secret
```

Project-specific source/target database settings are loaded from the `dc_project.project_config` column.

## Upgrade Guide

1. Stop all running pgCompare instances
2. Backup your current repository database
3. Drop the existing pgCompare schema: `DROP SCHEMA pgcompare CASCADE;`
4. Run `java -jar pgcompare.jar init` to create the new schema
5. Reconfigure your projects and table mappings

## Known Limitations

- Server mode requires PostgreSQL 14+ for `SKIP LOCKED` support
- Job control signals may have up to 5 second delay before processing
- Servers are marked offline after 2 minutes without heartbeat
