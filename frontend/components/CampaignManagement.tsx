'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Loader2, Search, ChevronDown, CheckCircle2, RefreshCw, Trash2, X, Upload, ToggleLeft, ToggleRight, AlertTriangle } from 'lucide-react';
import { DataTable } from './DataTable';
import { api } from '@/lib/api';

interface CSVData {
  [key: string]: any;
}

interface Client {
  id: number;
  name: string;
  meta_map: any;
  table_name: string;
}

interface Phase {
  id: number;
  name: string;
  client_id: number;
  status?: string | null;
  records_count?: string | null;
}

interface Campaign {
  id: number;
  campaign_name: string;
  upsert_time: string;
  phase_id: number;
  created_at: string;
  cid: string | null;
  phone_id: string | null;
  agent_id: string | null;
  record_count: number | null;
  status: string | null;
}

interface Phone {
  id: string;
  agent_id: string;
  create_at: number;
  status: string;
}

interface Agent {
  id: string;
  name: string;
  config: any;
  [key: string]: any;
}

interface CampaignManagementProps {
  selectedClientId: number | null;
}

export function CampaignManagement({ selectedClientId }: CampaignManagementProps) {
  const [csvData, setCsvData] = useState<CSVData[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<Record<string, boolean>>({});
  const [selectedRecording, setSelectedRecording] = useState<string | null>(null);
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [searchColumn, setSearchColumn] = useState<string>('');
  const [searchInput, setSearchInput] = useState<string>('');
  
  // Phase management states
  const [phaseMode, setPhaseMode] = useState<'existing' | 'new'>('existing');
  const [phases, setPhases] = useState<Phase[]>([]);
  const [selectedPhaseId, setSelectedPhaseId] = useState<number | null>(null);
  const [loadingPhases, setLoadingPhases] = useState(false);
  const [creatingPhase, setCreatingPhase] = useState(false);
  const [phaseMessage, setPhaseMessage] = useState<string | null>(null);
  
  // Campaign management states
  const [showCampaignSection, setShowCampaignSection] = useState(false);
  const [campaignMode, setCampaignMode] = useState<'existing' | 'new'>('existing');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  
  // New Campaign states
  const [newCampaignMode, setNewCampaignMode] = useState<'single' | 'multiple'>('single');
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [createdCampaign, setCreatedCampaign] = useState<{
    id: number;
    campaign_name: string;
    cid: string;
    status: string;
    record_count: number;
    phase_id: number;
  } | null>(null);
  const [settingCampaignId, setSettingCampaignId] = useState(false);
  const [campaignIdMessage, setCampaignIdMessage] = useState<string | null>(null);
  const [csvCampaignIds, setCsvCampaignIds] = useState<number[]>([]);
  const [loadingCampaignIds, setLoadingCampaignIds] = useState(false);
  const [settingCid, setSettingCid] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingStatus, setRefreshingStatus] = useState<number | null>(null);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    show: boolean;
    campaignId: number | null;
    campaignName: string | null;
  }>({ show: false, campaignId: null, campaignName: null });
  const [deletingCampaign, setDeletingCampaign] = useState(false);
  const [uploadRecordsModal, setUploadRecordsModal] = useState<{
    show: boolean;
    campaignId: number | null;
    campaignName: string | null;
    campaignCid: string | null;
    phaseName: string | null;
  }>({ show: false, campaignId: null, campaignName: null, campaignCid: null, phaseName: null });
  const [uploadingRecords, setUploadingRecords] = useState(false);
  const [formattingPhoneNumbers, setFormattingPhoneNumbers] = useState(false);
  const [phoneFormatMessage, setPhoneFormatMessage] = useState<string | null>(null);
  
  // Phone and caller management states
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneModalCampaignId, setPhoneModalCampaignId] = useState<number | null>(null);
  const [phones, setPhones] = useState<Phone[]>([]);
  const [agents, setAgents] = useState<Record<string, Agent>>({});
  const [loadingPhones, setLoadingPhones] = useState(false);
  const [settingPhone, setSettingPhone] = useState<string | null>(null);
  const [startingCampaign, setStartingCampaign] = useState<number | null>(null);
  
  // Campaign start/stop confirmation modal
  const [campaignActionModal, setCampaignActionModal] = useState<{
    show: boolean;
    action: 'start' | 'stop' | null;
    campaign: Campaign | null;
  }>({ show: false, action: null, campaign: null });
  
  // Upload metadata states
  const [uploadMetadataEnabled, setUploadMetadataEnabled] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadingCSV, setUploadingCSV] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // View/Edit mode states for Current CD
  const [cdViewMode, setCdViewMode] = useState<'view' | 'edit'>('view');
  const [selectedCdRecords, setSelectedCdRecords] = useState<Set<number>>(new Set());
  const [deletingCdRecords, setDeletingCdRecords] = useState(false);
  const [editedRecords, setEditedRecords] = useState<Map<number, any>>(new Map());
  const [savingChanges, setSavingChanges] = useState(false);
  const [newRecords, setNewRecords] = useState<any[]>([]); // Array of new records being added


  // Fetch phases when client is selected
  useEffect(() => {
    if (selectedClientId) {
      const fetchPhases = async () => {
        setLoadingPhases(true);
        try {
          const response = await api.get(`/phase?client_id=${selectedClientId}`);

          if (response.ok) {
            const result = await response.json();
            setPhases(result.phases || []);
            // Set first phase as default if available
            if (result.phases && result.phases.length > 0) {
              setSelectedPhaseId(result.phases[0].id);
            } else {
              setSelectedPhaseId(null);
            }
          }
        } catch (error) {
          console.error('Error fetching phases:', error);
        } finally {
          setLoadingPhases(false);
        }
      };

      fetchPhases();
    }
  }, [selectedClientId]);

  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setUploadMessage('Please upload a CSV file');
      setTimeout(() => setUploadMessage(null), 3000);
      return;
    }

    setUploadingCSV(true);
    setUploadMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.upload('/upload_csv', formData);

      if (!response.ok) {
        const errorData = await response.json();
        const errorDetail = errorData.detail || errorData;
        throw new Error(errorDetail.message || 'Failed to upload CSV file');
      }

      const result = await response.json();
      setUploadMessage(`Success: ${result.message}`);
      
      // Close modal after 2 seconds
      setTimeout(() => {
        setShowUploadModal(false);
        setUploadMessage(null);
        setUploadMetadataEnabled(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }, 2000);
    } catch (error: any) {
      console.error('Error uploading CSV:', error);
      setUploadMessage(`Error: ${error.message || 'Failed to upload CSV file'}`);
    } finally {
      setUploadingCSV(false);
    }
  };

  const handleShowCurrentCD = async () => {
    setLoading(true);
    try {
      const response = await api.get('/get_csv_data');

      if (!response.ok) {
        throw new Error('Failed to fetch CSV data');
      }

      const result = await response.json();
      setCsvData(result.data || []);

      // Initialize column selection - select all by default
      if (result.data && result.data.length > 0) {
        const columns: Record<string, boolean> = {};
        Object.keys(result.data[0]).forEach((key) => {
          columns[key] = true;
        });
        setSelectedColumns(columns);
        // Set first column as default search column
        const firstColumn = Object.keys(result.data[0])[0];
        setSearchColumn(firstColumn);
      }
    } catch (error) {
      console.error('Error fetching CSV data:', error);
      alert('Failed to fetch CSV data. Please check if the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePhase = async () => {
    if (!selectedClientId) {
      setPhaseMessage('Please select a client first');
      setTimeout(() => setPhaseMessage(null), 3000);
      return;
    }

    setCreatingPhase(true);
    setPhaseMessage(null);
    try {
      const response = await api.post('/phase/create', {
        client_id: selectedClientId,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail?.message || 'Failed to create phase');
      }

      const result = await response.json();
      setPhaseMessage(`Phase created: ${result.name} (ID: ${result.id})`);
      
      // Refresh phases list
      const phasesResponse = await api.get(`/phase?client_id=${selectedClientId}`);

      if (phasesResponse.ok) {
        const phasesResult = await phasesResponse.json();
        setPhases(phasesResult.phases || []);
        // Set the newly created phase as selected
        setSelectedPhaseId(result.id);
        // Switch to existing mode to show the created phase
        setPhaseMode('existing');
      }
    } catch (error: any) {
      console.error('Error creating phase:', error);
      setPhaseMessage(`Error: ${error.message || 'Failed to create phase'}`);
    } finally {
      setCreatingPhase(false);
      setTimeout(() => setPhaseMessage(null), 5000);
    }
  };

  const fetchCampaigns = async () => {
    if (!selectedPhaseId) {
      return;
    }

    setLoadingCampaigns(true);
    try {
      const response = await api.get(`/campaign?phase_id=${selectedPhaseId}`);

      if (response.ok) {
        const result = await response.json();
        setCampaigns(result.campaigns || []);
        // Set first campaign as default if available
        if (result.campaigns && result.campaigns.length > 0) {
          setSelectedCampaignId(result.campaigns[0].id);
        } else {
          setSelectedCampaignId(null);
        }
      }
    } catch (error) {
      console.error('Error fetching campaigns:', error);
    } finally {
      setLoadingCampaigns(false);
    }
  };

  // Show/hide campaign section based on phase mode
  useEffect(() => {
    if (phaseMode === 'existing' && selectedPhaseId) {
      setShowCampaignSection(true);
    } else {
      setShowCampaignSection(false);
    }
  }, [phaseMode, selectedPhaseId]);

  // Fetch campaigns when phase changes and campaign section should be visible
  useEffect(() => {
    if (phaseMode === 'existing' && selectedPhaseId) {
      const loadCampaigns = async () => {
        setLoadingCampaigns(true);
        try {
          const response = await api.get(`/campaign?phase_id=${selectedPhaseId}`);

          if (response.ok) {
            const result = await response.json();
            setCampaigns(result.campaigns || []);
            // Set first campaign as default if available
            if (result.campaigns && result.campaigns.length > 0) {
              setSelectedCampaignId(result.campaigns[0].id);
            } else {
              setSelectedCampaignId(null);
            }
          }
        } catch (error) {
          console.error('Error fetching campaigns:', error);
        } finally {
          setLoadingCampaigns(false);
        }
      };

      loadCampaigns();
    }
  }, [phaseMode, selectedPhaseId]);

  // Function to fetch campaign IDs from CSV
  const fetchCampaignIds = async () => {
    setLoadingCampaignIds(true);
    try {
      const response = await api.get('/get_campaign_ids');

      if (response.ok) {
        const result = await response.json();
        setCsvCampaignIds(result.campaign_ids || []);
      }
    } catch (error) {
      console.error('Error fetching campaign IDs:', error);
    } finally {
      setLoadingCampaignIds(false);
    }
  };

  // Function to refresh campaigns
  const refreshCampaigns = async () => {
    if (!selectedPhaseId) return;
    
    setLoadingCampaigns(true);
    try {
      const response = await api.get(`/campaign?phase_id=${selectedPhaseId}`);

      if (response.ok) {
        const result = await response.json();
        setCampaigns(result.campaigns || []);
        if (result.campaigns && result.campaigns.length > 0) {
          setSelectedCampaignId(result.campaigns[0].id);
        } else {
          setSelectedCampaignId(null);
        }
      }
    } catch (error) {
      console.error('Error fetching campaigns:', error);
    } finally {
      setLoadingCampaigns(false);
    }
  };

  // Function to open phone selection modal
  const handleOpenPhoneModal = async (campaignId: number) => {
    setPhoneModalCampaignId(campaignId);
    setShowPhoneModal(true);
    setLoadingPhones(true);

    try {
      // Fetch phones
      const phonesResponse = await api.get('/phones');

      if (phonesResponse.ok) {
        const phonesResult = await phonesResponse.json();
        setPhones(phonesResult.phones || []);

        // Fetch agents for each phone
        const agentPromises = (phonesResult.phones || []).map(async (phone: Phone) => {
          if (phone.agent_id) {
            try {
              const agentResponse = await api.get(`/agent/${phone.agent_id}`);
              if (agentResponse.ok) {
                const agentResult = await agentResponse.json();
                return { agentId: phone.agent_id, agent: agentResult.agent };
              }
            } catch (error) {
              console.error(`Error fetching agent ${phone.agent_id}:`, error);
            }
          }
          return null;
        });

        const agentResults = await Promise.all(agentPromises);
        const agentsMap: Record<string, Agent> = {};
        agentResults.forEach((result) => {
          if (result) {
            agentsMap[result.agentId] = result.agent;
          }
        });
        setAgents(agentsMap);
      } else {
        alert('Failed to fetch phones');
      }
    } catch (error) {
      console.error('Error fetching phones:', error);
      alert('Error fetching phones');
    } finally {
      setLoadingPhones(false);
    }
  };

  // Function to set phone for campaign
  const handleSetPhone = async (campaignId: number, phoneId: string) => {
    setSettingPhone(phoneId);
    try {
      const response = await api.post('/campaign/set_caller', {
        campaign_id: campaignId,
        phone_id: phoneId,
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.detail?.message || errorData.detail?.error || 'Failed to set phone';
        alert(errorMessage);
      } else {
        const result = await response.json();
        alert(result.message || 'Phone set successfully');
        
        // Refresh campaigns to get updated phone_id and agent_id
        await refreshCampaigns();
        
        // Close modal
        setShowPhoneModal(false);
        setPhoneModalCampaignId(null);
      }
    } catch (error: any) {
      console.error('Error setting phone:', error);
      alert(`Error: ${error.message || 'Failed to set phone'}`);
    } finally {
      setSettingPhone(null);
    }
  };

  // Function to open start campaign confirmation modal
  const handleOpenStartModal = (campaignId: number) => {
    const campaign = campaigns.find(c => c.id === campaignId);
    if (campaign) {
      setCampaignActionModal({ show: true, action: 'start', campaign });
    }
  };

  // Function to open stop campaign confirmation modal
  const handleOpenStopModal = (campaignId: number) => {
    const campaign = campaigns.find(c => c.id === campaignId);
    if (campaign) {
      setCampaignActionModal({ show: true, action: 'stop', campaign });
    }
  };

  // Function to start campaign
  const handleStartCampaign = async (campaignId: number) => {
    console.log(`[FRONTEND] Start Campaign button clicked for campaign ID: ${campaignId}`);
    
    // Find campaign details for logging
    const campaign = campaigns.find(c => c.id === campaignId);
    if (campaign) {
      console.log(`[FRONTEND] Campaign details:`, {
        id: campaign.id,
        name: campaign.campaign_name,
        cid: campaign.cid,
        phone_id: campaign.phone_id,
        agent_id: campaign.agent_id,
        status: campaign.status
      });
      
      // Warn if caller is not set
      if (!campaign.phone_id && !campaign.agent_id) {
        console.warn(`[FRONTEND] WARNING: Campaign ${campaignId} does not have a caller set (phone_id: ${campaign.phone_id}, agent_id: ${campaign.agent_id})`);
      }
    }
    
    setStartingCampaign(campaignId);
    try {
      const requestBody = {
        campaign_id: campaignId,
      };
      
      console.log(`[FRONTEND] Making POST request to /campaign/start`);
      console.log(`[FRONTEND] Request body:`, requestBody);
      console.log(`[FRONTEND] Request URL: https://cms-backend.finovateglobal.com/campaign/start`);
      
      const response = await api.post('/campaign/start', requestBody);

      console.log(`[FRONTEND] Response received - Status: ${response.status}, OK: ${response.ok}`);

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.detail?.message || errorData.detail?.error || 'Failed to start campaign';
        console.error(`[FRONTEND] ERROR: Campaign start failed:`, errorData);
        console.error(`[FRONTEND] Error message: ${errorMessage}`);
        alert(errorMessage);
      } else {
        const result = await response.json();
        console.log(`[FRONTEND] SUCCESS: Campaign started successfully:`, result);
        alert(result.message || 'Campaign started successfully');
        
        // Refresh campaigns to get updated status
        console.log(`[FRONTEND] Refreshing campaigns list to get updated status`);
        await refreshCampaigns();
        
        // Close modal
        setCampaignActionModal({ show: false, action: null, campaign: null });
      }
    } catch (error: any) {
      console.error(`[FRONTEND] EXCEPTION: Error starting campaign:`, error);
      console.error(`[FRONTEND] Exception details:`, {
        message: error.message,
        stack: error.stack,
        campaignId: campaignId
      });
      alert(`Error: ${error.message || 'Failed to start campaign'}`);
    } finally {
      setStartingCampaign(null);
      console.log(`[FRONTEND] Start campaign operation completed for campaign ID: ${campaignId}`);
    }
  };

  // Function to stop campaign
  const handleStopCampaign = async (campaignId: number) => {
    setStartingCampaign(campaignId);
    try {
      const response = await api.post('/campaign/stop', {
        campaign_id: campaignId,
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.detail?.message || errorData.detail?.error || 'Failed to stop campaign';
        alert(errorMessage);
      } else {
        const result = await response.json();
        alert(result.message || 'Campaign stopped successfully');
        
        // Refresh campaigns to get updated status
        await refreshCampaigns();
        
        // Close modal
        setCampaignActionModal({ show: false, action: null, campaign: null });
      }
    } catch (error: any) {
      console.error('Error stopping campaign:', error);
      alert(`Error: ${error.message || 'Failed to stop campaign'}`);
    } finally {
      setStartingCampaign(null);
    }
  };

  // Function to refresh both campaigns and campaign IDs
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // Refresh all campaign statuses from Millis.ai
      if (selectedPhaseId) {
        const statusResponse = await api.post(`/campaign/refresh-all-status?phase_id=${selectedPhaseId}`);

        if (statusResponse.ok) {
          const statusResult = await statusResponse.json();
          // Update campaigns with refreshed statuses
          setCampaigns(statusResult.campaigns || []);
        }
      }
      
      // Also refresh campaign IDs from CSV
      await fetchCampaignIds();
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setRefreshing(false);
    }
  };

  // Fetch campaign IDs from CSV when campaign section is visible
  useEffect(() => {
    if (showCampaignSection) {
      fetchCampaignIds();
    }
  }, [showCampaignSection]);

  // Get available columns for search dropdown (only selected columns)
  const availableSearchColumns = useMemo(() => {
    return Object.keys(selectedColumns).filter((key) => selectedColumns[key]);
  }, [selectedColumns]);

  // Filter data based on search
  const filteredData = useMemo(() => {
    if (!searchColumn || !searchInput.trim()) {
      return csvData;
    }

    const searchTerm = searchInput.trim().toLowerCase();
    return csvData.filter((row) => {
      const value = row[searchColumn];
      if (value === null || value === undefined) {
        return false;
      }
      // Convert to string and check if it contains the search term (case-insensitive)
      const stringValue = String(value).toLowerCase();
      return stringValue.includes(searchTerm);
    });
  }, [csvData, searchColumn, searchInput]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-[var(--foreground)] mb-2">
          Campaign Management
        </h2>
        <p className="text-[var(--secondary)]">
          Manage and view campaign data from data.csv
        </p>
      </div>

      {/* Phase Selection Section */}
      <div className="mb-4 p-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-sm">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Toggle: Existing / New Phase */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--foreground)] whitespace-nowrap">Phase Selection:</span>
            <div className="flex items-center gap-2 bg-[var(--input-bg)] p-1 rounded-lg border border-[var(--input-border)]">
              <button
                onClick={() => setPhaseMode('existing')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                  phaseMode === 'existing'
                    ? 'bg-[var(--primary)] text-white shadow-sm'
                    : 'text-[var(--secondary)] hover:text-[var(--foreground)]'
                }`}
              >
                Existing Phase
              </button>
              <button
                onClick={() => setPhaseMode('new')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                  phaseMode === 'new'
                    ? 'bg-[var(--primary)] text-white shadow-sm'
                    : 'text-[var(--secondary)] hover:text-[var(--foreground)]'
                }`}
              >
                New Phase
              </button>
            </div>
          </div>


          {/* Existing Phase Dropdown or Create Phase Button */}
          {phaseMode === 'existing' ? (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-[var(--foreground)] whitespace-nowrap">
                Phase:
              </label>
              <div className="relative w-48">
                <select
                  value={selectedPhaseId || ''}
                  onChange={(e) => setSelectedPhaseId(Number(e.target.value))}
                  disabled={loadingPhases || !selectedClientId || phases.length === 0}
                  className="w-full px-3 py-2 pr-8 border border-[var(--input-border)] rounded-md bg-[var(--input-bg)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">Select phase</option>
                  {phases.map((phase) => (
                    <option key={phase.id} value={phase.id}>
                      {phase.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--secondary)] pointer-events-none" />
                {loadingPhases && (
                  <div className="absolute right-8 top-1/2 -translate-y-1/2">
                    <Loader2 className="w-4 h-4 animate-spin text-[var(--secondary)]" />
                  </div>
                )}
              </div>
              {!selectedClientId && (
                <span className="text-sm text-[var(--secondary)] whitespace-nowrap">Please select a client first</span>
              )}
              {selectedClientId && phases.length === 0 && !loadingPhases && (
                <span className="text-sm text-[var(--secondary)] whitespace-nowrap">No phases found</span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCreatePhase}
                disabled={creatingPhase || !selectedClientId}
                className="px-6 py-2 bg-[var(--success)] text-white rounded-md hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
              >
                {creatingPhase ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Phase'
                )}
              </button>
              {!selectedClientId && (
                <span className="text-sm text-[var(--secondary)] whitespace-nowrap">Please select a client first</span>
              )}
              {phaseMessage && (
                <span className={`text-sm whitespace-nowrap ${
                  phaseMessage.startsWith('Error') 
                    ? 'text-[var(--danger)]' 
                    : 'text-[var(--success)]'
                }`}>
                  {phaseMessage}
                </span>
              )}
            </div>
          )}
        </div>
        
        {/* Upload Metadata Section */}
        {phaseMode === 'existing' && selectedPhaseId && (
          <div className="mt-4 pt-4 border-t border-[var(--card-border)]">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[var(--foreground)]">Manual Upload:</span>
                <div className="relative group">
                  <button
                    onClick={() => setUploadMetadataEnabled(!uploadMetadataEnabled)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] hover:bg-[var(--table-row-hover)] transition-colors"
                  >
                    {uploadMetadataEnabled ? (
                      <ToggleRight className="w-5 h-5 text-[var(--primary)]" />
                    ) : (
                      <ToggleLeft className="w-5 h-5 text-[var(--secondary)]" />
                    )}
                    <span className="text-xs text-[var(--foreground)]">
                      {uploadMetadataEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </button>
                  {/* Tooltip */}
                  <div className="absolute left-0 top-full mt-2 w-72 p-3 bg-[var(--card-bg)] border border-[var(--danger)] rounded-md shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                    <p className="text-xs text-[var(--foreground)] mb-2">
                      <AlertTriangle className="w-4 h-4 text-[var(--danger)] inline mr-1" />
                      <strong className="text-[var(--danger)]">Warning:</strong> Enable this to manually upload metadata CSV.
                    </p>
                    <p className="text-xs text-[var(--danger)] font-semibold">
                      ⚠️ This will delete all existing records in data.csv and replace them with the uploaded data.
                    </p>
                  </div>
                </div>
              </div>
              
              {uploadMetadataEnabled && (
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="px-4 py-2 bg-[var(--primary)] text-white rounded-md hover:bg-[var(--primary-hover)] transition-colors text-sm font-medium flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Upload Meta Data
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Campaign Selection Section - Only show when Existing Phase mode is selected */}
      {phaseMode === 'existing' && selectedPhaseId && (
        <div className="mb-4 p-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-sm">
          <div className="space-y-4">
            {/* Toggle: Existing / New Campaign */}
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-[var(--foreground)]">Campaign Selection:</span>
              <div className="flex items-center gap-2 bg-[var(--input-bg)] p-1 rounded-lg border border-[var(--input-border)]">
                <button
                  onClick={() => setCampaignMode('existing')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                    campaignMode === 'existing'
                      ? 'bg-[var(--primary)] text-white shadow-sm'
                      : 'text-[var(--secondary)] hover:text-[var(--foreground)]'
                  }`}
                >
                  Existing Campaign
                </button>
                <button
                  onClick={() => setCampaignMode('new')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                    campaignMode === 'new'
                      ? 'bg-[var(--primary)] text-white shadow-sm'
                      : 'text-[var(--secondary)] hover:text-[var(--foreground)]'
                  }`}
                >
                  New Campaign
                </button>
              </div>
            </div>

            {/* Existing Campaign Section */}
            {campaignMode === 'existing' && (
              <div className="space-y-4">
                {/* Campaign IDs Status Display */}
                <div className="p-3 bg-[var(--card-bg)] rounded-md border border-[var(--card-border)]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div>
                        <span className="text-xs text-[var(--secondary)]">ID:</span>
                        <p className="text-sm font-medium text-[var(--foreground)]">
                          {selectedPhaseId || 'N/A'}
                        </p>
                      </div>
                      <div className="flex-1">
                        <span className="text-xs text-[var(--secondary)]">Set Status:</span>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {loadingCampaignIds ? (
                            <Loader2 className="w-4 h-4 animate-spin text-[var(--secondary)]" />
                          ) : csvCampaignIds.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {csvCampaignIds.map((campaignId) => {
                                const campaign = campaigns.find(c => c.id === campaignId);
                                return (
                                  <span
                                    key={campaignId}
                                    className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--input-bg)] border border-[var(--input-border)] rounded text-sm text-[var(--foreground)]"
                                  >
                                    <span className="font-medium">{campaignId}</span>
                                    {campaign && (
                                      <span className="text-[var(--secondary)]">
                                        ({campaign.campaign_name || 'N/A'})
                                      </span>
                                    )}
                                  </span>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-sm text-[var(--secondary)]">No campaign IDs set in data.csv</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleRefresh}
                      disabled={refreshing || loadingCampaigns || !selectedPhaseId}
                      className="px-4 py-2 bg-[var(--primary)] text-white rounded-md hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      title="Refresh campaigns and campaign IDs"
                    >
                      <RefreshCw className={`w-4 h-4 ${(refreshing || loadingCampaigns) ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                  </div>
                </div>

                {/* Campaign Table */}
                {campaigns.length > 0 && (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full border-collapse border border-[var(--card-border)]">
                      <thead>
                        <tr className="bg-[var(--table-header-bg)]">
                          <th className="border border-[var(--card-border)] px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)]">
                            ID
                          </th>
                          <th className="border border-[var(--card-border)] px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)]">
                            Campaign Name
                          </th>
                          <th className="border border-[var(--card-border)] px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)]">
                            CID
                          </th>
                          <th className="border border-[var(--card-border)] px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)]">
                            <div className="flex items-center gap-2">
                              <span>Status</span>
                              <button
                                onClick={async () => {
                                  if (!selectedPhaseId) {
                                    alert('Please select a phase first');
                                    return;
                                  }
                                  setRefreshing(true);
                                  try {
                                    const response = await api.post(`/campaign/refresh-all-status?phase_id=${selectedPhaseId}`);
                                    if (!response.ok) {
                                      const errorData = await response.json();
                                      const errorDetail = errorData.detail || errorData;
                                      alert(errorDetail.message || 'Failed to refresh all statuses');
                                    } else {
                                      const result = await response.json();
                                      // Update campaigns with refreshed statuses
                                      setCampaigns(result.campaigns || []);
                                    }
                                  } catch (error: any) {
                                    console.error('Error refreshing all statuses:', error);
                                    alert(`Error: ${error.message || 'Failed to refresh all statuses'}`);
                                  } finally {
                                    setRefreshing(false);
                                  }
                                }}
                                disabled={refreshing || !selectedPhaseId}
                                className="p-1 hover:bg-[var(--table-row-hover)] rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Refresh all campaign statuses"
                              >
                                <RefreshCw className={`w-3 h-3 text-[var(--secondary)] ${refreshing ? 'animate-spin' : ''}`} />
                              </button>
                            </div>
                          </th>
                          <th className="border border-[var(--card-border)] px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)]">
                            Record Count
                          </th>
                          <th className="border border-[var(--card-border)] px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)]">
                            Upsert Time
                          </th>
                          <th className="border border-[var(--card-border)] px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)]">
                            Created At
                          </th>
                          <th className="border border-[var(--card-border)] px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)]">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {campaigns.map((campaign) => {
                          const isIdSet = csvCampaignIds.includes(campaign.id);
                          return (
                          <tr
                            key={campaign.id}
                            className={`${isIdSet ? 'bg-green-50 dark:bg-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/40' : ''} hover:bg-[var(--table-row-hover)] ${
                              selectedCampaignId === campaign.id ? 'bg-[var(--primary)]/10' : ''
                            }`}
                          >
                            <td className="border border-[var(--card-border)] px-4 py-2 text-sm text-[var(--foreground)]">
                              {campaign.id}
                            </td>
                            <td className="border border-[var(--card-border)] px-4 py-2 text-sm text-[var(--foreground)]">
                              {campaign.campaign_name || 'N/A'}
                            </td>
                            <td className="border border-[var(--card-border)] px-4 py-2 text-sm text-[var(--foreground)]">
                              {campaign.cid || 'N/A'}
                            </td>
                            <td className="border border-[var(--card-border)] px-4 py-2 text-sm text-[var(--foreground)]">
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                  campaign.status === 'finished' 
                                    ? 'bg-green-100 text-green-800' 
                                    : campaign.status === 'idle'
                                    ? 'bg-blue-100 text-blue-800'
                                    : campaign.status === 'active'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : campaign.status === 'completed'
                                    ? 'bg-gray-100 text-gray-800'
                                    : campaign.status === 'running'
                                    ? 'bg-purple-100 text-purple-800'
                                    : 'bg-gray-100 text-gray-600'
                                }`}>
                                  {campaign.status || 'N/A'}
                                </span>
                                <button
                                  onClick={async () => {
                                    setRefreshingStatus(campaign.id);
                                    try {
                                      const response = await api.post(`/campaign/${campaign.id}/refresh-status`);

                                      if (!response.ok) {
                                        const errorData = await response.json();
                                        const errorDetail = errorData.detail || errorData;
                                        alert(errorDetail.message || 'Failed to refresh status');
                                      } else {
                                        const result = await response.json();
                                        // Update the campaign in the campaigns array
                                        setCampaigns(prevCampaigns => 
                                          prevCampaigns.map(c => 
                                            c.id === campaign.id 
                                              ? { ...c, status: result.status, record_count: result.record_count }
                                              : c
                                          )
                                        );
                                      }
                                    } catch (error: any) {
                                      console.error('Error refreshing status:', error);
                                      alert(`Error: ${error.message || 'Failed to refresh status'}`);
                                    } finally {
                                      setRefreshingStatus(null);
                                    }
                                  }}
                                  disabled={refreshingStatus === campaign.id}
                                  className="p-1 hover:bg-[var(--table-row-hover)] rounded transition-colors disabled:opacity-50"
                                  title="Refresh status from Millis.ai"
                                >
                                  <RefreshCw className={`w-3 h-3 text-[var(--secondary)] ${refreshingStatus === campaign.id ? 'animate-spin' : ''}`} />
                                </button>
                              </div>
                            </td>
                            <td className="border border-[var(--card-border)] px-4 py-2 text-sm text-[var(--foreground)]">
                              {campaign.record_count !== null ? campaign.record_count : 'N/A'}
                            </td>
                            <td className="border border-[var(--card-border)] px-4 py-2 text-sm text-[var(--foreground)]">
                              {campaign.upsert_time ? new Date(campaign.upsert_time).toLocaleString() : 'N/A'}
                            </td>
                            <td className="border border-[var(--card-border)] px-4 py-2 text-sm text-[var(--foreground)]">
                              {campaign.created_at ? new Date(campaign.created_at).toLocaleString() : 'N/A'}
                            </td>
                            <td className="border border-[var(--card-border)] px-4 py-2 text-sm text-[var(--foreground)]">
                              {campaign.status === 'finished' ? (
                                <span className="text-sm">{campaign.phone_id || 'N/A'}</span>
                              ) : campaign.status === 'idle' ? (
                                campaign.phone_id ? (
                                  <div className="relative group">
                                    <span className="text-sm">{campaign.phone_id}</span>
                                    <button
                                      onClick={() => handleOpenPhoneModal(campaign.id)}
                                      className="absolute top-0 left-0 w-full h-full opacity-0 group-hover:opacity-100 bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium transition-opacity"
                                    >
                                      Update
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => handleOpenPhoneModal(campaign.id)}
                                    className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:opacity-90 transition-opacity"
                                  >
                                    Set Phone
                                  </button>
                                )
                              ) : campaign.status === 'started' ? (
                                <button
                                  onClick={() => handleOpenStopModal(campaign.id)}
                                  disabled={startingCampaign === campaign.id}
                                  className="px-3 py-1 bg-red-600 text-white rounded text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {startingCampaign === campaign.id ? 'Stopping...' : 'Stop'}
                                </button>
                              ) : (
                                <span className="text-sm">{campaign.phone_id || 'N/A'}</span>
                              )}
                            </td>
                            <td className="border border-[var(--card-border)] px-4 py-2 text-sm text-[var(--foreground)]">
                              {campaign.status === 'idle' && campaign.phone_id ? (
                                <button
                                  onClick={() => handleOpenStartModal(campaign.id)}
                                  disabled={startingCampaign === campaign.id}
                                  className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {startingCampaign === campaign.id ? 'Starting...' : 'Start'}
                                </button>
                              ) : campaign.status === 'started' ? (
                                <button
                                  disabled
                                  className="px-3 py-1 bg-gray-400 text-white rounded text-xs font-medium cursor-not-allowed opacity-50"
                                >
                                  Start
                                </button>
                              ) : null}
                            </td>
                            <td className="border border-[var(--card-border)] px-4 py-2 text-sm text-[var(--foreground)]">
                              <div className="flex items-center gap-2">
                                {campaign.status === 'idle' && (
                                  <button
                                  onClick={async () => {
                                    setSettingCid(campaign.id);
                                    try {
                                      const response = await api.post('/set_campaign_id', {
                                        campaign_id: campaign.id,
                                      });

                                      if (!response.ok) {
                                        const errorData = await response.json();
                                        const errorDetail = errorData.detail || errorData;
                                        alert(errorDetail.message || 'Failed to set campaign ID');
                                      } else {
                                        const result = await response.json();
                                        alert(result.message || 'Campaign ID set successfully');
                                        // Refresh campaign IDs
                                        const idsResponse = await api.get('/get_campaign_ids');
                                        if (idsResponse.ok) {
                                          const idsResult = await idsResponse.json();
                                          setCsvCampaignIds(idsResult.campaign_ids || []);
                                        }
                                      }
                                    } catch (error: any) {
                                      console.error('Error setting CID:', error);
                                      alert(`Error: ${error.message || 'Failed to set campaign ID'}`);
                                    } finally {
                                      setSettingCid(null);
                                    }
                                  }}
                                  disabled={settingCid === campaign.id}
                                  className="px-3 py-1 bg-[var(--primary)] text-white rounded text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                                >
                                  {settingCid === campaign.id ? (
                                    <>
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                      Setting...
                                    </>
                                  ) : (
                                    'Set CID'
                                  )}
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setDeleteConfirmModal({
                                    show: true,
                                    campaignId: campaign.id,
                                    campaignName: campaign.campaign_name || `Campaign ${campaign.id}`
                                  });
                                }}
                                disabled={deletingCampaign}
                                className="p-1.5 hover:bg-red-100 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Delete campaign"
                              >
                                <Trash2 className="w-4 h-4 text-[var(--danger)]" />
                              </button>
                            </div>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* New Campaign Mode */}
            {campaignMode === 'new' && selectedPhaseId && (
              <div className="space-y-4">
                {/* Mode Toggle: Single / Multiple */}
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-[var(--foreground)]">Mode:</span>
                  <div className="flex items-center gap-2 bg-[var(--input-bg)] p-1 rounded-lg border border-[var(--input-border)]">
                    <button
                      onClick={() => setNewCampaignMode('single')}
                      className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                        newCampaignMode === 'single'
                          ? 'bg-[var(--primary)] text-white shadow-sm'
                          : 'text-[var(--secondary)] hover:text-[var(--foreground)]'
                      }`}
                    >
                      Single
                    </button>
                    <button
                      onClick={() => setNewCampaignMode('multiple')}
                      className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                        newCampaignMode === 'multiple'
                          ? 'bg-[var(--primary)] text-white shadow-sm'
                          : 'text-[var(--secondary)] hover:text-[var(--foreground)]'
                      }`}
                    >
                      Multiple
                    </button>
                  </div>
                </div>

                {/* Single Mode Content */}
                {newCampaignMode === 'single' && (
                  <div className="space-y-4 p-4 bg-[var(--input-bg)] rounded-md border border-[var(--input-border)]">
                    {/* Create Campaign Button */}
                    {!createdCampaign && (
                      <div>
                        <button
                          onClick={async () => {
                            if (!selectedPhaseId) {
                              return;
                            }

                            // Get phase name from selected phase
                            const selectedPhase = phases.find(p => p.id === selectedPhaseId);
                            if (!selectedPhase) {
                              setCampaignIdMessage('Error: Phase not found');
                              setTimeout(() => setCampaignIdMessage(null), 5000);
                              return;
                            }

                            setCreatingCampaign(true);
                            setCampaignIdMessage(null);
                            
                            try {
                              const response = await api.post('/campaign/create', {
                                phase_id: selectedPhaseId,
                                phase_name: selectedPhase.name,
                              });

                              if (!response.ok) {
                                const errorData = await response.json();
                                const errorDetail = errorData.detail || errorData;
                                let errorMessage = 'Failed to create campaign';
                                
                                if (errorDetail.message) {
                                  errorMessage = errorDetail.message;
                                } else if (typeof errorDetail === 'string') {
                                  errorMessage = errorDetail;
                                }
                                
                                setCampaignIdMessage(`Error: ${errorMessage}`);
                                setTimeout(() => setCampaignIdMessage(null), 5000);
                                return;
                              }

                              const result = await response.json();
                              setCreatedCampaign({
                                id: result.id,
                                campaign_name: result.campaign_name,
                                cid: result.cid,
                                status: result.status,
                                record_count: result.record_count,
                                phase_id: result.phase_id
                              });
                            } catch (error: any) {
                              console.error('Error creating campaign:', error);
                              setCampaignIdMessage(`Error: ${error.message || 'Failed to create campaign'}`);
                              setTimeout(() => setCampaignIdMessage(null), 5000);
                            } finally {
                              setCreatingCampaign(false);
                            }
                          }}
                          disabled={creatingCampaign || !selectedPhaseId}
                          className="px-6 py-2 bg-[var(--success)] text-white rounded-md hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          {creatingCampaign ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Creating Campaign...
                            </>
                          ) : (
                            'Create Campaign'
                          )}
                        </button>
                        {campaignIdMessage && campaignIdMessage.startsWith('Error') && (
                          <div className="mt-2 p-3 rounded-md text-sm bg-[var(--danger)] text-white">
                            {campaignIdMessage}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Created Campaign Display */}
                    {createdCampaign && (
                      <div className="space-y-4">
                        <div className="p-4 bg-[var(--card-bg)] rounded-md border border-[var(--card-border)]">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-semibold text-[var(--foreground)]">Campaign Created:</h4>
                            <span className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                              {createdCampaign.status}
                            </span>
                          </div>
                          <div className="space-y-2">
                            <div>
                              <span className="text-xs text-[var(--secondary)]">Campaign Name:</span>
                              <p className="text-sm font-medium text-[var(--foreground)]">{createdCampaign.campaign_name}</p>
                            </div>
                            <div className="flex items-center gap-4">
                              <div>
                                <span className="text-xs text-[var(--secondary)]">Campaign ID:</span>
                                <p className="text-sm font-medium text-[var(--foreground)]">{createdCampaign.id}</p>
                              </div>
                              <div>
                                <span className="text-xs text-[var(--secondary)]">CID:</span>
                                <p className="text-sm font-medium text-[var(--foreground)]">{createdCampaign.cid}</p>
                              </div>
                              <div>
                                <span className="text-xs text-[var(--secondary)]">Record Count:</span>
                                <p className="text-sm font-medium text-[var(--foreground)]">{createdCampaign.record_count}</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Set Campaign ID Button and Set New Campaign Button */}
                        <div className="flex items-center gap-3">
                          <button
                            onClick={async () => {
                              if (!createdCampaign) {
                                return;
                              }

                              setSettingCampaignId(true);
                              setCampaignIdMessage(null);
                              
                              try {
                                const response = await api.post('/set_campaign_id', {
                                  campaign_id: createdCampaign.id,
                                });

                                if (!response.ok) {
                                  const errorData = await response.json();
                                  const errorDetail = errorData.detail || errorData;
                                  let errorMessage = 'Failed to set campaign ID';
                                  
                                  if (errorDetail.message) {
                                    errorMessage = errorDetail.message;
                                  } else if (typeof errorDetail === 'string') {
                                    errorMessage = errorDetail;
                                  }
                                  
                                  setCampaignIdMessage(errorMessage);
                                  setTimeout(() => setCampaignIdMessage(null), 5000);
                                  return;
                                }

                                const result = await response.json();
                                setCampaignIdMessage(result.message || `Successfully set campaign ID for ${result.records_updated || 0} records`);
                                setTimeout(() => setCampaignIdMessage(null), 5000);
                              } catch (error: any) {
                                console.error('Error setting campaign ID:', error);
                                setCampaignIdMessage(`Error: ${error.message || 'Failed to set campaign ID'}`);
                                setTimeout(() => setCampaignIdMessage(null), 5000);
                              } finally {
                                setSettingCampaignId(false);
                              }
                            }}
                            disabled={settingCampaignId || !createdCampaign}
                            className="px-6 py-2 bg-[var(--primary)] text-white rounded-md hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                          >
                            {settingCampaignId ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Setting Campaign ID...
                              </>
                            ) : (
                              'Set Campaign ID'
                            )}
                          </button>
                          
                          <button
                            onClick={() => {
                              setCreatedCampaign(null);
                              setCampaignIdMessage(null);
                            }}
                            disabled={!createdCampaign}
                            className="px-6 py-2 bg-[var(--secondary)] text-white rounded-md hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Set New Campaign
                          </button>
                        </div>
                        
                        {campaignIdMessage && (
                          <div className={`p-3 rounded-md text-sm ${
                            campaignIdMessage.toLowerCase().includes('error') || 
                            campaignIdMessage.toLowerCase().includes('no records') ||
                            campaignIdMessage.toLowerCase().includes('does not exist')
                              ? 'bg-[var(--danger)] text-white'
                              : 'bg-[var(--success)] text-white'
                          }`}>
                            {campaignIdMessage}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Multiple Mode Content - Placeholder */}
                {newCampaignMode === 'multiple' && (
                  <div className="p-4 bg-[var(--input-bg)] rounded-md border border-[var(--input-border)]">
                    <p className="text-sm text-[var(--secondary)]">Multiple campaign creation will be implemented here.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Show Current CD Button and Format Phone Numbers Button */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <button
          onClick={handleShowCurrentCD}
          disabled={loading}
          className="px-6 py-3 bg-[var(--primary)] text-white rounded-md hover:bg-[var(--primary-hover)] transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading...
            </>
          ) : (
            'Show Current CD'
          )}
        </button>
        
        <button
          onClick={async () => {
            setFormattingPhoneNumbers(true);
            setPhoneFormatMessage(null);
            try {
              const response = await api.post('/format_phone_numbers');

              if (!response.ok) {
                const errorData = await response.json();
                const errorDetail = errorData.detail || errorData;
                setPhoneFormatMessage(errorDetail.message || 'Failed to format phone numbers');
              } else {
                const result = await response.json();
                setPhoneFormatMessage(result.message || 'Phone numbers formatted successfully');
                
                // Refresh CSV data to show updated phone numbers
                await handleShowCurrentCD();
              }
            } catch (error: any) {
              console.error('Error formatting phone numbers:', error);
              setPhoneFormatMessage(`Error: ${error.message || 'Failed to format phone numbers'}`);
            } finally {
              setFormattingPhoneNumbers(false);
              setTimeout(() => setPhoneFormatMessage(null), 5000);
            }
          }}
          disabled={formattingPhoneNumbers}
          className="px-6 py-3 bg-[var(--success)] text-white rounded-md hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {formattingPhoneNumbers ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Formatting...
            </>
          ) : (
            'Format Phone Numbers (+91)'
          )}
        </button>
        
        {phoneFormatMessage && (
          <div className={`px-4 py-2 rounded-md text-sm ${
            phoneFormatMessage.includes('+91 exists') || phoneFormatMessage.includes('Successfully')
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
              : phoneFormatMessage.includes('Error') || phoneFormatMessage.includes('No')
              ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
              : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
          }`}>
            {phoneFormatMessage}
          </div>
        )}
      </div>

      {/* Column Selection Section */}
      {csvData.length > 0 && (
        <div className="mb-4 p-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-[var(--foreground)]">
              Column Selection
            </h3>
            <button
              onClick={() => {
                const allSelected = Object.values(selectedColumns).every((val) => val === true);
                const newColumns: Record<string, boolean> = {};
                Object.keys(selectedColumns).forEach((key) => {
                  newColumns[key] = !allSelected;
                });
                setSelectedColumns(newColumns);
              }}
              className="px-3 py-1.5 text-sm font-medium text-[var(--primary)] border border-[var(--primary)] rounded-md hover:bg-[var(--primary)] hover:text-white transition-colors"
            >
              {Object.values(selectedColumns).every((val) => val === true)
                ? 'Deselect All'
                : 'Select All'}
            </button>
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
                      onChange={(e) =>
                        setSelectedColumns({
                          ...selectedColumns,
                          [column]: e.target.checked,
                        })
                      }
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
      {csvData.length > 0 && availableSearchColumns.length > 0 && (
        <div className="mb-4 p-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-sm">
          <div className="flex items-center gap-3 flex-wrap">
            {/* View/Edit Mode Dropdown - Extreme Left */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-[var(--foreground)] whitespace-nowrap">Mode:</span>
              <div className="relative">
                <select
                  value={cdViewMode}
                  onChange={(e) => {
                    const newMode = e.target.value as 'view' | 'edit';
                    if (newMode === 'view' && (editedRecords.size > 0 || newRecords.length > 0)) {
                      if (!confirm('You have unsaved changes. Are you sure you want to switch to view mode? Changes will be lost.')) {
                        return;
                      }
                    }
                    setCdViewMode(newMode);
                    setSelectedCdRecords(new Set()); // Clear selection when switching modes
                    setEditedRecords(new Map()); // Clear edited records when switching modes
                    setNewRecords([]); // Clear new records when switching modes
                  }}
                  className="px-3 py-2 pr-8 border border-[var(--input-border)] rounded-md bg-[var(--input-bg)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] appearance-none"
                >
                  <option value="view">View Only</option>
                  <option value="edit">Edit</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--secondary)] pointer-events-none" />
              </div>
            </div>

            {/* Add Record Button - Only show in edit mode */}
            {cdViewMode === 'edit' && csvData.length > 0 && (
              <button
                onClick={() => {
                  // Create a new empty record with same schema as existing records
                  const emptyRecord: any = {};
                  if (csvData.length > 0) {
                    Object.keys(csvData[0]).forEach(key => {
                      emptyRecord[key] = '';
                    });
                  }
                  setNewRecords([...newRecords, emptyRecord]);
                }}
                className="px-4 py-2 bg-[var(--primary)] text-white rounded-md hover:bg-[var(--primary-hover)] transition-colors text-sm font-medium flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                Add Record
              </button>
            )}

            {/* Save Changes Button - Only show in edit mode when there are changes */}
            {cdViewMode === 'edit' && (editedRecords.size > 0 || newRecords.length > 0) && (
              <button
                onClick={async () => {
                  setSavingChanges(true);
                  try {
                    // Prepare the records to update
                    const recordsToUpdate = [];
                    for (const [index, changes] of editedRecords.entries()) {
                      const originalRecord = filteredData[index];
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
                    if (newRecords.length > 0) {
                      const addResponse = await api.post('/add_csv_records', {
                        records: newRecords
                      });

                      if (!addResponse.ok) {
                        const errorData = await addResponse.json();
                        const errorDetail = errorData.detail || errorData;
                        throw new Error(errorDetail.message || 'Failed to add new records');
                      }
                    }

                    alert(`Successfully saved ${recordsToUpdate.length} update(s) and ${newRecords.length} new record(s)!`);
                    
                    // Clear edited records, new records, and refresh data
                    setEditedRecords(new Map());
                    setNewRecords([]);
                    await handleShowCurrentCD();
                  } catch (error: any) {
                    console.error('Error saving changes:', error);
                    alert(`Error: ${error.message || 'Failed to save changes'}`);
                  } finally {
                    setSavingChanges(false);
                  }
                }}
                disabled={savingChanges}
                className="px-4 py-2 bg-[var(--success)] text-white rounded-md hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {savingChanges ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Save ({editedRecords.size} edit{editedRecords.size !== 1 ? 's' : ''}, {newRecords.length} new)
                  </>
                )}
              </button>
            )}

            {/* Delete Selected Button - Only show in edit mode */}
            {cdViewMode === 'edit' && selectedCdRecords.size > 0 && (
              <button
                onClick={async () => {
                  if (!confirm(`Are you sure you want to delete ${selectedCdRecords.size} selected record(s)?`)) {
                    return;
                  }
                  setDeletingCdRecords(true);
                  try {
                    // Get the selected records
                    const recordsToDelete = filteredData.filter((_, index) => selectedCdRecords.has(index));
                    
                    // Send delete request with phone numbers or identifiers
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
                      
                      // Refresh data
                      await handleShowCurrentCD();
                      setSelectedCdRecords(new Set());
                      setEditedRecords(new Map());
                    }
                  } catch (error: any) {
                    console.error('Error deleting records:', error);
                    alert(`Error: ${error.message || 'Failed to delete records'}`);
                  } finally {
                    setDeletingCdRecords(false);
                  }
                }}
                disabled={deletingCdRecords}
                className="px-4 py-2 bg-[var(--danger)] text-white rounded-md hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {deletingCdRecords ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete Selected ({selectedCdRecords.size})
                  </>
                )}
              </button>
            )}

            {/* Upload Records Button */}
            {selectedPhaseId && (
              <button
                onClick={() => {
                  // Find campaigns for this phase
                  const phaseCampaigns = campaigns.filter(c => c.phase_id === selectedPhaseId);
                  const selectedPhase = phases.find(p => p.id === selectedPhaseId);
                  
                  if (phaseCampaigns.length === 0) {
                    alert('No campaigns found for the selected phase. Please create a campaign first.');
                    return;
                  }
                  
                  // Prioritize campaigns that have been set in csvCampaignIds (set via "Set CID" button)
                  let campaignToUse = null;
                  
                  if (csvCampaignIds.length > 0) {
                    // Find the first campaign that is set in csvCampaignIds and belongs to this phase
                    const setCampaigns = phaseCampaigns.filter(c => csvCampaignIds.includes(c.id));
                    if (setCampaigns.length > 0) {
                      campaignToUse = setCampaigns[0]; // Use the first set campaign
                    }
                  }
                  
                  // Fallback: use selectedCampaignId if set, otherwise use first campaign
                  if (!campaignToUse) {
                    campaignToUse = selectedCampaignId 
                      ? phaseCampaigns.find(c => c.id === selectedCampaignId) || phaseCampaigns[0]
                      : phaseCampaigns[0];
                  }
                  
                  if (campaignToUse && selectedPhase) {
                    setUploadRecordsModal({
                      show: true,
                      campaignId: campaignToUse.id,
                      campaignName: campaignToUse.campaign_name || `Campaign ${campaignToUse.id}`,
                      campaignCid: campaignToUse.cid || null,
                      phaseName: selectedPhase.name
                    });
                  }
                }}
                disabled={!selectedPhaseId || campaigns.length === 0}
                className="px-4 py-2 bg-[var(--success)] text-white rounded-md hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
              >
                Upload Records to Campaign
              </button>
            )}
            <div className="flex items-center gap-2 flex-1">
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

            {/* Results count */}
            {searchInput && (
              <div className="text-sm text-[var(--secondary)] whitespace-nowrap">
                {filteredData.length} {filteredData.length === 1 ? 'result' : 'results'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Data Table */}
      {csvData.length > 0 && (
        <div>
          <DataTable
            data={[...filteredData, ...newRecords]}
            loading={loading}
            selectedColumns={selectedColumns}
            onPlayRecording={(url) => setSelectedRecording(url)}
            onViewChat={(chat) => setSelectedChat(chat)}
            onViewMetadata={(metadata) => setSelectedChat(metadata)}
            editMode={cdViewMode === 'edit'}
            selectedRecords={selectedCdRecords}
            onToggleRecord={(index) => {
              const newSelected = new Set(selectedCdRecords);
              if (newSelected.has(index)) {
                newSelected.delete(index);
              } else {
                newSelected.add(index);
              }
              setSelectedCdRecords(newSelected);
            }}
            onToggleAll={() => {
              if (selectedCdRecords.size === filteredData.length) {
                setSelectedCdRecords(new Set());
              } else {
                setSelectedCdRecords(new Set(filteredData.map((_, idx) => idx)));
              }
            }}
            editedRecords={editedRecords}
            onCellEdit={(rowIndex, column, value) => {
              // Check if this is a new record (index >= filteredData.length)
              if (rowIndex >= filteredData.length) {
                // Editing a new record
                const newRecordIndex = rowIndex - filteredData.length;
                const updatedNewRecords = [...newRecords];
                updatedNewRecords[newRecordIndex] = {
                  ...updatedNewRecords[newRecordIndex],
                  [column]: value
                };
                setNewRecords(updatedNewRecords);
              } else {
                // Editing an existing record
                const newEditedRecords = new Map(editedRecords);
                const existingChanges = newEditedRecords.get(rowIndex) || {};
                newEditedRecords.set(rowIndex, {
                  ...existingChanges,
                  [column]: value
                });
                setEditedRecords(newEditedRecords);
              }
            }}
          />
        </div>
      )}

      {/* Empty State */}
      {csvData.length === 0 && !loading && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-sm p-12">
          <div className="text-center">
            <p className="text-[var(--secondary)] text-lg">
              No data available. Click "Show Current CD" to load data from data.csv
            </p>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmModal.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--card-bg)] rounded-lg border border-[var(--card-border)] shadow-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">Delete Campaign</h3>
              <button
                onClick={() => setDeleteConfirmModal({ show: false, campaignId: null, campaignName: null })}
                className="p-1 hover:bg-[var(--table-row-hover)] rounded transition-colors"
                disabled={deletingCampaign}
              >
                <X className="w-5 h-5 text-[var(--secondary)]" />
              </button>
            </div>
            <p className="text-sm text-[var(--foreground)] mb-6">
              Are you sure you want to delete <span className="font-medium">"{deleteConfirmModal.campaignName}"</span>?
              <br />
              <span className="text-[var(--secondary)]">This action will delete the campaign from Millis.ai and the database. This cannot be undone.</span>
            </p>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirmModal({ show: false, campaignId: null, campaignName: null })}
                disabled={deletingCampaign}
                className="px-4 py-2 border border-[var(--input-border)] rounded-md bg-[var(--input-bg)] text-[var(--foreground)] text-sm font-medium hover:bg-[var(--table-row-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!deleteConfirmModal.campaignId) return;
                  
                  setDeletingCampaign(true);
                  try {
                    const response = await api.delete(`/campaign/${deleteConfirmModal.campaignId}`);

                    if (!response.ok) {
                      const errorData = await response.json();
                      const errorDetail = errorData.detail || errorData;
                      alert(errorDetail.message || 'Failed to delete campaign');
                    } else {
                      // Remove campaign from the list
                      setCampaigns(prevCampaigns => 
                        prevCampaigns.filter(c => c.id !== deleteConfirmModal.campaignId)
                      );
                      // Close modal
                      setDeleteConfirmModal({ show: false, campaignId: null, campaignName: null });
                      // Refresh campaign IDs
                      await fetchCampaignIds();
                    }
                  } catch (error: any) {
                    console.error('Error deleting campaign:', error);
                    alert(`Error: ${error.message || 'Failed to delete campaign'}`);
                  } finally {
                    setDeletingCampaign(false);
                  }
                }}
                disabled={deletingCampaign}
                className="px-4 py-2 bg-[var(--danger)] text-white rounded-md hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {deletingCampaign ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Records Confirmation Modal */}
      {uploadRecordsModal.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--card-bg)] rounded-lg border border-[var(--card-border)] shadow-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">Upload Records</h3>
              <button
                onClick={() => setUploadRecordsModal({ show: false, campaignId: null, campaignName: null, campaignCid: null, phaseName: null })}
                className="p-1 hover:bg-[var(--table-row-hover)] rounded transition-colors"
                disabled={uploadingRecords}
              >
                <X className="w-5 h-5 text-[var(--secondary)]" />
              </button>
            </div>
            <div className="mb-6">
              <p className="text-sm text-[var(--foreground)] mb-4">
                Upload records from data.csv to the following campaign:
              </p>
              <div className="p-4 bg-[var(--input-bg)] rounded-md border border-[var(--input-border)] space-y-2">
                <div>
                  <span className="text-xs text-[var(--secondary)]">Phase:</span>
                  <p className="text-sm font-medium text-[var(--foreground)]">{uploadRecordsModal.phaseName || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-xs text-[var(--secondary)]">Campaign:</span>
                  <p className="text-sm font-medium text-[var(--foreground)]">{uploadRecordsModal.campaignName || 'N/A'}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setUploadRecordsModal({ show: false, campaignId: null, campaignName: null, campaignCid: null, phaseName: null })}
                disabled={uploadingRecords}
                className="px-4 py-2 border border-[var(--input-border)] rounded-md bg-[var(--input-bg)] text-[var(--foreground)] text-sm font-medium hover:bg-[var(--table-row-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!uploadRecordsModal.campaignId) return;
                  
                  setUploadingRecords(true);
                  try {
                    const response = await api.post('/campaign/upload-records', {
                      campaign_id: uploadRecordsModal.campaignId,
                    });

                    if (!response.ok) {
                      const errorData = await response.json();
                      const errorDetail = errorData.detail || errorData;
                      alert(errorDetail.message || 'Failed to upload records');
                    } else {
                      const result = await response.json();
                      alert(`Successfully uploaded ${result.records_uploaded || 0} records to ${result.campaign_name}`);
                      // Close modal
                      setUploadRecordsModal({ show: false, campaignId: null, campaignName: null, campaignCid: null, phaseName: null });
                      // Refresh campaigns to get updated record counts
                      if (selectedPhaseId) {
                        await refreshCampaigns();
                      }
                    }
                  } catch (error: any) {
                    console.error('Error uploading records:', error);
                    alert(`Error: ${error.message || 'Failed to upload records'}`);
                  } finally {
                    setUploadingRecords(false);
                  }
                }}
                disabled={uploadingRecords}
                className="px-4 py-2 bg-[var(--success)] text-white rounded-md hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {uploadingRecords ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  'Upload Records'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload CSV Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--card-bg)] rounded-lg border border-[var(--card-border)] shadow-lg p-6 max-w-lg w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">Upload Meta Data CSV</h3>
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  setDragActive(false);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }}
                className="p-1 hover:bg-[var(--table-row-hover)] rounded transition-colors"
                disabled={uploadingCSV}
              >
                <X className="w-5 h-5 text-[var(--secondary)]" />
              </button>
            </div>
            
            {/* Warning */}
            <div className="mb-4 p-3 bg-[var(--danger)]/10 border border-[var(--danger)]/30 rounded-md">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-[var(--danger)] flex-shrink-0 mt-0.5" />
                <p className="text-sm text-[var(--foreground)]">
                  <strong>Warning:</strong> This will completely replace all existing data in data.csv. All previous campaign data will be erased.
                </p>
              </div>
            </div>

            {/* Upload Area */}
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive
                  ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                  : 'border-[var(--input-border)] bg-[var(--input-bg)]'
              }`}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(false);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(false);
                
                const files = e.dataTransfer.files;
                if (files && files.length > 0) {
                  const file = files[0];
                  if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
                    handleFileUpload(file);
                  } else {
                    alert('Please upload a CSV file');
                  }
                }
              }}
            >
              <Upload className="w-12 h-12 text-[var(--secondary)] mx-auto mb-4" />
              <p className="text-sm text-[var(--foreground)] mb-2">
                Drag and drop your CSV file here, or
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={(e) => {
                  const files = e.target.files;
                  if (files && files.length > 0) {
                    handleFileUpload(files[0]);
                  }
                }}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingCSV}
                className="px-4 py-2 bg-[var(--primary)] text-white rounded-md hover:bg-[var(--primary-hover)] transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Browse Files
              </button>
              <p className="text-xs text-[var(--secondary)] mt-2">
                Only CSV files are supported
              </p>
            </div>

            {uploadMessage && (
              <div className={`mt-4 p-3 rounded-md ${
                uploadMessage.startsWith('Success') 
                  ? 'bg-[var(--success)]/10 border border-[var(--success)]/30 text-[var(--success)]'
                  : 'bg-[var(--danger)]/10 border border-[var(--danger)]/30 text-[var(--danger)]'
              }`}>
                <p className="text-sm">{uploadMessage}</p>
              </div>
            )}

            <div className="flex items-center gap-3 justify-end mt-6">
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  setDragActive(false);
                  setUploadMessage(null);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }}
                disabled={uploadingCSV}
                className="px-4 py-2 border border-[var(--input-border)] rounded-md bg-[var(--input-bg)] text-[var(--foreground)] text-sm font-medium hover:bg-[var(--table-row-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Campaign Start/Stop Confirmation Modal */}
      {campaignActionModal.show && campaignActionModal.campaign && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--card-bg)] rounded-lg border border-[var(--card-border)] shadow-lg p-6 max-w-lg w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">
                {campaignActionModal.action === 'start' ? 'Start Campaign' : 'Stop Campaign'}
              </h3>
              <button
                onClick={() => setCampaignActionModal({ show: false, action: null, campaign: null })}
                className="p-1 hover:bg-[var(--table-row-hover)] rounded transition-colors"
                disabled={startingCampaign === campaignActionModal.campaign?.id}
              >
                <X className="w-5 h-5 text-[var(--secondary)]" />
              </button>
            </div>
            
            <div className="mb-6">
              <p className="text-sm text-[var(--foreground)] mb-4">
                Are you sure you want to {campaignActionModal.action === 'start' ? 'start' : 'stop'} this campaign?
              </p>
              
              {/* Campaign Info */}
              <div className="bg-[var(--input-bg)] border border-[var(--input-border)] rounded-md p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-[var(--secondary)] mb-1">Campaign Name</p>
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {campaignActionModal.campaign.campaign_name || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--secondary)] mb-1">Campaign ID</p>
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {campaignActionModal.campaign.id}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--secondary)] mb-1">CID (Millis.ai)</p>
                    <p className="text-sm font-medium text-[var(--foreground)] break-all">
                      {campaignActionModal.campaign.cid || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--secondary)] mb-1">Status</p>
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {campaignActionModal.campaign.status || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--secondary)] mb-1">Caller Phone</p>
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {campaignActionModal.campaign.phone_id || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--secondary)] mb-1">Agent ID</p>
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {campaignActionModal.campaign.agent_id || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--secondary)] mb-1">Record Count</p>
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {campaignActionModal.campaign.record_count !== null ? campaignActionModal.campaign.record_count : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--secondary)] mb-1">Created At</p>
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {campaignActionModal.campaign.created_at 
                        ? new Date(campaignActionModal.campaign.created_at).toLocaleString() 
                        : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
              
              {campaignActionModal.action === 'start' && !campaignActionModal.campaign.phone_id && !campaignActionModal.campaign.agent_id && (
                <div className="mt-3 flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
                  <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-yellow-600">
                    Warning: This campaign does not have a caller set. The campaign may not be able to make calls.
                  </p>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setCampaignActionModal({ show: false, action: null, campaign: null })}
                disabled={startingCampaign === campaignActionModal.campaign?.id}
                className="px-4 py-2 border border-[var(--input-border)] rounded-md bg-[var(--input-bg)] text-[var(--foreground)] text-sm font-medium hover:bg-[var(--table-row-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!campaignActionModal.campaign?.id) return;
                  
                  if (campaignActionModal.action === 'start') {
                    await handleStartCampaign(campaignActionModal.campaign.id);
                  } else if (campaignActionModal.action === 'stop') {
                    await handleStopCampaign(campaignActionModal.campaign.id);
                  }
                }}
                disabled={startingCampaign === campaignActionModal.campaign?.id}
                className={`px-4 py-2 text-white rounded-md hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
                  campaignActionModal.action === 'start' 
                    ? 'bg-green-600' 
                    : 'bg-red-600'
                }`}
              >
                {startingCampaign === campaignActionModal.campaign?.id ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {campaignActionModal.action === 'start' ? 'Starting...' : 'Stopping...'}
                  </>
                ) : (
                  campaignActionModal.action === 'start' ? 'Start Campaign' : 'Stop Campaign'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phone Selection Modal */}
      {showPhoneModal && phoneModalCampaignId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--card-bg)] rounded-lg border border-[var(--card-border)] shadow-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">Select Phone</h3>
              <button
                onClick={() => {
                  setShowPhoneModal(false);
                  setPhoneModalCampaignId(null);
                  setPhones([]);
                  setAgents({});
                }}
                className="p-1 hover:bg-[var(--table-row-hover)] rounded transition-colors"
              >
                <X className="w-5 h-5 text-[var(--foreground)]" />
              </button>
            </div>

            {loadingPhones ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--primary)]" />
              </div>
            ) : phones.length === 0 ? (
              <div className="text-center py-8 text-[var(--secondary)]">
                No phones available
              </div>
            ) : (
              <div className="overflow-auto flex-1">
                <table className="w-full border-collapse">
                  <thead className="bg-[var(--table-header-bg)] sticky top-0">
                    <tr>
                      <th className="border border-[var(--card-border)] px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)]">
                        Phone ID
                      </th>
                      <th className="border border-[var(--card-border)] px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)]">
                        Agent Name
                      </th>
                      <th className="border border-[var(--card-border)] px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)]">
                        Status
                      </th>
                      <th className="border border-[var(--card-border)] px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)]">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {phones.map((phone) => {
                      const agent = agents[phone.agent_id];
                      return (
                        <tr
                          key={phone.id}
                          className="hover:bg-[var(--table-row-hover)] transition-colors"
                        >
                          <td className="border border-[var(--card-border)] px-4 py-2 text-sm text-[var(--foreground)]">
                            {phone.id}
                          </td>
                          <td className="border border-[var(--card-border)] px-4 py-2 text-sm text-[var(--foreground)]">
                            {agent?.name || phone.agent_id || 'N/A'}
                          </td>
                          <td className="border border-[var(--card-border)] px-4 py-2 text-sm text-[var(--foreground)]">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              phone.status === 'active'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {phone.status}
                            </span>
                          </td>
                          <td className="border border-[var(--card-border)] px-4 py-2 text-sm text-[var(--foreground)]">
                            <button
                              onClick={() => handleSetPhone(phoneModalCampaignId, phone.id)}
                              disabled={settingPhone === phone.id}
                              className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                            >
                              {settingPhone === phone.id ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  Setting...
                                </>
                              ) : (
                                'Set Phone'
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

