'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, PlayCircle, PauseCircle, StopCircle, XCircle, CheckCircle, Clock, RefreshCw, Trash2, AlertTriangle } from 'lucide-react';
import { Job } from '@/lib/types';
import { formatDistanceToNow, format } from 'date-fns';
import { toast } from 'sonner';

interface JobsViewProps {
  initialFilter?: 'running' | 'pending' | 'all';
  onBack: () => void;
  onJobSelect: (jobId: string) => void;
}

export default function JobsView({ initialFilter = 'all', onBack, onJobSelect }: JobsViewProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(initialFilter);
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadJobs();
    const interval = setInterval(loadJobs, 5000);
    return () => clearInterval(interval);
  }, [filter]);

  useEffect(() => {
    setSelectedJobs(new Set());
  }, [filter]);

  const loadJobs = async () => {
    try {
      let url = '/api/jobs?limit=100';
      if (filter === 'running') {
        url += '&status=running,paused';
      } else if (filter === 'pending') {
        url += '&status=pending,scheduled';
      }
      
      const res = await fetch(url);
      const data = await res.json();
      setJobs(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendControl = async (jobId: string, signal: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal })
      });
      
      if (res.ok) {
        toast.success(`Job ${signal} signal sent`);
        loadJobs();
      } else {
        toast.error(`Failed to send ${signal} signal`);
      }
    } catch (error) {
      toast.error(`Failed to send ${signal} signal`);
    }
  };

  const deleteJob = async (jobId: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
      if (res.ok) {
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  };

  const handleDeleteSingle = async (jobId: string, isRunning: boolean = false) => {
    const message = isRunning 
      ? 'This job is still running. Are you sure you want to delete it? This cannot be undone.'
      : 'Are you sure you want to delete this job?';
    
    if (!confirm(message)) return;
    
    const success = await deleteJob(jobId);
    if (success) {
      toast.success('Job deleted');
      loadJobs();
    } else {
      toast.error('Failed to delete job');
    }
  };

  const handleDeleteSelected = async () => {
    const deletableJobs = Array.from(selectedJobs).filter(jobId => {
      const job = jobs.find(j => j.job_id === jobId);
      if (!job) return false;
      // Allow deletion of completed/error/failed/cancelled jobs, or running standalone jobs
      return ['completed', 'error', 'failed', 'cancelled'].includes(job.status) ||
             (job.status === 'running' && job.source === 'standalone');
    });

    if (deletableJobs.length === 0) {
      toast.error('No deletable jobs selected');
      return;
    }

    const runningCount = deletableJobs.filter(jobId => {
      const job = jobs.find(j => j.job_id === jobId);
      return job?.status === 'running';
    }).length;

    const message = runningCount > 0
      ? `Are you sure you want to delete ${deletableJobs.length} job(s)? ${runningCount} job(s) are still running.`
      : `Are you sure you want to delete ${deletableJobs.length} job(s)?`;

    if (!confirm(message)) return;

    let successCount = 0;
    let failCount = 0;

    for (const jobId of deletableJobs) {
      const success = await deleteJob(jobId);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
    }

    if (successCount > 0) {
      toast.success(`Deleted ${successCount} job(s)`);
    }
    if (failCount > 0) {
      toast.error(`Failed to delete ${failCount} job(s)`);
    }

    setSelectedJobs(new Set());
    loadJobs();
  };

  const toggleSelectAll = () => {
    if (selectedJobs.size === jobs.length) {
      setSelectedJobs(new Set());
    } else {
      setSelectedJobs(new Set(jobs.map(j => j.job_id)));
    }
  };

  const toggleSelectJob = (jobId: string) => {
    const newSelected = new Set(selectedJobs);
    if (newSelected.has(jobId)) {
      newSelected.delete(jobId);
    } else {
      newSelected.add(jobId);
    }
    setSelectedJobs(newSelected);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <PlayCircle className="h-5 w-5 text-blue-500" />;
      case 'paused':
        return <PauseCircle className="h-5 w-5 text-yellow-500" />;
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'error':
        return <AlertTriangle className="h-5 w-5 text-orange-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'cancelled':
        return <XCircle className="h-5 w-5 text-gray-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      running: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      paused: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      error: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
      pending: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
      scheduled: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
    };
    return colors[status] || colors.pending;
  };

  const formatDuration = (seconds: number | null | undefined): string => {
    if (seconds === null || seconds === undefined || isNaN(Number(seconds))) {
      return '-';
    }
    return `${Math.round(Number(seconds))}s`;
  };

  const deletableSelectedCount = Array.from(selectedJobs).filter(jobId => {
    const job = jobs.find(j => j.job_id === jobId);
    return job && ['completed', 'error', 'failed', 'cancelled'].includes(job.status);
  }).length;

  if (loading) {
    return <div className="p-4">Loading jobs...</div>;
  }

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
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {filter === 'running' ? 'Running Jobs' : filter === 'pending' ? 'Pending Jobs' : 'All Jobs'}
          </h2>
        </div>
        
        <div className="flex items-center gap-2">
          {selectedJobs.size > 0 && deletableSelectedCount > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm"
            >
              <Trash2 className="h-4 w-4" />
              Delete Selected ({deletableSelectedCount})
            </button>
          )}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
          >
            <option value="all">All Jobs</option>
            <option value="running">Running</option>
            <option value="pending">Pending</option>
          </select>
          <button
            onClick={loadJobs}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Jobs List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        {jobs.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            No jobs found
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedJobs.size === jobs.length && jobs.length > 0}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300">Project</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300">Server</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300">Created</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300">Duration</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {jobs.map((job) => (
                <tr
                  key={job.job_id}
                  className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${selectedJobs.has(job.job_id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedJobs.has(job.job_id)}
                      onChange={() => toggleSelectJob(job.job_id)}
                      className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(job.status)}
                      <span className={`px-2 py-1 rounded text-xs ${getStatusBadge(job.status)}`}>
                        {job.status}
                      </span>
                    </div>
                  </td>
                  <td 
                    className="px-4 py-3 font-medium cursor-pointer hover:text-blue-600"
                    onClick={() => onJobSelect(job.job_id)}
                  >
                    {job.project_name || `Project ${job.pid}`}
                  </td>
                  <td className="px-4 py-3 capitalize">{job.job_type}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {job.source === 'standalone' ? 'standalone' : (job.assigned_server_name || '-')}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {formatDuration(job.duration_seconds)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {job.status === 'running' && job.source !== 'standalone' && (
                        <>
                          <button
                            onClick={() => sendControl(job.job_id, 'pause')}
                            className="p-1 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 rounded"
                            title="Pause"
                          >
                            <PauseCircle className="h-4 w-4 text-yellow-600" />
                          </button>
                          <button
                            onClick={() => sendControl(job.job_id, 'stop')}
                            className="p-1 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded"
                            title="Stop"
                          >
                            <StopCircle className="h-4 w-4 text-orange-600" />
                          </button>
                        </>
                      )}
                      {job.status === 'running' && job.source === 'standalone' && (
                        <button
                          onClick={() => handleDeleteSingle(job.job_id, true)}
                          className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                          title="Delete running standalone job"
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </button>
                      )}
                      {job.status === 'paused' && (
                        <button
                          onClick={() => sendControl(job.job_id, 'resume')}
                          className="p-1 hover:bg-green-100 dark:hover:bg-green-900/30 rounded"
                          title="Resume"
                        >
                          <PlayCircle className="h-4 w-4 text-green-600" />
                        </button>
                      )}
                      {['completed', 'error', 'failed', 'cancelled'].includes(job.status) && (
                        <button
                          onClick={() => handleDeleteSingle(job.job_id)}
                          className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
