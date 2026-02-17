'use client';

import { useEffect, useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, Folder, Table, X, Plus, Search, Upload } from 'lucide-react';
import { Project, Table as TableType, Result } from '@/lib/types';
import { toast } from '@/components/Toaster';

interface NavigationTreeProps {
  onProjectSelect: (projectId: number) => void;
  onTableSelect: (tableId: number) => void;
  selectedProjectId?: number;
  selectedTableId?: number;
  refreshTrigger?: number;
}

export default function NavigationTree({
  onProjectSelect,
  onTableSelect,
  selectedProjectId,
  selectedTableId,
  refreshTrigger,
}: NavigationTreeProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set());
  const [projectTables, setProjectTables] = useState<Map<number, TableType[]>>(new Map());
  const [tableStatuses, setTableStatuses] = useState<Map<number, boolean>>(new Map()); // tid -> hasIssues
  const [loading, setLoading] = useState(true);
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [importingProject, setImportingProject] = useState(false);
  const [importProjectName, setImportProjectName] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    
    const query = searchQuery.toLowerCase();
    return projects.filter(project => {
      const projectMatches = project.project_name.toLowerCase().includes(query);
      const tables = projectTables.get(project.pid) || [];
      const hasMatchingTable = tables.some(table => 
        table.table_alias.toLowerCase().includes(query)
      );
      return projectMatches || hasMatchingTable;
    });
  }, [projects, projectTables, searchQuery]);

  useEffect(() => {
    loadProjects();
  }, [refreshTrigger]);

  const loadProjects = async () => {
    try {
      const response = await fetch('/api/projects');
      const data = await response.json();
      
      // Check if response is an error
      if (!response.ok || data.error) {
        console.error('Failed to load projects:', data.error || 'Unknown error');
        setProjects([]);
        return;
      }
      
      // Ensure data is an array
      if (Array.isArray(data)) {
        setProjects(data);
      } else {
        console.error('Invalid data format received:', data);
        setProjects([]);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleProject = async (projectId: number) => {
    const newExpanded = new Set(expandedProjects);
    
    if (newExpanded.has(projectId)) {
      newExpanded.delete(projectId);
    } else {
      newExpanded.add(projectId);
      // Load tables if not already loaded
      if (!projectTables.has(projectId)) {
        try {
          const response = await fetch(`/api/projects/${projectId}/tables`);
          const tables = await response.json();
          setProjectTables(new Map(projectTables.set(projectId, tables)));
          
          // Load status for each table
          for (const table of tables) {
            loadTableStatus(table.tid);
          }
        } catch (error) {
          console.error('Failed to load tables:', error);
        }
      }
    }
    
    setExpandedProjects(newExpanded);
  };

  const loadTableStatus = async (tableId: number) => {
    try {
      const response = await fetch(`/api/tables/${tableId}/results?latest=true`);
      const data = await response.json();
      
      if (data && data.length > 0) {
        const latestResult = data[0];
        const hasIssues = (latestResult.not_equal_cnt || 0) > 0 || 
                          (latestResult.missing_source_cnt || 0) > 0 || 
                          (latestResult.missing_target_cnt || 0) > 0;
        setTableStatuses(prev => new Map(prev).set(tableId, hasIssues));
      }
    } catch (error) {
      console.error('Failed to load table status:', error);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      alert('Please enter a project name');
      return;
    }

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_name: newProjectName.trim() }),
      });

      if (!response.ok) {
        throw new Error('Failed to create project');
      }

      const newProject = await response.json();
      setProjects([...projects, newProject]);
      setNewProjectName('');
      setCreatingProject(false);
      
      // Select the newly created project
      onProjectSelect(newProject.pid);
      toast.success(`Project "${newProjectName.trim()}" created`);
    } catch (error) {
      console.error('Failed to create project:', error);
      toast.error('Failed to create project');
    }
  };

  const handleImportProject = async () => {
    if (!importProjectName.trim()) {
      toast.error('Please enter a project name');
      return;
    }
    if (!importFile) {
      toast.error('Please select a properties file');
      return;
    }

    try {
      const text = await importFile.text();
      const lines = text.split('\n');
      const configObject: Record<string, any> = {};

      lines.forEach(line => {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith('#') || trimmedLine.startsWith('!')) {
          return;
        }
        const separatorIndex = trimmedLine.indexOf('=');
        if (separatorIndex > 0) {
          const key = trimmedLine.substring(0, separatorIndex).trim();
          const value = trimmedLine.substring(separatorIndex + 1).trim();
          try {
            configObject[key] = JSON.parse(value);
          } catch {
            configObject[key] = value;
          }
        }
      });

      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          project_name: importProjectName.trim(),
          project_config: configObject
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create project');
      }

      const newProject = await response.json();
      setProjects([...projects, newProject]);
      setImportProjectName('');
      setImportFile(null);
      setImportingProject(false);
      
      onProjectSelect(newProject.pid);
      toast.success(`Project "${importProjectName.trim()}" imported with ${Object.keys(configObject).length} properties`);
    } catch (error) {
      console.error('Failed to import project:', error);
      toast.error('Failed to import project');
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-2">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="p-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No projects found. Check your database connection and schema.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-1">
      {/* Search Input */}
      <div className="relative mb-3">
        <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search projects/tables..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-8 pr-8 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Add New Project / Import Project Buttons */}
      {!creatingProject && !importingProject ? (
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => setCreatingProject(true)}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
          >
            <Plus className="h-4 w-4" />
            New
          </button>
          <button
            onClick={() => setImportingProject(true)}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-2 text-sm text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"
          >
            <Upload className="h-4 w-4" />
            Import
          </button>
        </div>
      ) : creatingProject ? (
        <div className="mb-2 p-2 border border-blue-500 rounded bg-blue-50 dark:bg-blue-900/20">
          <input
            type="text"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCreateProject();
              } else if (e.key === 'Escape') {
                setCreatingProject(false);
                setNewProjectName('');
              }
            }}
            placeholder="Project name..."
            autoFocus
            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded mb-2 dark:bg-gray-700 dark:text-white"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreateProject}
              className="flex-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Create
            </button>
            <button
              onClick={() => {
                setCreatingProject(false);
                setNewProjectName('');
              }}
              className="flex-1 px-2 py-1 text-xs bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-400 dark:hover:bg-gray-500"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-2 p-2 border border-green-500 rounded bg-green-50 dark:bg-green-900/20">
          <input
            type="text"
            value={importProjectName}
            onChange={(e) => setImportProjectName(e.target.value)}
            placeholder="Project name..."
            autoFocus
            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded mb-2 dark:bg-gray-700 dark:text-white"
          />
          <input
            type="file"
            accept=".properties,.txt"
            onChange={(e) => setImportFile(e.target.files?.[0] || null)}
            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded mb-2 dark:bg-gray-700 dark:text-white"
          />
          <div className="flex gap-2">
            <button
              onClick={handleImportProject}
              disabled={!importProjectName.trim() || !importFile}
              className="flex-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              Import
            </button>
            <button
              onClick={() => {
                setImportingProject(false);
                setImportProjectName('');
                setImportFile(null);
              }}
              className="flex-1 px-2 py-1 text-xs bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-400 dark:hover:bg-gray-500"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Projects List */}
      {filteredProjects.length === 0 && searchQuery && (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
          No results found for "{searchQuery}"
        </p>
      )}
      {filteredProjects.map((project) => {
        const isExpanded = expandedProjects.has(project.pid);
        const allTables = projectTables.get(project.pid) || [];
        const tables = searchQuery 
          ? allTables.filter(t => t.table_alias.toLowerCase().includes(searchQuery.toLowerCase()))
          : allTables;
        const isSelected = selectedProjectId === project.pid;

        return (
          <div key={project.pid}>
            <div
              className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${
                isSelected ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : ''
              }`}
            >
              <button
                onClick={() => toggleProject(project.pid)}
                className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
              <Folder className="h-4 w-4" />
              <span
                onClick={() => onProjectSelect(project.pid)}
                className="flex-1 text-sm"
              >
                {project.project_name} <span className="text-xs text-gray-500 dark:text-gray-400">({project.pid})</span>
              </span>
            </div>

            {isExpanded && (
              <div className="ml-6 mt-1 space-y-1">
                {tables.map((table) => {
                  const isTableSelected = selectedTableId === table.tid;
                  const hasIssues = tableStatuses.get(table.tid) || false;
                  return (
                    <div
                      key={table.tid}
                      onClick={() => onTableSelect(table.tid)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${
                        isTableSelected
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                          : ''
                      }`}
                    >
                      <Table className="h-4 w-4" />
                      <span className="text-sm flex-1">{table.table_alias}</span>
                      {hasIssues && (
                        <X className="h-4 w-4 text-red-600 dark:text-red-400" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

