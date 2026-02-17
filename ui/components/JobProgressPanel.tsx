'use client';

import { useEffect, useState } from 'react';
import { X, Pause, Play, StopCircle, AlertTriangle, CheckCircle, Clock, RefreshCw } from 'lucide-react';
import { Job, JobProgress, JobProgressSummary } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/components/Toaster';

interface JobProgressPanelProps {
  jobId: string;
  onClose: () => void;
}

export default function JobProgressPanel({ jobId, onClose }: JobProgressPanelProps) {
  const [job, setJob] = useState<Job | null>(null);
  const [progress, setProgress] = useState<JobProgress[]>([]);
  const [summary, setSummary] = useState<JobProgressSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, [jobId]);

  const loadData = async () => {
    try {
      const [jobRes, progressRes] = await Promise.all([
        fetch(`/api/jobs/${jobId}`),
        fetch(`/api/jobs/${jobId}/progress`)
      ]);
      
      const jobData = await jobRes.json();
      const progressData = await progressRes.json();
      
      setJob(jobData);
      setProgress(progressData.tables || []);
      setSummary(progressData.summary || null);
    } catch (error) {
      console.error('Failed to load job data:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendSignal = async (signal: string) => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal }),
      });

      if (!response.ok) {
        throw new Error('Failed to send signal');
      }

      toast.success(`${signal} signal sent`);
      loadData();
    } catch (error) {
      console.error('Failed to send signal:', error);
      toast.error('Failed to send control signal');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'failed':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'pending':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
      case 'skipped':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      </div>
    );
  }

  if (!job) {
    return null;
  }

  const progressPercent = summary 
    ? Math.round((summary.completed_tables / summary.total_tables) * 100) 
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Job Progress - {job.project_name || `Project ${job.pid}`}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {job.job_type} • Started {job.started_at ? formatDistanceToNow(new Date(job.started_at), { addSuffix: true }) : 'pending'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(job.status === 'running' || job.status === 'paused') && (
              <>
                {job.status === 'running' ? (
                  <button
                    onClick={() => sendSignal('pause')}
                    className="p-2 text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 rounded"
                    title="Pause"
                  >
                    <Pause className="h-5 w-5" />
                  </button>
                ) : (
                  <button
                    onClick={() => sendSignal('resume')}
                    className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"
                    title="Resume"
                  >
                    <Play className="h-5 w-5" />
                  </button>
                )}
                <button
                  onClick={() => sendSignal('stop')}
                  className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                  title="Stop gracefully"
                >
                  <StopCircle className="h-5 w-5" />
                </button>
              </>
            )}
            <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        {summary && (
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {summary.completed_tables} of {summary.total_tables} tables
              </span>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {progressPercent}%
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            
            {/* Stats */}
            <div className="grid grid-cols-4 gap-4 mt-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {(summary.total_equal || 0).toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Equal</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {(summary.total_not_equal || 0).toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Not Equal</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                  {((summary.total_missing_source || 0) + (summary.total_missing_target || 0)).toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Missing</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                  {summary.failed_tables}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Failed</p>
              </div>
            </div>
          </div>
        )}

        {/* Table Progress */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">Table</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">Status</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300">Equal</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300">Not Equal</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300">Missing</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {progress.map((table) => (
                <tr key={table.tid} className={table.status === 'running' ? 'bg-blue-50 dark:bg-blue-900/10' : ''}>
                  <td className="px-4 py-2 font-medium">{table.table_name}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-1 rounded text-xs ${getStatusColor(table.status)}`}>
                      {table.status === 'running' && <RefreshCw className="inline h-3 w-3 mr-1 animate-spin" />}
                      {table.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right text-green-600 dark:text-green-400">
                    {(table.equal_cnt || 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className={table.not_equal_cnt ? 'text-red-600 dark:text-red-400 font-medium' : ''}>
                      {(table.not_equal_cnt || 0).toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className={(table.missing_source_cnt || table.missing_target_cnt) ? 'text-orange-600 dark:text-orange-400 font-medium' : ''}>
                      {((table.missing_source_cnt || 0) + (table.missing_target_cnt || 0)).toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-400">
                    {table.duration_seconds ? `${Math.round(table.duration_seconds)}s` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Error Message */}
        {job.error_message && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-red-50 dark:bg-red-900/20">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm font-medium">Error: {job.error_message}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
