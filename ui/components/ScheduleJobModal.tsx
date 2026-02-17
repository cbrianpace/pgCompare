'use client';

import { useState, useEffect } from 'react';
import { X, Play, Calendar, Server as ServerIcon } from 'lucide-react';
import { Project, Server } from '@/lib/types';
import { toast } from '@/components/Toaster';

interface ScheduleJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  preselectedProject?: number;
}

export default function ScheduleJobModal({ isOpen, onClose, onSuccess, preselectedProject }: ScheduleJobModalProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    pid: preselectedProject || 0,
    job_type: 'compare' as 'compare' | 'check' | 'discover',
    priority: 5,
    batch_nbr: 0,
    table_filter: '',
    target_server_id: '' as string,
    schedule_now: true,
    scheduled_at: '',
  });

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  useEffect(() => {
    if (preselectedProject) {
      setFormData(prev => ({ ...prev, pid: preselectedProject }));
    }
  }, [preselectedProject]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [projectsRes, serversRes] = await Promise.all([
        fetch('/api/projects'),
        fetch('/api/servers')
      ]);
      
      const projectsData = await projectsRes.json();
      const serversData = await serversRes.json();
      
      setProjects(Array.isArray(projectsData) ? projectsData : []);
      setServers(Array.isArray(serversData) ? serversData.filter((s: Server) => s.status !== 'terminated' && s.status !== 'offline') : []);
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Failed to load projects and servers');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.pid) {
      toast.error('Please select a project');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pid: formData.pid,
          job_type: formData.job_type,
          priority: formData.priority,
          batch_nbr: formData.batch_nbr,
          table_filter: formData.table_filter || null,
          target_server_id: formData.target_server_id || null,
          scheduled_at: formData.schedule_now ? null : formData.scheduled_at || null,
          created_by: 'ui',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to schedule job');
      }

      toast.success('Job scheduled successfully');
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Failed to schedule job:', error);
      toast.error('Failed to schedule job');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Play className="h-5 w-5" />
            Schedule Job
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Project Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Project *
            </label>
            <select
              value={formData.pid}
              onChange={(e) => setFormData({ ...formData, pid: parseInt(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
              required
            >
              <option value={0}>Select a project...</option>
              {projects.map((project) => (
                <option key={project.pid} value={project.pid}>
                  {project.project_name} (ID: {project.pid})
                </option>
              ))}
            </select>
          </div>

          {/* Job Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Job Type
            </label>
            <select
              value={formData.job_type}
              onChange={(e) => setFormData({ ...formData, job_type: e.target.value as any })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="compare">Compare</option>
              <option value="check">Check (Recompare)</option>
              <option value="discover">Discover Tables</option>
            </select>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Priority (1-10)
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 5 })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Higher priority jobs are executed first</p>
          </div>

          {/* Batch Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Batch Number
            </label>
            <input
              type="number"
              min={0}
              value={formData.batch_nbr}
              onChange={(e) => setFormData({ ...formData, batch_nbr: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">0 = all batches</p>
          </div>

          {/* Table Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Table Filter (optional)
            </label>
            <input
              type="text"
              value={formData.table_filter}
              onChange={(e) => setFormData({ ...formData, table_filter: e.target.value })}
              placeholder="e.g., customers"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Target Server */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Target Server
            </label>
            <select
              value={formData.target_server_id}
              onChange={(e) => setFormData({ ...formData, target_server_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Any available server</option>
              {servers.map((server) => (
                <option key={server.server_id} value={server.server_id}>
                  {server.server_name} ({server.status})
                </option>
              ))}
            </select>
          </div>

          {/* Schedule */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              When to Run
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={formData.schedule_now}
                  onChange={() => setFormData({ ...formData, schedule_now: true })}
                  className="text-blue-600"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Run as soon as possible</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={!formData.schedule_now}
                  onChange={() => setFormData({ ...formData, schedule_now: false })}
                  className="text-blue-600"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Schedule for later</span>
              </label>
            </div>
            {!formData.schedule_now && (
              <input
                type="datetime-local"
                value={formData.scheduled_at}
                onChange={(e) => setFormData({ ...formData, scheduled_at: e.target.value })}
                className="mt-2 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
              />
            )}
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !formData.pid}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Play className="h-4 w-4" />
              {submitting ? 'Scheduling...' : 'Schedule Job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
