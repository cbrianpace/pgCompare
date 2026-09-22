# pgCompare UI

A Next.js-based web application for viewing and editing pgCompare configuration data.

## Features

- **Database Authentication**: Secure login with PostgreSQL credentials stored locally (except password)
- **Project Management**: View and edit project configurations in a user-friendly table format
- **Results Visualization**: Charts and graphs showing comparison results and trends
- **Table Configuration**: Edit table settings, mappings, and column configurations
- **Navigation Tree**: Intuitive sidebar navigation for projects and tables with search/filter
- **Dark/Light Mode**: Toggle between dark and light themes, with preference saved locally
- **Responsive Design**: Modern, responsive UI built with Tailwind CSS

### Server Mode Features (introduced in v0.6.0)

- **Dashboard Overview**: Real-time server status monitoring with heartbeat tracking
- **Job Scheduling**: Schedule compare, check, or discover jobs from the UI
- **Job Management**: View running, pending, and completed jobs
- **Job Control**: Pause, resume, stop, or terminate running jobs
- **Progress Tracking**: Real-time per-table progress monitoring
- **Job Logs**: View job execution logs directly in the UI

## Prerequisites

- Node.js 22+ and npm
- PostgreSQL database with pgCompare schema

## Installation

1. Navigate to the ui directory:
```bash
cd ui
```

2. Install dependencies:
```bash
npm install
```

## Development

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Database Schema

The application expects a PostgreSQL repository initialized with the pgCompare schema. Core tables include:

- `dc_project` - Project configurations
- `dc_result` - Comparison results
- `dc_table` - Table definitions
- `dc_table_map` - Table mapping configurations (source/target)
- `dc_table_column` - Column definitions
- `dc_table_column_map` - Column mapping configurations
- `dc_source` / `dc_target` - Out-of-sync row findings and generated fix SQL

Server mode and job management use additional tables:

- `dc_server` - Server registration and heartbeat state
- `dc_job` - Job queue
- `dc_job_control` - Pause/resume/stop/terminate signals
- `dc_job_progress` - Per-table job progress
- `dc_job_log` - Optional job log messages

## Usage

1. **Login**: Enter your PostgreSQL connection details on the login page
2. **Select Project**: Click on a project in the navigation tree to view/edit configuration and results
3. **Select Table**: Click on a table under a project to view/edit table settings and mappings
4. **Edit Configurations**: Make changes in the UI and click "Save" to persist changes
5. **Column Mappings**: Click "Map" button on any column to edit column-specific mappings
6. **Toggle Theme**: Click the sun/moon icon in the top-right corner to switch themes

## Building for Production

Build the application:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

## Technology Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: PostgreSQL (via node-postgres)
- **Charts**: Recharts
- **Icons**: Lucide React

## License

See the main project LICENSE.md file.
