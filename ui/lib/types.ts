// Database types for pgCompare

export interface DBCredentials {
  host: string;
  port: number;
  database: string;
  schema: string;
  user: string;
  password: string;
}

export interface Project {
  pid: number;
  project_name: string;
  project_config: Record<string, any>;
}

export interface Table {
  tid: number;
  pid: number;
  table_alias: string;
  enabled: boolean;
  batch_nbr: number;
  parallel_degree: number;
}

export interface TableMap {
  tid: number;
  dest_type: string;
  schema_name: string;
  table_name: string;
  mod_column?: string;
  table_filter?: string;
  schema_preserve_case?: boolean;
  table_preserve_case?: boolean;
}

export interface TableColumn {
  column_id: number;
  tid: number;
  column_alias: string;
  enabled: boolean;
}

export interface TableColumnMap {
  tid: number;
  column_id: number;
  column_origin: string;
  column_name: string;
  data_type: string;
  data_class?: string;
  data_length?: number;
  number_precision?: number;
  number_scale?: number;
  column_nullable?: boolean;
  column_primarykey?: boolean;
  map_expression?: string;
  supported?: boolean;
  preserve_case?: boolean;
  map_type: string;
}

export interface Result {
  cid: number;
  rid?: number;
  tid?: number;
  table_name?: string;
  status?: string;
  compare_start?: Date;
  equal_cnt?: number;
  missing_source_cnt?: number;
  missing_target_cnt?: number;
  not_equal_cnt?: number;
  source_cnt?: number;
  target_cnt?: number;
  compare_end?: Date;
}

export interface Server {
  server_id: string;
  server_name: string;
  server_host: string;
  server_pid: number;
  status: 'active' | 'idle' | 'busy' | 'offline' | 'terminated';
  registered_at: Date;
  last_heartbeat: Date;
  current_job_id?: string;
  server_config?: Record<string, any>;
  seconds_since_heartbeat?: number;
}

export interface Job {
  job_id: string;
  pid: number;
  project_name?: string;
  job_type: 'compare' | 'check' | 'discover';
  status: 'pending' | 'scheduled' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  priority: number;
  batch_nbr: number;
  table_filter?: string;
  target_server_id?: string;
  assigned_server_id?: string;
  assigned_server_name?: string;
  created_at: Date;
  scheduled_at?: Date;
  started_at?: Date;
  completed_at?: Date;
  created_by?: string;
  job_config?: Record<string, any>;
  result_summary?: {
    totalTables?: number;
    completedTables?: number;
    failedTables?: number;
    totalSource?: number;
    totalEqual?: number;
    totalNotEqual?: number;
    totalMissing?: number;
  };
  error_message?: string;
  duration_seconds?: number;
  source?: 'server' | 'standalone' | 'api';
}

export interface JobProgress {
  job_id: string;
  tid: number;
  table_name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  started_at?: Date;
  completed_at?: Date;
  source_cnt?: number;
  target_cnt?: number;
  equal_cnt?: number;
  not_equal_cnt?: number;
  missing_source_cnt?: number;
  missing_target_cnt?: number;
  error_message?: string;
  duration_seconds?: number;
}

export interface JobProgressSummary {
  total_tables: number;
  completed_tables: number;
  running_tables: number;
  pending_tables: number;
  failed_tables: number;
  total_source: number;
  total_target: number;
  total_equal: number;
  total_not_equal: number;
  total_missing_source: number;
  total_missing_target: number;
}

