'use client';

import { useEffect, useState } from 'react';
import { Activity, Server, Clock, AlertTriangle, CheckCircle, PlayCircle, PauseCircle, XCircle } from 'lucide-react';
import { Job, Server as ServerType } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';

interface DashboardProps {
  onJobSelect?: (jobId: string) => void;
  onFilterJobs?: (filter: 'running' | 'pending' | 'all') => void;
}

export default function Dashboard({ onJobSelect, onFilterJobs }: DashboardProps) {
  const [servers, setServers] = useState<ServerType[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [serversRes, jobsRes] = await Promise.all([
        fetch('/api/servers'),
        fetch('/api/jobs?limit=20')
      ]);
      
      const serversData = await serversRes.json();
      const jobsData = await jobsRes.json();
      
      console.log('Servers API response:', serversRes.status, serversData);
      console.log('Jobs API response:', jobsRes.status, jobsData);
      
      setServers(Array.isArray(serversData) ? serversData : []);
      setJobs(Array.isArray(jobsData) ? jobsData : []);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <PlayCircle className="h-4 w-4 text-blue-500" />;
      case 'paused':
        return <PauseCircle className="h-4 w-4 text-yellow-500" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'cancelled':
        return <XCircle className="h-4 w-4 text-gray-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const formatDuration = (seconds: number | null | undefined): string => {
    if (seconds === null || seconds === undefined || isNaN(Number(seconds))) {
      return '-';
    }
    return `${Math.round(Number(seconds))}s`;
  };

  const getServerStatusColor = (status: string) => {
    switch (status) {
      case 'busy':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'idle':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'active':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'offline':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  const runningJobs = jobs.filter(j => j.status === 'running' || j.status === 'paused');
  const pendingJobs = jobs.filter(j => j.status === 'pending' || j.status === 'scheduled');
  const activeServers = servers.filter(s => 
    s.status !== 'terminated' && s.status !== 'offline' &&
    (s.seconds_since_heartbeat === undefined || s.seconds_since_heartbeat === null || s.seconds_since_heartbeat < 300)
  );

  if (loading) {
    return <div className="p-4">Loading dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <Server className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Active Servers</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{activeServers.length}</p>
            </div>
          </div>
        </div>
        
        <div 
          onClick={() => onFilterJobs?.('running')}
          className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <PlayCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Running Jobs</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{runningJobs.length}</p>
            </div>
          </div>
        </div>
        
        <div 
          onClick={() => onFilterJobs?.('pending')}
          className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 cursor-pointer hover:ring-2 hover:ring-yellow-500 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
              <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Pending Jobs</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{pendingJobs.length}</p>
            </div>
          </div>
        </div>
        
        <div 
          onClick={() => onFilterJobs?.('all')}
          className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 cursor-pointer hover:ring-2 hover:ring-purple-500 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <Activity className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Jobs</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{jobs.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Servers Panel */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Server className="h-5 w-5" />
            Active Servers
          </h3>
        </div>
        <div className="p-4">
          {servers.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-4">
              No servers registered. Start pgCompare in server mode to register workers.
            </p>
          ) : (
            <div className="grid gap-4">
              {servers.map((server) => (
                <div
                  key={server.server_id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${
                      server.status === 'busy' ? 'bg-blue-500 animate-pulse' :
                      server.status === 'idle' || server.status === 'active' ? 'bg-green-500' :
                      'bg-red-500'
                    }`} />
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{server.server_name}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {server.server_host} (PID: {server.server_pid})
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`px-2 py-1 rounded text-xs ${getServerStatusColor(server.status)}`}>
                      {server.status}
                    </span>
                    {server.last_heartbeat && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Last seen {formatDistanceToNow(new Date(server.last_heartbeat), { addSuffix: true })}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Running Jobs */}
      {runningJobs.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <PlayCircle className="h-5 w-5 text-blue-500" />
              Running Jobs
            </h3>
          </div>
          <div className="p-4">
            <div className="space-y-3">
              {runningJobs.map((job) => (
                <div
                  key={job.job_id}
                  onClick={() => onJobSelect?.(job.job_id)}
                  className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(job.status)}
                      <span className="font-medium text-gray-900 dark:text-white">
                        {job.project_name || `Project ${job.pid}`}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        ({job.job_type})
                      </span>
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {job.source === 'standalone' ? 'standalone' : (job.assigned_server_name || 'Unassigned')}
                    </div>
                  </div>
                  {job.started_at && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Started {formatDistanceToNow(new Date(job.started_at), { addSuffix: true })}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Recent Jobs */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Jobs
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">Status</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">Project</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">Type</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">Server</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">Created</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {jobs.map((job) => (
                <tr
                  key={job.job_id}
                  onClick={() => onJobSelect?.(job.job_id)}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                >
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(job.status)}
                      <span className="capitalize">{job.status}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 font-medium">{job.project_name || `Project ${job.pid}`}</td>
                  <td className="px-4 py-2 capitalize">{job.job_type}</td>
                  <td className="px-4 py-2 text-gray-600 dark:text-gray-400">
                    {job.source === 'standalone' ? 'standalone' : (job.assigned_server_name || '-')}
                  </td>
                  <td className="px-4 py-2 text-gray-600 dark:text-gray-400">
                    {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-400">
                    {formatDuration(job.duration_seconds)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
