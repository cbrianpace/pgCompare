'use client';

import { useEffect, useState } from 'react';
import { X, AlertTriangle, Code, ChevronDown, ChevronRight, Copy, Check, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';

interface OutOfSyncModalProps {
  tid: number;
  tableName: string;
  cid?: number | null;
  isOpen: boolean;
  onClose: () => void;
}

interface SourceTargetRow {
  pk: any;
  pk_hash: string | null;
  column_hash: string | null;
  compare_result: string | null;
  thread_nbr: number | null;
  fix_sql: string | null;
}

export default function OutOfSyncModal({ tid, tableName, cid, isOpen, onClose }: OutOfSyncModalProps) {
  const [sourceRows, setSourceRows] = useState<SourceTargetRow[]>([]);
  const [targetRows, setTargetRows] = useState<SourceTargetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'not_equal' | 'missing_source' | 'missing_target' | 'fix_sql'>('not_equal');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [copiedSql, setCopiedSql] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, tid, cid]);

  const loadData = async () => {
    setLoading(true);
    try {
      let url = `/api/tables/${tid}/out-of-sync`;
      if (cid) {
        url += `?cid=${cid}`;
      }
      const response = await fetch(url);
      const data = await response.json();
      
      setSourceRows(Array.isArray(data.source) ? data.source : []);
      setTargetRows(Array.isArray(data.target) ? data.target : []);
    } catch (error) {
      console.error('Failed to load out-of-sync data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleRow = (pkHash: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(pkHash)) {
      newExpanded.delete(pkHash);
    } else {
      newExpanded.add(pkHash);
    }
    setExpandedRows(newExpanded);
  };

  const copyToClipboard = async (sql: string, pkHash: string) => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopiedSql(pkHash);
      toast.success('SQL copied to clipboard');
      setTimeout(() => setCopiedSql(null), 2000);
    } catch (error) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const copyAllFixSql = async () => {
    const allSql = [...sourceRows, ...targetRows]
      .filter(row => row.fix_sql)
      .map(row => row.fix_sql)
      .join(';\n\n');
    
    if (allSql) {
      try {
        await navigator.clipboard.writeText(allSql + ';');
        toast.success('All fix SQL copied to clipboard');
      } catch (error) {
        toast.error('Failed to copy to clipboard');
      }
    }
  };

  if (!isOpen) return null;

  const notEqualSource = sourceRows.filter(row => row.compare_result === 'n');
  const notEqualTarget = targetRows.filter(row => row.compare_result === 'n');
  const missingInTarget = sourceRows.filter(row => row.compare_result === 'm');
  const missingInSource = targetRows.filter(row => row.compare_result === 'm');
  
  const allFixSql = [...sourceRows, ...targetRows].filter(row => row.fix_sql);
  const hasFixSql = allFixSql.length > 0;

  const renderTable = (rows: SourceTargetRow[], title: string, showFixSql: boolean = false) => (
    <div className="mb-6">
      <h4 className="text-md font-semibold text-gray-900 dark:text-white mb-3">{title}</h4>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No rows found</p>
      ) : (
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
              <tr>
                {showFixSql && (
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 w-8">
                  </th>
                )}
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                  Primary Key
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                  PK Hash
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                  Column Hash
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                  Thread
                </th>
                {showFixSql && (
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                    Fix SQL
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {rows.map((row, index) => {
                const pkHash = row.pk_hash || `row-${index}`;
                const isExpanded = expandedRows.has(pkHash);
                return (
                  <>
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      {showFixSql && (
                        <td className="px-3 py-2 border border-gray-200 dark:border-gray-600">
                          {row.fix_sql && (
                            <button
                              onClick={() => toggleRow(pkHash)}
                              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                            >
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          )}
                        </td>
                      )}
                      <td className="px-3 py-2 text-xs font-mono border border-gray-200 dark:border-gray-600">
                        {typeof row.pk === 'object' ? JSON.stringify(row.pk) : row.pk}
                      </td>
                      <td className="px-3 py-2 text-xs font-mono border border-gray-200 dark:border-gray-600 truncate max-w-xs">
                        {row.pk_hash || 'N/A'}
                      </td>
                      <td className="px-3 py-2 text-xs font-mono border border-gray-200 dark:border-gray-600 truncate max-w-xs">
                        {row.column_hash || 'N/A'}
                      </td>
                      <td className="px-3 py-2 text-xs text-center border border-gray-200 dark:border-gray-600">
                        {row.thread_nbr || '-'}
                      </td>
                      {showFixSql && (
                        <td className="px-3 py-2 text-xs text-center border border-gray-200 dark:border-gray-600">
                          {row.fix_sql ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded text-xs">
                              <Code className="h-3 w-3" />
                              Available
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                      )}
                    </tr>
                    {showFixSql && row.fix_sql && isExpanded && (
                      <tr key={`${index}-sql`} className="bg-gray-50 dark:bg-gray-900">
                        <td colSpan={6} className="px-3 py-3 border border-gray-200 dark:border-gray-600">
                          <div className="flex items-start justify-between gap-2">
                            <pre className="text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-all flex-1 bg-white dark:bg-gray-800 p-2 rounded border">
                              {row.fix_sql}
                            </pre>
                            <button
                              onClick={() => copyToClipboard(row.fix_sql!, pkHash)}
                              className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                              title="Copy to clipboard"
                            >
                              {copiedSql === pkHash ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : (
                                <Copy className="h-4 w-4 text-gray-500" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderFixSqlTab = () => (
    <div className="space-y-4">
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-4">
        <div className="flex items-start gap-2">
          <FlaskConical className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-amber-800 dark:text-amber-200">
            <p className="font-medium">Experimental Feature</p>
            <p className="mt-1">These SQL statements are designed to be executed on the <strong>target database</strong> to make it match the source. Review carefully before executing.</p>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <h4 className="text-md font-semibold text-gray-900 dark:text-white">
          Generated Fix SQL ({allFixSql.length} statements)
        </h4>
        {allFixSql.length > 0 && (
          <button
            onClick={copyAllFixSql}
            className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800 rounded text-sm flex items-center gap-2"
          >
            <Copy className="h-4 w-4" />
            Copy All
          </button>
        )}
      </div>
      
      {allFixSql.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
          No fix SQL available. Run a check job with "Generate Fix SQL" enabled.
        </p>
      ) : (
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {allFixSql.map((row, index) => (
            <div key={index} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  PK: <span className="font-mono">{typeof row.pk === 'object' ? JSON.stringify(row.pk) : row.pk}</span>
                </div>
                <button
                  onClick={() => copyToClipboard(row.fix_sql!, row.pk_hash || `sql-${index}`)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                  title="Copy to clipboard"
                >
                  {copiedSql === (row.pk_hash || `sql-${index}`) ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4 text-gray-500" />
                  )}
                </button>
              </div>
              <pre className="text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-all bg-gray-50 dark:bg-gray-900 p-2 rounded">
                {row.fix_sql}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              Out of Sync Details - {tableName}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400">Not Equal Rows</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                {notEqualSource.length}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400">Missing in Target</p>
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {missingInTarget.length}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400">Missing in Source</p>
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {missingInSource.length}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400">Fix SQL Available</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {allFixSql.length}
              </p>
            </div>
          </div>
        </div>

        <div className="border-b border-gray-200 dark:border-gray-700 px-6">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab('not_equal')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'not_equal'
                  ? 'border-red-600 text-red-600 dark:text-red-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Not Equal ({notEqualSource.length})
            </button>
            <button
              onClick={() => setActiveTab('missing_target')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'missing_target'
                  ? 'border-orange-600 text-orange-600 dark:text-orange-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Missing in Target ({missingInTarget.length})
            </button>
            <button
              onClick={() => setActiveTab('missing_source')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'missing_source'
                  ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Missing in Source ({missingInSource.length})
            </button>
            {hasFixSql && (
              <button
                onClick={() => setActiveTab('fix_sql')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1 ${
                  activeTab === 'fix_sql'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                <Code className="h-4 w-4" />
                Fix SQL ({allFixSql.length})
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-8">Loading out-of-sync details...</div>
          ) : (
            <>
              {activeTab === 'not_equal' && (
                <div className="space-y-6">
                  {renderTable(notEqualSource, 'Source Rows (Different)', hasFixSql)}
                  {renderTable(notEqualTarget, 'Target Rows (Different)', hasFixSql)}
                  {notEqualSource.length === 0 && notEqualTarget.length === 0 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                      No differing rows found
                    </p>
                  )}
                </div>
              )}

              {activeTab === 'missing_target' && (
                <>
                  {renderTable(missingInTarget, 'Rows in Source but Missing in Target', hasFixSql)}
                </>
              )}

              {activeTab === 'missing_source' && (
                <>
                  {renderTable(missingInSource, 'Rows in Target but Missing in Source', hasFixSql)}
                </>
              )}

              {activeTab === 'fix_sql' && renderFixSqlTab()}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
