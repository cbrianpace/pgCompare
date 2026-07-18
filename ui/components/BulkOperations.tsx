'use client';

import { useState } from 'react';
import { CheckSquare, Square, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';
import { toast } from '@/components/Toaster';

interface BulkOperationsProps {
  selectedIds: number[];
  totalCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkEnable: () => void;
  onBulkDisable: () => void;
  onBulkDelete?: () => void;
  entityName?: string;
}

export default function BulkOperations({
  selectedIds,
  totalCount,
  onSelectAll,
  onClearSelection,
  onBulkEnable,
  onBulkDisable,
  onBulkDelete,
  entityName = 'items',
}: BulkOperationsProps) {
  const [confirming, setConfirming] = useState<'enable' | 'disable' | 'delete' | null>(null);

  const handleAction = async (action: 'enable' | 'disable' | 'delete') => {
    if (confirming === action) {
      switch (action) {
        case 'enable':
          onBulkEnable();
          break;
        case 'disable':
          onBulkDisable();
          break;
        case 'delete':
          onBulkDelete?.();
          break;
      }
      setConfirming(null);
    } else {
      setConfirming(action);
      setTimeout(() => setConfirming(null), 3000);
    }
  };

  if (selectedIds.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-2 mb-4">
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
          {selectedIds.length} of {totalCount} {entityName} selected
        </span>
        
        <div className="flex items-center gap-2">
          <button
            onClick={onSelectAll}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Select all
          </button>
          <span className="text-gray-400">|</span>
          <button
            onClick={onClearSelection}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Clear selection
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => handleAction('enable')}
          className={`flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded transition-colors ${
            confirming === 'enable'
              ? 'bg-green-600 text-white'
              : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50'
          }`}
        >
          <ToggleRight className="h-4 w-4" />
          {confirming === 'enable' ? 'Confirm Enable' : 'Enable'}
        </button>

        <button
          onClick={() => handleAction('disable')}
          className={`flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded transition-colors ${
            confirming === 'disable'
              ? 'bg-yellow-600 text-white'
              : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 hover:bg-yellow-200 dark:hover:bg-yellow-900/50'
          }`}
        >
          <ToggleLeft className="h-4 w-4" />
          {confirming === 'disable' ? 'Confirm Disable' : 'Disable'}
        </button>

        {onBulkDelete && (
          <button
            onClick={() => handleAction('delete')}
            className={`flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded transition-colors ${
              confirming === 'delete'
                ? 'bg-red-600 text-white'
                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50'
            }`}
          >
            <Trash2 className="h-4 w-4" />
            {confirming === 'delete' ? 'Confirm Delete' : 'Delete'}
          </button>
        )}
      </div>
    </div>
  );
}
