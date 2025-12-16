'use client';

import { X, Download } from 'lucide-react';
import { useMemo } from 'react';

interface CSVPreviewModalProps {
  data: any[];
  selectedColumns: Record<string, boolean>;
  csvFileName: string;
  onClose: () => void;
  onConfirmDownload: () => void;
}

// Helper function to format chat data for display
const formatChatForDisplay = (chat: any): string => {
  if (!chat) return '-';
  
  // If it's an array of messages
  if (Array.isArray(chat)) {
    return chat
      .map((msg: any) => {
        const role = msg.role || msg.sender || 'unknown';
        const content = msg.content || msg.message || msg.text || '';
        return `${role}: ${content}`;
      })
      .join(' | ');
  }
  
  // If it's an object with messages property
  if (typeof chat === 'object' && chat.messages && Array.isArray(chat.messages)) {
    return formatChatForDisplay(chat.messages);
  }
  
  // If it's an object with chat property
  if (typeof chat === 'object' && chat.chat && Array.isArray(chat.chat)) {
    return formatChatForDisplay(chat.chat);
  }
  
  // If it's a string, try to parse it
  if (typeof chat === 'string') {
    try {
      const parsed = JSON.parse(chat);
      return formatChatForDisplay(parsed);
    } catch {
      return chat.length > 100 ? chat.substring(0, 100) + '...' : chat;
    }
  }
  
  // Fallback to JSON stringify for other object types
  const jsonStr = JSON.stringify(chat);
  return jsonStr.length > 100 ? jsonStr.substring(0, 100) + '...' : jsonStr;
};

// Helper function to format value for display
const formatValueForDisplay = (value: any, column: string): string => {
  if (value === null || value === undefined) return '-';
  
  // Special handling for chat column
  if (column === 'chat') {
    return formatChatForDisplay(value);
  }
  
  // Special handling for meta_data column
  if (column === 'meta_data') {
    if (typeof value === 'object') {
      const jsonStr = JSON.stringify(value);
      return jsonStr.length > 100 ? jsonStr.substring(0, 100) + '...' : jsonStr;
    }
    if (typeof value === 'string') {
      return value.length > 100 ? value.substring(0, 100) + '...' : value;
    }
  }
  
  // Handle arrays
  if (Array.isArray(value)) {
    const arrStr = value.map(item => 
      typeof item === 'object' ? JSON.stringify(item) : String(item)
    ).join(', ');
    return arrStr.length > 100 ? arrStr.substring(0, 100) + '...' : arrStr;
  }
  
  // Handle objects
  if (typeof value === 'object') {
    const jsonStr = JSON.stringify(value);
    return jsonStr.length > 100 ? jsonStr.substring(0, 100) + '...' : jsonStr;
  }
  
  // Handle strings - truncate if too long
  const str = String(value);
  return str.length > 100 ? str.substring(0, 100) + '...' : str;
};

export function CSVPreviewModal({
  data,
  selectedColumns,
  csvFileName,
  onClose,
  onConfirmDownload,
}: CSVPreviewModalProps) {
  const selectedCols = useMemo(() => {
    return Object.keys(selectedColumns).filter((key) => selectedColumns[key]);
  }, [selectedColumns]);

  const previewData = useMemo(() => {
    // Show first 10 rows for preview
    return data.slice(0, 10).map((row) => {
      const previewRow: Record<string, string> = {};
      selectedCols.forEach((col) => {
        const value = (row as any)[col];
        previewRow[col] = formatValueForDisplay(value, col);
      });
      return previewRow;
    });
  }, [data, selectedCols]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-[var(--card-bg)] rounded-lg shadow-xl w-full max-w-6xl mx-4 h-[90vh] flex flex-col border border-[var(--card-border)]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--card-border)]">
          <h2 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
            <Download className="w-5 h-5" />
            CSV Download Preview
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-[var(--table-row-hover)] transition-colors"
          >
            <X className="w-5 h-5 text-[var(--foreground)]" />
          </button>
        </div>

        {/* Preview Info */}
        <div className="p-4 border-b border-[var(--card-border)] bg-[var(--table-header-bg)]">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-sm text-[var(--foreground)]">
                <span className="font-semibold">File name:</span> {csvFileName || 'campaign_data'}.csv
              </p>
              <p className="text-sm text-[var(--secondary)]">
                <span className="font-semibold">Total rows:</span> {data.length} | 
                <span className="font-semibold"> Columns:</span> {selectedCols.length} | 
                <span className="font-semibold"> Preview:</span> Showing first 10 rows
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-[var(--foreground)] bg-[var(--table-row-hover)] rounded-md hover:opacity-90 transition-opacity"
              >
                Cancel
              </button>
              <button
                onClick={onConfirmDownload}
                className="px-4 py-2 text-sm font-medium text-white bg-[var(--success)] rounded-md hover:opacity-90 transition-opacity flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download CSV
              </button>
            </div>
          </div>
        </div>

        {/* Preview Table */}
        <div className="flex-1 overflow-auto p-4">
          {previewData.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-[var(--secondary)]">No data to preview</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-[var(--table-header-bg)]">
                    {selectedCols.map((col) => (
                      <th
                        key={col}
                        className="px-4 py-2 text-left text-xs font-semibold text-[var(--foreground)] border border-[var(--card-border)] sticky top-0 bg-[var(--table-header-bg)]"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.map((row, idx) => (
                    <tr
                      key={idx}
                      className="hover:bg-[var(--table-row-hover)] transition-colors"
                    >
                      {selectedCols.map((col) => (
                        <td
                          key={col}
                          className="px-4 py-2 text-xs text-[var(--foreground)] border border-[var(--card-border)] max-w-xs"
                        >
                          <div className="truncate" title={row[col]}>
                            {row[col]}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--card-border)] bg-[var(--table-header-bg)]">
          <p className="text-xs text-[var(--secondary)] text-center">
            {data.length > 10 ? (
              <>Showing first 10 of {data.length} rows. All {data.length} rows will be included in the download.</>
            ) : (
              <>All {data.length} rows will be included in the download.</>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

