'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import NavigationTree from '@/components/NavigationTree';
import ProjectView from '@/components/ProjectView';
import TableView from '@/components/TableView';
import Dashboard from '@/components/Dashboard';
import ThemeToggle from '@/components/ThemeToggle';
import ScheduleJobModal from '@/components/ScheduleJobModal';
import JobProgressPanel from '@/components/JobProgressPanel';
import { LogOut, LayoutDashboard, Play, Plus } from 'lucide-react';

type ViewMode = 'dashboard' | 'projects';

export default function DashboardPage() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>();
  const [selectedTableId, setSelectedTableId] = useState<number | undefined>();
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [navRefreshTrigger, setNavRefreshTrigger] = useState(0);

  const handleProjectUpdated = () => {
    setNavRefreshTrigger(prev => prev + 1);
  };

  const handleProjectSelect = (projectId: number) => {
    setViewMode('projects');
    setSelectedProjectId(projectId);
    setSelectedTableId(undefined);
  };

  const handleTableSelect = (tableId: number) => {
    setSelectedTableId(tableId);
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/');
    } catch (error) {
      console.error('Logout error:', error);
      router.push('/');
    }
  };

  const handleJobSelect = (jobId: string) => {
    setSelectedJobId(jobId);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">pgCompare</h1>
            
            {/* View Mode Toggle */}
            <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
              <button
                onClick={() => setViewMode('dashboard')}
                className={`flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  viewMode === 'dashboard'
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </button>
              <button
                onClick={() => setViewMode('projects')}
                className={`flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  viewMode === 'projects'
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Projects
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowScheduleModal(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              <Play className="h-4 w-4" />
              Schedule Job
            </button>
            <ThemeToggle />
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {viewMode === 'projects' && (
          <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
            <NavigationTree
              onProjectSelect={handleProjectSelect}
              onTableSelect={handleTableSelect}
              selectedProjectId={selectedProjectId}
              selectedTableId={selectedTableId}
              refreshTrigger={navRefreshTrigger}
            />
          </aside>
        )}

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-6">
          {viewMode === 'dashboard' ? (
            <Dashboard onJobSelect={handleJobSelect} />
          ) : selectedTableId ? (
            <TableView tableId={selectedTableId} />
          ) : selectedProjectId ? (
            <ProjectView projectId={selectedProjectId} onProjectUpdated={handleProjectUpdated} />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-500 dark:text-gray-400 text-lg">
                Select a project or table from the navigation tree
              </p>
            </div>
          )}
        </main>
      </div>

      {/* Modals */}
      <ScheduleJobModal
        isOpen={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        preselectedProject={selectedProjectId}
      />

      {selectedJobId && (
        <JobProgressPanel
          jobId={selectedJobId}
          onClose={() => setSelectedJobId(null)}
        />
      )}
    </div>
  );
}
