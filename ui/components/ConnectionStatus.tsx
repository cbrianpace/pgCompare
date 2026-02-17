'use client';

import { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

export default function ConnectionStatus() {
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkConnection = async () => {
    setStatus('checking');
    try {
      const response = await fetch('/api/health', { 
        method: 'GET',
        cache: 'no-store' 
      });
      setStatus(response.ok ? 'connected' : 'disconnected');
    } catch {
      setStatus('disconnected');
    }
    setLastChecked(new Date());
  };

  useEffect(() => {
    checkConnection();
    const interval = setInterval(checkConnection, 30000);
    return () => clearInterval(interval);
  }, []);

  const statusConfig = {
    connected: {
      icon: Wifi,
      color: 'text-green-500',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
      label: 'Connected',
    },
    disconnected: {
      icon: WifiOff,
      color: 'text-red-500',
      bgColor: 'bg-red-100 dark:bg-red-900/30',
      label: 'Disconnected',
    },
    checking: {
      icon: RefreshCw,
      color: 'text-blue-500',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
      label: 'Checking...',
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${config.bgColor} cursor-pointer`}
      onClick={checkConnection}
      title={`Click to refresh. Last checked: ${lastChecked?.toLocaleTimeString() || 'Never'}`}
    >
      <Icon className={`h-4 w-4 ${config.color} ${status === 'checking' ? 'animate-spin' : ''}`} />
      <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
    </div>
  );
}
