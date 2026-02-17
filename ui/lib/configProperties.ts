export interface PropertyDefinition {
  key: string;
  description: string;
  defaultValue: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  options?: string[];
  category: 'system' | 'repository' | 'source' | 'target';
}

export const CONFIG_PROPERTIES: PropertyDefinition[] = [
  // System Settings
  { key: 'batch-fetch-size', description: 'Number of rows to fetch per batch', defaultValue: '2000', type: 'number', category: 'system' },
  { key: 'batch-commit-size', description: 'Number of rows to commit per batch', defaultValue: '2000', type: 'number', category: 'system' },
  { key: 'batch-progress-report-size', description: 'Rows between progress reports', defaultValue: '1000000', type: 'number', category: 'system' },
  { key: 'column-hash-method', description: 'Method for hashing columns', defaultValue: 'database', type: 'select', options: ['database', 'hybrid', 'raw'], category: 'system' },
  { key: 'database-sort', description: 'Let database sort results', defaultValue: 'true', type: 'boolean', category: 'system' },
  { key: 'float-scale', description: 'Decimal places for float comparison', defaultValue: '3', type: 'number', category: 'system' },
  { key: 'loader-threads', description: 'Number of loader threads (0=disabled)', defaultValue: '0', type: 'number', category: 'system' },
  { key: 'log-destination', description: 'Where to send logs', defaultValue: 'stdout', type: 'string', category: 'system' },
  { key: 'log-level', description: 'Logging level', defaultValue: 'INFO', type: 'select', options: ['INFO', 'WARNING', 'SEVERE', 'FINE', 'FINER', 'FINEST'], category: 'system' },
  { key: 'message-queue-size', description: 'Size of message queue', defaultValue: '1000', type: 'number', category: 'system' },
  { key: 'number-cast', description: 'Number casting method', defaultValue: 'notation', type: 'select', options: ['notation', 'standard'], category: 'system' },
  { key: 'observer-throttle', description: 'Enable observer throttling', defaultValue: 'true', type: 'boolean', category: 'system' },
  { key: 'observer-throttle-size', description: 'Observer throttle threshold', defaultValue: '2000000', type: 'number', category: 'system' },
  { key: 'observer-vacuum', description: 'Vacuum after observer operations', defaultValue: 'true', type: 'boolean', category: 'system' },
  { key: 'stage-table-parallel', description: 'Parallel workers for staging', defaultValue: '0', type: 'number', category: 'system' },
  { key: 'standard-number-format', description: 'Format for standard number casting', defaultValue: '0000000000000000000000.0000000000000000000000', type: 'string', category: 'system' },

  // Repository Settings
  { key: 'repo-dbname', description: 'Repository database name', defaultValue: 'pgcompare', type: 'string', category: 'repository' },
  { key: 'repo-host', description: 'Repository host', defaultValue: 'localhost', type: 'string', category: 'repository' },
  { key: 'repo-port', description: 'Repository port', defaultValue: '5432', type: 'number', category: 'repository' },
  { key: 'repo-schema', description: 'Repository schema', defaultValue: 'pgcompare', type: 'string', category: 'repository' },
  { key: 'repo-sslmode', description: 'Repository SSL mode', defaultValue: 'disable', type: 'select', options: ['disable', 'require', 'verify-ca', 'verify-full'], category: 'repository' },
  { key: 'repo-user', description: 'Repository user', defaultValue: 'pgcompare', type: 'string', category: 'repository' },

  // Source Database Settings
  { key: 'source-type', description: 'Source database type', defaultValue: 'postgres', type: 'select', options: ['postgres', 'oracle', 'db2', 'mariadb', 'mysql', 'mssql', 'snowflake'], category: 'source' },
  { key: 'source-dbname', description: 'Source database name', defaultValue: 'postgres', type: 'string', category: 'source' },
  { key: 'source-host', description: 'Source host', defaultValue: 'localhost', type: 'string', category: 'source' },
  { key: 'source-port', description: 'Source port', defaultValue: '5432', type: 'number', category: 'source' },
  { key: 'source-schema', description: 'Source schema', defaultValue: '', type: 'string', category: 'source' },
  { key: 'source-sslmode', description: 'Source SSL mode', defaultValue: 'disable', type: 'select', options: ['disable', 'require', 'verify-ca', 'verify-full'], category: 'source' },
  { key: 'source-user', description: 'Source user', defaultValue: 'postgres', type: 'string', category: 'source' },
  { key: 'source-warehouse', description: 'Snowflake warehouse (source)', defaultValue: 'compute_wh', type: 'string', category: 'source' },

  // Target Database Settings
  { key: 'target-type', description: 'Target database type', defaultValue: 'postgres', type: 'select', options: ['postgres', 'oracle', 'db2', 'mariadb', 'mysql', 'mssql', 'snowflake'], category: 'target' },
  { key: 'target-dbname', description: 'Target database name', defaultValue: 'postgres', type: 'string', category: 'target' },
  { key: 'target-host', description: 'Target host', defaultValue: 'localhost', type: 'string', category: 'target' },
  { key: 'target-port', description: 'Target port', defaultValue: '5432', type: 'number', category: 'target' },
  { key: 'target-schema', description: 'Target schema', defaultValue: '', type: 'string', category: 'target' },
  { key: 'target-sslmode', description: 'Target SSL mode', defaultValue: 'disable', type: 'select', options: ['disable', 'require', 'verify-ca', 'verify-full'], category: 'target' },
  { key: 'target-user', description: 'Target user', defaultValue: 'postgres', type: 'string', category: 'target' },
  { key: 'target-warehouse', description: 'Snowflake warehouse (target)', defaultValue: 'compute_wh', type: 'string', category: 'target' },
];

export const CATEGORY_LABELS: Record<string, string> = {
  system: 'System Settings',
  repository: 'Repository Settings',
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
