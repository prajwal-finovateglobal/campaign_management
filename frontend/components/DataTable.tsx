'use client';

import { useState, useMemo } from 'react';
import { MessageSquare, Database, Loader2, Play } from 'lucide-react';

interface DataLog {
  id?: number;
  call_start_time?: string;
  chat?: any;
  provider?: string;
  contact_to?: string;
  contact_from?: string;
  direction?: string;
  call_id?: string;
  agent_id?: string;
  duration?: number;
  recording?: string;
  model?: string;
  language?: string;
  cost?: number;
  meta_data?: any;
}

interface DataTableProps {
  data: DataLog[];
  loading: boolean;
  selectedColumns: Record<string, boolean>;
  expandedMetadataColumns?: Record<string, boolean>;
  onPlayRecording: (url: string) => void;
  onViewChat: (chat: any) => void;
  onViewMetadata: (metadata: any) => void;
  editMode?: boolean;
  selectedRecords?: Set<number>;
  onToggleRecord?: (index: number) => void;
  onToggleAll?: () => void;
  editedRecords?: Map<number, any>;
  onCellEdit?: (rowIndex: number, column: string, value: any) => void;
}

export function DataTable({
  data,
  loading,
  selectedColumns,
  expandedMetadataColumns = {},
  onPlayRecording,
  onViewChat,
  onViewMetadata,
  editMode = false,
  selectedRecords = new Set(),
  onToggleRecord,
  onToggleAll,
  editedRecords = new Map(),
  onCellEdit,
}: DataTableProps) {
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: 'asc' | 'desc';
  } | null>(null);

  const visibleColumns = useMemo(() => {
    if (data.length === 0) return [];
    const baseColumns = Object.keys(selectedColumns).filter((key) => selectedColumns[key]);
    
    // Only show expanded metadata columns if meta_data is actually selected
    const isMetaDataSelected = selectedColumns['meta_data'] === true;
    const hasExpandedMetadata = Object.keys(expandedMetadataColumns).length > 0;
    
    if (isMetaDataSelected && hasExpandedMetadata) {
      // Remove meta_data from visible columns if expanded metadata exists
      const filteredColumns = baseColumns.filter((col) => col !== 'meta_data');
      // Add expanded metadata columns
      const expandedCols = Object.keys(expandedMetadataColumns).filter(
        (key) => expandedMetadataColumns[key]
      );
      return [...filteredColumns, ...expandedCols];
    }
    
    return baseColumns;
  }, [selectedColumns, expandedMetadataColumns, data]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (
      sortConfig &&
      sortConfig.key === key &&
      sortConfig.direction === 'asc'
    ) {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedData = useMemo(() => {
    if (!sortConfig) return data;

    return [...data].sort((a, b) => {
      const aValue = (a as any)[sortConfig.key];
      const bValue = (b as any)[sortConfig.key];

      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc'
          ? aValue - bValue
          : bValue - aValue;
      }

      const aStr = String(aValue).toLowerCase();
      const bStr = String(bValue).toLowerCase();

      if (aStr < bStr) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aStr > bStr) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [data, sortConfig]);

  const formatDuration = (seconds: number): string => {
    if (seconds === null || seconds === undefined || isNaN(seconds)) return '-';
    const totalSeconds = Math.round(seconds);
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  };

  const formatDateTime = (dateTimeStr: string): string => {
    if (!dateTimeStr) return '-';
    try {
      const date = new Date(dateTimeStr);
      if (isNaN(date.getTime())) return dateTimeStr;
      
      // Format date: YYYY-MM-DD
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      // Format time: HH:MM am/pm
      let hours = date.getHours();
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'pm' : 'am';
      hours = hours % 12;
      hours = hours ? hours : 12; // 0 should be 12
      const timeStr = `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
      
      return `${dateStr} | ${timeStr}`;
    } catch (e) {
      return dateTimeStr;
    }
  };

  const formatCellValue = (value: any): string => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'object') return JSON.stringify(value);
    if (typeof value === 'number') {
      // Format duration and cost nicely
      if (value % 1 !== 0) {
        return value.toFixed(2);
      }
      return value.toString();
    }
    return String(value);
  };

  if (loading) {
    return (
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-sm p-12">
        <div className="flex flex-col items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)] mb-4" />
          <p className="text-[var(--secondary)]">Loading data...</p>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-sm p-12">
        <div className="text-center">
          <p className="text-[var(--secondary)] text-lg">
            No data available. Apply filters to view results.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[var(--table-header-bg)] border-b border-[var(--card-border)]">
              {/* Checkbox column in edit mode */}
              {editMode && (
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--foreground)] w-12">
                  <input
                    type="checkbox"
                    checked={selectedRecords.size === sortedData.length && sortedData.length > 0}
                    onChange={onToggleAll}
                    className="w-4 h-4 rounded border-[var(--input-border)] text-[var(--primary)] focus:ring-[var(--primary)] cursor-pointer"
                  />
                </th>
              )}
              {visibleColumns.map((column) => (
                <th
                  key={column}
                  className="px-4 py-3 text-left text-xs font-semibold text-[var(--foreground)] uppercase tracking-wider cursor-pointer hover:bg-[var(--table-row-hover)] transition-colors"
                  onClick={() => handleSort(column)}
                >
                  <div className="flex items-center gap-2">
                    {column.startsWith('meta_data.') 
                      ? column.replace('meta_data.', '').replace(/_/g, ' ')
                      : column.replace(/_/g, ' ')}
                    {sortConfig?.key === column && (
                      <span className="text-[var(--primary)]">
                        {sortConfig.direction === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--card-border)]">
            {sortedData.map((row, idx) => (
              <tr
                key={row.id || idx}
                className={`hover:bg-[var(--table-row-hover)] transition-colors ${
                  editMode && selectedRecords.has(idx) ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                }`}
              >
                {/* Checkbox cell in edit mode */}
                {editMode && (
                  <td className="px-4 py-3 w-12">
                    <input
                      type="checkbox"
                      checked={selectedRecords.has(idx)}
                      onChange={() => onToggleRecord?.(idx)}
                      className="w-4 h-4 rounded border-[var(--input-border)] text-[var(--primary)] focus:ring-[var(--primary)] cursor-pointer"
                    />
                  </td>
                )}
                {visibleColumns.map((column) => {
                  // For recording column, show play button if valid URL
                  if (column === 'recording') {
                    const recordingValue = (row as any)[column];
                    const recordingStr = recordingValue ? String(recordingValue).trim() : '';
                    const isValidRecording = recordingStr && 
                      recordingStr !== '-' && 
                      recordingStr !== '' &&
                      (recordingStr.startsWith('http://') || recordingStr.startsWith('https://'));
                    
                    return (
                      <td
                        key={column}
                        className="px-4 py-3 text-sm text-[var(--foreground)]"
                      >
                        {isValidRecording ? (
                          <button
                            onClick={() => onPlayRecording(recordingStr)}
                            className="flex items-center justify-center w-8 h-8 rounded-md bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition-colors"
                            title="Play recording"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                        ) : (
                          <span className="text-[var(--secondary)]">-</span>
                        )}
                      </td>
                    );
                  }

                  // For chat column, show truncated preview or button
                  if (column === 'chat') {
                    const chatValue = (row as any)[column];
                    return (
                      <td
                        key={column}
                        className="px-4 py-3 text-sm text-[var(--foreground)]"
                      >
                        {chatValue ? (
                          <div className="flex items-center gap-2">
                            <span className="truncate max-w-xs">
                              {typeof chatValue === 'object' 
                                ? JSON.stringify(chatValue).substring(0, 50) + '...'
                                : String(chatValue).substring(0, 50)}
                            </span>
                            <button
                              onClick={() => onViewChat(chatValue)}
                              className="flex items-center justify-center w-6 h-6 rounded-md bg-[var(--success)] text-white hover:opacity-90 transition-opacity flex-shrink-0"
                              title="View full chat"
                            >
                              <MessageSquare className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[var(--secondary)]">-</span>
                        )}
                      </td>
                    );
                  }

                  // For call_start_time column, format as YYYY-MM-DD | HH:MM am/pm
                  if (column === 'call_start_time') {
                    const dateTimeValue = (row as any)[column];
                    return (
                      <td
                        key={column}
                        className="px-4 py-3 text-sm text-[var(--foreground)]"
                      >
                        {dateTimeValue !== null && dateTimeValue !== undefined 
                          ? formatDateTime(String(dateTimeValue))
                          : <span className="text-[var(--secondary)]">-</span>}
                      </td>
                    );
                  }

                  // For duration column, format as MM:SS
                  if (column === 'duration') {
                    const durationValue = (row as any)[column];
                    return (
                      <td
                        key={column}
                        className="px-4 py-3 text-sm text-[var(--foreground)]"
                      >
                        {durationValue !== null && durationValue !== undefined 
                          ? formatDuration(Number(durationValue))
                          : <span className="text-[var(--secondary)]">-</span>}
                      </td>
                    );
                  }

                  // For expanded metadata columns (meta_data.key format)
                  if (column.startsWith('meta_data.')) {
                    const metadataKey = column.replace('meta_data.', '');
                    const metadataValue = (row as any).meta_data;
                    const value = metadataValue && typeof metadataValue === 'object' 
                      ? metadataValue[metadataKey] 
                      : null;
                    return (
                      <td
                        key={column}
                        className="px-4 py-3 text-sm text-[var(--foreground)]"
                      >
                        {value !== null && value !== undefined 
                          ? formatCellValue(value)
                          : <span className="text-[var(--secondary)]">-</span>}
                      </td>
                    );
                  }

                  // For meta_data column, show truncated preview or button (only if not expanded)
                  if (column === 'meta_data') {
                    const metadataValue = (row as any)[column];
                    return (
                      <td
                        key={column}
                        className="px-4 py-3 text-sm text-[var(--foreground)]"
                      >
                        {metadataValue ? (
                          <div className="flex items-center gap-2">
                            <span className="truncate max-w-xs">
                              {typeof metadataValue === 'object' 
                                ? JSON.stringify(metadataValue).substring(0, 50) + '...'
                                : String(metadataValue).substring(0, 50)}
                            </span>
                            <button
                              onClick={() => onViewMetadata(metadataValue)}
                              className="flex items-center justify-center w-6 h-6 rounded-md bg-[var(--primary)] text-white hover:opacity-90 transition-opacity flex-shrink-0"
                              title="View metadata"
                            >
                              <Database className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[var(--secondary)]">-</span>
                        )}
                      </td>
                    );
                  }

                  // Get the current value (either edited or original)
                  const originalValue = (row as any)[column];
                  const editedRow = editedRecords.get(idx);
                  const currentValue = editedRow && editedRow.hasOwnProperty(column) 
                    ? editedRow[column] 
                    : originalValue;
                  const isEdited = editedRow && editedRow.hasOwnProperty(column);

                  return (
                    <td
                      key={column}
                      className={`px-4 py-3 text-sm ${isEdited ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''}`}
                    >
                      {editMode ? (
                        <input
                          type="text"
                          value={currentValue !== null && currentValue !== undefined ? String(currentValue) : ''}
                          onChange={(e) => onCellEdit?.(idx, column, e.target.value)}
                          className="w-full px-2 py-1 text-sm border border-[var(--input-border)] rounded bg-[var(--input-bg)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                        />
                      ) : (
                        <span className="text-[var(--foreground)]">{formatCellValue(currentValue)}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3 bg-[var(--table-header-bg)] border-t border-[var(--card-border)]">
        <p className="text-sm text-[var(--secondary)]">
          Showing {data.length} {data.length === 1 ? 'record' : 'records'}
        </p>
      </div>
    </div>
  );
}

