'use client';

import { useState } from 'react';
import { Download, FileText, Table } from 'lucide-react';
import { toast } from '@/components/Toaster';

interface ExportButtonProps {
  data: any[];
  filename: string;
  headers?: { key: string; label: string }[];
}

export default function ExportButton({ data, filename, headers }: ExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const exportToCSV = () => {
    if (data.length === 0) {
      toast.error('No data to export');
      return;
    }

    const keys = headers 
      ? headers.map(h => h.key)
      : Object.keys(data[0]);
    
    const headerLabels = headers 
      ? headers.map(h => h.label)
      : keys;

    const csvContent = [
      headerLabels.join(','),
      ...data.map(row => 
        keys.map(key => {
          const value = row[key];
          if (value === null || value === undefined) return '';
          const stringValue = String(value);
          if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        }).join(',')
      )
    ].join('\n');

    downloadFile(csvContent, `${filename}.csv`, 'text/csv');
    toast.success('CSV exported successfully');
    setIsOpen(false);
  };

  const exportToJSON = () => {
    if (data.length === 0) {
      toast.error('No data to export');
      return;
    }

    const jsonContent = JSON.stringify(data, null, 2);
    downloadFile(jsonContent, `${filename}.json`, 'application/json');
    toast.success('JSON exported successfully');
    setIsOpen(false);
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
      >
        <Download className="h-4 w-4" />
        Export
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-20">
            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-t-lg"
            >
              <Table className="h-4 w-4" />
              Export as CSV
            </button>
            <button
              onClick={exportToJSON}
              className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-b-lg"
            >
              <FileText className="h-4 w-4" />
              Export as JSON
            </button>
          </div>
        </>
      )}
    </div>
  );
}
