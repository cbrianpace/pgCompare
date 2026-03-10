'use client';

import { useRouter } from 'next/navigation';
import { use } from 'react';
import JobDetailView from '@/components/JobDetailView';
import ThemeToggle from '@/components/ThemeToggle';
import { LayoutDashboard } from 'lucide-react';

export default function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);

  const handleBack = () => {
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
            >
              <LayoutDashboard className="h-5 w-5" />
              <span className="font-medium">Dashboard</span>
            </button>
            <span className="text-gray-400 dark:text-gray-500">/</span>
            <span className="text-gray-900 dark:text-white font-medium">Job Details</span>
          </div>
          <ThemeToggle />
        </div>
      </header>
      <main className="p-6">
        <JobDetailView jobId={id} onBack={handleBack} />
      </main>
    </div>
  );
}
