'use client';

import { X, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';

interface CSVPreviewModalProps {
  /** Initial page data (e.g. first page) */
  data: any[];
  selectedColumns: Record<string, boolean>;
  csvFileName: string;
  downloadFormat?: 'csv' | 'json';
  /** Total number of rows that will be exported (for display and pagination) */
  totalCount: number;
  /** Page size for preview (same as table page size) */
  pageSize: number;
  /** Fetch a specific page of preview data (1-based). Returns rows for that page. */
  fetchPreviewPage: (page: number) => Promise<any[]>;
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
  downloadFormat = 'csv',
  totalCount,
  pageSize,
  fetchPreviewPage,
  onClose,
  onConfirmDownload,
}: CSVPreviewModalProps) {
  const selectedCols = useMemo(() => {
    return Object.keys(selectedColumns).filter((key) => selectedColumns[key]);
  }, [selectedColumns]);

  const [previewPage, setPreviewPage] = useState(1);
  const [previewDataRaw, setPreviewDataRaw] = useState<any[]>(data);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const totalPreviewPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // When modal opens or page changes, fetch that page (always fetch so preview matches export filters)
  useEffect(() => {
    let cancelled = false;
    setLoadingPreview(true);
    fetchPreviewPage(previewPage)
      .then((rows) => {
        if (!cancelled) setPreviewDataRaw(rows || []);
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });
    return () => { cancelled = true; };
  }, [previewPage, fetchPreviewPage]);

  // Reset to page 1 when modal opens
  useEffect(() => {
    setPreviewPage(1);
  }, []);

  const previewData = useMemo(() => {
    return previewDataRaw.map((row) => {
      const previewRow: Record<string, string> = {};
      selectedCols.forEach((col) => {
        const value = (row as any)[col];
        previewRow[col] = formatValueForDisplay(value, col);
      });
      return previewRow;
    });
  }, [previewDataRaw, selectedCols]);

  const startRow = (previewPage - 1) * pageSize + 1;
  const endRow = Math.min(previewPage * pageSize, totalCount);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-[var(--card-bg)] rounded-lg shadow-xl w-full max-w-6xl mx-4 h-[90vh] flex flex-col border border-[var(--card-border)]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--card-border)]">
          <h2 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
            <Download className="w-5 h-5" />
            {downloadFormat.toUpperCase()} Download Preview
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
                <span className="font-semibold">File name:</span> {csvFileName || 'campaign_data'}.{downloadFormat}
              </p>
              <p className="text-sm text-[var(--secondary)]">
                <span className="font-semibold">Total rows:</span> {totalCount.toLocaleString()} | 
                <span className="font-semibold"> Columns:</span> {selectedCols.length} | 
                <span className="font-semibold"> Preview:</span> Showing rows {startRow}–{endRow} of {totalCount.toLocaleString()}
                {totalPreviewPages > 1 && (
                  <span className="ml-1">(page {previewPage} of {totalPreviewPages})</span>
                )}
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
                Download {downloadFormat.toUpperCase()}
              </button>
            </div>
          </div>
        </div>

        {/* Preview Table */}
        <div className="flex-1 overflow-auto p-4">
          {loadingPreview ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-[var(--secondary)]">Loading preview...</p>
            </div>
          ) : previewData.length === 0 ? (
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

        {/* Footer: pagination + download note */}
        <div className="p-4 border-t border-[var(--card-border)] bg-[var(--table-header-bg)] flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-[var(--secondary)]">
            All {totalCount.toLocaleString()} rows will be included in the download.
          </p>
          {totalPreviewPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                disabled={previewPage <= 1 || loadingPreview}
                className="p-1.5 rounded-md border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--table-row-hover)] transition-colors"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-[var(--secondary)] min-w-[100px] text-center">
                Page {previewPage} of {totalPreviewPages}
              </span>
              <button
                type="button"
                onClick={() => setPreviewPage((p) => Math.min(totalPreviewPages, p + 1))}
                disabled={previewPage >= totalPreviewPages || loadingPreview}
                className="p-1.5 rounded-md border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--table-row-hover)] transition-colors"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

