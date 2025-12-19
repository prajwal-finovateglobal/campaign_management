'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FilterSection } from '@/components/FilterSection';
import { DataTable } from '@/components/DataTable';
import { AudioPlayerModal } from '@/components/AudioPlayerModal';
import { ChatModal } from '@/components/ChatModal';
import { MetadataModal } from '@/components/MetadataModal';
import { CSVPreviewModal } from '@/components/CSVPreviewModal';
import { CampaignManagement } from '@/components/CampaignManagement';
import { DispositionTree } from '@/components/DispositionTree';
import { PersistentFilters } from '@/components/PersistentFilters';
import { Download, AlertCircle, Info, CheckCircle2, X, Database, BarChart3, Wrench, Search, ChevronDown, ChevronLeft, ChevronRight, Network, LogOut, Loader2, Trash2 } from 'lucide-react';
import { api, setAuthToken, getAuthToken } from '@/lib/api';

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

export default function Home() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [data, setData] = useState<DataLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSDTC, setLoadingSDTC] = useState(false);
  const [selectedRecording, setSelectedRecording] = useState<string | null>(null);
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [selectedMetadata, setSelectedMetadata] = useState<any>(null);
  const [selectedColumns, setSelectedColumns] = useState<Record<string, boolean>>({});
  const [currentPreset, setCurrentPreset] = useState<string>('simple');
  const [expandedMetadataColumns, setExpandedMetadataColumns] = useState<Record<string, boolean>>({});
  const [csvFileName, setCsvFileName] = useState('campaign_data');
  const [sdtcError, setSdtcError] = useState<string | null>(null);
  const [sdtcErrorTimeout, setSdtcErrorTimeout] = useState<NodeJS.Timeout | null>(null);
  const [deletePCDMessage, setDeletePCDMessage] = useState<string | null>(null);
  const [deletePCDTone, setDeletePCDTone] = useState<'positive' | 'neutral' | 'danger'>('neutral');
  const [deletePCDTimeout, setDeletePCDTimeout] = useState<NodeJS.Timeout | null>(null);
  const [loadingDeletePCD, setLoadingDeletePCD] = useState(false);
  const [cutCCDMessage, setCutCCDMessage] = useState<string | null>(null);
  const [cutCCDTone, setCutCCDTone] = useState<'positive' | 'neutral' | 'danger'>('neutral');
  const [cutCCDTimeout, setCutCCDTimeout] = useState<NodeJS.Timeout | null>(null);
  const [loadingCutCCD, setLoadingCutCCD] = useState(false);
  const [showCCDModal, setShowCCDModal] = useState(false);
  const [ccdData, setCcdData] = useState<any[]>([]);
  const [loadingCCD, setLoadingCCD] = useState(false);
  const [ccdLimit, setCcdLimit] = useState<number>(50);
  const [showCSVPreview, setShowCSVPreview] = useState(false);
  const [ccdCurrentPage, setCcdCurrentPage] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<'data-management' | 'campaign-management' | 'reports' | 'disposition-tree'>('data-management');
  
  // View/Edit mode states for CCD modal
  const [ccdViewMode, setCcdViewMode] = useState<'view' | 'edit'>('view');
  const [selectedCcdRecords, setSelectedCcdRecords] = useState<Set<number>>(new Set());
  const [deletingCcdRecords, setDeletingCcdRecords] = useState(false);
  const [editedCcdRecords, setEditedCcdRecords] = useState<Map<number, any>>(new Map());
  const [savingCcdChanges, setSavingCcdChanges] = useState(false);
  const [newCcdRecords, setNewCcdRecords] = useState<any[]>([]);
  const [searchColumn, setSearchColumn] = useState<string>('');
  const [searchInput, setSearchInput] = useState<string>('');
  
  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      // Use getAuthToken which checks both cookies and localStorage
      const token = getAuthToken();
      if (!token) {
        router.push('/login');
        return;
      }

      try {
        // api.get will automatically add Authorization header from token
        const response = await api.get('/auth/verify');

        if (response.ok) {
          setIsAuthenticated(true);
        } else {
          setAuthToken(null);
          router.push('/login');
        }
      } catch (error) {
        setAuthToken(null);
        router.push('/login');
      }
    };

    checkAuth();
  }, [router]);

  // Handle URL parameters for shared links
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam === 'disposition-tree') {
        setActiveTab('disposition-tree');
      }
      // Clean up URL after setting tab (optional - keeps URL clean)
      // if (tabParam === 'disposition-tree') {
      //   window.history.replaceState({}, '', window.location.pathname);
      // }
    }
  }, []);

  // Handle logout
  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setAuthToken(null);
      router.push('/login');
    }
  };
  
  // Persistent filter states (survive tab switches)
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [selectedClientTableName, setSelectedClientTableName] = useState<string | null>(null);
  const [selectedPhaseId, setSelectedPhaseId] = useState<number | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);

  const handleApplyFilters = async (filters: any) => {
    // Validate that client is selected before applying filters
    if (!selectedClientId) {
      alert('Please select a client first before applying filters.');
      return;
    }

    setLoading(true);
    try {
      // Add persistent filter values to the request
      const requestBody = {
        ...filters,
        client_id: selectedClientId,
        table_name: selectedClientTableName,
        phase_id: selectedPhaseId,
        campaign_id: selectedCampaignId,
      };
      
      const response = await api.post('/show_data', requestBody);

      if (!response.ok) {
        throw new Error('Failed to fetch data');
      }

      const result = await response.json();
      setData(result.data || []);

      // Initialize column selection - preserve preset or existing selection
      if (result.data && result.data.length > 0) {
        const availableColumns = Object.keys(result.data[0]);
        const columns: Record<string, boolean> = {};
        
        // Apply preset (default to 'simple' if not set)
        const presetToApply = currentPreset || 'simple';
        if (presetToApply) {
          // Initialize all columns to false
          availableColumns.forEach((key) => {
            columns[key] = false;
          });
          
          // Apply preset
          if (presetToApply === 'simple') {
            const simpleColumns = ['call_start_time', 'chat', 'contact_to', 'direction', 'duration', 'recording'];
            simpleColumns.forEach((col) => {
              if (availableColumns.includes(col)) {
                columns[col] = true;
              }
            });
            // Set current preset if not already set
            if (!currentPreset) {
              setCurrentPreset('simple');
            }
          } else if (presetToApply === 'metadata') {
            // Show contact_to and meta_data columns
            if (availableColumns.includes('contact_to')) {
              columns['contact_to'] = true;
            }
            if (availableColumns.includes('meta_data')) {
              columns['meta_data'] = true;
            }
            // Extract all unique keys from meta_data
            const metadataKeys = new Set<string>();
            result.data.forEach((row: DataLog) => {
              if (row.meta_data && typeof row.meta_data === 'object') {
                Object.keys(row.meta_data).forEach((key) => {
                  metadataKeys.add(`meta_data.${key}`);
                });
              }
            });
            // Create expanded columns for metadata keys
            const expandedCols: Record<string, boolean> = {};
            Array.from(metadataKeys).forEach((key) => {
              expandedCols[key] = true;
            });
            setExpandedMetadataColumns(expandedCols);
          }
        } else if (Object.keys(selectedColumns).length > 0) {
          // Preserve existing column selection for columns that still exist
          availableColumns.forEach((key) => {
            columns[key] = selectedColumns[key] !== undefined ? selectedColumns[key] : true;
          });
        } else {
          // Default: select all columns
          availableColumns.forEach((key) => {
            columns[key] = true;
          });
        }
        
        setSelectedColumns(columns);
        // Set first column as default search column
        const firstColumn = availableColumns[0];
        setSearchColumn(firstColumn);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      alert('Failed to fetch data. Please check if the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelectAll = () => {
    const allSelected = Object.values(selectedColumns).every((val) => val === true);
    const newColumns: Record<string, boolean> = {};
    Object.keys(selectedColumns).forEach((key) => {
      newColumns[key] = !allSelected;
    });
    setSelectedColumns(newColumns);
    // Clear expanded metadata columns if meta_data is being deselected
    if (!allSelected && newColumns['meta_data'] === false) {
      setExpandedMetadataColumns({});
    }
  };

  const handlePresetChange = (preset: string) => {
    if (preset === 'none' || !preset) {
      setCurrentPreset('');
      return;
    }

    // Store the preset state
    setCurrentPreset(preset);

    const allColumns = Object.keys(selectedColumns);
    const newColumns: Record<string, boolean> = {};
    
    // Initialize all columns to false
    allColumns.forEach((key) => {
      newColumns[key] = false;
    });

    // Apply preset
    if (preset === 'simple') {
      // Simple preset: call_start_time, chat, contact_to, direction, duration, recording
      const simpleColumns = ['call_start_time', 'chat', 'contact_to', 'direction', 'duration', 'recording'];
      simpleColumns.forEach((col) => {
        if (allColumns.includes(col)) {
          newColumns[col] = true;
        }
      });
    } else if (preset === 'metadata') {
      // Metadata preset: show contact_to and meta_data, and expand meta_data into columns
      if (allColumns.includes('contact_to')) {
        newColumns['contact_to'] = true;
      }
      if (allColumns.includes('meta_data')) {
        newColumns['meta_data'] = true;
      }
      // Extract all unique keys from meta_data in current data
      const metadataKeys = new Set<string>();
      if (data && data.length > 0) {
        data.forEach((row) => {
          if (row.meta_data && typeof row.meta_data === 'object') {
            Object.keys(row.meta_data).forEach((key) => {
              metadataKeys.add(`meta_data.${key}`);
            });
          }
        });
      }
      // Enable all metadata columns
      const expandedCols: Record<string, boolean> = {};
      Array.from(metadataKeys).forEach((key) => {
        expandedCols[key] = true;
      });
      setExpandedMetadataColumns(expandedCols);
    }
    // Add more presets here in the future

    setSelectedColumns(newColumns);
    
    // Reset dropdown to show "Presets" placeholder
    const selectElement = document.querySelector('select[value=""]') as HTMLSelectElement;
    if (selectElement) {
      selectElement.value = '';
    }
  };

  const handleCloseDeletePCDMessage = () => {
    if (deletePCDTimeout) {
      clearTimeout(deletePCDTimeout);
      setDeletePCDTimeout(null);
    }
    setDeletePCDMessage(null);
  };

  const handleCloseCutCCDMessage = () => {
    if (cutCCDTimeout) {
      clearTimeout(cutCCDTimeout);
      setCutCCDTimeout(null);
    }
    setCutCCDMessage(null);
  };

  const handleShowCCD = async () => {
    setShowCCDModal(true);
    setLoadingCCD(true);
    setCcdCurrentPage(1);

    try {
      const response = await api.get('/get_csv_data');

      if (!response.ok) {
        console.error('Failed to fetch CCD data');
        setCcdData([]);
      } else {
        const result = await response.json();
        setCcdData(result.data || []);
      }
    } catch (error) {
      console.error('Error fetching CCD data:', error);
      setCcdData([]);
    } finally {
      setLoadingCCD(false);
    }
  };

  const handleCutCCD = async () => {
    setLoadingCutCCD(true);
    setCutCCDMessage(null);
    if (cutCCDTimeout) {
      clearTimeout(cutCCDTimeout);
      setCutCCDTimeout(null);
    }

    try {
      // Extract contact_to or phone values from displayed data
      const contactValues: string[] = [];
      data.forEach((row) => {
        const contactTo = row.contact_to;
        const phone = (row as any).phone;
        
        if (contactTo && contactTo.trim()) {
          contactValues.push(contactTo.trim());
        } else if (phone && phone.trim()) {
          contactValues.push(phone.trim());
        }
      });

      if (contactValues.length === 0) {
        const errorMessage = 'No contact_to or phone values found in displayed data';
        setCutCCDTone('danger');
        const timeout = setTimeout(() => setCutCCDMessage(null), 8000);
        setCutCCDTimeout(timeout);
        setCutCCDMessage(errorMessage);
        setLoadingCutCCD(false);
        return;
      }

      const response = await api.post('/cut_ccd', { contact_values: contactValues });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.detail?.message || errorData.detail?.error || 'Failed to cut CCD';
        const tone = errorData.detail?.tone || 'danger';
        setCutCCDTone(tone as 'danger');
        const timeout = setTimeout(() => setCutCCDMessage(null), 8000);
        setCutCCDTimeout(timeout);
        setCutCCDMessage(errorMessage);
      } else {
        const result = await response.json();
        setCutCCDTone(result.tone || 'positive');
        const timeout = setTimeout(() => setCutCCDMessage(null), 5000);
        setCutCCDTimeout(timeout);
        setCutCCDMessage(result.message);
      }
    } catch (error) {
      setCutCCDTone('danger');
      const timeout = setTimeout(() => setCutCCDMessage(null), 5000);
      setCutCCDTimeout(timeout);
      setCutCCDMessage('Network error. Please check if backend is running.');
    } finally {
      setLoadingCutCCD(false);
    }
  };

  const handleDeletePCD = async () => {
    setLoadingDeletePCD(true);
    setDeletePCDMessage(null);
    if (deletePCDTimeout) {
      clearTimeout(deletePCDTimeout);
      setDeletePCDTimeout(null);
    }

    try {
      const response = await api.delete('/delete_pcd');

      if (!response.ok) {
        const errorData = await response.json();
        const errorDetail = errorData.detail || errorData;
        
        let errorMessage = 'Failed to delete data from CSV';
        if (errorDetail.error) {
          errorMessage = errorDetail.error;
        } else if (typeof errorDetail === 'string') {
          errorMessage = errorDetail;
        }

        // Get tone from error response or default to danger
        const tone = errorDetail.tone || 'danger';
        setDeletePCDTone(tone as 'danger');
        
        const timeout = setTimeout(() => setDeletePCDMessage(null), 8000);
        setDeletePCDTimeout(timeout);
        setDeletePCDMessage(errorMessage);
        return;
      }

      const result = await response.json();
      // Set tone from response
      setDeletePCDTone(result.tone || 'positive');
      
      // Show message based on tone
      const timeout = setTimeout(() => setDeletePCDMessage(null), 5000);
      setDeletePCDTimeout(timeout);
      setDeletePCDMessage(result.message);
    } catch (error) {
      console.error('Error deleting PCD:', error);
      setDeletePCDTone('danger');
      const timeout = setTimeout(() => setDeletePCDMessage(null), 5000);
      setDeletePCDTimeout(timeout);
      setDeletePCDMessage('Network error. Please check if backend is running.');
    } finally {
      setLoadingDeletePCD(false);
    }
  };

  const handleCloseError = () => {
    if (sdtcErrorTimeout) {
      clearTimeout(sdtcErrorTimeout);
      setSdtcErrorTimeout(null);
    }
    setSdtcError(null);
  };

  const handleLoadSDTC = async () => {
    if (data.length === 0) {
      const timeout = setTimeout(() => setSdtcError(null), 5000);
      setSdtcErrorTimeout(timeout);
      setSdtcError('No data to load. Please apply filters first.');
      return;
    }

    setLoadingSDTC(true);
    setSdtcError(null);
    if (sdtcErrorTimeout) {
      clearTimeout(sdtcErrorTimeout);
      setSdtcErrorTimeout(null);
    }

    try {
      // Prepare data with only selected columns
      const selectedCols = Object.keys(selectedColumns).filter(
        (key) => selectedColumns[key]
      );

      if (selectedCols.length === 0) {
        const timeout = setTimeout(() => setSdtcError(null), 5000);
        setSdtcErrorTimeout(timeout);
        setSdtcError('Please select at least one column');
        setLoadingSDTC(false);
        return;
      }

      // Filter data to include only selected columns
      const dataToSend = data.map((row) => {
        const filteredRow: any = {};
        selectedCols.forEach((col) => {
          const value = (row as any)[col];
          // Convert objects/arrays to JSON strings for CSV storage
          if (value !== null && value !== undefined) {
            if (typeof value === 'object' && !Array.isArray(value)) {
              // For objects (like meta_data, chat), stringify to JSON
              filteredRow[col] = JSON.stringify(value);
            } else {
              filteredRow[col] = value;
            }
          } else {
            filteredRow[col] = value;
          }
        });
        return filteredRow;
      });

      const response = await api.post('/load_sdtc', { data: dataToSend });

      if (!response.ok) {
        const errorData = await response.json();
        const errorDetail = errorData.detail || errorData;
        
        let errorMessage = 'Failed to load data to CSV';
        if (errorDetail.error) {
          errorMessage = errorDetail.error;
        } else if (typeof errorDetail === 'string') {
          errorMessage = errorDetail;
        }

        // Include expected columns in error message if available
        if (errorDetail.expected_columns && Array.isArray(errorDetail.expected_columns)) {
          errorMessage += `. Expected columns: ${errorDetail.expected_columns.join(', ')}`;
        }

        const timeout = setTimeout(() => setSdtcError(null), 8000);
        setSdtcErrorTimeout(timeout);
        setSdtcError(errorMessage);
        return;
      }

      const result = await response.json();
      // Success - show brief success message
      setSdtcError(null);
      if (sdtcErrorTimeout) {
        clearTimeout(sdtcErrorTimeout);
        setSdtcErrorTimeout(null);
      }
      alert(`Successfully loaded ${result.rows_added} rows to data.csv`);
    } catch (error) {
      console.error('Error loading SDTC:', error);
      const timeout = setTimeout(() => setSdtcError(null), 5000);
      setSdtcErrorTimeout(timeout);
      setSdtcError('Network error. Please check if backend is running.');
    } finally {
      setLoadingSDTC(false);
    }
  };

  // Helper function to format chat data for CSV
  const formatChatForCSV = (chat: any): string => {
    if (!chat) return '';
    
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
      return formatChatForCSV(chat.messages);
    }
    
    // If it's an object with chat property
    if (typeof chat === 'object' && chat.chat && Array.isArray(chat.chat)) {
      return formatChatForCSV(chat.chat);
    }
    
    // If it's a string, try to parse it
    if (typeof chat === 'string') {
      try {
        const parsed = JSON.parse(chat);
        return formatChatForCSV(parsed);
      } catch {
        return chat;
      }
    }
    
    // Fallback to JSON stringify for other object types
    return JSON.stringify(chat);
  };

  // Helper function to format value for CSV
  const formatValueForCSV = (value: any, column: string): string => {
    if (value === null || value === undefined) return '';
    
    // Special handling for chat column
    if (column === 'chat') {
      return formatChatForCSV(value);
    }
    
    // Special handling for meta_data column
    if (column === 'meta_data') {
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      if (typeof value === 'string') {
        try {
          JSON.parse(value); // Check if it's valid JSON
          return value; // Return as-is if valid JSON string
        } catch {
          return value; // Return as-is if not JSON
        }
      }
    }
    
    // Handle arrays
    if (Array.isArray(value)) {
      return value.map(item => 
        typeof item === 'object' ? JSON.stringify(item) : String(item)
      ).join(' | ');
    }
    
    // Handle objects
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    
    // Handle strings - escape quotes
    return String(value).replace(/"/g, '""');
  };

  const handleDownloadCSV = () => {
    if (filteredData.length === 0) {
      alert('No data to export');
      return;
    }

    const selectedCols = Object.keys(selectedColumns).filter(
      (key) => selectedColumns[key]
    );

    if (selectedCols.length === 0) {
      alert('Please select at least one column');
      return;
    }

    // Show preview modal instead of downloading directly
    setShowCSVPreview(true);
  };

  const performCSVDownload = () => {
    const selectedCols = Object.keys(selectedColumns).filter(
      (key) => selectedColumns[key]
    );

    // Create CSV content
    const headers = selectedCols.map(col => `"${col}"`).join(',');
    const rows = filteredData.map((row) => {
      return selectedCols
        .map((col) => {
          const value = (row as any)[col];
          const formattedValue = formatValueForCSV(value, col);
          return `"${formattedValue}"`;
        })
        .join(',');
    });

    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${csvFileName || 'campaign_data'}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Close the preview modal
    setShowCSVPreview(false);
  };

  // Get available columns for search dropdown (only selected columns)
  const availableSearchColumns = Object.keys(selectedColumns).filter((key) => selectedColumns[key]);

  // Filter data based on search
  const filteredData = (() => {
    if (!searchColumn || !searchInput.trim()) {
      return data;
    }

    const searchTerm = searchInput.trim().toLowerCase();
    return data.filter((row) => {
      const value = (row as any)[searchColumn];
      if (value === null || value === undefined) {
        return false;
      }
      // Convert to string and check if it contains the search term (case-insensitive)
      const stringValue = String(value).toLowerCase();
      return stringValue.includes(searchTerm);
    });
  })();

  // Show loading state while checking authentication
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)] mx-auto mb-4" />
          <p className="text-[var(--secondary)]">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Don't render if not authenticated (will redirect)
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="container mx-auto px-4 py-6 max-w-[1920px]">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between flex-wrap mb-2">
            <div className="flex items-center gap-4 flex-wrap">
              <h1 className="text-3xl font-bold text-[var(--foreground)]">
                Campaign Management Dashboard
              </h1>
            
            {/* Persistent Filters - Inline with title (Client only) */}
            <div className="flex-shrink-0">
              <PersistentFilters
                onClientChange={(clientId, tableName) => {
                  setSelectedClientId(clientId);
                  setSelectedClientTableName(tableName);
                  // Reset phase when client changes
                  setSelectedPhaseId(null);
                }}
              />
            </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[var(--foreground)] border border-[var(--card-border)] rounded-md hover:bg-[var(--table-row-hover)] transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
          <p className="text-[var(--secondary)]">
            Filter and analyze campaign data with advanced controls
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-[var(--card-border)]">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('data-management')}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'data-management'
                  ? 'border-[var(--primary)] text-[var(--primary)]'
                  : 'border-transparent text-[var(--secondary)] hover:text-[var(--foreground)]'
              }`}
            >
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4" />
                Data Management
              </div>
            </button>
            <button
              onClick={() => setActiveTab('campaign-management')}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'campaign-management'
                  ? 'border-[var(--primary)] text-[var(--primary)]'
                  : 'border-transparent text-[var(--secondary)] hover:text-[var(--foreground)]'
              }`}
            >
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Campaign Management
              </div>
            </button>
            <button
              onClick={() => setActiveTab('reports')}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'reports'
                  ? 'border-[var(--primary)] text-[var(--primary)]'
                  : 'border-transparent text-[var(--secondary)] hover:text-[var(--foreground)]'
              }`}
            >
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4" />
                Reports
              </div>
            </button>
            <button
              onClick={() => setActiveTab('disposition-tree')}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'disposition-tree'
                  ? 'border-[var(--primary)] text-[var(--primary)]'
                  : 'border-transparent text-[var(--secondary)] hover:text-[var(--foreground)]'
              }`}
            >
              <div className="flex items-center gap-2">
                <Network className="w-4 h-4" />
                Disposition Tree
              </div>
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {/* Data Management Tab */}
        <div className={activeTab === 'data-management' ? '' : 'hidden'}>
        {/* Filter Section */}
        <div className="mb-6">
          <FilterSection 
            onApply={handleApplyFilters} 
            loading={loading}
            selectedClientId={selectedClientId}
            selectedPhaseId={selectedPhaseId}
            selectedCampaignId={selectedCampaignId}
            onPhaseChange={(phaseId) => setSelectedPhaseId(phaseId)}
            onCampaignChange={(campaignId) => setSelectedCampaignId(campaignId)}
          />
        </div>

        {/* Column Selection & Export Section */}
        {data.length > 0 && (
          <div className="mb-4 p-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-[var(--foreground)]">
                  Column Selection
                </h2>
                <button
                  onClick={handleToggleSelectAll}
                  className="px-3 py-1.5 text-sm font-medium text-[var(--primary)] border border-[var(--primary)] rounded-md hover:bg-[var(--primary)] hover:text-white transition-colors"
                >
                  {Object.values(selectedColumns).every((val) => val === true)
                    ? 'Deselect All'
                    : 'Select All'}
                </button>
                <div className="relative">
                  <select
                    value={currentPreset}
                    onChange={(e) => {
                      handlePresetChange(e.target.value);
                    }}
                    className="px-3 py-1.5 text-sm font-medium border border-[var(--input-border)] rounded-md bg-[var(--input-bg)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] appearance-none pr-8"
                  >
                    <option value="">Presets</option>
                    <option value="simple">Simple</option>
                    <option value="metadata">Metadata Only</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--secondary)] pointer-events-none" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleShowCCD}
                  disabled={loadingCCD}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingCCD ? 'Loading...' : 'Show CCD'}
                </button>
                <div className="relative group">
                  <button
                    onClick={handleCutCCD}
                    disabled={loadingCutCCD || data.length === 0}
                    className="px-4 py-2 bg-orange-600 text-white rounded-md hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Cut CCD: Delete rows from data.csv matching contact_to or phone from displayed data"
                  >
                    {loadingCutCCD ? 'Cutting...' : 'Cut CCD'}
                  </button>
                  {/* Warning tooltip */}
                  <div className="absolute bottom-full left-0 mb-2 w-64 p-2 bg-yellow-100 border border-yellow-400 rounded-md shadow-lg text-xs text-yellow-800 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                    <div className="font-semibold mb-1">⚠️ Warning</div>
                    <div>This will permanently delete rows from data.csv that match the contact_to or phone values from the currently displayed data.</div>
                  </div>
                  {cutCCDMessage && (
                    <div className={`absolute top-full left-0 mt-2 z-50 w-96 p-3 rounded-md shadow-lg text-sm ${
                      cutCCDTone === 'danger'
                        ? 'bg-[var(--danger)] text-white'
                        : cutCCDTone === 'neutral'
                        ? 'bg-[var(--primary)] text-white'
                        : 'bg-[var(--success)] text-white'
                    }`}>
                      <div className="flex items-start gap-2">
                        <span className="flex-shrink-0 mt-0.5">
                          {cutCCDTone === 'danger' ? (
                            <AlertCircle className="w-5 h-5" />
                          ) : cutCCDTone === 'neutral' ? (
                            <Info className="w-5 h-5" />
                          ) : (
                            <CheckCircle2 className="w-5 h-5" />
                          )}
                        </span>
                        <span className="flex-1 break-words">{cutCCDMessage}</span>
                        <button
                          onClick={handleCloseCutCCDMessage}
                          className="flex-shrink-0 hover:bg-white/20 rounded-full w-6 h-6 flex items-center justify-center transition-colors"
                          title="Close"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="relative">
                  <button
                    onClick={handleDeletePCD}
                    disabled={loadingDeletePCD}
                    className="px-4 py-2 bg-[var(--danger)] text-white rounded-md hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingDeletePCD ? 'Deleting...' : 'Delete PCD'}
                  </button>
                  {deletePCDMessage && (
                    <div className={`absolute top-full left-0 mt-2 z-50 w-96 p-3 rounded-md shadow-lg text-sm ${
                      deletePCDTone === 'danger'
                        ? 'bg-[var(--danger)] text-white'
                        : deletePCDTone === 'neutral'
                        ? 'bg-[var(--primary)] text-white'
                        : 'bg-[var(--success)] text-white'
                    }`}>
                      <div className="flex items-start gap-2">
                        <span className="flex-shrink-0 mt-0.5">
                          {deletePCDTone === 'danger' ? (
                            <AlertCircle className="w-5 h-5" />
                          ) : deletePCDTone === 'neutral' ? (
                            <Info className="w-5 h-5" />
                          ) : (
                            <CheckCircle2 className="w-5 h-5" />
                          )}
                        </span>
                        <span className="flex-1 break-words">{deletePCDMessage}</span>
                        <button
                          onClick={handleCloseDeletePCDMessage}
                          className="flex-shrink-0 hover:bg-white/20 rounded-full w-6 h-6 flex items-center justify-center transition-colors"
                          title="Close"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="relative">
                  <button
                    onClick={handleLoadSDTC}
                    disabled={loadingSDTC}
                    className="px-4 py-2 bg-[var(--success)] text-white rounded-md hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingSDTC ? 'Loading...' : 'Load SDTC'}
                  </button>
                  {sdtcError && (
                    <div className="absolute top-full left-0 mt-2 z-50 w-96 p-3 bg-[var(--danger)] text-white rounded-md shadow-lg text-sm">
                      <div className="flex items-start gap-2">
                        <span className="flex-shrink-0 mt-0.5">
                          <AlertCircle className="w-5 h-5" />
                        </span>
                        <span className="flex-1 break-words">{sdtcError}</span>
                        <button
                          onClick={handleCloseError}
                          className="flex-shrink-0 hover:bg-white/20 rounded-full w-6 h-6 flex items-center justify-center transition-colors"
                          title="Close"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={handleDownloadCSV}
                  className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-md hover:bg-[var(--primary-hover)] transition-colors text-sm font-medium"
                >
                  <Download size={16} />
                  Download CSV
                </button>
                <input
                  type="text"
                  value={csvFileName}
                  onChange={(e) => setCsvFileName(e.target.value)}
                  placeholder="CSV filename"
                  className="px-3 py-2 border border-[var(--input-border)] rounded-md bg-[var(--input-bg)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.keys(selectedColumns).map((column) => {
                const isChecked = selectedColumns[column] || false;
                return (
                  <label
                    key={column}
                    className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] hover:bg-[var(--table-row-hover)] hover:border-[var(--primary)] transition-all group"
                  >
                    <div className="relative flex items-center">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          const newValue = e.target.checked;
                          setSelectedColumns({
                            ...selectedColumns,
                            [column]: newValue,
                          });
                          // Clear expanded metadata columns if meta_data is being deselected
                          if (column === 'meta_data' && !newValue) {
                            setExpandedMetadataColumns({});
                          }
                        }}
                        className="sr-only"
                      />
                      <div className={`w-5 h-5 border-2 rounded flex items-center justify-center transition-all group-hover:border-[var(--primary)] ${
                        isChecked
                          ? 'bg-[var(--primary)] border-[var(--primary)]'
                          : 'border-[var(--input-border)]'
                      }`}>
                        {isChecked && (
                          <CheckCircle2 className="w-4 h-4 text-white" />
                        )}
                      </div>
                    </div>
                    <span className="text-sm text-[var(--foreground)] capitalize select-none">
                      {column.replace(/_/g, ' ')}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

            {/* Search Bar */}
            {data.length > 0 && availableSearchColumns.length > 0 && (
              <div className="mb-4 p-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-sm">
                <div className="flex items-center gap-3">
                  {/* Record count */}
                  <div className="text-sm text-[var(--foreground)] font-medium whitespace-nowrap">
                    Count: {searchInput ? (
                      <>
                        {filteredData.length} of {data.length}
                      </>
                    ) : (
                      <>
                        {data.length}
                      </>
                    )}
                  </div>
                  
                  {/* Separator */}
                  <div className="text-[var(--secondary)]">|</div>
                  
                  {/* Search label */}
                  <div className="flex items-center gap-2">
                    <Search className="w-5 h-5 text-[var(--secondary)]" />
                    <span className="text-sm font-medium text-[var(--foreground)]">Search:</span>
                  </div>
                  
                  {/* Dropdown for column selection */}
                  <div className="relative flex-1 max-w-xs">
                    <select
                      value={searchColumn}
                      onChange={(e) => {
                        setSearchColumn(e.target.value);
                        setSearchInput(''); // Clear search when column changes
                      }}
                      className="w-full px-3 py-2 pr-8 border border-[var(--input-border)] rounded-md bg-[var(--input-bg)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] appearance-none"
                    >
                      <option value="">Select column</option>
                      {availableSearchColumns.map((column) => (
                        <option key={column} value={column}>
                          {column.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--secondary)] pointer-events-none" />
                  </div>

                  {/* Input box for search */}
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder={searchColumn ? `Search in ${searchColumn.replace(/_/g, ' ')}...` : 'Select a column first'}
                    disabled={!searchColumn}
                    className="flex-1 px-3 py-2 border border-[var(--input-border)] rounded-md bg-[var(--input-bg)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            )}

            {/* Data Table Section */}
            <div>
              <DataTable
                data={filteredData}
                loading={loading}
                selectedColumns={selectedColumns}
                expandedMetadataColumns={expandedMetadataColumns}
                onPlayRecording={(url) => setSelectedRecording(url)}
                onViewChat={(chat) => setSelectedChat(chat)}
                onViewMetadata={(metadata) => setSelectedMetadata(metadata)}
              />
            </div>
          </div>

        {/* Campaign Management Tab */}
        <div className={activeTab === 'campaign-management' ? '' : 'hidden'}>
          <CampaignManagement selectedClientId={selectedClientId} />
          </div>

        {/* Reports Tab */}
        <div className={activeTab === 'reports' ? '' : 'hidden'}>
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-sm p-12">
            <div className="text-center">
              <Wrench className="w-16 h-16 mx-auto mb-4 text-[var(--secondary)]" />
              <h3 className="text-xl font-semibold text-[var(--foreground)] mb-2">
                Under Maintenance
              </h3>
              <p className="text-[var(--secondary)]">
                Reports section is currently under development. Please check back later.
              </p>
            </div>
          </div>
        </div>

        {/* Disposition Tree Tab */}
        <div className={activeTab === 'disposition-tree' ? '' : 'hidden'}>
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold text-[var(--foreground)] mb-2">
                Disposition Tree Visualization
              </h2>
              <p className="text-[var(--secondary)]">
                Interactive visualization of call disposition outcomes. Node sizes represent relative counts.
              </p>
            </div>
            <DispositionTree />
          </div>
        </div>
      </div>

      {/* Modals */}
      {selectedRecording && (
        <AudioPlayerModal
          url={selectedRecording}
          onClose={() => setSelectedRecording(null)}
        />
      )}

      {selectedChat && (
        <ChatModal
          chat={selectedChat}
          onClose={() => setSelectedChat(null)}
        />
      )}

      {selectedMetadata && (
        <MetadataModal
          metadata={selectedMetadata}
          onClose={() => setSelectedMetadata(null)}
        />
      )}

      {showCSVPreview && (
        <CSVPreviewModal
          data={filteredData}
          selectedColumns={selectedColumns}
          csvFileName={csvFileName}
          onClose={() => setShowCSVPreview(false)}
          onConfirmDownload={performCSVDownload}
        />
      )}

      {showCCDModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
          <div className="bg-[var(--card-bg)] rounded-lg shadow-xl w-full max-w-6xl mx-4 h-[90vh] flex flex-col border border-[var(--card-border)]">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--card-border)]">
              <h2 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
                <Database className="w-5 h-5" />
                Show CCD Data
              </h2>
              <button
                onClick={() => {
                  if (editedCcdRecords.size > 0 || newCcdRecords.length > 0) {
                    if (!confirm('You have unsaved changes. Are you sure you want to close? Changes will be lost.')) {
                      return;
                    }
                  }
                  setShowCCDModal(false);
                  setCcdData([]);
                  setCcdCurrentPage(1);
                  setCcdViewMode('view');
                  setSelectedCcdRecords(new Set());
                  setEditedCcdRecords(new Map());
                  setNewCcdRecords([]);
                }}
                className="p-1 rounded-md hover:bg-[var(--table-row-hover)] transition-colors"
              >
                <X className="w-5 h-5 text-[var(--foreground)]" />
              </button>
            </div>

            {/* Controls */}
            <div className="p-4 border-b border-[var(--card-border)] flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                {/* View/Edit Mode Dropdown */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--foreground)] whitespace-nowrap">Mode:</span>
                  <div className="relative">
                    <select
                      value={ccdViewMode}
                      onChange={(e) => {
                        const newMode = e.target.value as 'view' | 'edit';
                        if (newMode === 'view' && (editedCcdRecords.size > 0 || newCcdRecords.length > 0)) {
                          if (!confirm('You have unsaved changes. Are you sure you want to switch to view mode? Changes will be lost.')) {
                            return;
                          }
                        }
                        setCcdViewMode(newMode);
                        setSelectedCcdRecords(new Set());
                        setEditedCcdRecords(new Map());
                        setNewCcdRecords([]);
                      }}
                      className="px-3 py-2 pr-8 border border-[var(--input-border)] rounded-md bg-[var(--input-bg)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] appearance-none"
                    >
                      <option value="view">View Only</option>
                      <option value="edit">Edit</option>
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--secondary)] pointer-events-none" />
                  </div>
                </div>

                <span className="text-sm font-medium text-[var(--foreground)]">
                  Total Records: <span className="font-bold">{ccdData.length + newCcdRecords.length}</span>
                </span>

                {/* Add Record Button - Only show in edit mode */}
                {ccdViewMode === 'edit' && ccdData.length > 0 && (
                  <button
                    onClick={() => {
                      // Create a new empty record with same schema as existing records
                      const emptyRecord: any = {};
                      if (ccdData.length > 0) {
                        Object.keys(ccdData[0]).forEach(key => {
                          emptyRecord[key] = '';
                        });
                      }
                      setNewCcdRecords([...newCcdRecords, emptyRecord]);
                    }}
                    className="px-4 py-2 bg-[var(--primary)] text-white rounded-md hover:bg-[var(--primary-hover)] transition-colors text-sm font-medium flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Add Record
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Save Changes Button - Only show in edit mode when there are changes */}
                {ccdViewMode === 'edit' && (editedCcdRecords.size > 0 || newCcdRecords.length > 0) && (
                  <button
                    onClick={async () => {
                      setSavingCcdChanges(true);
                      try {
                        const currentPageData = ccdData.slice((ccdCurrentPage - 1) * ccdLimit, ccdCurrentPage * ccdLimit);
                        const recordsToUpdate = [];
                        for (const [index, changes] of editedCcdRecords.entries()) {
                          const originalRecord = currentPageData[index];
                          const updatedRecord = { ...originalRecord, ...changes };
                          recordsToUpdate.push({
                            original: originalRecord,
                            updated: updatedRecord
                          });
                        }
                        
                        // Send update request if there are edited records
                        if (recordsToUpdate.length > 0) {
                          const updateResponse = await api.post('/update_csv_records', {
                            records: recordsToUpdate
                          });

                          if (!updateResponse.ok) {
                            const errorData = await updateResponse.json();
                            const errorDetail = errorData.detail || errorData;
                            throw new Error(errorDetail.message || 'Failed to update records');
                          }
                        }

                        // Send add request if there are new records
                        if (newCcdRecords.length > 0) {
                          const addResponse = await api.post('/add_csv_records', {
                            records: newCcdRecords
                          });

                          if (!addResponse.ok) {
                            const errorData = await addResponse.json();
                            const errorDetail = errorData.detail || errorData;
                            throw new Error(errorDetail.message || 'Failed to add new records');
                          }
                        }

                        alert(`Successfully saved ${recordsToUpdate.length} update(s) and ${newCcdRecords.length} new record(s)!`);
                        
                        // Clear edited records, new records, and refresh data
                        setEditedCcdRecords(new Map());
                        setNewCcdRecords([]);
                        await handleShowCCD();
                      } catch (error: any) {
                        console.error('Error saving changes:', error);
                        alert(`Error: ${error.message || 'Failed to save changes'}`);
                      } finally {
                        setSavingCcdChanges(false);
                      }
                    }}
                    disabled={savingCcdChanges}
                    className="px-4 py-2 bg-[var(--success)] text-white rounded-md hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {savingCcdChanges ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Save ({editedCcdRecords.size} edit{editedCcdRecords.size !== 1 ? 's' : ''}, {newCcdRecords.length} new)
                      </>
                    )}
                  </button>
                )}

                {/* Delete Selected Button - Only show in edit mode */}
                {ccdViewMode === 'edit' && selectedCcdRecords.size > 0 && (
                  <button
                    onClick={async () => {
                      if (!confirm(`Are you sure you want to delete ${selectedCcdRecords.size} selected record(s) from CCD?`)) {
                        return;
                      }
                      setDeletingCcdRecords(true);
                      try {
                        const currentPageData = ccdData.slice((ccdCurrentPage - 1) * ccdLimit, ccdCurrentPage * ccdLimit);
                        const recordsToDelete = currentPageData.filter((_, index) => selectedCcdRecords.has(index));
                        
                        const response = await api.post('/delete_csv_records', {
                          records: recordsToDelete
                        });

                        if (!response.ok) {
                          const errorData = await response.json();
                          const errorDetail = errorData.detail || errorData;
                          alert(errorDetail.message || 'Failed to delete records');
                        } else {
                          const result = await response.json();
                          alert(result.message || 'Records deleted successfully');
                          
                          // Refresh CCD data
                          await handleShowCCD();
                          setSelectedCcdRecords(new Set());
                          setEditedCcdRecords(new Map());
                          setNewCcdRecords([]);
                        }
                      } catch (error: any) {
                        console.error('Error deleting records:', error);
                        alert(`Error: ${error.message || 'Failed to delete records'}`);
                      } finally {
                        setDeletingCcdRecords(false);
                      }
                    }}
                    disabled={deletingCcdRecords}
                    className="px-4 py-2 bg-[var(--danger)] text-white rounded-md hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {deletingCcdRecords ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        Delete ({selectedCcdRecords.size})
                      </>
                    )}
                  </button>
                )}

                <label className="text-sm text-[var(--foreground)]">Limit:</label>
                <input
                  type="number"
                  min="1"
                  value={ccdLimit}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 50;
                    setCcdLimit(val);
                    setCcdCurrentPage(1);
                  }}
                  className="w-20 px-2 py-1 text-sm border border-[var(--card-border)] rounded-md bg-[var(--card-bg)] text-[var(--foreground)]"
                />
              </div>
            </div>

            {/* Table Container */}
            <div className="flex-1 overflow-auto p-4">
              {loadingCCD ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-[var(--secondary)]">Loading data...</p>
                </div>
              ) : ccdData.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-[var(--secondary)]">No data found in CSV</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-[var(--table-header-bg)] border-b border-[var(--card-border)]">
                          {/* Checkbox column in edit mode */}
                          {ccdViewMode === 'edit' && (
                            <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--foreground)] w-12">
                              <input
                                type="checkbox"
                                checked={selectedCcdRecords.size === ccdData.slice((ccdCurrentPage - 1) * ccdLimit, ccdCurrentPage * ccdLimit).length && ccdData.slice((ccdCurrentPage - 1) * ccdLimit, ccdCurrentPage * ccdLimit).length > 0}
                                onChange={() => {
                                  const currentPageData = ccdData.slice((ccdCurrentPage - 1) * ccdLimit, ccdCurrentPage * ccdLimit);
                                  if (selectedCcdRecords.size === currentPageData.length) {
                                    setSelectedCcdRecords(new Set());
                                  } else {
                                    setSelectedCcdRecords(new Set(currentPageData.map((_, idx) => idx)));
                                  }
                                }}
                                className="w-4 h-4 rounded border-[var(--input-border)] text-[var(--primary)] focus:ring-[var(--primary)] cursor-pointer"
                              />
                            </th>
                          )}
                          {Object.keys(ccdData[0] || {}).map((key) => (
                            <th
                              key={key}
                              className="px-4 py-3 text-left text-xs font-semibold text-[var(--foreground)] uppercase tracking-wider"
                            >
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--card-border)]">
                        {[...ccdData.slice((ccdCurrentPage - 1) * ccdLimit, ccdCurrentPage * ccdLimit), ...newCcdRecords]
                          .map((row, idx) => (
                            <tr
                              key={idx}
                              className={`hover:bg-[var(--table-row-hover)] transition-colors ${
                                ccdViewMode === 'edit' && selectedCcdRecords.has(idx) ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                              }`}
                            >
                              {/* Checkbox cell in edit mode */}
                              {ccdViewMode === 'edit' && (
                                <td className="px-4 py-3 w-12">
                                  <input
                                    type="checkbox"
                                    checked={selectedCcdRecords.has(idx)}
                                    onChange={() => {
                                      const newSelected = new Set(selectedCcdRecords);
                                      if (newSelected.has(idx)) {
                                        newSelected.delete(idx);
                                      } else {
                                        newSelected.add(idx);
                                      }
                                      setSelectedCcdRecords(newSelected);
                                    }}
                                    className="w-4 h-4 rounded border-[var(--input-border)] text-[var(--primary)] focus:ring-[var(--primary)] cursor-pointer"
                                  />
                                </td>
                              )}
                              {Object.keys(ccdData[0] || {}).map((key) => {
                                const currentPageData = ccdData.slice((ccdCurrentPage - 1) * ccdLimit, ccdCurrentPage * ccdLimit);
                                const isNewRecord = idx >= currentPageData.length;
                                
                                // Get the current value (either edited or original)
                                let originalValue, currentValue, isEdited;
                                
                                if (isNewRecord) {
                                  // This is a new record
                                  const newRecordIndex = idx - currentPageData.length;
                                  originalValue = newCcdRecords[newRecordIndex][key];
                                  currentValue = originalValue;
                                  isEdited = originalValue !== '';
                                } else {
                                  // This is an existing record
                                  originalValue = row[key];
                                  const editedRow = editedCcdRecords.get(idx);
                                  currentValue = editedRow && editedRow.hasOwnProperty(key) 
                                    ? editedRow[key] 
                                    : originalValue;
                                  isEdited = editedRow && editedRow.hasOwnProperty(key);
                                }

                                return (
                                  <td
                                    key={key}
                                    className={`px-4 py-3 text-sm ${isEdited ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''} ${isNewRecord ? 'bg-green-50 dark:bg-green-900/20' : ''}`}
                                  >
                                    {ccdViewMode === 'edit' ? (
                                      <input
                                        type="text"
                                        value={
                                          typeof currentValue === 'object' && currentValue !== null
                                            ? JSON.stringify(currentValue)
                                            : (currentValue !== null && currentValue !== undefined ? String(currentValue) : '')
                                        }
                                        onChange={(e) => {
                                          if (isNewRecord) {
                                            // Editing a new record
                                            const newRecordIndex = idx - currentPageData.length;
                                            const updatedNewRecords = [...newCcdRecords];
                                            updatedNewRecords[newRecordIndex] = {
                                              ...updatedNewRecords[newRecordIndex],
                                              [key]: e.target.value
                                            };
                                            setNewCcdRecords(updatedNewRecords);
                                          } else {
                                            // Editing an existing record
                                            const newEditedRecords = new Map(editedCcdRecords);
                                            const existingChanges = newEditedRecords.get(idx) || {};
                                            newEditedRecords.set(idx, {
                                              ...existingChanges,
                                              [key]: e.target.value
                                            });
                                            setEditedCcdRecords(newEditedRecords);
                                          }
                                        }}
                                        className="w-full px-2 py-1 text-sm border border-[var(--input-border)] rounded bg-[var(--input-bg)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                                      />
                                    ) : (
                                      <span className="text-[var(--foreground)]">
                                        {typeof currentValue === 'object' && currentValue !== null
                                          ? JSON.stringify(currentValue)
                                          : currentValue || '-'}
                                      </span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* Pagination Footer */}
            {ccdData.length > 0 && (
              <div className="p-4 border-t border-[var(--card-border)] flex items-center justify-between">
                <div className="text-sm text-[var(--secondary)]">
                  Showing {((ccdCurrentPage - 1) * ccdLimit) + 1} to {Math.min(ccdCurrentPage * ccdLimit, ccdData.length)} of {ccdData.length} records
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCcdCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={ccdCurrentPage === 1}
                    className="px-3 py-1.5 text-sm font-medium text-[var(--foreground)] border border-[var(--card-border)] rounded-md hover:bg-[var(--table-row-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </button>
                  <span className="text-sm text-[var(--foreground)] px-2">
                    Page {ccdCurrentPage} of {Math.ceil(ccdData.length / ccdLimit)}
                  </span>
                  <button
                    onClick={() => setCcdCurrentPage((prev) => Math.min(Math.ceil(ccdData.length / ccdLimit), prev + 1))}
                    disabled={ccdCurrentPage >= Math.ceil(ccdData.length / ccdLimit)}
                    className="px-3 py-1.5 text-sm font-medium text-[var(--foreground)] border border-[var(--card-border)] rounded-md hover:bg-[var(--table-row-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
