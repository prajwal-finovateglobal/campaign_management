'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { CampaignAutomation } from '@/components/CampaignAutomation';
import { CampaignMonitor } from '@/components/CampaignMonitor';
import { Download, AlertCircle, Info, CheckCircle2, X, Database, BarChart3, Wrench, Search, ChevronDown, ChevronLeft, ChevronRight, Network, LogOut, Loader2, Trash2, Sun, Moon, AlertTriangle, FileText, Code, Braces, Sheet } from 'lucide-react';
import { api, setAuthToken, getAuthToken } from '@/lib/api';
import '@/components/FilterSection.css';
import { VerticalSidebar } from '@/components/VerticalSidebar';
import { RocketIcon } from '@/components/icons/RocketIcon';
import { FileStackIcon } from '@/components/icons/FileStackIcon';
import { SquareActivityIcon } from '@/components/icons/SquareActivityIcon';

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
  const [downloadFormat, setDownloadFormat] = useState<'csv' | 'json'>('csv');
  const [sdtcError, setSdtcError] = useState<string | null>(null);
  const [sdtcErrorTimeout, setSdtcErrorTimeout] = useState<NodeJS.Timeout | null>(null);
  const [deletePCDMessage, setDeletePCDMessage] = useState<string | null>(null);
  const [deletePCDTone, setDeletePCDTone] = useState<'positive' | 'neutral' | 'danger'>('neutral');
  const [deletePCDTimeout, setDeletePCDTimeout] = useState<NodeJS.Timeout | null>(null);
  const [loadingDeletePCD, setLoadingDeletePCD] = useState(false);
  const [showDeletePCDModal, setShowDeletePCDModal] = useState(false);
  const [cleanCDMessage, setCleanCDMessage] = useState<string | null>(null);
  const [cleanCDTone, setCleanCDTone] = useState<'positive' | 'neutral' | 'danger'>('neutral');
  const [cleanCDTimeout, setCleanCDTimeout] = useState<NodeJS.Timeout | null>(null);
  const [loadingCleanCD, setLoadingCleanCD] = useState(false);
  const [showCleanCDConfirm, setShowCleanCDConfirm] = useState(false);
  const [clearTDMessage, setClearTDMessage] = useState<string | null>(null);
  const [clearTDTone, setClearTDTone] = useState<'positive' | 'neutral' | 'danger'>('neutral');
  const [clearTDTimeout, setClearTDTimeout] = useState<NodeJS.Timeout | null>(null);
  const [loadingClearTD, setLoadingClearTD] = useState(false);
  const [showClearTDConfirm, setShowClearTDConfirm] = useState(false);
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
  const [activeTab, setActiveTab] = useState<'data-management' | 'campaign-management' | 'campaign-automation' | 'reports' | 'monitor' | 'disposition-tree'>('data-management');
  
  // View/Edit mode states for CCD modal
  const [ccdViewMode, setCcdViewMode] = useState<'view' | 'edit'>('view');
  const [selectedCcdRecords, setSelectedCcdRecords] = useState<Set<number>>(new Set());
  const [deletingCcdRecords, setDeletingCcdRecords] = useState(false);
  const [editedCcdRecords, setEditedCcdRecords] = useState<Map<number, any>>(new Map());
  const [savingCcdChanges, setSavingCcdChanges] = useState(false);
  const [newCcdRecords, setNewCcdRecords] = useState<any[]>([]);
  const [searchColumn, setSearchColumn] = useState<string>('');
  const [searchInput, setSearchInput] = useState<string>('');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [lastFilters, setLastFilters] = useState<any>(null);
  const [pageInputValue, setPageInputValue] = useState<string>('1');
  
  // Initialize theme from localStorage or system preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
      setTheme(initialTheme);
      document.documentElement.setAttribute('data-theme', initialTheme);
    }
  }, []);

  // Update theme when it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('theme', theme);
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };
  
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

  // Re-fetch when search input or column changes (debounced 500ms, DB-level search)
  useEffect(() => {
    if (!lastFilters) return;
    const timer = setTimeout(() => {
      setCurrentPage(1);
      setPageInputValue('1');
      fetchPage(lastFilters, 1, pageSize);
    }, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, searchColumn]);

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
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<number[] | null>(null);

  const buildRequestBody = (filters: any, page: number, size: number, searchCol?: string, searchVal?: string) => {
    const requestBody: any = {
      ...filters,
      client_id: selectedClientId,
      table_name: selectedClientTableName,
      phase_id: selectedPhaseId,
      page,
      page_size: size,
    };
    if (selectedCampaignIds && selectedCampaignIds.length > 0) {
      requestBody.campaign_ids = selectedCampaignIds;
    } else if (selectedCampaignId) {
      requestBody.campaign_ids = [selectedCampaignId];
    } else {
      requestBody.campaign_ids = null;
    }
    // DB-level search
    const col = searchCol ?? searchColumn;
    const val = searchVal ?? searchInput;
    if (col && val.trim()) {
      requestBody.search_column = col;
      requestBody.search_value = val.trim();
    }
    return requestBody;
  };

  const fetchPage = async (filters: any, page: number, size: number) => {
    setLoading(true);
    try {
      const requestBody = buildRequestBody(filters, page, size);
      const response = await api.post('/show_data', requestBody);
      if (!response.ok) throw new Error('Failed to fetch data');
      const result = await response.json();
      setData(result.data || []);
      setTotalCount(result.total_count ?? 0);
      setCurrentPage(result.page ?? page);
      setPageInputValue(String(result.page ?? page));

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
            const simpleColumns = ['call_start_time', 'chat', 'contact_to', 'direction', 'duration', 'recording', 'campaign_id'];
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
        // Keep user's search column if it still exists in the new data; otherwise default to first column
        const firstColumn = availableColumns[0] || '';
        setSearchColumn((prev) => (availableColumns.includes(prev) ? prev : firstColumn));
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      alert('Failed to fetch data. Please check if the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFilters = async (filters: any) => {
    if (!selectedClientId) {
      alert('Please select a client first before applying filters.');
      return;
    }
    // Reset to page 1 and clear search on new filter apply
    setSearchInput('');
    setLastFilters(filters);
    setCurrentPage(1);
    setPageInputValue('1');
    await fetchPage(filters, 1, pageSize);
  };

  const handlePageChange = async (newPage: number) => {
    if (!lastFilters || newPage < 1) return;
    const totalPages = Math.ceil(totalCount / pageSize);
    if (newPage > totalPages) return;
    setCurrentPage(newPage);
    setPageInputValue(String(newPage));
    await fetchPage(lastFilters, newPage, pageSize);
  };

  const handlePageSizeChange = async (newSize: number) => {
    if (!lastFilters) return;
    setPageSize(newSize);
    setCurrentPage(1);
    setPageInputValue('1');
    await fetchPage(lastFilters, 1, newSize);
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
      // Simple preset: call_start_time, chat, contact_to, direction, duration, recording, campaign_id
      const simpleColumns = ['call_start_time', 'chat', 'contact_to', 'direction', 'duration', 'recording', 'campaign_id'];
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

  const handleCloseCleanCDMessage = () => {
    if (cleanCDTimeout) {
      clearTimeout(cleanCDTimeout);
      setCleanCDTimeout(null);
    }
    setCleanCDMessage(null);
  };

  const handleCloseClearTDMessage = () => {
    if (clearTDTimeout) {
      clearTimeout(clearTDTimeout);
      setClearTDTimeout(null);
    }
    setClearTDMessage(null);
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

  const handleCleanCD = () => {
    // Validation: Only require client selection (phase/campaigns are optional)
    if (!selectedClientId) {
      setCleanCDTone('danger');
      setCleanCDMessage('Please select a client first');
      const timeout = setTimeout(() => setCleanCDMessage(null), 5000);
      setCleanCDTimeout(timeout);
      return;
    }

    // Show confirmation modal
    // Note: If no campaigns/phase selected, will use client-level mode (all campaigns for client)
    setShowCleanCDConfirm(true);
  };

  const executeCleanCD = async () => {
    // Close confirmation modal
    setShowCleanCDConfirm(false);

    setLoadingCleanCD(true);
    setCleanCDMessage(null);
    if (cleanCDTimeout) {
      clearTimeout(cleanCDTimeout);
      setCleanCDTimeout(null);
    }

    try {
      // Prepare request payload
      const requestBody: any = {
        table_name: selectedClientTableName,
      };

      // Priority: campaign_ids > phase_id > client_id
      if (selectedCampaignIds && selectedCampaignIds.length > 0) {
        requestBody.campaign_ids = selectedCampaignIds;
        console.log('Clean CD - Mode: Campaign-specific | campaign_ids:', selectedCampaignIds);
      } else if (selectedPhaseId) {
        requestBody.phase_id = selectedPhaseId;
        console.log('Clean CD - Mode: Phase-level | phase_id:', selectedPhaseId);
      } else if (selectedClientId) {
        requestBody.client_id = selectedClientId;
        console.log('Clean CD - Mode: Client-level | client_id:', selectedClientId);
      } else {
        setCleanCDTone('danger');
        setCleanCDMessage('Please select a client, phase, or at least one campaign');
        const timeout = setTimeout(() => setCleanCDMessage(null), 5000);
        setCleanCDTimeout(timeout);
        setLoadingCleanCD(false);
        return;
      }

      const response = await api.post('/campaign/clean_cd', requestBody);

      if (!response.ok) {
        const errorData = await response.json();
        const errorDetail = errorData.detail || errorData;
        
        let errorMessage = 'Failed to clean CD';
        if (errorDetail.error) {
          errorMessage = errorDetail.error;
        } else if (typeof errorDetail === 'string') {
          errorMessage = errorDetail;
        }

        const tone = errorDetail.tone || 'danger';
        setCleanCDTone(tone as 'danger');
        
        const timeout = setTimeout(() => setCleanCDMessage(null), 8000);
        setCleanCDTimeout(timeout);
        setCleanCDMessage(errorMessage);
        return;
      }

      const result = await response.json();
      setCleanCDTone(result.tone || 'positive');
      
      // Build detailed message
      let message = result.message || 'Clean CD completed';
      if (result.total_records_deleted > 0 && result.records_deleted_per_campaign) {
        const perCampaign = Object.entries(result.records_deleted_per_campaign)
          .map(([id, count]) => `Campaign ${id}: ${count}`)
          .join(', ');
        message += ` (${perCampaign})`;
      }
      
      const timeout = setTimeout(() => setCleanCDMessage(null), 5000);
      setCleanCDTimeout(timeout);
      setCleanCDMessage(message);
    } catch (error) {
      console.error('Error cleaning CD:', error);
      setCleanCDTone('danger');
      const timeout = setTimeout(() => setCleanCDMessage(null), 5000);
      setCleanCDTimeout(timeout);
      setCleanCDMessage('Network error. Please check if backend is running.');
    } finally {
      setLoadingCleanCD(false);
    }
  };

  const handleClearTD = () => {
    // Validation: Check if client is selected
    if (!selectedClientId) {
      setClearTDTone('danger');
      setClearTDMessage('Please select a client first');
      const timeout = setTimeout(() => setClearTDMessage(null), 5000);
      setClearTDTimeout(timeout);
      return;
    }

    // Show confirmation modal
    setShowClearTDConfirm(true);
  };

  const executeClearTD = async () => {
    // Close confirmation modal
    setShowClearTDConfirm(false);

    setLoadingClearTD(true);
    setClearTDMessage(null);
    if (clearTDTimeout) {
      clearTimeout(clearTDTimeout);
      setClearTDTimeout(null);
    }

    try {
      // Prepare request payload
      const requestBody = {
        client_id: selectedClientId,
        table_name: selectedClientTableName,
      };

      console.log('Clear TD - sending request:', requestBody);

      const response = await api.post('/campaign/clear_td', requestBody);

      if (!response.ok) {
        const errorData = await response.json();
        const errorDetail = errorData.detail || errorData;
        
        let errorMessage = 'Failed to clear TD';
        if (errorDetail.error) {
          errorMessage = errorDetail.error;
        } else if (typeof errorDetail === 'string') {
          errorMessage = errorDetail;
        }

        const tone = errorDetail.tone || 'danger';
        setClearTDTone(tone as 'danger');
        
        const timeout = setTimeout(() => setClearTDMessage(null), 8000);
        setClearTDTimeout(timeout);
        setClearTDMessage(errorMessage);
        return;
      }

      const result = await response.json();
      setClearTDTone(result.tone || 'positive');
      
      let message = result.message || 'Clear TD completed';
      if (result.total_records_deleted > 0) {
        message = `${message} (${result.total_records_deleted} records deleted)`;
      }
      
      const timeout = setTimeout(() => setClearTDMessage(null), 5000);
      setClearTDTimeout(timeout);
      setClearTDMessage(message);
      
      // Reload data if filters are applied
      if (lastFilters !== null) {
        await fetchPage(lastFilters, currentPage, pageSize);
      }
    } catch (error) {
      console.error('Error clearing TD:', error);
      setClearTDTone('danger');
      const timeout = setTimeout(() => setClearTDMessage(null), 5000);
      setClearTDTimeout(timeout);
      setClearTDMessage('Network error. Please check if backend is running.');
    } finally {
      setLoadingClearTD(false);
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
    if (!lastFilters) {
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

      // Build request: same filter params as the display query + selected columns
      // Backend will run the full query (all rows, no pagination) and write to data.csv
      const requestBody = buildRequestBody(lastFilters, 1, 1);  // page/page_size unused by this endpoint
      delete requestBody.page;
      delete requestBody.page_size;
      requestBody.selected_columns = selectedCols;

      const response = await api.post('/load_sdtc_query', requestBody);

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

  const performCSVDownload = async () => {
    if (!lastFilters) {
      alert('No data to export. Please apply filters first.');
      return;
    }

    const selectedCols = Object.keys(selectedColumns).filter((key) => selectedColumns[key]);
    if (selectedCols.length === 0) {
      alert('Please select at least one column');
      return;
    }

    const filename = csvFileName || 'campaign_data';

    // Build export body from filters only — no pagination; backend returns full result set
    const requestBody: Record<string, unknown> = {
      ...lastFilters,
      client_id: selectedClientId,
      table_name: selectedClientTableName,
      phase_id: selectedPhaseId,
      selected_columns: selectedCols,
      export_format: downloadFormat,
      filename,
    };
    if (selectedCampaignIds && selectedCampaignIds.length > 0) {
      requestBody.campaign_ids = selectedCampaignIds;
    } else if (selectedCampaignId) {
      requestBody.campaign_ids = [selectedCampaignId];
    } else {
      requestBody.campaign_ids = null;
    }
    if (searchColumn && searchInput.trim()) {
      requestBody.search_column = searchColumn;
      requestBody.search_value = searchInput.trim();
    }
    // Explicitly omit page/page_size so backend always does full export
    delete (requestBody as any).page;
    delete (requestBody as any).page_size;

    try {
      const response = await api.post('/export_data', requestBody);
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        alert(`Export failed: ${err.detail || 'Unknown error'}`);
        return;
      }

      const blob = await response.blob();
      const ext = downloadFormat === 'json' ? 'json' : 'csv';
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}.${ext}`;
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export error:', error);
      alert('Export failed. Please check if the backend is running.');
    }

    setShowCSVPreview(false);
  };

  /** Fetch a single page of data for the download preview modal (same filters as table, does not change table state) */
  const fetchPreviewPage = useCallback(async (page: number): Promise<any[]> => {
    if (!lastFilters) return [];
    const requestBody = buildRequestBody(lastFilters, page, pageSize);
    const response = await api.post('/show_data', requestBody);
    if (!response.ok) return [];
    const result = await response.json();
    return result.data || [];
  }, [lastFilters, pageSize]);

  // Get available columns for search dropdown (all columns in table, so user can search any column)
  const availableSearchColumns = Object.keys(selectedColumns);

  // Search is now handled by the DB — filteredData is the current page as-is
  const filteredData = data;

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
      {/* Vertical Sidebar */}
      <VerticalSidebar activeTab={activeTab} onTabChange={setActiveTab} />
      
      {/* Main Content - with left padding to account for sidebar */}
      <div className="ml-14 transition-all duration-300">
        <div className="container mx-auto px-4 py-6 max-w-[1920px]">
          {/* Header */}
          <div className="mb-6">
          <div className="flex items-center justify-between flex-wrap mb-2">
            <div className="flex items-center gap-4 flex-wrap">
              <h1 className="text-3xl font-bold text-[var(--foreground)]">
                Campaign Management System
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
            <div className="flex items-center gap-2">
              {/* Theme Toggle Button */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-md border border-[var(--card-border)] hover:bg-[var(--table-row-hover)] transition-all duration-300 flex items-center justify-center relative w-10 h-10"
                title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              >
                <Sun className={`w-5 h-5 text-yellow-500 transition-all duration-300 absolute ${theme === 'dark' ? 'opacity-0 rotate-90 scale-0' : 'opacity-100 rotate-0 scale-100'}`} />
                <Moon className={`w-5 h-5 text-blue-400 transition-all duration-300 absolute ${theme === 'dark' ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-0'}`} />
              </button>
              {/* Logout Button */}
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[var(--foreground)] border border-[var(--card-border)] rounded-md hover:bg-[var(--table-row-hover)] transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
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
            selectedCampaignIds={selectedCampaignIds}
            onPhaseChange={(phaseId) => setSelectedPhaseId(phaseId)}
            onCampaignChange={(campaignId) => setSelectedCampaignId(campaignId)}
            onCampaignIdsChange={(campaignIds) => setSelectedCampaignIds(campaignIds)}
            onCleanCD={handleCleanCD}
            onClearTD={handleClearTD}
            loadingCleanCD={loadingCleanCD}
            loadingClearTD={loadingClearTD}
          />
        </div>

        {/* Clean CD Confirmation Modal */}
        {showCleanCDConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-2xl p-6 max-w-md w-full mx-4">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="w-6 h-6 text-yellow-500" />
                <h3 className="text-lg font-semibold text-[var(--foreground)]">Confirm Clean CD</h3>
              </div>
              <p className="text-[var(--secondary)] mb-6">
                This will delete all disconnected records that have matching contact numbers with connected records in the selected campaigns. This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowCleanCDConfirm(false)}
                  className="px-4 py-2 bg-[var(--card-bg)] text-[var(--foreground)] border border-[var(--card-border)] rounded-md hover:bg-[var(--table-row-hover)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={executeCleanCD}
                  className="px-4 py-2 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-md hover:from-purple-600 hover:to-purple-700 transition-all"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Clear TD Confirmation Modal */}
        {showClearTDConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-2xl p-6 max-w-md w-full mx-4">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="w-6 h-6 text-red-500" />
                <h3 className="text-lg font-semibold text-[var(--foreground)]">Confirm Clear TD</h3>
              </div>
              <p className="text-[var(--secondary)] mb-6">
                This will delete all records from the table that do NOT belong to campaigns associated with the selected client. This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowClearTDConfirm(false)}
                  className="px-4 py-2 bg-[var(--card-bg)] text-[var(--foreground)] border border-[var(--card-border)] rounded-md hover:bg-[var(--table-row-hover)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={executeClearTD}
                  className="px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-md hover:from-red-600 hover:to-red-700 transition-all"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Clean CD Message Display */}
        {cleanCDMessage && (
          <div className={`mb-4 p-4 rounded-lg border ${
            cleanCDTone === 'positive' ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' :
            cleanCDTone === 'neutral' ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' :
            'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          } flex items-center justify-between`}>
            <div className="flex items-center gap-3">
              {cleanCDTone === 'positive' ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
              ) : cleanCDTone === 'neutral' ? (
                <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
              )}
              <p className={`text-sm font-medium ${
                cleanCDTone === 'positive' ? 'text-green-800 dark:text-green-300' :
                cleanCDTone === 'neutral' ? 'text-blue-800 dark:text-blue-300' :
                'text-red-800 dark:text-red-300'
              }`}>
                {cleanCDMessage}
              </p>
            </div>
            <button
              onClick={() => setCleanCDMessage(null)}
              className={`p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${
                cleanCDTone === 'positive' ? 'text-green-600 dark:text-green-400' :
                cleanCDTone === 'neutral' ? 'text-blue-600 dark:text-blue-400' :
                'text-red-600 dark:text-red-400'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Clear TD Message Display */}
        {clearTDMessage && (
          <div className={`mb-4 p-4 rounded-lg border ${
            clearTDTone === 'positive' ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' :
            clearTDTone === 'neutral' ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' :
            'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          } flex items-center justify-between`}>
            <div className="flex items-center gap-3">
              {clearTDTone === 'positive' ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
              ) : clearTDTone === 'neutral' ? (
                <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
              )}
              <p className={`text-sm font-medium ${
                clearTDTone === 'positive' ? 'text-green-800 dark:text-green-300' :
                clearTDTone === 'neutral' ? 'text-blue-800 dark:text-blue-300' :
                'text-red-800 dark:text-red-300'
              }`}>
                {clearTDMessage}
              </p>
            </div>
            <button
              onClick={() => setClearTDMessage(null)}
              className={`p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${
                clearTDTone === 'positive' ? 'text-green-600 dark:text-green-400' :
                clearTDTone === 'neutral' ? 'text-blue-600 dark:text-blue-400' :
                'text-red-600 dark:text-red-400'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

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
                  className="group relative px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-md font-medium flex items-center gap-2 overflow-hidden transition-all duration-300 hover:from-blue-600 hover:to-blue-700 hover:shadow-lg hover:shadow-blue-500/50 hover:scale-105 active:scale-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none text-sm"
                >
                  {/* Animated background shimmer */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out"></div>
                  
                  <span className="relative z-10">{loadingCCD ? 'Loading...' : 'Show CCD'}</span>
                  
                  {/* Glow effect on hover */}
                  <div className="absolute inset-0 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-blue-400/20 via-blue-500/30 to-blue-400/20 blur-sm"></div>
                </button>
                <div className="relative group">
                  <button
                    onClick={handleCutCCD}
                    disabled={loadingCutCCD || data.length === 0}
                    className="group relative px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-md font-medium flex items-center gap-2 overflow-hidden transition-all duration-300 hover:from-orange-600 hover:to-orange-700 hover:shadow-lg hover:shadow-orange-500/50 hover:scale-105 active:scale-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none text-sm"
                    title="Cut CCD: Delete rows from data.csv matching contact_to or phone from displayed data"
                  >
                    {/* Animated background shimmer */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out"></div>
                    
                    <span className="relative z-10">{loadingCutCCD ? 'Cutting...' : 'Cut CCD'}</span>
                    
                    {/* Glow effect on hover */}
                    <div className="absolute inset-0 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-orange-400/20 via-orange-500/30 to-orange-400/20 blur-sm"></div>
                  </button>
                  {/* Warning tooltip */}
                  <div className="absolute bottom-full left-0 mb-2 w-64 p-2 bg-yellow-100 border border-yellow-400 rounded-md shadow-lg text-xs text-yellow-800 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                    <div className="font-semibold mb-1 flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" />
                      Warning
                    </div>
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
                    onClick={() => setShowDeletePCDModal(true)}
                    disabled={loadingDeletePCD}
                    className="group relative px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-md font-medium flex items-center gap-2 overflow-hidden transition-all duration-300 hover:from-red-600 hover:to-red-700 hover:shadow-lg hover:shadow-red-500/50 hover:scale-105 active:scale-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none text-sm"
                  >
                    {/* Animated background shimmer */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out"></div>
                    
                    <span className="relative z-10">{loadingDeletePCD ? 'Deleting...' : 'Delete PCD'}</span>
                    
                    {/* Glow effect on hover */}
                    <div className="absolute inset-0 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-red-400/20 via-red-500/30 to-red-400/20 blur-sm"></div>
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
                    className="group relative px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-md font-medium flex items-center gap-2 overflow-hidden transition-all duration-300 hover:from-green-600 hover:to-green-700 hover:shadow-lg hover:shadow-green-500/50 hover:scale-105 active:scale-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none text-sm"
                  >
                    {/* Animated background shimmer */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out"></div>
                    
                    <span className="relative z-10">{loadingSDTC ? 'Loading...' : 'Load SDTC'}</span>
                    
                    {/* Glow effect on hover */}
                    <div className="absolute inset-0 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-green-400/20 via-green-500/30 to-green-400/20 blur-sm"></div>
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
                <div className="flex items-center gap-2">
                  {/* Format Toggle Button (CSV/JSON) - Radio button style like theme toggle */}
                  <button
                    onClick={() => setDownloadFormat(downloadFormat === 'csv' ? 'json' : 'csv')}
                    className="group relative p-2 rounded-md border border-[var(--card-border)] bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 hover:from-blue-100 hover:to-blue-200 dark:hover:from-blue-800/30 dark:hover:to-blue-700/30 transition-all duration-300 flex items-center justify-center relative w-10 h-10 overflow-hidden hover:shadow-lg hover:shadow-blue-500/30 hover:scale-110 active:scale-100"
                    title={`Switch to ${downloadFormat === 'csv' ? 'JSON' : 'CSV'} format`}
                  >
                    {/* Animated background shimmer */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out"></div>
                    
                    <Sheet className={`w-5 h-5 text-blue-600 dark:text-blue-400 transition-all duration-300 absolute z-10 ${downloadFormat === 'csv' ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-90 scale-0'}`} />
                    <Braces className={`w-5 h-5 text-blue-600 dark:text-blue-400 transition-all duration-300 absolute z-10 ${downloadFormat === 'json' ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-0'}`} />
                    
                    {/* Glow effect on hover */}
                    <div className="absolute inset-0 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-blue-400/10 via-blue-500/20 to-blue-400/10 blur-sm"></div>
                  </button>
                <button
                  onClick={handleDownloadCSV}
                  className="group relative flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-md font-medium overflow-hidden transition-all duration-300 hover:from-blue-600 hover:to-blue-700 hover:shadow-lg hover:shadow-blue-500/50 hover:scale-105 active:scale-100 text-sm w-40"
                >
                  {/* Animated background shimmer */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out"></div>
                  
                  <Download size={16} className="relative z-10 filter-inject-icon flex-shrink-0" />
                  <span className="relative z-10 whitespace-nowrap">Download {downloadFormat.toUpperCase()}</span>
                  
                  {/* Glow effect on hover */}
                  <div className="absolute inset-0 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-blue-400/20 via-blue-500/30 to-blue-400/20 blur-sm"></div>
                </button>
                </div>
                <input
                  type="text"
                  value={csvFileName}
                  onChange={(e) => setCsvFileName(e.target.value)}
                  placeholder={`${downloadFormat.toUpperCase()} filename`}
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
                        {filteredData.length} of {totalCount.toLocaleString()}
                      </>
                    ) : (
                      <>
                        {totalCount.toLocaleString()}
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

              {/* Paginator */}
              {totalCount > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 mt-4 px-1">
                  {/* Left: total info */}
                  <div className="text-sm text-[var(--secondary)]">
                    Showing{' '}
                    <span className="font-medium text-[var(--foreground)]">
                      {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, totalCount)}
                    </span>{' '}
                    of{' '}
                    <span className="font-medium text-[var(--foreground)]">{totalCount.toLocaleString()}</span>{' '}
                    records
                  </div>

                  {/* Center: prev / page-input / next */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage <= 1 || loading}
                      className="px-3 py-1.5 rounded-md border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--input-bg)] transition-colors"
                    >
                      ← Prev
                    </button>

                    <div className="flex items-center gap-1.5 text-sm text-[var(--secondary)]">
                      <span>Page</span>
                      <input
                        type="number"
                        min={1}
                        max={Math.ceil(totalCount / pageSize)}
                        value={pageInputValue}
                        onChange={(e) => setPageInputValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const p = parseInt(pageInputValue);
                            if (!isNaN(p)) handlePageChange(p);
                          }
                        }}
                        onBlur={() => {
                          const p = parseInt(pageInputValue);
                          if (!isNaN(p)) handlePageChange(p);
                          else setPageInputValue(String(currentPage));
                        }}
                        className="w-14 px-2 py-1 rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--foreground)] text-sm text-center focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                      />
                      <span>of {Math.ceil(totalCount / pageSize)}</span>
                    </div>

                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage >= Math.ceil(totalCount / pageSize) || loading}
                      className="px-3 py-1.5 rounded-md border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--input-bg)] transition-colors"
                    >
                      Next →
                    </button>
                  </div>

                  {/* Right: rows-per-page */}
                  <div className="flex items-center gap-2 text-sm text-[var(--secondary)]">
                    <span>Rows per page:</span>
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={pageSize}
                      onChange={(e) => {
                        const s = parseInt(e.target.value);
                        if (!isNaN(s) && s > 0) handlePageSizeChange(s);
                      }}
                      className="w-16 px-2 py-1 rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--foreground)] text-sm text-center focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

        {/* Campaign Management Tab */}
        <div className={activeTab === 'campaign-management' ? '' : 'hidden'}>
          <CampaignManagement selectedClientId={selectedClientId} />
        </div>

        {/* Campaign Automation Tab */}
        <div className={activeTab === 'campaign-automation' ? '' : 'hidden'}>
          <CampaignAutomation />
        </div>

        {/* Reports Tab */}
        <div className={activeTab === 'reports' ? '' : 'hidden'}>
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-sm p-12">
            <div className="text-center">
              <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-xl">
                <FileStackIcon size={48} className="text-white" />
              </div>
              <h3 className="text-2xl font-bold text-[var(--foreground)] mb-3">
                Advanced Reports
              </h3>
              <p className="text-[var(--secondary)] text-lg">
                Comprehensive analytics and reporting dashboard. Coming soon!
              </p>
            </div>
          </div>
        </div>

        {/* Monitor Tab */}
        <div className={activeTab === 'monitor' ? '' : 'hidden'}>
          <CampaignMonitor selectedClientId={selectedClientId} />
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
          downloadFormat={downloadFormat}
          totalCount={totalCount}
          pageSize={pageSize}
          fetchPreviewPage={fetchPreviewPage}
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

      {/* Delete PCD Confirmation Modal */}
      {showDeletePCDModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--card-bg)] rounded-lg border border-[var(--card-border)] shadow-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-[var(--danger)]" />
                Delete PCD
              </h3>
              <button
                onClick={() => setShowDeletePCDModal(false)}
                className="p-1 hover:bg-[var(--table-row-hover)] rounded transition-colors"
                disabled={loadingDeletePCD}
              >
                <X className="w-5 h-5 text-[var(--secondary)]" />
              </button>
            </div>
            <p className="text-sm text-[var(--foreground)] mb-6">
              Are you sure you want to delete PCD data?
              <br />
              <span className="text-[var(--secondary)]">This action will delete data from CSV. This cannot be undone.</span>
            </p>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setShowDeletePCDModal(false)}
                disabled={loadingDeletePCD}
                className="px-4 py-2 border border-[var(--input-border)] rounded-md bg-[var(--input-bg)] text-[var(--foreground)] text-sm font-medium hover:bg-[var(--table-row-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowDeletePCDModal(false);
                  await handleDeletePCD();
                }}
                disabled={loadingDeletePCD}
                className="px-4 py-2 bg-[var(--danger)] text-white rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loadingDeletePCD ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
