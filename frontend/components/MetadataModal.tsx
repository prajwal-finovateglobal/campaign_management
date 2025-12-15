'use client';

import { X, Database } from 'lucide-react';

interface MetadataModalProps {
  metadata: any;
  onClose: () => void;
}

export function MetadataModal({ metadata, onClose }: MetadataModalProps) {
  const formatMetadata = (data: any): any => {
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch {
        return data;
      }
    }
    return data;
  };

  const formattedMetadata = formatMetadata(metadata);

  const renderValue = (value: any, depth: number = 0): JSX.Element => {
    if (value === null || value === undefined) {
      return <span className="text-[var(--secondary)]">null</span>;
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      const indentStyle = { marginLeft: `${depth * 16}px` };
      return (
        <div style={indentStyle} className="border-l-2 border-[var(--card-border)] pl-3">
          {Object.entries(value).map(([key, val]) => (
            <div key={key} className="mb-2">
              <span className="font-semibold text-[var(--primary)]">{key}:</span>
              <div className="mt-1">{renderValue(val, depth + 1)}</div>
            </div>
          ))}
        </div>
      );
    }

    if (Array.isArray(value)) {
      const indentStyle = { marginLeft: `${depth * 16}px` };
      return (
        <div style={indentStyle}>
          {value.map((item, idx) => (
            <div key={idx} className="mb-1 pl-4 border-l-2 border-[var(--card-border)]">
              {renderValue(item, depth + 1)}
            </div>
          ))}
        </div>
      );
    }

    return <span className="text-[var(--foreground)]">{String(value)}</span>;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-[var(--card-bg)] rounded-lg shadow-xl w-full max-w-2xl mx-4 h-[80vh] flex flex-col border border-[var(--card-border)]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--card-border)]">
          <h2 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
            <Database className="w-5 h-5" />
            Metadata
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-[var(--table-row-hover)] transition-colors"
          >
            <X className="w-5 h-5 text-[var(--foreground)]" />
          </button>
        </div>

        {/* Metadata Container */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#f0f2f5] dark:bg-[#1a1a1a]">
          {formattedMetadata === null || formattedMetadata === undefined ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-[var(--secondary)]">No metadata available</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-[#2a2a2a] rounded-lg p-4 shadow-sm">
              <div className="text-sm text-[var(--foreground)]">
                {renderValue(formattedMetadata)}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--card-border)] bg-[var(--table-header-bg)]">
          <p className="text-xs text-[var(--secondary)] text-center">
            Metadata Details
          </p>
        </div>
      </div>
    </div>
  );
}

