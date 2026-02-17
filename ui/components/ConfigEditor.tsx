'use client';

import { useState, useEffect } from 'react';
import { Save, Plus, Trash2, Download, Upload, ChevronDown, ChevronRight, Info } from 'lucide-react';
import { CONFIG_PROPERTIES, CATEGORY_LABELS, PropertyDefinition, getPropertyDefinition, isDefaultValue } from '@/lib/configProperties';

interface ConfigEditorProps {
  configData: Array<{ key: string; value: string }>;
  onConfigChange: (configData: Array<{ key: string; value: string }>) => void;
  onSave: () => void;
  onImport: (file: File) => void;
  saving: boolean;
}

export default function ConfigEditor({ 
  configData, 
  onConfigChange, 
  onSave, 
  onImport,
  saving 
}: ConfigEditorProps) {
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    system: true,
    repository: false,
    source: false,
    target: false,
  });
  const [showAddProperty, setShowAddProperty] = useState(false);
  const [newPropertyKey, setNewPropertyKey] = useState('');

  const handleConfigChange = (key: string, value: string) => {
    const newConfig = configData.map(item => 
      item.key === key ? { ...item, value } : item
    );
    onConfigChange(newConfig);
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
    return configData.filter(item => {
      const propDef = getPropertyDefinition(item.key);
      if (propDef) {
        return propDef.category === category;
      }
      if (category === 'source') return item.key.startsWith('source-');
      if (category === 'target') return item.key.startsWith('target-');
      if (category === 'repository') return item.key.startsWith('repo-');
      return category === 'system';
    });
  };

  const getAvailableProperties = () => {
    const existingKeys = new Set(configData.map(item => item.key));
    return CONFIG_PROPERTIES.filter(prop => !existingKeys.has(prop.key));
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
                    
                    return (
                      <div key={key} className="flex items-start gap-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <label className="font-medium text-sm text-gray-900 dark:text-white">
                              {key}
                            </label>
                            {isDefault && (
                              <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-600 rounded">
                                default
                              </span>
                            )}
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
                  {prop.key} - {prop.description}
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
