'use client';

import { useState, useEffect } from 'react';
import { Save, Plus, Trash2, Download, Upload, ChevronDown, ChevronRight, Info, Plug, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { CONFIG_PROPERTIES, CATEGORY_LABELS, PropertyDefinition, getPropertyDefinition, isDefaultValue, getFriendlyLabel } from '@/lib/configProperties';

interface ConnectionTestResult {
  success: boolean;
  connectionType: string;
  databaseType: string;
  host: string;
  port: number;
  database: string;
  schema: string;
  user: string;
  databaseProductName?: string;
  databaseProductVersion?: string;
  errorMessage?: string;
  errorDetail?: string;
  responseTimeMs: number;
}

interface ConfigEditorProps {
  configData: Array<{ key: string; value: string }>;
  onConfigChange: (configData: Array<{ key: string; value: string }>) => void;
  onSave: () => void;
  onImport: (file: File) => void;
  saving: boolean;
  projectId?: number;
}

export default function ConfigEditor({ 
  configData, 
  onConfigChange, 
  onSave, 
  onImport,
  saving,
  projectId
}: ConfigEditorProps) {
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    system: true,
    repository: false,
    source: false,
    target: false,
  });
  const [showAddProperty, setShowAddProperty] = useState(false);
  const [newPropertyKey, setNewPropertyKey] = useState('');
  const [testingConnections, setTestingConnections] = useState(false);
  const [connectionResults, setConnectionResults] = useState<Record<string, ConnectionTestResult | null>>({});
  const [showTestResults, setShowTestResults] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [serverUsed, setServerUsed] = useState<{ name: string } | null>(null);

  const handleConfigChange = (key: string, value: string) => {
    const existingIndex = configData.findIndex(item => item.key === key);
    if (existingIndex >= 0) {
      const newConfig = configData.map(item => 
        item.key === key ? { ...item, value } : item
      );
      onConfigChange(newConfig);
    } else {
      onConfigChange([...configData, { key, value }]);
    }
  };

  const handleRemoveProperty = (key: string) => {
    onConfigChange(configData.filter(item => item.key !== key));
  };

  const handleAddProperty = () => {
    if (!newPropertyKey) return;
    
    if (configData.some(item => item.key === newPropertyKey)) {
      alert('Property already exists');
      return;
    }
    
    const propDef = getPropertyDefinition(newPropertyKey);
    const defaultValue = propDef?.defaultValue || '';
    
    onConfigChange([...configData, { key: newPropertyKey, value: defaultValue }]);
    setNewPropertyKey('');
    setShowAddProperty(false);
  };

  const handleTestConnections = async () => {
    if (!projectId) return;
    
    setTestingConnections(true);
    setShowTestResults(true);
    setConnectionResults({});
    setTestError(null);
    setServerUsed(null);
    
    try {
      const response = await fetch(`/api/projects/${projectId}/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionTypes: ['repository', 'source', 'target'] }),
      });
      
      const data = await response.json();
      
      if (data.serverUsed) {
        setServerUsed(data.serverUsed);
      }
      
      if (data.error && !data.results) {
        setTestError(data.error);
      } else if (data.results) {
        setConnectionResults(data.results);
      }
    } catch (error: any) {
      console.error('Failed to test connections:', error);
      setConnectionResults({
        error: {
          success: false,
          connectionType: 'error',
          databaseType: '',
          host: '',
          port: 0,
          database: '',
          schema: '',
          user: '',
          errorMessage: error.message || 'Failed to test connections',
          responseTimeMs: 0,
        }
      });
    } finally {
      setTestingConnections(false);
    }
  };

  const handleExport = () => {
    const lines: string[] = ['# pgCompare Configuration Export', '# Only non-default values are included', ''];
    
    const categories = ['system', 'repository', 'source', 'target'];
    
    categories.forEach(category => {
      const categoryProps = configData.filter(item => {
        const propDef = getPropertyDefinition(item.key);
        return propDef?.category === category || 
               (!propDef && category === 'system' && !item.key.startsWith('repo-') && !item.key.startsWith('source-') && !item.key.startsWith('target-'));
      });
      
      if (categoryProps.length > 0) {
        lines.push(`# ${CATEGORY_LABELS[category] || category}`);
        categoryProps.forEach(({ key, value }) => {
          if (!isDefaultValue(key, value)) {
            lines.push(`${key}=${value}`);
          }
        });
        lines.push('');
      }
    });
    
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pgcompare.properties';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImport(file);
    }
    e.target.value = '';
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const getCategoryProperties = (category: string) => {
    const existingKeys = new Set(configData.map(item => item.key));
    
    const essentialKeys: Record<string, string[]> = {
      repository: ['repo-host', 'repo-port', 'repo-dbname', 'repo-schema', 'repo-user', 'repo-password', 'repo-sslmode'],
      source: ['source-type', 'source-host', 'source-port', 'source-dbname', 'source-schema', 'source-user', 'source-password', 'source-sslmode', 'source-name', 'source-warehouse'],
      target: ['target-type', 'target-host', 'target-port', 'target-dbname', 'target-schema', 'target-user', 'target-password', 'target-sslmode', 'target-name', 'target-warehouse'],
      system: []
    };
    
    const result: Array<{ key: string; value: string }> = [];
    
    const essential = essentialKeys[category] || [];
    essential.forEach(key => {
      const existing = configData.find(item => item.key === key);
      if (existing) {
        result.push(existing);
      } else {
        const propDef = getPropertyDefinition(key);
        result.push({ key, value: propDef?.defaultValue || '' });
      }
    });
    
    configData.forEach(item => {
      if (result.some(r => r.key === item.key)) return;
      
      const propDef = getPropertyDefinition(item.key);
      if (propDef) {
        if (propDef.category === category) result.push(item);
      } else {
        if (category === 'source' && item.key.startsWith('source-')) result.push(item);
        else if (category === 'target' && item.key.startsWith('target-')) result.push(item);
        else if (category === 'repository' && item.key.startsWith('repo-')) result.push(item);
        else if (category === 'system' && !item.key.startsWith('source-') && !item.key.startsWith('target-') && !item.key.startsWith('repo-')) result.push(item);
      }
    });
    
    return result;
  };

  const getAvailableProperties = () => {
    const existingKeys = new Set(configData.map(item => item.key));
    return CONFIG_PROPERTIES
      .filter(prop => !existingKeys.has(prop.key))
      .sort((a, b) => a.key.localeCompare(b.key));
  };

  const renderPropertyInput = (key: string, value: string) => {
    const propDef = getPropertyDefinition(key);
    
    if (propDef?.type === 'select' && propDef.options) {
      return (
        <select
          value={value}
          onChange={(e) => handleConfigChange(key, e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500"
        >
          {propDef.options.map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      );
    }
    
    if (propDef?.type === 'boolean') {
      return (
        <select
          value={value}
          onChange={(e) => handleConfigChange(key, e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500"
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      );
    }
    
    if (propDef?.type === 'password') {
      return (
        <input
          type="password"
          value={value}
          onChange={(e) => handleConfigChange(key, e.target.value)}
          placeholder="Enter password"
          autoComplete="new-password"
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500"
        />
      );
    }
    
    return (
      <input
        type={propDef?.type === 'number' ? 'number' : 'text'}
        value={value}
        onChange={(e) => handleConfigChange(key, e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500"
      />
    );
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Project Configuration</h3>
        <div className="flex gap-2">
          <input
            type="file"
            id="config-import"
            onChange={handleFileUpload}
            accept=".properties,.txt"
            className="hidden"
          />
          <label
            htmlFor="config-import"
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 cursor-pointer"
          >
            <Upload className="h-4 w-4" />
            Import
          </label>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
          {projectId && (
            <button
              onClick={handleTestConnections}
              disabled={testingConnections}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
            >
              {testingConnections ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plug className="h-4 w-4" />
              )}
              {testingConnections ? 'Testing...' : 'Test Connections'}
            </button>
          )}
          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Connection Test Results */}
      {showTestResults && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                <Plug className="h-4 w-4" />
                Connection Test Results
              </h4>
              {serverUsed && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Tested via server: {serverUsed.name}
                </p>
              )}
            </div>
            <button
              onClick={() => setShowTestResults(false)}
              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              <XCircle className="h-5 w-5" />
            </button>
          </div>
          
          {testingConnections ? (
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              Testing connections via pgCompare server...
            </div>
          ) : testError ? (
            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
                <XCircle className="h-5 w-5" />
                <span className="font-medium">Connection Test Failed</span>
              </div>
              <p className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">{testError}</p>
            </div>
          ) : Object.keys(connectionResults).length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No results yet</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(connectionResults).map(([key, result]) => {
                if (!result) return null;
                return (
                  <div
                    key={key}
                    className={`p-3 rounded-lg border ${
                      result.success
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                        : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {result.success ? (
                        <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                      )}
                      <span className="font-medium text-gray-900 dark:text-white capitalize">
                        {key}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        ({result.databaseType})
                      </span>
                      <span className="text-xs text-gray-400 ml-auto">
                        {result.responseTimeMs}ms
                      </span>
                    </div>
                    
                    <div className="text-sm space-y-1 ml-7">
                      <p className="text-gray-600 dark:text-gray-300">
                        <span className="text-gray-500 dark:text-gray-400">Host:</span> {result.host}:{result.port}
                      </p>
                      <p className="text-gray-600 dark:text-gray-300">
                        <span className="text-gray-500 dark:text-gray-400">Database:</span> {result.database}
                        {result.schema && <span className="text-gray-400"> / {result.schema}</span>}
                      </p>
                      <p className="text-gray-600 dark:text-gray-300">
                        <span className="text-gray-500 dark:text-gray-400">User:</span> {result.user}
                      </p>
                      
                      {result.success && result.databaseProductName && (
                        <p className="text-green-600 dark:text-green-400">
                          <span className="text-gray-500 dark:text-gray-400">Server:</span> {result.databaseProductName} {result.databaseProductVersion}
                        </p>
                      )}
                      
                      {!result.success && result.errorMessage && (
                        <div className="mt-2 p-2 bg-red-100 dark:bg-red-900/30 rounded text-red-700 dark:text-red-300">
                          <p className="font-medium">Error:</p>
                          <p className="text-sm">{result.errorMessage}</p>
                          {result.errorDetail && (
                            <p className="text-xs mt-1 text-red-600 dark:text-red-400">{result.errorDetail}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Category Sections */}
      {['system', 'repository', 'source', 'target'].map(category => {
        const categoryProps = getCategoryProperties(category);
        
        return (
          <div key={category} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleCategory(category)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600"
            >
              <div className="flex items-center gap-2">
                {expandedCategories[category] ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <span className="font-medium text-gray-900 dark:text-white">
                  {CATEGORY_LABELS[category]}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  ({categoryProps.length} properties)
                </span>
              </div>
            </button>
            
            {expandedCategories[category] && (
              <div className="p-4 space-y-3">
                {categoryProps.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No properties configured</p>
                ) : (
                  categoryProps.map(({ key, value }) => {
                    const propDef = getPropertyDefinition(key);
                    const isDefault = isDefaultValue(key, value);
                    const label = getFriendlyLabel(key);
                    
                    return (
                      <div key={key} className="flex items-start gap-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <label className="font-medium text-sm text-gray-900 dark:text-white">
                              {label}
                            </label>
                            {isDefault && (
                              <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-600 rounded">
                                default
                              </span>
                            )}
                            <span className="text-xs text-gray-400" title={key}>
                              ({key})
                            </span>
                          </div>
                          {propDef?.description && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                              {propDef.description}
                            </p>
                          )}
                          {renderPropertyInput(key, value)}
                        </div>
                        <button
                          onClick={() => handleRemoveProperty(key)}
                          className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                          title="Remove property"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Add Property */}
      <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4">
        {showAddProperty ? (
          <div className="flex items-center gap-4">
            <select
              value={newPropertyKey}
              onChange={(e) => setNewPropertyKey(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
            >
              <option value="">Select a property...</option>
              {getAvailableProperties().map(prop => (
                <option key={prop.key} value={prop.key}>
                  {prop.label} - {prop.description}
                </option>
              ))}
            </select>
            <button
              onClick={handleAddProperty}
              disabled={!newPropertyKey}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              Add
            </button>
            <button
              onClick={() => {
                setShowAddProperty(false);
                setNewPropertyKey('');
              }}
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAddProperty(true)}
            className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          >
            <Plus className="h-4 w-4" />
            Add Property
          </button>
        )}
      </div>
    </div>
  );
}
