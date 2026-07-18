'use client';

import { ChevronRight, Home } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
  icon?: React.ReactNode;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export default function Breadcrumb({ items }: BreadcrumbProps) {
  if (items.length === 0) return null;

  return (
    <nav className="flex items-center space-x-1 text-sm text-gray-600 dark:text-gray-400 mb-4">
      <Home className="h-4 w-4" />
      {items.map((item, index) => (
        <div key={index} className="flex items-center">
          <ChevronRight className="h-4 w-4 mx-1" />
          {item.onClick || item.href ? (
            <button
              onClick={item.onClick}
              className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              {item.icon}
              {item.label}
            </button>
          ) : (
            <span className="flex items-center gap-1 text-gray-900 dark:text-white font-medium">
              {item.icon}
              {item.label}
            </span>
          )}
        </div>
      ))}
    </nav>
  );
}
