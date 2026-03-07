'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { FileText, RefreshCw, ChevronDown, ChevronUp, Play, Pause } from 'lucide-react';

interface LogEntry {
  log_id: number;
  job_id: string;
  log_ts: string;
  log_level: string;
  thread_name: string | null;
  message: string;
  context: unknown;
}

interface JobLogsViewerProps {
  jobId: string;
  isExpanded?: boolean;
  jobStatus?: string;
}

export default function JobLogsViewer({ jobId, isExpanded: initialExpanded = false, jobStatus }: JobLogsViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(initialExpanded);
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [totalCount, setTotalCount] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastLogId, setLastLogId] = useState<number | null>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const isScrollingProgrammatically = useRef(false);
  const userHasScrolled = useRef(false);

  const isJobActive = jobStatus === 'running' || jobStatus === 'paused';

  const loadLogs = useCallback(async (sinceLogId?: number | null) => {
    if (!expanded) return;
    
    setLoading(true);
    try {
      const params = new URLSearchParams({
        pageSize: '500',
        ...(levelFilter !== 'all' && { level: levelFilter }),
        ...(sinceLogId && { sinceLogId: sinceLogId.toString() })
      });

      const res = await fetch(`/api/jobs/${jobId}/logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        
        if (sinceLogId && data.logs.length > 0) {
          setLogs(prev => [...prev, ...data.logs]);
        } else if (!sinceLogId) {
          setLogs(data.logs);
        }
        
        setTotalCount(data.pagination.totalCount);
        
        if (data.logs.length > 0) {
          const maxLogId = Math.max(...data.logs.map((l: LogEntry) => l.log_id));
          setLastLogId(maxLogId);
        }
      }
    } catch (error) {
      console.error('Failed to load logs:', error);
    } finally {
      setLoading(false);
    }
  }, [jobId, expanded, levelFilter]);

  // Initial load and filter change
  useEffect(() => {
    if (expanded) {
      setLastLogId(null);
      userHasScrolled.current = false;
      setAutoScroll(true);
      loadLogs();
    }
  }, [expanded, levelFilter]);

  // Auto-refresh for streaming logs
  useEffect(() => {
    if (!expanded || !autoRefresh) return;
    
    const interval = isJobActive ? 2000 : 5000;
    
    const timer = setInterval(() => {
      if (lastLogId) {
        loadLogs(lastLogId);
      } else {
        loadLogs();
      }
    }, interval);

    return () => clearInterval(timer);
  }, [expanded, autoRefresh, isJobActive, lastLogId, loadLogs]);

  // Auto-scroll to bottom when new logs arrive (only if user hasn't scrolled away)
  useEffect(() => {
    if (autoScroll && logsEndRef.current && logsContainerRef.current && logs.length > 0) {
      isScrollingProgrammatically.current = true;
      
      // Use instant scroll for auto-scroll to avoid timing issues
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
      
      // Reset the flag after a short delay
      setTimeout(() => {
        isScrollingProgrammatically.current = false;
      }, 100);
    }
  }, [logs, autoScroll]);

  // Detect manual scroll to disable auto-scroll
  const handleScroll = useCallback(() => {
    // Ignore programmatic scrolls
    if (isScrollingProgrammatically.current) return;
    if (!logsContainerRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isNearBottom = distanceFromBottom < 30;
    
    // User scrolled away from bottom - disable auto-scroll
    if (!isNearBottom) {
      userHasScrolled.current = true;
      setAutoScroll(false);
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    if (logsContainerRef.current) {
      isScrollingProgrammatically.current = true;
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
      userHasScrolled.current = false;
      setAutoScroll(true);
      
      setTimeout(() => {
        isScrollingProgrammatically.current = false;
      }, 100);
    }
  }, []);

  const getLogLevelStyle = (level: string) => {
    switch (level.toUpperCase()) {
      case 'ERROR':
      case 'SEVERE':
        return 'text-red-400';
      case 'WARNING':
      case 'WARN':
        return 'text-amber-400';
      case 'INFO':
        return 'text-emerald-400';
      case 'DEBUG':
      case 'FINE':
        return 'text-sky-400';
      case 'TRACE':
      case 'FINEST':
        return 'text-slate-400';
      default:
        return 'text-slate-300';
    }
  };

  const getRowBackground = (level: string) => {
    switch (level.toUpperCase()) {
      case 'ERROR':
      case 'SEVERE':
        return 'bg-red-950/30';
      case 'WARNING':
      case 'WARN':
        return 'bg-amber-950/20';
      default:
        return '';
    }
  };

  const formatTimestamp = (ts: string) => {
    const date = new Date(ts);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      fractionalSecondDigits: 3 
    });
  };

  if (!expanded) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <button
          onClick={() => setExpanded(true)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          <div className="flex items-center gap-2 text-gray-900 dark:text-white">
            <FileText className="h-5 w-5" />
            <span className="font-semibold">Job Logs</span>
            {totalCount > 0 && (
              <span className="text-sm text-gray-500">({totalCount} entries)</span>
            )}
          </div>
          <ChevronDown className="h-5 w-5 text-gray-400" />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(false)}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            <ChevronUp className="h-5 w-5 text-gray-400" />
          </button>
          <FileText className="h-5 w-5 text-gray-600 dark:text-gray-300" />
          <span className="font-semibold text-gray-900 dark:text-white">Job Logs</span>
          <span className="text-sm text-gray-500">({totalCount} entries)</span>
          {isJobActive && autoRefresh && (
            <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Live
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          {/* Level Filter */}
          <select
            value={levelFilter}
            onChange={(e) => {
              setLevelFilter(e.target.value);
              setLastLogId(null);
              userHasScrolled.current = false;
              setAutoScroll(true);
            }}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200"
          >
            <option value="all">All Levels</option>
            <option value="error">Errors</option>
            <option value="warning">Warnings</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
          </select>

          {/* Auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-sm transition-colors ${
              autoRefresh 
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
            }`}
            title={autoRefresh ? 'Auto-refresh on' : 'Auto-refresh off'}
          >
            {autoRefresh ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            Auto
          </button>

          {/* Scroll to bottom - show when auto-scroll is off */}
          {!autoScroll && (
            <button
              onClick={scrollToBottom}
              className="px-2 py-1 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded animate-pulse"
            >
              ↓ Latest
            </button>
          )}

          {/* Manual Refresh */}
          <button
            onClick={() => {
              setLastLogId(null);
              loadLogs();
            }}
            disabled={loading}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded disabled:opacity-50"
            title="Refresh logs"
          >
            <RefreshCw className={`h-4 w-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Logs content */}
      <div 
        ref={logsContainerRef}
        onScroll={handleScroll}
        className="max-h-[500px] overflow-y-auto bg-slate-900 text-sm font-mono"
      >
        {logs.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            {loading ? 'Loading logs...' : 'No logs available'}
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {logs.map((log) => (
              <div 
                key={log.log_id} 
                className={`flex gap-3 px-3 py-1.5 hover:bg-slate-800/50 ${getRowBackground(log.log_level)}`}
              >
                <span className="text-slate-500 flex-shrink-0 tabular-nums">
                  {formatTimestamp(log.log_ts)}
                </span>
                <span className={`w-16 flex-shrink-0 font-medium ${getLogLevelStyle(log.log_level)}`}>
                  {log.log_level.toUpperCase().padEnd(7)}
                </span>
                {log.thread_name && (
                  <span className="text-violet-400 flex-shrink-0 max-w-[140px] truncate" title={log.thread_name}>
                    [{log.thread_name}]
                  </span>
                )}
                <span className="text-slate-200 break-words min-w-0">{log.message}</span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}
