'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, PlayCircle, PauseCircle, StopCircle, XCircle, CheckCircle, Clock, RefreshCw, AlertTriangle } from 'lucide-react';
import { Job } from '@/lib/types';
import { formatDistanceToNow, format } from 'date-fns';
import { toast } from 'sonner';
import OutOfSyncModal from './OutOfSyncModal';
import JobLogsViewer from './JobLogsViewer';

interface JobProgress {
  job_id: string;
  tid: number;
  table_name: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  source_cnt: number;
  target_cnt: number;
  equal_cnt: number;
  not_equal_cnt: number;
  missing_source_cnt: number;
  missing_target_cnt: number;
  error_message: string | null;
  cid: number | null;
}

interface JobDetailViewProps {
  jobId: string;
  onBack: () => void;
}

export default function JobDetailView({ jobId, onBack }: JobDetailViewProps) {
  const [job, setJob] = useState<Job | null>(null);
  const [progress, setProgress] = useState<JobProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<{ tid: number; tableName: string; cid?: number | null } | null>(null);

  useEffect(() => {
    loadJobDetails();
    const interval = setInterval(loadJobDetails, 3000);
    return () => clearInterval(interval);
  }, [jobId]);

  const loadJobDetails = async () => {
    try {
      const [jobRes, progressRes] = await Promise.all([
        fetch(`/api/jobs/${jobId}`),
        fetch(`/api/jobs/${jobId}/progress`)
      ]);
      
      if (jobRes.ok) {
        const jobData = await jobRes.json();
        setJob(jobData);
      }
      
      if (progressRes.ok) {
        const progressData = await progressRes.json();
        setProgress(Array.isArray(progressData.tables) ? progressData.tables : []);
      }
    } catch (error) {
      console.error('Failed to load job details:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendControl = async (signal: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal })
      });
      
      if (res.ok) {
        toast.success(`Job ${signal} signal sent`);
        loadJobDetails();
      } else {
        toast.error(`Failed to send ${signal} signal`);
      }
    } catch (error) {
      toast.error(`Failed to send ${signal} signal`);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <PlayCircle className="h-5 w-5 text-blue-500" />;
      case 'paused':
        return <PauseCircle className="h-5 w-5 text-yellow-500" />;
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const getProgressColor = (status: string) => {
    switch (status) {
      case 'completed':
      case 'in-sync': return 'bg-green-500';
      case 'out-of-sync': return 'bg-orange-500';
      case 'running': return 'bg-blue-500';
      case 'failed': return 'bg-red-500';
      default: return 'bg-gray-300';
    }
  };

  const getDisplayStatus = (p: JobProgress) => {
    if (p.status === 'completed') {
      const hasOutOfSync = (p.not_equal_cnt || 0) + (p.missing_source_cnt || 0) + (p.missing_target_cnt || 0) > 0;
      return hasOutOfSync ? 'out-of-sync' : 'in-sync';
    }
    return p.status;
  };

  if (loading) {
    return <div className="p-4">Loading job details...</div>;
  }

  if (!job) {
    return <div className="p-4">Job not found</div>;
  }

  const completedTables = progress.filter(p => p.status === 'completed').length;
  const totalTables = progress.length;
  const progressPercent = totalTables > 0 ? (completedTables / totalTables) * 100 : 0;

  const totalEqual = progress.reduce((sum, p) => sum + (p.equal_cnt || 0), 0);
  const totalNotEqual = progress.reduce((sum, p) => sum + (p.not_equal_cnt || 0), 0);
  const totalMissing = progress.reduce((sum, p) => sum + (p.missing_source_cnt || 0) + (p.missing_target_cnt || 0), 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              {getStatusIcon(job.status)}
              {job.project_name || `Project ${job.pid}`} - {job.job_type}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Job ID: {job.job_id}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {job.status === 'running' && (
            <>
              <button
                onClick={() => sendControl('pause')}
                className="px-3 py-2 bg-yellow-100 text-yellow-700 hover:bg-yellow-200 rounded-lg flex items-center gap-2"
              >
                <PauseCircle className="h-4 w-4" /> Pause
              </button>
              <button
                onClick={() => sendControl('stop')}
                className="px-3 py-2 bg-orange-100 text-orange-700 hover:bg-orange-200 rounded-lg flex items-center gap-2"
              >
                <StopCircle className="h-4 w-4" /> Stop
              </button>
              <button
                onClick={() => sendControl('terminate')}
                className="px-3 py-2 bg-red-100 text-red-700 hover:bg-red-200 rounded-lg flex items-center gap-2"
              >
                <XCircle className="h-4 w-4" /> Terminate
              </button>
            </>
          )}
          {job.status === 'paused' && (
            <button
              onClick={() => sendControl('resume')}
              className="px-3 py-2 bg-green-100 text-green-700 hover:bg-green-200 rounded-lg flex items-center gap-2"
            >
              <PlayCircle className="h-4 w-4" /> Resume
            </button>
          )}
          <button
            onClick={loadJobDetails}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Job Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Job Details</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Status</dt>
              <dd className="font-medium capitalize">{job.status}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Type</dt>
              <dd className="font-medium capitalize">{job.job_type}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Priority</dt>
              <dd className="font-medium">{job.priority}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Batch</dt>
              <dd className="font-medium">{job.batch_nbr}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Server</dt>
              <dd className="font-medium">{job.assigned_server_name || '-'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Created</dt>
              <dd className="font-medium">{format(new Date(job.created_at), 'PPp')}</dd>
            </div>
            {job.started_at && (
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">Started</dt>
                <dd className="font-medium">{format(new Date(job.started_at), 'PPp')}</dd>
              </div>
            )}
            {job.completed_at && (
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">Completed</dt>
                <dd className="font-medium">{format(new Date(job.completed_at), 'PPp')}</dd>
              </div>
            )}
            {job.duration_seconds != null && !isNaN(Number(job.duration_seconds)) && (
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">Duration</dt>
                <dd className="font-medium">{Math.round(Number(job.duration_seconds))}s</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Progress Summary</h3>
          
          {/* Progress bar */}
          <div className="mb-4">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600 dark:text-gray-400">Tables Progress</span>
              <span className="font-medium">{completedTables} / {totalTables}</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
              <div
                className="bg-blue-500 h-3 rounded-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Stats */}
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Equal Rows</dt>
              <dd className="font-medium text-green-600">{totalEqual.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Not Equal</dt>
              <dd className="font-medium text-yellow-600">{totalNotEqual.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Missing</dt>
              <dd className="font-medium text-red-600">{totalMissing.toLocaleString()}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Error message */}
      {job.error_message && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">Error</span>
          </div>
          <p className="mt-2 text-sm text-red-600 dark:text-red-300">{job.error_message}</p>
        </div>
      )}

      {/* Table Progress */}
      {progress.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white">Table Progress</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">Table</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">Status</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300">Source</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300">Target</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300">Equal</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300">Not Equal</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300">Missing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {progress.map((p) => {
                const displayStatus = getDisplayStatus(p);
                const isOutOfSync = displayStatus === 'out-of-sync';
                return (
                <tr 
                  key={p.tid} 
                  className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${isOutOfSync ? 'cursor-pointer' : ''}`}
                  onClick={() => isOutOfSync && setSelectedTable({ tid: p.tid, tableName: p.table_name, cid: p.cid })}
                  title={isOutOfSync ? 'Click to view out-of-sync details' : ''}
                >
                  <td className="px-4 py-2 font-medium">{p.table_name}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${getProgressColor(displayStatus)}`} />
                      <span className="capitalize">{displayStatus}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-400">
                    {(p.source_cnt || 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-400">
                    {(p.target_cnt || 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right text-green-600">
                    {(p.equal_cnt || 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right text-yellow-600">
                    {(p.not_equal_cnt || 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right text-red-600">
                    {((p.missing_source_cnt || 0) + (p.missing_target_cnt || 0)).toLocaleString()}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Job Logs */}
      <JobLogsViewer jobId={jobId} jobStatus={job?.status} />

      {selectedTable && (
        <OutOfSyncModal
          tid={selectedTable.tid}
          tableName={selectedTable.tableName}
          cid={selectedTable.cid}
          isOpen={true}
          onClose={() => setSelectedTable(null)}
        />
      )}
    </div>
  );
}
