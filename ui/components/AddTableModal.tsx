'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface AddTableModalProps {
  projectId: number;
  onClose: () => void;
  onTableCreated: (table: any) => void;
}

export default function AddTableModal({ projectId, onClose, onTableCreated }: AddTableModalProps) {
  const [tableAlias, setTableAlias] = useState('');
  const [batchNbr, setBatchNbr] = useState(0);
  const [parallelDegree, setParallelDegree] = useState(4);
  const [sourceSchema, setSourceSchema] = useState('');
  const [sourceTable, setSourceTable] = useState('');
  const [targetSchema, setTargetSchema] = useState('');
  const [targetTable, setTargetTable] = useState('');
  const [sourceSchemaPreserveCase, setSourceSchemaPreserveCase] = useState(false);
  const [sourceTablePreserveCase, setSourceTablePreserveCase] = useState(false);
  const [targetSchemaPreserveCase, setTargetSchemaPreserveCase] = useState(false);
  const [targetTablePreserveCase, setTargetTablePreserveCase] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!tableAlias.trim()) {
      setError('Table alias is required');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/tables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_alias: tableAlias.trim(),
          batch_nbr: batchNbr,
          parallel_degree: parallelDegree,
          source_schema: sourceSchema.trim() || undefined,
          source_table: sourceTable.trim() || undefined,
          target_schema: targetSchema.trim() || undefined,
          target_table: targetTable.trim() || undefined,
          source_schema_preserve_case: sourceSchemaPreserveCase,
          source_table_preserve_case: sourceTablePreserveCase,
          target_schema_preserve_case: targetSchemaPreserveCase,
          target_table_preserve_case: targetTablePreserveCase,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create table');
      }

      const newTable = await response.json();
      onTableCreated(newTable);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Add New Table</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Table Alias <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={tableAlias}
              onChange={(e) => setTableAlias(e.target.value)}
              placeholder="e.g., customers"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              A unique identifier for this table mapping
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Batch Number
              </label>
              <input
                type="number"
                value={batchNbr}
                onChange={(e) => setBatchNbr(parseInt(e.target.value) || 0)}
                min={0}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Parallel Degree
              </label>
              <input
                type="number"
                value={parallelDegree}
                onChange={(e) => setParallelDegree(parseInt(e.target.value) || 4)}
                min={1}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Source Table</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Schema
                </label>
                <input
                  type="text"
                  value={sourceSchema}
                  onChange={(e) => setSourceSchema(e.target.value)}
                  placeholder="e.g., public"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
                <label className="flex items-center gap-2 mt-2 text-xs text-gray-600 dark:text-gray-400">
                  <input
                    type="checkbox"
                    checked={sourceSchemaPreserveCase}
                    onChange={(e) => setSourceSchemaPreserveCase(e.target.checked)}
                    className="rounded"
                  />
                  Preserve case
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Table Name
                </label>
                <input
                  type="text"
                  value={sourceTable}
                  onChange={(e) => setSourceTable(e.target.value)}
                  placeholder="e.g., customers"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
                <label className="flex items-center gap-2 mt-2 text-xs text-gray-600 dark:text-gray-400">
                  <input
                    type="checkbox"
                    checked={sourceTablePreserveCase}
                    onChange={(e) => setSourceTablePreserveCase(e.target.checked)}
                    className="rounded"
                  />
                  Preserve case
                </label>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Target Table</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Schema
                </label>
                <input
                  type="text"
                  value={targetSchema}
                  onChange={(e) => setTargetSchema(e.target.value)}
                  placeholder="e.g., public"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
                <label className="flex items-center gap-2 mt-2 text-xs text-gray-600 dark:text-gray-400">
                  <input
                    type="checkbox"
                    checked={targetSchemaPreserveCase}
                    onChange={(e) => setTargetSchemaPreserveCase(e.target.checked)}
                    className="rounded"
                  />
                  Preserve case
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Table Name
                </label>
                <input
                  type="text"
                  value={targetTable}
                  onChange={(e) => setTargetTable(e.target.value)}
                  placeholder="e.g., customers"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
                <label className="flex items-center gap-2 mt-2 text-xs text-gray-600 dark:text-gray-400">
                  <input
                    type="checkbox"
                    checked={targetTablePreserveCase}
                    onChange={(e) => setTargetTablePreserveCase(e.target.checked)}
                    className="rounded"
                  />
                  Preserve case
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create Table'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
