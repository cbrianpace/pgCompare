export interface PropertyDefinition {
  key: string;
  label: string;
  description: string;
  defaultValue: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'password';
  options?: string[];
  category: 'system' | 'repository' | 'source' | 'target';
}

export const CONFIG_PROPERTIES: PropertyDefinition[] = [
  // System Settings (sorted alphabetically by key)
  { key: 'batch-commit-size', label: 'Batch Commit Size', description: 'Number of rows to commit per batch', defaultValue: '2000', type: 'number', category: 'system' },
  { key: 'batch-fetch-size', label: 'Batch Fetch Size', description: 'Number of rows to fetch per batch', defaultValue: '2000', type: 'number', category: 'system' },
  { key: 'batch-progress-report-size', label: 'Progress Report Size', description: 'Rows between progress reports', defaultValue: '1000000', type: 'number', category: 'system' },
  { key: 'column-hash-method', label: 'Hash Method', description: 'Method for hashing columns', defaultValue: 'database', type: 'select', options: ['database', 'hybrid', 'raw'], category: 'system' },
  { key: 'database-sort', label: 'Database Sort', description: 'Let database sort results', defaultValue: 'true', type: 'boolean', category: 'system' },
  { key: 'float-cast', label: 'Float Cast', description: 'Method for casting float/double to string', defaultValue: 'notation', type: 'select', options: ['notation', 'standard'], category: 'system' },
  { key: 'float-scale', label: 'Float Scale', description: 'Decimal places for float comparison', defaultValue: '3', type: 'number', category: 'system' },
  { key: 'job-logging-enabled', label: 'Job Logging', description: 'Log job output to dc_job_log table', defaultValue: 'false', type: 'boolean', category: 'system' },
  { key: 'loader-threads', label: 'Loader Threads', description: 'Number of loader threads (0=disabled)', defaultValue: '0', type: 'number', category: 'system' },
  { key: 'log-destination', label: 'Log Destination', description: 'Where to send logs', defaultValue: 'stdout', type: 'string', category: 'system' },
  { key: 'log-level', label: 'Log Level', description: 'Logging level', defaultValue: 'INFO', type: 'select', options: ['DEBUG', 'INFO', 'WARNING', 'ERROR'], category: 'system' },
  { key: 'message-queue-size', label: 'Message Queue Size', description: 'Size of message queue', defaultValue: '100', type: 'number', category: 'system' },
  { key: 'number-cast', label: 'Number Cast', description: 'Number casting method', defaultValue: 'notation', type: 'select', options: ['notation', 'standard'], category: 'system' },
  { key: 'observer-throttle', label: 'Observer Throttle', description: 'Enable observer throttling', defaultValue: 'true', type: 'boolean', category: 'system' },
  { key: 'observer-throttle-size', label: 'Throttle Size', description: 'Observer throttle threshold', defaultValue: '2000000', type: 'number', category: 'system' },
  { key: 'observer-vacuum', label: 'Observer Vacuum', description: 'Vacuum after observer operations', defaultValue: 'true', type: 'boolean', category: 'system' },
  { key: 'stage-table-parallel', label: 'Stage Parallel', description: 'Parallel workers for staging', defaultValue: '0', type: 'number', category: 'system' },
  { key: 'standard-number-format', label: 'Number Format', description: 'Format for standard number casting', defaultValue: '0000000000000000000000.0000000000000000000000', type: 'string', category: 'system' },

  // Repository Settings (sorted alphabetically by key)
  { key: 'repo-dbname', label: 'Database', description: 'Repository database name', defaultValue: 'pgcompare', type: 'string', category: 'repository' },
  { key: 'repo-host', label: 'Host', description: 'Repository host address', defaultValue: 'localhost', type: 'string', category: 'repository' },
  { key: 'repo-password', label: 'Password', description: 'Repository password', defaultValue: '', type: 'password', category: 'repository' },
  { key: 'repo-port', label: 'Port', description: 'Repository port number', defaultValue: '5432', type: 'number', category: 'repository' },
  { key: 'repo-schema', label: 'Schema', description: 'Repository schema name', defaultValue: 'pgcompare', type: 'string', category: 'repository' },
  { key: 'repo-sslmode', label: 'SSL Mode', description: 'Repository SSL mode', defaultValue: 'disable', type: 'select', options: ['disable', 'prefer', 'require', 'verify-ca', 'verify-full'], category: 'repository' },
  { key: 'repo-user', label: 'User', description: 'Repository username', defaultValue: 'pgcompare', type: 'string', category: 'repository' },

  // Source Database Settings (sorted alphabetically by key)
  { key: 'source-dbname', label: 'Database', description: 'Database name', defaultValue: 'postgres', type: 'string', category: 'source' },
  { key: 'source-host', label: 'Host', description: 'Host address', defaultValue: 'localhost', type: 'string', category: 'source' },
  { key: 'source-name', label: 'Service Name', description: 'Oracle service/SID name', defaultValue: '', type: 'string', category: 'source' },
  { key: 'source-password', label: 'Password', description: 'Password', defaultValue: '', type: 'password', category: 'source' },
  { key: 'source-port', label: 'Port', description: 'Port number', defaultValue: '5432', type: 'number', category: 'source' },
  { key: 'source-schema', label: 'Schema', description: 'Schema name', defaultValue: '', type: 'string', category: 'source' },
  { key: 'source-sslmode', label: 'SSL Mode', description: 'SSL mode', defaultValue: 'disable', type: 'select', options: ['disable', 'prefer', 'require', 'verify-ca', 'verify-full'], category: 'source' },
  { key: 'source-type', label: 'Type', description: 'Database type', defaultValue: 'postgres', type: 'select', options: ['postgres', 'oracle', 'db2', 'mariadb', 'mysql', 'mssql', 'snowflake'], category: 'source' },
  { key: 'source-user', label: 'User', description: 'Username', defaultValue: 'postgres', type: 'string', category: 'source' },
  { key: 'source-warehouse', label: 'Warehouse', description: 'Snowflake warehouse', defaultValue: 'compute_wh', type: 'string', category: 'source' },

  // Target Database Settings (sorted alphabetically by key)
  { key: 'target-dbname', label: 'Database', description: 'Database name', defaultValue: 'postgres', type: 'string', category: 'target' },
  { key: 'target-host', label: 'Host', description: 'Host address', defaultValue: 'localhost', type: 'string', category: 'target' },
  { key: 'target-name', label: 'Service Name', description: 'Oracle service/SID name', defaultValue: '', type: 'string', category: 'target' },
  { key: 'target-password', label: 'Password', description: 'Password', defaultValue: '', type: 'password', category: 'target' },
  { key: 'target-port', label: 'Port', description: 'Port number', defaultValue: '5432', type: 'number', category: 'target' },
  { key: 'target-schema', label: 'Schema', description: 'Schema name', defaultValue: '', type: 'string', category: 'target' },
  { key: 'target-sslmode', label: 'SSL Mode', description: 'SSL mode', defaultValue: 'disable', type: 'select', options: ['disable', 'prefer', 'require', 'verify-ca', 'verify-full'], category: 'target' },
  { key: 'target-type', label: 'Type', description: 'Database type', defaultValue: 'postgres', type: 'select', options: ['postgres', 'oracle', 'db2', 'mariadb', 'mysql', 'mssql', 'snowflake'], category: 'target' },
  { key: 'target-user', label: 'User', description: 'Username', defaultValue: 'postgres', type: 'string', category: 'target' },
  { key: 'target-warehouse', label: 'Warehouse', description: 'Snowflake warehouse', defaultValue: 'compute_wh', type: 'string', category: 'target' },
];

export const CATEGORY_LABELS: Record<string, string> = {
  system: 'System Settings',
  repository: 'Repository Database',
  source: 'Source Database',
  target: 'Target Database',
};

export function getPropertyDefinition(key: string): PropertyDefinition | undefined {
  return CONFIG_PROPERTIES.find(p => p.key === key);
}

export function isDefaultValue(key: string, value: string): boolean {
  const prop = getPropertyDefinition(key);
  return prop ? prop.defaultValue === value : false;
}

export function getFriendlyLabel(key: string): string {
  const prop = getPropertyDefinition(key);
  return prop?.label || key;
}
