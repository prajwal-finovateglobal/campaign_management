'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Loader2, Search, ChevronDown, CheckCircle2, RefreshCw, Trash2, X, Upload, ToggleLeft, ToggleRight, AlertTriangle, Database, Play, Clock, XCircle, Network, FileText, BarChart, Info } from 'lucide-react';
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
  type: string | null;  // 'single' or 'multiple'
  record_count: number | null;
  status: string | null;
  chunk_size: number | null;  // Chunk size for multiple type campaigns
  idx?: number | null;  // Starting index in data.csv for partial upsert
  size?: number | null;  // Number of records to upsert from idx
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
    cid: string | null;
    status: string;
    record_count: number;
    phase_id: number;
    idx?: number;
    size?: number;
  } | null>(null);
  
  // Create Campaign Modal states (for single mode)
  const [showCreateCampaignModal, setShowCreateCampaignModal] = useState(false);
  const [isFullUpsert, setIsFullUpsert] = useState(true);
  const [campaignIdx, setCampaignIdx] = useState<number>(0);
  const [campaignSize, setCampaignSize] = useState<number>(0);
  const [csvRowCount, setCsvRowCount] = useState<number>(0);
  const [rangeError, setRangeError] = useState<string | null>(null);
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
  
  // Upsert confirmation modal states
  const [upsertConfirmModal, setUpsertConfirmModal] = useState<{
    show: boolean;
    campaignId: number | null;
    campaignName: string | null;
  }>({ show: false, campaignId: null, campaignName: null });
  const [upsertPreviewRecords, setUpsertPreviewRecords] = useState<any[]>([]);
  const [loadingUpsertPreview, setLoadingUpsertPreview] = useState(false);
  const [upserting, setUpserting] = useState(false);
  
  // Update Range states for existing campaigns
  const [updatingRangeCampaignId, setUpdatingRangeCampaignId] = useState<number | null>(null);
  const [updateRangeIsFull, setUpdateRangeIsFull] = useState(true);
  const [updateRangeIdx, setUpdateRangeIdx] = useState<number>(0);
  const [updateRangeSize, setUpdateRangeSize] = useState<number>(0);
  const [updateRangeError, setUpdateRangeError] = useState<string | null>(null);
  const [updatingRange, setUpdatingRange] = useState(false);
  
  // Chunked campaigns upsert modal states
  const [chunkedUpsertModal, setChunkedUpsertModal] = useState<{
    show: boolean;
    campaignId: number | null;
    campaignName: string | null;
    chunkSize: number | null;
  }>({ show: false, campaignId: null, campaignName: null, chunkSize: null });
  const [chunkedUpsertPreviews, setChunkedUpsertPreviews] = useState<any[]>([]);
  const [totalChunksCount, setTotalChunksCount] = useState<number>(0);
  const [chunksPreviewLimit, setChunksPreviewLimit] = useState<number>(5);
  const [loadingChunkedPreviews, setLoadingChunkedPreviews] = useState(false);
  const [upsertingChunks, setUpsertingChunks] = useState(false);
  const [chunkProgress, setChunkProgress] = useState<Record<string, { status: string; message: string; records_count?: number }>>({});
  
  // Set phone for chunks states
  const [settingChunkPhones, setSettingChunkPhones] = useState<number | null>(null);

  // Chunks modal states
  const [showChunksModal, setShowChunksModal] = useState<{
    show: boolean;
    campaignId: number | null;
    campaignName: string;
  }>({ show: false, campaignId: null, campaignName: '' });
  const [chunks, setChunks] = useState<any[]>([]);
  const [loadingChunks, setLoadingChunks] = useState(false);

  // Create chunks modal states
  const [showCreateChunksModal, setShowCreateChunksModal] = useState<{
    show: boolean;
    campaignId: number | null;
    campaignName: string;
  }>({ show: false, campaignId: null, campaignName: '' });
  const [chunkSize, setChunkSize] = useState<number>(25);
  const [chunksPreview, setChunksPreview] = useState<any>(null);
  const [calculatingChunks, setCalculatingChunks] = useState(false);
  const [creatingChunks, setCreatingChunks] = useState(false);
  const [uploadingRecords, setUploadingRecords] = useState(false);
  const [formattingPhoneNumbers, setFormattingPhoneNumbers] = useState(false);
  const [phoneFormatMessage, setPhoneFormatMessage] = useState<string | null>(null);
  
  // Inbound call upsert states
  const [showInboundCallModal, setShowInboundCallModal] = useState(false);
  const [inboundContactTo, setInboundContactTo] = useState<string>('');
  const [inboundMetadata, setInboundMetadata] = useState<string>('{}');
  const [upsertingInboundCall, setUpsertingInboundCall] = useState(false);
  const [inboundCallMessage, setInboundCallMessage] = useState<string | null>(null);
  
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
  
  // Chunk upsert warning modal
  const [chunkWarningModal, setChunkWarningModal] = useState<{
    show: boolean;
    chunkNames: string[];
  }>({ show: false, chunkNames: [] });

  // Auto-start chunks modal (for multiple-type campaigns)
  const [autoStartModal, setAutoStartModal] = useState<{
    show: boolean;
    campaign: Campaign | null;
  }>({ show: false, campaign: null });
  const [autoStartChunks, setAutoStartChunks] = useState<any[]>([]);
  const [autoStartGap, setAutoStartGap] = useState<number>(30); // seconds between chunks
  const [isAutoStarting, setIsAutoStarting] = useState(false);
  const [shouldStopAutoStart, setShouldStopAutoStart] = useState(false);
  const shouldStopAutoStartRef = useRef(false); // Ref for synchronous access in async functions
  const [autoStartProgress, setAutoStartProgress] = useState<Record<number, {
    status: 'pending' | 'starting' | 'started' | 'waiting_finish' | 'finished' | 'countdown' | 'failed';
    message: string;
    countdown?: number;
  }>>({});
  const [startingIndividualChunk, setStartingIndividualChunk] = useState<number | null>(null);
  const [refreshingChunkStatuses, setRefreshingChunkStatuses] = useState(false);
  
  // Launch status check states
  const [checkingLaunchStatus, setCheckingLaunchStatus] = useState(false);
  const [launchStatusMessage, setLaunchStatusMessage] = useState<{ type: 'success' | 'error' | null; text: string }>({ type: null, text: '' });
  
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
            const phasesList = result.phases || [];
            // Sort phases by name (natural/numeric sorting)
            phasesList.sort((a: Phase, b: Phase) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
            setPhases(phasesList);
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
        const phasesList = phasesResult.phases || [];
        // Sort phases by name (natural/numeric sorting)
        phasesList.sort((a: Phase, b: Phase) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        setPhases(phasesList);
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
            const campaignsList = result.campaigns || [];
            // Sort campaigns by name (natural/numeric sorting)
            campaignsList.sort((a: Campaign, b: Campaign) => a.campaign_name.localeCompare(b.campaign_name, undefined, { numeric: true, sensitivity: 'base' }));
            setCampaigns(campaignsList);
            // Set first campaign as default if available
            if (campaignsList.length > 0) {
              setSelectedCampaignId(campaignsList[0].id);
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
        const campaignsList = result.campaigns || [];
        // Sort campaigns by name (natural/numeric sorting)
        campaignsList.sort((a: Campaign, b: Campaign) => a.campaign_name.localeCompare(b.campaign_name, undefined, { numeric: true, sensitivity: 'base' }));
        setCampaigns(campaignsList);
        if (campaignsList.length > 0) {
          setSelectedCampaignId(campaignsList[0].id);
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
    // Check if campaign is of type 'multiple'
    const campaign = campaigns.find(c => c.id === campaignId);
    if (campaign?.type === 'multiple') {
      // Check if chunks have been upserted by fetching chunk details
      try {
        const chunksResponse = await api.get(`/chunk/campaign/${campaignId}`);
        if (chunksResponse.ok) {
          const chunksData = await chunksResponse.json();
          const chunks = chunksData.chunks || [];
          
          // Check if any chunk has no records uploaded (records_count is 0 or null)
          const unupsertedChunks = chunks.filter((chunk: any) => 
            !chunk.records_count || chunk.records_count === 0
          );
          
          if (unupsertedChunks.length > 0) {
            const chunkNames = unupsertedChunks.map((c: any) => c.chunk_name);
            setChunkWarningModal({ show: true, chunkNames });
            return;  // Don't open modal
          }
        }
      } catch (error) {
        console.error('Error checking chunks:', error);
        // If there's an error checking, still allow them to proceed
        // The backend will catch issues if any
      }
    }
    
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
  const handleOpenStartModal = async (campaignId: number) => {
    const campaign = campaigns.find(c => c.id === campaignId);
    if (!campaign) return;
    
    // If single-type campaign, use the existing modal
    if (campaign.type === 'single' || !campaign.type) {
      setCampaignActionModal({ show: true, action: 'start', campaign });
      return;
    }
    
    // If multiple-type campaign, fetch chunks and open auto-start modal
    if (campaign.type === 'multiple') {
      try {
        console.log('[OPEN_MODAL] Fetching chunks for campaign:', campaignId);
        const response = await api.get(`/chunk/campaign/${campaignId}`);
        if (response.ok) {
          const result = await response.json();
          const chunks = result.chunks || [];
          setAutoStartChunks(chunks);
          setAutoStartModal({ show: true, campaign });
          setAutoStartProgress({});
          
          // Automatically refresh all chunk statuses when modal opens
          console.log('[OPEN_MODAL] Auto-refreshing chunk statuses...');
          try {
            // Fetch fresh status for all chunks
            for (const chunk of chunks) {
              if (chunk.cid) {
                await api.get(`/chunk/${chunk.id}/status`);
              }
            }
            
            // Refresh chunks list to show updated statuses
            const refreshResponse = await api.get(`/chunk/campaign/${campaignId}`);
            if (refreshResponse.ok) {
              const refreshResult = await refreshResponse.json();
              setAutoStartChunks(refreshResult.chunks || []);
              console.log('[OPEN_MODAL] ✓ Chunk statuses refreshed automatically');
            }
          } catch (refreshError) {
            console.error('[OPEN_MODAL] Error refreshing statuses:', refreshError);
            // Don't alert - modal still opens with original data
          }
        } else {
          alert('Failed to fetch chunks for this campaign');
        }
      } catch (error: any) {
        console.error('Error fetching chunks:', error);
        alert(`Error: ${error.message || 'Failed to fetch chunks'}`);
      }
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

  // Function to start an individual chunk
  const handleStartIndividualChunk = async (chunkId: number) => {
    console.log(`[START_CHUNK] Starting individual chunk ${chunkId}`);
    setStartingIndividualChunk(chunkId);
    
    try {
      const response = await api.post(`/chunk/${chunkId}/start`);
      
      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.detail || 'Failed to start chunk';
        alert(errorMessage);
        return;
      }
      
      const result = await response.json();
      console.log(`[START_CHUNK] Successfully started chunk:`, result);
      
      // Wait 2 seconds for Millis.ai to update status
      console.log(`[START_CHUNK] Waiting 2 seconds for status update...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Fetch updated status from Millis.ai
      console.log(`[START_CHUNK] Fetching updated status for chunk ${chunkId}`);
      const statusResponse = await api.get(`/chunk/${chunkId}/status`);
      if (statusResponse.ok) {
        const statusResult = await statusResponse.json();
        console.log(`[START_CHUNK] Updated status: ${statusResult.status}`);
      }
      
      // Refresh chunks list to show updated status
      if (autoStartModal.campaign) {
        const chunksResponse = await api.get(`/chunk/campaign/${autoStartModal.campaign.id}`);
        if (chunksResponse.ok) {
          const chunksResult = await chunksResponse.json();
          setAutoStartChunks(chunksResult.chunks || []);
          console.log(`[START_CHUNK] Chunks list refreshed`);
        }
      }
      
      alert(`Successfully started chunk: ${result.chunk_name}`);
      
    } catch (error: any) {
      console.error('[START_CHUNK] Error:', error);
      alert(`Error: ${error.message || 'Failed to start chunk'}`);
    } finally {
      setStartingIndividualChunk(null);
    }
  };

  // Function to poll chunk status until it becomes "finished"
  const pollChunkStatus = async (chunkId: number): Promise<string> => {
    const maxAttempts = 1000; // Max polling attempts (1000 * 10s = ~166 minutes max)
    const pollInterval = 10000; // 10 seconds (faster status updates)
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Check if user requested to stop
      if (shouldStopAutoStartRef.current) {
        console.log(`[POLL_STATUS] Stop requested by user, aborting poll for chunk ${chunkId}`);
        throw new Error('Auto-start stopped by user');
      }
      
      try {
        const response = await api.get(`/chunk/${chunkId}/status`);
        
        if (response.ok) {
          const result = await response.json();
          console.log(`[POLL_STATUS] Chunk ${chunkId} status: ${result.status} (attempt ${attempt + 1})`);
          
          if (result.status === 'finished') {
            console.log(`[POLL_STATUS] ✓ Chunk ${chunkId} finished!`);
            return 'finished';
          }
          
          // Update progress message with waiting time
          const elapsedSeconds = (attempt + 1) * (pollInterval / 1000);
          setAutoStartProgress(prev => ({
            ...prev,
            [chunkId]: {
              ...prev[chunkId],
              message: `Waiting for chunk to finish... (status: ${result.status}, elapsed: ${elapsedSeconds}s)`
            }
          }));
          
          // Wait before next poll (10 seconds) - check stop flag periodically during wait
          for (let waitCount = 0; waitCount < pollInterval / 1000; waitCount++) {
            if (shouldStopAutoStartRef.current) {
              console.log(`[POLL_STATUS] Stop requested by user during wait, aborting poll for chunk ${chunkId}`);
              throw new Error('Auto-start stopped by user');
            }
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second at a time
          }
        } else {
          console.error(`[POLL_STATUS] Failed to fetch status for chunk ${chunkId}`);
          // Check stop flag before waiting
          if (shouldStopAutoStartRef.current) {
            console.log(`[POLL_STATUS] Stop requested by user, aborting poll for chunk ${chunkId}`);
            throw new Error('Auto-start stopped by user');
          }
          await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
      } catch (error: any) {
        // If it's a stop error, re-throw it
        if (error.message === 'Auto-start stopped by user') {
          throw error;
        }
        console.error(`[POLL_STATUS] Error polling chunk ${chunkId}:`, error);
        // Check stop flag before waiting
        if (shouldStopAutoStartRef.current) {
          console.log(`[POLL_STATUS] Stop requested by user after error, aborting poll for chunk ${chunkId}`);
          throw new Error('Auto-start stopped by user');
        }
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }
    
    throw new Error('Polling timeout: chunk did not finish in expected time');
  };

  // Function to run countdown timer
  const runCountdown = async (chunkId: number, seconds: number): Promise<void> => {
    for (let remaining = seconds; remaining > 0; remaining--) {
      // Check if user requested to stop
      if (shouldStopAutoStartRef.current) {
        console.log(`[COUNTDOWN] Stop requested by user, aborting countdown for chunk ${chunkId}`);
        throw new Error('Auto-start stopped by user');
      }
      
      setAutoStartProgress(prev => ({
        ...prev,
        [chunkId]: {
          status: 'countdown',
          message: `Next chunk will start in ${remaining} seconds...`,
          countdown: remaining
        }
      }));
      
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    }
    
    // After countdown completes, update progress to show completion
    setAutoStartProgress(prev => ({
      ...prev,
      [chunkId]: {
        status: 'finished',
        message: 'Countdown completed, moving to next chunk'
      }
    }));
  };

  // Function to handle auto-start of all chunks
  const handleAutoStartChunks = async () => {
    if (!autoStartModal.campaign || autoStartChunks.length === 0) return;
    
    console.log('[AUTO_START] Starting auto-start sequence');
    console.log('[AUTO_START] Gap between chunks:', autoStartGap, 'seconds');
    console.log('[AUTO_START] Total chunks:', autoStartChunks.length);
    
    setIsAutoStarting(true);
    setShouldStopAutoStart(false);
    shouldStopAutoStartRef.current = false; // Reset ref
    
    try {
      for (let i = 0; i < autoStartChunks.length; i++) {
        // Check if user requested to stop (check both state and ref)
        if (shouldStopAutoStartRef.current || shouldStopAutoStart) {
          console.log('[AUTO_START] Stop requested by user, terminating auto-start...');
          alert('Auto-start stopped by user');
          break;
        }
        
        const chunk = autoStartChunks[i];
        console.log(`\n[AUTO_START] Processing chunk ${i + 1}/${autoStartChunks.length}: ${chunk.chunk_name}`);
        
        // Initialize progress for this chunk
        setAutoStartProgress(prev => ({
          ...prev,
          [chunk.id]: {
            status: 'pending',
            message: `Checking chunk status...`
          }
        }));
        
        try {
          // Step 0: Check current chunk status
          console.log(`[AUTO_START] Step 0: Checking status of chunk ${chunk.id}`);
          const statusResponse = await api.get(`/chunk/${chunk.id}/status`);
          
          if (!statusResponse.ok) {
            throw new Error('Failed to fetch chunk status');
          }
          
          const statusResult = await statusResponse.json();
          const currentStatus = statusResult.status;
          console.log(`[AUTO_START] Current status: ${currentStatus}`);
          
          // Decision based on current status
          if (currentStatus === 'finished') {
            // Chunk already finished, skip it WITHOUT timer
            console.log(`[AUTO_START] Chunk ${chunk.chunk_name} is already finished, skipping to next (no timer)...`);
            setAutoStartProgress(prev => ({
              ...prev,
              [chunk.id]: {
                status: 'finished',
                message: 'Already finished (skipped, no timer)'
              }
            }));
            
            // Refresh status before moving to next chunk
            console.log(`[AUTO_START] Refreshing status before moving to next...`);
            if (autoStartModal.campaign) {
              try {
                const refreshResponse = await api.get(`/chunk/campaign/${autoStartModal.campaign.id}`);
                if (refreshResponse.ok) {
                  const refreshResult = await refreshResponse.json();
                  setAutoStartChunks(refreshResult.chunks || []);
                }
              } catch (err) {
                console.error('[AUTO_START] Error refreshing chunks:', err);
              }
            }
            
            // NO TIMER - immediately move to next chunk
            console.log(`[AUTO_START] Moving to next chunk immediately (no countdown)`);
            continue;
          }
          
          if (currentStatus === 'started') {
            // Chunk is already started, just wait for it to finish
            console.log(`[AUTO_START] Chunk ${chunk.chunk_name} is already started, waiting for finish...`);
            setAutoStartProgress(prev => ({
              ...prev,
              [chunk.id]: {
                status: 'waiting_finish',
                message: 'Already started, waiting for finish...'
              }
            }));
            
            // Wait for chunk to finish
            await pollChunkStatus(chunk.id);
            
            console.log(`[AUTO_START] Chunk ${chunk.chunk_name} finished!`);
            setAutoStartProgress(prev => ({
              ...prev,
              [chunk.id]: {
                status: 'finished',
                message: 'Chunk finished (no timer - already started)'
              }
            }));
            
            // Refresh status before moving to next chunk
            console.log(`[AUTO_START] Refreshing status before moving to next...`);
            if (autoStartModal.campaign) {
              try {
                const refreshResponse = await api.get(`/chunk/campaign/${autoStartModal.campaign.id}`);
                if (refreshResponse.ok) {
                  const refreshResult = await refreshResponse.json();
                  setAutoStartChunks(refreshResult.chunks || []);
                }
              } catch (err) {
                console.error('[AUTO_START] Error refreshing chunks:', err);
              }
            }
            
            // NO TIMER - didn't go through full cycle (idle→started→finished)
            // This was already started, so we skip the countdown
            console.log(`[AUTO_START] Moving to next chunk immediately (no countdown - chunk was already started)`);
            continue;
          }
          
          if (currentStatus === 'idle') {
            // Chunk is idle, start it
            console.log(`[AUTO_START] Chunk ${chunk.chunk_name} is idle, starting...`);
            setAutoStartProgress(prev => ({
              ...prev,
              [chunk.id]: {
                status: 'starting',
                message: `Starting chunk ${i + 1}/${autoStartChunks.length}...`
              }
            }));
            
            // Step 1: Start the chunk
            console.log(`[AUTO_START] Step 1: Starting chunk ${chunk.id}`);
            const startResponse = await api.post(`/chunk/${chunk.id}/start`);
            
            if (!startResponse.ok) {
              const errorData = await startResponse.json();
              throw new Error(errorData.detail || 'Failed to start chunk');
            }
            
            console.log(`[AUTO_START] Chunk ${chunk.chunk_name} started successfully`);
            
            // Update status to started
            setAutoStartProgress(prev => ({
              ...prev,
              [chunk.id]: {
                status: 'started',
                message: 'Chunk started successfully'
              }
            }));
            
            // Step 2: Wait for chunk to finish
            console.log(`[AUTO_START] Step 2: Waiting for chunk ${chunk.id} to finish...`);
            setAutoStartProgress(prev => ({
              ...prev,
              [chunk.id]: {
                status: 'waiting_finish',
                message: 'Waiting for chunk to finish...'
              }
            }));
            
            await pollChunkStatus(chunk.id);
            
            console.log(`[AUTO_START] Chunk ${chunk.chunk_name} finished!`);
            
            // Update status to finished
            setAutoStartProgress(prev => ({
              ...prev,
              [chunk.id]: {
                status: 'finished',
                message: 'Chunk finished (full cycle completed)'
              }
            }));
            
            // Refresh status before countdown/moving to next chunk
            console.log(`[AUTO_START] Refreshing status before moving to next...`);
            if (autoStartModal.campaign) {
              try {
                const refreshResponse = await api.get(`/chunk/campaign/${autoStartModal.campaign.id}`);
                if (refreshResponse.ok) {
                  const refreshResult = await refreshResponse.json();
                  setAutoStartChunks(refreshResult.chunks || []);
                  console.log(`[AUTO_START] ✓ Status refreshed`);
                }
              } catch (err) {
                console.error('[AUTO_START] Error refreshing chunks:', err);
              }
            }
            
            // Step 3: Countdown before next chunk (if not the last chunk)
            // Timer runs because chunk went through FULL CYCLE: idle → started → finished
            if (i < autoStartChunks.length - 1) {
              console.log(`[AUTO_START] Step 3: Full cycle completed (idle→started→finished), countdown for ${autoStartGap} seconds`);
              await runCountdown(chunk.id, autoStartGap);
              // Small delay to show the completion message before moving to next chunk
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          } else {
            // Unknown status, skip with warning
            console.warn(`[AUTO_START] Chunk ${chunk.chunk_name} has unexpected status: ${currentStatus}, skipping...`);
            setAutoStartProgress(prev => ({
              ...prev,
              [chunk.id]: {
                status: 'failed',
                message: `Unexpected status: ${currentStatus} (skipped)`
              }
            }));
          }
          
        } catch (error: any) {
          // Check if this is a user-initiated stop
          if (error.message === 'Auto-start stopped by user') {
            console.log('[AUTO_START] User stopped auto-start, breaking loop');
            setAutoStartProgress(prev => ({
              ...prev,
              [chunk.id]: {
                status: 'failed',
                message: 'Stopped by user'
              }
            }));
            break; // Break out of the loop without asking user
          }
          
          console.error(`[AUTO_START] Error with chunk ${chunk.chunk_name}:`, error);
          setAutoStartProgress(prev => ({
            ...prev,
            [chunk.id]: {
              status: 'failed',
              message: `Failed: ${error.message}`
            }
          }));
          
          // Ask user if they want to continue
          const continueNext = confirm(`Chunk ${chunk.chunk_name} failed: ${error.message}\n\nContinue with next chunk?`);
          if (!continueNext) {
            break;
          }
        }
      }
      
      // Only show completion message if we didn't stop early
      if (!shouldStopAutoStartRef.current) {
        console.log('[AUTO_START] Auto-start sequence completed');
        alert('Auto-start sequence completed!');
      } else {
        console.log('[AUTO_START] Auto-start sequence stopped by user');
      }
      
      // Refresh chunks
      if (autoStartModal.campaign) {
        const chunksResponse = await api.get(`/chunk/campaign/${autoStartModal.campaign.id}`);
        if (chunksResponse.ok) {
          const chunksResult = await chunksResponse.json();
          setAutoStartChunks(chunksResult.chunks || []);
        }
      }
      
    } catch (error: any) {
      console.error('[AUTO_START] Fatal error:', error);
      alert(`Auto-start failed: ${error.message}`);
    } finally {
      setIsAutoStarting(false);
      setShouldStopAutoStart(false);
      shouldStopAutoStartRef.current = false; // Reset ref
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
          const campaignsList = statusResult.campaigns || [];
          // Sort campaigns by name (natural/numeric sorting)
          campaignsList.sort((a: Campaign, b: Campaign) => a.campaign_name.localeCompare(b.campaign_name, undefined, { numeric: true, sensitivity: 'base' }));
          setCampaigns(campaignsList);
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

  // Function to check launch status from Avio API (via backend proxy)
  const handleCheckLaunchStatus = async () => {
    setCheckingLaunchStatus(true);
    setLaunchStatusMessage({ type: null, text: '' });
    
    try {
      const response = await api.get('/campaign/launch-status');

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success && result.status === 'healthy') {
        setLaunchStatusMessage({
          type: 'success',
          text: 'Ready to go! Launch status is healthy. All systems operational.',
        });
      } else {
        const errorMsg = result.message || 'Launch status is not healthy. Callback URL might be failing or system is experiencing issues.';
        setLaunchStatusMessage({
          type: 'error',
          text: `Not ready. ${errorMsg}`,
        });
      }
    } catch (error: any) {
      console.error('Error checking launch status:', error);
      setLaunchStatusMessage({
        type: 'error',
        text: `Not ready. Failed to check launch status: ${error.message || 'Callback URL might be failing or network error occurred.'}`,
      });
    } finally {
      setCheckingLaunchStatus(false);
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
                    <p className="text-xs text-[var(--danger)] font-semibold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      This will delete all existing records in data.csv and replace them with the uploaded data.
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
                                      const campaignsList = result.campaigns || [];
                                      // Sort campaigns by name (natural/numeric sorting)
                                      campaignsList.sort((a: Campaign, b: Campaign) => a.campaign_name.localeCompare(b.campaign_name, undefined, { numeric: true, sensitivity: 'base' }));
                                      setCampaigns(campaignsList);
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
                            Caller
                          </th>
                          <th className="border border-[var(--card-border)] px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)]">
                            Start
                          </th>
                          <th className="border border-[var(--card-border)] px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)]">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...campaigns].sort((a, b) => a.id - b.id).map((campaign) => {
                          const isIdSet = csvCampaignIds.includes(campaign.id);
                          return (
                            <>
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
                              {campaign.type === 'multiple' ? (
                                <button
                                  onClick={async () => {
                                    // Open chunks modal and fetch chunks
                                    setShowChunksModal({ show: true, campaignId: campaign.id, campaignName: campaign.campaign_name || '' });
                                    setLoadingChunks(true);
                                    try {
                                      const response = await api.get(`/chunk/campaign/${campaign.id}`);
                                      if (response.ok) {
                                        const result = await response.json();
                                        setChunks(result.chunks || []);
                                      } else {
                                        const errorData = await response.json();
                                        alert(errorData.detail || 'Failed to fetch chunks');
                                      }
                                    } catch (error: any) {
                                      console.error('Error fetching chunks:', error);
                                      alert(`Error: ${error.message || 'Failed to fetch chunks'}`);
                                    } finally {
                                      setLoadingChunks(false);
                                    }
                                  }}
                                  className="px-3 py-1 bg-[var(--primary)] text-white rounded text-xs hover:bg-[var(--primary-hover)] transition-colors"
                                >
                                  Show Chunks
                                </button>
                              ) : (
                                campaign.cid || 'N/A'
                              )}
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
                                        setCampaigns(prevCampaigns => {
                                          const updated = prevCampaigns.map(c => 
                                            c.id === campaign.id 
                                              ? { ...c, status: result.status, record_count: result.record_count }
                                              : c
                                          );
                                          // Maintain sort order by name (natural/numeric sorting)
                                          return updated.sort((a, b) => a.campaign_name.localeCompare(b.campaign_name, undefined, { numeric: true, sensitivity: 'base' }));
                                        });
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
                              ) : campaign.status === 'started' ? (
                                <button
                                  onClick={() => handleOpenStopModal(campaign.id)}
                                  disabled={startingCampaign === campaign.id}
                                  className="px-3 py-1 bg-red-600 text-white rounded text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {startingCampaign === campaign.id ? 'Stopping...' : 'Stop'}
                                </button>
                              ) : (
                                // Show Set Phone button for both single and multiple type campaigns
                                campaign.phone_id ? (
                                  <div className="relative group">
                                    <span className="text-sm">{campaign.phone_id}</span>
                                    <button
                                      onClick={() => handleOpenPhoneModal(campaign.id)}
                                      disabled={settingChunkPhones === campaign.id}
                                      className="absolute top-0 left-0 w-full h-full opacity-0 group-hover:opacity-100 bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                                      title={campaign.type === 'multiple' ? 'Update Phone ID for all chunks' : 'Update Phone ID'}
                                    >
                                      {settingChunkPhones === campaign.id ? 'Updating...' : 'Update'}
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => handleOpenPhoneModal(campaign.id)}
                                    disabled={settingChunkPhones === campaign.id}
                                    className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                                    title={campaign.type === 'multiple' ? 'Set Phone ID for all chunks' : 'Set Phone ID'}
                                  >
                                    {settingChunkPhones === campaign.id ? 'Setting...' : 'Set Phone'}
                                  </button>
                                )
                              )}
                            </td>
                            <td className="border border-[var(--card-border)] px-4 py-2 text-sm text-[var(--foreground)]">
                              {(() => {
                                // For single-type campaigns: show Start button only when status is 'idle' and phone is set
                                if (campaign.type === 'single' || !campaign.type) {
                                  if (campaign.status === 'idle' && campaign.phone_id) {
                                    return (
                                      <button
                                        onClick={() => handleOpenStartModal(campaign.id)}
                                        disabled={startingCampaign === campaign.id}
                                        className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        {startingCampaign === campaign.id ? 'Starting...' : 'Start'}
                                      </button>
                                    );
                                  } else if (campaign.status === 'started') {
                                    return (
                                      <button
                                        disabled
                                        className="px-3 py-1 bg-gray-400 text-white rounded text-xs font-medium cursor-not-allowed opacity-50"
                                      >
                                        Start
                                      </button>
                                    );
                                  }
                                  return null;
                                }
                                
                                // For multiple-type campaigns: show Start button if phone is set and status indicates there are idle chunks
                                // Status can be: 'idle', 'partly idle', 'chunks_started', 'partly finished', 'pending', etc.
                                // Don't show if all chunks are 'started' or 'finished'
                                if (campaign.type === 'multiple') {
                                  const hasIdleChunks = campaign.phone_id && 
                                    campaign.status !== 'finished' && 
                                    campaign.status !== 'started' &&
                                    campaign.status !== 'mixed';
                                  
                                  if (hasIdleChunks) {
                                    return (
                                      <button
                                        onClick={() => handleOpenStartModal(campaign.id)}
                                        disabled={startingCampaign === campaign.id}
                                        className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        {startingCampaign === campaign.id ? 'Starting...' : 'Start'}
                                      </button>
                                    );
                                  } else if (campaign.status === 'started' || campaign.status === 'finished') {
                                    return (
                                      <button
                                        disabled
                                        className="px-3 py-1 bg-gray-400 text-white rounded text-xs font-medium cursor-not-allowed opacity-50"
                                      >
                                        Start
                                      </button>
                                    );
                                  }
                                  return null;
                                }
                                
                                return null;
                              })()}
                            </td>
                            <td className="border border-[var(--card-border)] px-4 py-2 text-sm text-[var(--foreground)]">
                              <div className="flex items-center gap-2 flex-wrap">
                                {/* SINGLE TYPE CAMPAIGNS */}
                                {campaign.type === 'single' && (
                                  <>
                                    {/* Upsert button - only show for idle campaigns */}
                                    {campaign.status === 'idle' && (
                                      <button
                                        onClick={async () => {
                                          // Fetch first 5 records from data.csv for preview
                                          setLoadingUpsertPreview(true);
                                          setUpsertConfirmModal({
                                            show: true,
                                            campaignId: campaign.id,
                                            campaignName: campaign.campaign_name || ''
                                          });
                                          
                                          try {
                                            // Get campaign's idx and size for range preview
                                            const idx = campaign.idx ?? 0;
                                            const size = campaign.size ?? 0;
                                            
                                            const response = await api.get(`/get_csv_preview?limit=5&campaign_id=${campaign.id}&idx=${idx}&size=${size}`);
                                            if (response.ok) {
                                              const result = await response.json();
                                              setUpsertPreviewRecords(result.records || []);
                                            } else {
                                              console.error('Failed to fetch preview records');
                                              setUpsertPreviewRecords([]);
                                            }
                                          } catch (error) {
                                            console.error('Error fetching preview:', error);
                                            setUpsertPreviewRecords([]);
                                          } finally {
                                            setLoadingUpsertPreview(false);
                                          }
                                        }}
                                        className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:opacity-90 transition-opacity"
                                      >
                                        Upsert
                                      </button>
                                    )}
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
                              
                                  </>
                                )}
                                
                                {/* MULTIPLE TYPE CAMPAIGNS (CHUNKED) */}
                                {campaign.type === 'multiple' && (
                                  <>
                                    {/* Upsert button - show when status is not finished */}
                                    {campaign.status !== 'finished' && (
                                      <button
                                        onClick={async () => {
                                          setLoadingChunkedPreviews(true);
                                          setChunkedUpsertModal({
                                            show: true,
                                            campaignId: campaign.id,
                                            campaignName: campaign.campaign_name || '',
                                            chunkSize: campaign.chunk_size || 25
                                          });
                                          
                                          try {
                                            // Fetch chunks for this campaign
                                            const chunksResponse = await api.get(`/chunk/campaign/${campaign.id}`);
                                            if (chunksResponse.ok) {
                                              const chunksData = await chunksResponse.json();
                                              const chunks = chunksData.chunks || [];
                                              setTotalChunksCount(chunks.length);
                                              // Set preview limit to 5 by default
                                              setChunksPreviewLimit(5);
                                              
                                              // For each chunk, fetch first 2 records preview (show first 5 chunks by default)
                                              const previewsPromises = chunks.slice(0, 5).map(async (chunk: any) => {
                                                try {
                                                  const previewResponse = await api.get(`/get_csv_preview?limit=2&campaign_id=${campaign.id}`);
                                                  if (previewResponse.ok) {
                                                    const previewData = await previewResponse.json();
                                                    return {
                                                      chunk_name: chunk.chunk_name,
                                                      chunk_id: chunk.id,
                                                      records: previewData.records || []
                                                    };
                                                  }
                                                } catch (error) {
                                                  console.error(`Error fetching preview for chunk ${chunk.chunk_name}:`, error);
                                                }
                                                return {
                                                  chunk_name: chunk.chunk_name,
                                                  chunk_id: chunk.id,
                                                  records: []
                                                };
                                              });
                                              
                                              const previews = await Promise.all(previewsPromises);
                                              setChunkedUpsertPreviews(previews);
                                            } else {
                                              setChunkedUpsertPreviews([]);
                                            }
                                          } catch (error) {
                                            console.error('Error fetching chunk previews:', error);
                                            setChunkedUpsertPreviews([]);
                                          } finally {
                                            setLoadingChunkedPreviews(false);
                                          }
                                        }}
                                        className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:opacity-90 transition-opacity"
                                        title="Upsert all chunks to Millis.ai"
                                      >
                                        Upsert
                                      </button>
                                    )}
                                    
                                    {/* Set CID button - show when status is not finished */}
                                    {campaign.status !== 'finished' && (
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
                                              alert(result.message || 'Campaign ID set successfully in data.csv');
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
                                        className="px-3 py-1 bg-[var(--primary)] text-white rounded text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                                        title="Set logical campaign ID in data.csv"
                                      >
                                        {settingCid === campaign.id ? 'Setting...' : 'Set CID'}
                                      </button>
                                    )}
                                  </>
                                )}
                                
                                {/* Delete button - common for both types */}
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
                            </>
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

                            // Fetch CSV row count
                            try {
                              const csvResponse = await api.get('/get_csv_data');
                              if (csvResponse.ok) {
                                const csvData = await csvResponse.json();
                                const rowCount = csvData.data?.length || 0;
                                setCsvRowCount(rowCount);
                                setCampaignSize(rowCount); // Set default size to total
                              }
                            } catch (error) {
                              console.error('Error fetching CSV row count:', error);
                              setCsvRowCount(0);
                            }

                            // Reset modal state
                            setIsFullUpsert(true);
                            setCampaignIdx(0);
                            setRangeError(null);
                            setShowCreateCampaignModal(true);
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

                {/* Multiple Mode Content - Campaign with Chunks */}
                {newCampaignMode === 'multiple' && (
                  <div className="space-y-4 p-4 bg-[var(--input-bg)] rounded-md border border-[var(--input-border)]">
                    {!createdCampaign ? (
                      <div className="space-y-4">
                        {/* Info Banner */}
                        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                          <p className="text-sm text-blue-800 dark:text-blue-200">
                            <strong>Multiple Mode:</strong> Create a campaign first, then divide it into chunks based on data.csv records.
                          </p>
                        </div>

                        {/* Create Campaign Button */}
                        <div>
                          <button
                            onClick={async () => {
                              if (!selectedPhaseId) {
                                alert('Please select a phase first');
                                return;
                              }

                              const selectedPhase = phases.find(p => p.id === selectedPhaseId);
                              if (!selectedPhase) {
                                alert('Error: Phase not found');
                                return;
                              }

                              setCreatingCampaign(true);
                              setCampaignIdMessage(null);
                              
                              try {
                                const response = await api.post('/campaign/create', {
                                  phase_id: selectedPhaseId,
                                  phase_name: selectedPhase.name,
                                  campaign_type: 'multiple'  // Virtual campaign, no Millis.ai creation
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
                                
                                // Virtual campaign created in DB only (no CID yet)
                                setCreatedCampaign({
                                  id: result.id,
                                  campaign_name: result.campaign_name,
                                  cid: null,  // No CID for virtual campaign
                                  status: result.status,
                                  record_count: 0,
                                  phase_id: result.phase_id
                                });
                                
                                setCampaignIdMessage('Virtual campaign created successfully! Now set chunk size to divide into chunks.');
                                setTimeout(() => setCampaignIdMessage(null), 5000);
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
                          {campaignIdMessage && (
                            <div className={`mt-2 p-3 rounded-md text-sm ${
                              campaignIdMessage.toLowerCase().includes('error')
                                ? 'bg-[var(--danger)] text-white'
                                : 'bg-[var(--success)] text-white'
                            }`}>
                              {campaignIdMessage}
                            </div>
                          )}
                        </div>

                      </div>
                    ) : (
                      /* Created Campaign - Now Add Chunks */
                      <div className="space-y-4">
                        {/* Campaign Info */}
                        <div className="p-4 bg-[var(--card-bg)] rounded-md border border-[var(--card-border)]">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-semibold text-[var(--foreground)]">Virtual Campaign Created:</h4>
                            <span className="px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800">
                              Multiple Mode
                            </span>
                          </div>
                          <div className="space-y-3">
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
                                <span className="text-xs text-[var(--secondary)]">Type:</span>
                                <p className="text-sm font-medium text-[var(--foreground)]">Virtual (no CID)</p>
                              </div>
                            </div>
                            <div className="pt-2 border-t border-[var(--card-border)]">
                              <button
                                onClick={async () => {
                                  if (!createdCampaign) return;
                                  
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
                                    setCampaignIdMessage(result.message || `Successfully set campaign ID for ${result.records_updated || 0} records in data.csv`);
                                    setTimeout(() => setCampaignIdMessage(null), 7000);
                                  } catch (error: any) {
                                    console.error('Error setting campaign ID:', error);
                                    setCampaignIdMessage(`Error: ${error.message || 'Failed to set campaign ID'}`);
                                    setTimeout(() => setCampaignIdMessage(null), 5000);
                                  } finally {
                                    setSettingCampaignId(false);
                                  }
                                }}
                                disabled={settingCampaignId}
                                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                              >
                                {settingCampaignId ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Setting Campaign ID in data.csv...
                                  </>
                                ) : (
                                  <>
                                    <Database className="w-4 h-4" />
                                    Set Campaign ID in data.csv
                                  </>
                                )}
                              </button>
                              {campaignIdMessage && (
                                <div className={`mt-2 p-2 rounded text-xs ${
                                  campaignIdMessage.toLowerCase().includes('error')
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-green-100 text-green-800'
                                }`}>
                                  {campaignIdMessage}
                                </div>
                              )}
                              <p className="text-xs text-[var(--secondary)] mt-2 flex items-center gap-1">
                                <Info className="w-3 h-3" />
                                This sets the campaign ID in data.csv so records are associated with this campaign
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Chunk Size Input */}
                        {!chunksPreview && (
                          <div>
                            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                              Chunk Size (records per chunk) <span className="text-red-500">*</span>
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="number"
                                min="1"
                                value={chunkSize}
                                onChange={(e) => setChunkSize(parseInt(e.target.value) || 1)}
                                placeholder="e.g., 25"
                                className="flex-1 px-3 py-2 border border-[var(--input-border)] rounded-md bg-[var(--input-bg)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                              />
                              <button
                                onClick={async () => {
                                  if (!createdCampaign) return;
                                  
                                  setCalculatingChunks(true);
                                  try {
                                    const response = await api.post('/chunk/calculate', {
                                      campaign_id: createdCampaign.id,
                                      chunk_size: chunkSize
                                    });

                                    if (response.ok) {
                                      const result = await response.json();
                                      setChunksPreview(result);
                                    } else {
                                      const errorData = await response.json();
                                      alert(errorData.detail || 'Failed to calculate chunks');
                                    }
                                  } catch (error: any) {
                                    console.error('Error calculating chunks:', error);
                                    alert(`Error: ${error.message || 'Failed to calculate chunks'}`);
                                  } finally {
                                    setCalculatingChunks(false);
                                  }
                                }}
                                disabled={calculatingChunks}
                                className="px-4 py-2 bg-[var(--primary)] text-white rounded-md hover:bg-[var(--primary-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {calculatingChunks ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                                    Calculating...
                                  </>
                                ) : (
                                  'Preview Chunks'
                                )}
                              </button>
                            </div>
                            <p className="text-xs text-[var(--secondary)] mt-1">
                              Enter the number of records you want in each chunk
                            </p>
                          </div>
                        )}

                        {/* Chunks Preview */}
                        {chunksPreview && (
                          <div className="space-y-4">
                            <div className="p-4 bg-[var(--card-bg)] rounded-md border border-[var(--card-border)]">
                              <h4 className="text-sm font-semibold text-[var(--foreground)] mb-3 flex items-center gap-2">
                                <BarChart className="w-4 h-4" />
                                Chunks Preview
                              </h4>
                              <div className="grid grid-cols-2 gap-4 mb-3">
                                <div>
                                  <span className="text-xs text-[var(--secondary)]">Total Records:</span>
                                  <p className="text-sm font-medium text-[var(--foreground)]">{chunksPreview.total_records}</p>
                                </div>
                                <div>
                                  <span className="text-xs text-[var(--secondary)]">Chunk Size:</span>
                                  <p className="text-sm font-medium text-[var(--foreground)]">{chunksPreview.chunk_size}</p>
                                </div>
                                <div>
                                  <span className="text-xs text-[var(--secondary)]">Number of Chunks:</span>
                                  <p className="text-sm font-medium text-green-600 dark:text-green-400">{chunksPreview.number_of_chunks}</p>
                                </div>
                              </div>
                              
                              {/* Chunks List Preview */}
                              <div className="mt-3 pt-3 border-t border-[var(--card-border)]">
                                <p className="text-xs font-medium text-[var(--foreground)] mb-2">Chunks Distribution:</p>
                                <div className="max-h-32 overflow-y-auto space-y-1">
                                  {chunksPreview.chunks_preview.slice(0, 10).map((chunk: any) => (
                                    <div key={chunk.chunk_number} className="text-xs text-[var(--secondary)] flex justify-between">
                                      <span>{chunk.chunk_name}</span>
                                      <span className="text-[var(--foreground)] font-medium">{chunk.records_count} records ({chunk.records_range})</span>
                                    </div>
                                  ))}
                                  {chunksPreview.chunks_preview.length > 10 && (
                                    <p className="text-xs text-[var(--secondary)] italic">
                                      ... and {chunksPreview.chunks_preview.length - 10} more chunks
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Create Chunks Button */}
                            <div className="flex gap-2">
                              <button
                                onClick={async () => {
                                  if (!createdCampaign) return;

                                  setCreatingChunks(true);
                                  try {
                                    const response = await api.post('/chunk/create', {
                                      campaign_id: createdCampaign.id,
                                      chunk_size: chunkSize
                                    });

                                    if (response.ok) {
                                      const result = await response.json();
                                      alert(`Success! Created ${result.chunks_created} chunks for campaign.`);
                                      
                                      // Refresh campaigns list to show type='multiple'
                                      fetchCampaigns();
                                      
                                      // Clear preview and reset
                                      setChunksPreview(null);
                                      setCreatedCampaign(null);
                                      setChunkSize(25);
                                    } else {
                                      const errorData = await response.json();
                                      alert(errorData.detail || 'Failed to create chunks');
                                    }
                                  } catch (error: any) {
                                    console.error('Error creating chunks:', error);
                                    alert(`Error: ${error.message || 'Failed to create chunks'}`);
                                  } finally {
                                    setCreatingChunks(false);
                                  }
                                }}
                                disabled={creatingChunks}
                                className="flex-1 px-6 py-3 bg-[var(--success)] text-white rounded-md hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                              >
                                {creatingChunks ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Creating Chunks...
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="w-4 h-4" />
                                    Create {chunksPreview.number_of_chunks} Chunks
                                  </>
                                )}
                              </button>
                              
                              <button
                                onClick={() => setChunksPreview(null)}
                                className="px-4 py-2 border border-[var(--input-border)] rounded-md text-[var(--foreground)] hover:bg-[var(--table-row-hover)] transition-colors"
                              >
                                Change Size
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Reset Button */}
                        {!chunksPreview && (
                          <button
                            onClick={() => {
                              setCreatedCampaign(null);
                              setChunkSize(25);
                              setCampaignIdMessage(null);
                            }}
                            className="w-full px-6 py-2 bg-[var(--secondary)] text-white rounded-md hover:opacity-90 transition-opacity text-sm font-medium"
                          >
                            Create Another Campaign
                          </button>
                        )}
                      </div>
                    )}
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
              {/* Record Count */}
              <span className="text-sm text-[var(--foreground)] whitespace-nowrap font-medium">
                ({filteredData.length + newRecords.length} {filteredData.length + newRecords.length === 1 ? 'record' : 'records'})
              </span>
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
                      setCampaigns(prevCampaigns => {
                        const filtered = prevCampaigns.filter(c => c.id !== deleteConfirmModal.campaignId);
                        // Maintain sort order by name (natural/numeric sorting)
                        return filtered.sort((a, b) => a.campaign_name.localeCompare(b.campaign_name, undefined, { numeric: true, sensitivity: 'base' }));
                      });
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

      {/* Upsert Confirmation Modal */}
      {upsertConfirmModal.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--card-bg)] rounded-lg border border-[var(--card-border)] shadow-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">Confirm Upsert Records</h3>
              <div className="flex items-center gap-2">
                {/* Update Range button - only show for single type campaigns */}
                {(() => {
                  const campaign = campaigns.find(c => c.id === upsertConfirmModal.campaignId);
                  if (campaign && campaign.type === 'single' && campaign.status === 'idle') {
                    return (
                      <button
                        onClick={async () => {
                          // Fetch CSV row count
                          let totalRows = 0;
                          try {
                            const csvResponse = await api.get('/get_csv_data');
                            if (csvResponse.ok) {
                              const csvData = await csvResponse.json();
                              totalRows = csvData.data?.length || 0;
                            }
                          } catch (error) {
                            console.error('Error fetching CSV row count:', error);
                          }

                          // Set current campaign values or defaults
                          const currentIdx = campaign.idx ?? 0;
                          const currentSize = campaign.size ?? totalRows;
                          const isCurrentlyFull = (currentIdx === 0 && currentSize === totalRows) || (campaign.idx === null && campaign.size === null);
                          
                          setUpdateRangeIsFull(isCurrentlyFull);
                          setUpdateRangeIdx(currentIdx);
                          setUpdateRangeSize(currentSize);
                          setUpdateRangeError(null);
                          setUpdatingRangeCampaignId(campaign.id);
                        }}
                        className="px-3 py-1.5 bg-purple-600 text-white rounded text-xs font-medium hover:opacity-90 transition-opacity"
                        disabled={upserting || updatingRange}
                      >
                        Update Range
                      </button>
                    );
                  }
                  return null;
                })()}
                <button
                  onClick={() => {
                    setUpsertConfirmModal({ show: false, campaignId: null, campaignName: null });
                    setUpsertPreviewRecords([]);
                    setUpdatingRangeCampaignId(null);
                    setUpdateRangeError(null);
                  }}
                  className="p-1 hover:bg-[var(--table-row-hover)] rounded transition-colors"
                  disabled={upserting || updatingRange}
                >
                  <X className="w-5 h-5 text-[var(--secondary)]" />
                </button>
              </div>
            </div>
            
            <div className="mb-6">
              <p className="text-sm text-[var(--foreground)] mb-4">
                You are about to upsert records from <strong>data.csv</strong> to campaign: <strong>{upsertConfirmModal.campaignName}</strong>
              </p>
              
              {/* Range Information */}
              {(() => {
                const campaign = campaigns.find(c => c.id === upsertConfirmModal.campaignId);
                if (!campaign) return null;
                
                const idx = campaign.idx ?? 0;
                const size = campaign.size ?? 0;
                
                // Check if it's full: 
                // 1. idx is null and size is null (default full)
                // 2. idx is 0 and size equals csvRowCount (explicit full)
                // 3. size is 0 or null (treat as full range)
                const isFull = (campaign.idx === null && campaign.size === null) ||
                              (idx === 0 && size === csvRowCount) ||
                              (idx === 0 && campaign.size === null) ||
                              size === 0;
                
                // For full upsert, just show "Full upsert" without range details
                // For partial, calculate and show the range
                let displayText = '';
                if (isFull) {
                  displayText = 'Full upsert';
                } else {
                  const endingIdx = idx + size - 1;
                  displayText = `Partial upsert: Records ${idx} to ${endingIdx} (${size} records)`;
                }
                
                return (
                  <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded-md text-sm">
                    <p className="font-semibold mb-1 flex items-center gap-2">
                      <Info className="w-4 h-4" />
                      Upsert Range:
                    </p>
                    <p>{displayText}</p>
                  </div>
                );
              })()}
              
              {/* Update Range Section - shown when updatingRangeCampaignId matches modal campaign */}
              {updatingRangeCampaignId === upsertConfirmModal.campaignId && (
                <div className="mb-6 p-4 bg-[var(--input-bg)] rounded-md border border-[var(--input-border)]">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-semibold text-[var(--foreground)]">Update Range</h4>
                    <button
                      onClick={() => {
                        setUpdatingRangeCampaignId(null);
                        setUpdateRangeError(null);
                      }}
                      className="p-1 hover:bg-[var(--table-row-hover)] rounded transition-colors"
                      disabled={updatingRange}
                    >
                      <X className="w-4 h-4 text-[var(--secondary)]" />
                    </button>
                  </div>

                  {/* Full/Partial Toggle */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                      Upsert Mode
                    </label>
                    <div className="flex items-center gap-2 bg-[var(--card-bg)] p-1 rounded-lg border border-[var(--input-border)]">
                      <button
                        onClick={() => {
                          setUpdateRangeIsFull(true);
                          setUpdateRangeError(null);
                        }}
                        disabled={updatingRange}
                        className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all ${
                          updateRangeIsFull
                            ? 'bg-[var(--primary)] text-white shadow-sm'
                            : 'text-[var(--secondary)] hover:text-[var(--foreground)]'
                        } disabled:opacity-50`}
                      >
                        Full
                      </button>
                      <button
                        onClick={() => {
                          setUpdateRangeIsFull(false);
                          setUpdateRangeError(null);
                        }}
                        disabled={updatingRange}
                        className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all ${
                          !updateRangeIsFull
                            ? 'bg-[var(--primary)] text-white shadow-sm'
                            : 'text-[var(--secondary)] hover:text-[var(--foreground)]'
                        } disabled:opacity-50`}
                      >
                        Partial
                      </button>
                    </div>
                  </div>

                  {/* Partial Mode Fields */}
                  {!updateRangeIsFull && (
                    <div className="space-y-3 p-4 bg-[var(--card-bg)] rounded-md border border-[var(--input-border)]">
                      <div>
                        <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                          Index (Starting Position)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={updateRangeIdx}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            setUpdateRangeIdx(val);
                            setUpdateRangeError(null);
                          }}
                          disabled={updatingRange}
                          className="w-full px-3 py-2 border border-[var(--input-border)] rounded-md bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] disabled:opacity-50"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                          Size (Number of Records)
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={updateRangeSize}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            setUpdateRangeSize(val);
                            setUpdateRangeError(null);
                          }}
                          disabled={updatingRange}
                          className="w-full px-3 py-2 border border-[var(--input-border)] rounded-md bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] disabled:opacity-50"
                        />
                      </div>

                      {updateRangeError && (
                        <div className="p-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm">
                          <AlertTriangle className="w-4 h-4 inline mr-1" />
                          {updateRangeError}
                        </div>
                      )}

                      {!updateRangeError && updateRangeIdx >= 0 && updateRangeSize > 0 && (
                        <div className="p-3 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-sm">
                          <Info className="w-4 h-4 inline mr-1" />
                          {(() => {
                            // Calculate if size needs adjustment
                            const csvTotal = csvRowCount || 0;
                            const needsAdjustment = updateRangeIdx + updateRangeSize > csvTotal;
                            const adjustedSize = needsAdjustment ? csvTotal - updateRangeIdx : updateRangeSize;
                            const endIdx = updateRangeIdx + adjustedSize - 1;
                            
                            return needsAdjustment ? (
                              <>
                                Size will be auto-adjusted to fit CSV bounds. Will upsert records {updateRangeIdx} to {endIdx} ({adjustedSize} records)
                              </>
                            ) : (
                              <>
                                Will upsert records {updateRangeIdx} to {endIdx} ({updateRangeSize} records)
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center gap-3 justify-end mt-4">
                    <button
                      onClick={() => {
                        setUpdatingRangeCampaignId(null);
                        setUpdateRangeError(null);
                      }}
                      disabled={updatingRange}
                      className="px-4 py-2 border border-[var(--input-border)] rounded-md bg-[var(--input-bg)] text-[var(--foreground)] text-sm font-medium hover:bg-[var(--table-row-hover)] transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        const campaign = campaigns.find(c => c.id === upsertConfirmModal.campaignId);
                        if (!campaign) return;

                        // Fetch CSV row count for validation
                        let totalRows = 0;
                        try {
                          const csvResponse = await api.get('/get_csv_data');
                          if (csvResponse.ok) {
                            const csvData = await csvResponse.json();
                            totalRows = csvData.data?.length || 0;
                          }
                        } catch (error) {
                          console.error('Error fetching CSV row count:', error);
                        }

                        // Validate partial mode
                        if (!updateRangeIsFull) {
                          if (updateRangeIdx < 0) {
                            setUpdateRangeError(`Index must be >= 0`);
                            return;
                          }
                          if (updateRangeSize <= 0) {
                            setUpdateRangeError(`Size must be > 0`);
                            return;
                          }
                          if (updateRangeIdx >= totalRows) {
                            setUpdateRangeError(`Index (${updateRangeIdx}) must be less than total CSV rows (${totalRows}). Valid range: 0 to ${totalRows - 1}`);
                            return;
                          }
                          // Auto-adjust size if it exceeds CSV bounds (like Python list slicing)
                          // Note: Backend will also auto-adjust, but we do it here to update UI
                          if (updateRangeIdx + updateRangeSize > totalRows) {
                            const adjustedSize = totalRows - updateRangeIdx;
                            setUpdateRangeSize(adjustedSize);
                            setUpdateRangeError(null);
                          }
                        }

                        setUpdatingRange(true);
                        setUpdateRangeError(null);
                        
                        try {
                          // Calculate final size (auto-adjust if needed, like Python list slicing)
                          let finalSize = updateRangeSize;
                          if (!updateRangeIsFull && updateRangeIdx + updateRangeSize > totalRows) {
                            finalSize = totalRows - updateRangeIdx;
                            setUpdateRangeSize(finalSize); // Update UI
                          }
                          
                          const response = await api.post('/campaign/update-range', {
                            campaign_id: campaign.id,
                            is_full: updateRangeIsFull,
                            idx: updateRangeIsFull ? undefined : updateRangeIdx,
                            size: updateRangeIsFull ? undefined : finalSize,
                          });

                          if (!response.ok) {
                            const errorData = await response.json();
                            const errorDetail = errorData.detail || errorData;
                            const errorMessage = errorDetail.message || 'Failed to update range';
                            setUpdateRangeError(errorMessage);
                            return;
                          }

                          const result = await response.json();
                          alert(result.message || 'Range updated successfully');
                          
                          // Refresh campaigns to get updated idx/size
                          await handleRefresh();
                          
                          // Refresh the preview to show updated range
                          if (upsertConfirmModal.campaignId) {
                            setLoadingUpsertPreview(true);
                            try {
                              const previewResponse = await api.get(`/get_csv_preview?limit=5&campaign_id=${upsertConfirmModal.campaignId}`);
                              if (previewResponse.ok) {
                                const previewData = await previewResponse.json();
                                setUpsertPreviewRecords(previewData.records || []);
                              }
                            } catch (error) {
                              console.error('Error refreshing preview:', error);
                            } finally {
                              setLoadingUpsertPreview(false);
                            }
                          }
                          
                          setUpdatingRangeCampaignId(null);
                          setUpdateRangeError(null);
                        } catch (error: any) {
                          console.error('Error updating range:', error);
                          setUpdateRangeError(`Error: ${error.message || 'Failed to update range'}`);
                        } finally {
                          setUpdatingRange(false);
                        }
                      }}
                      disabled={updatingRange || (!updateRangeIsFull && (updateRangeIdx < 0 || updateRangeSize <= 0))}
                      className="px-4 py-2 bg-[var(--success)] text-white rounded-md hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {updatingRange ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Updating...
                        </>
                      ) : (
                        'Save Range'
                      )}
                    </button>
                  </div>
                </div>
              )}
              
              {loadingUpsertPreview ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-[var(--primary)]" />
                  <span className="ml-2 text-sm text-[var(--secondary)]">Loading preview...</span>
                </div>
              ) : upsertPreviewRecords.length > 0 ? (
                <div className="border border-[var(--card-border)] rounded-md overflow-hidden">
                  <div className="bg-[var(--input-bg)] px-4 py-2 border-b border-[var(--card-border)]">
                    <h4 className="text-sm font-semibold text-[var(--foreground)]">First 5 Records Preview:</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-[var(--table-header-bg)]">
                        <tr>
                          {Object.keys(upsertPreviewRecords[0] || {}).map((key) => (
                            <th key={key} className="px-3 py-2 text-left font-semibold text-[var(--foreground)] border-b border-[var(--card-border)]">
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {upsertPreviewRecords.map((record, idx) => (
                          <tr key={idx} className={idx % 2 === 0 ? 'bg-[var(--card-bg)]' : 'bg-[var(--input-bg)]'}>
                            {Object.values(record).map((value: any, colIdx) => (
                              <td key={colIdx} className="px-3 py-2 text-[var(--foreground)] border-b border-[var(--card-border)]">
                                {String(value || '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="bg-[var(--input-bg)] px-4 py-2 border-t border-[var(--card-border)] text-xs text-[var(--secondary)]">
                    Showing first 5 records. All records with this campaign_id will be upserted.
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 rounded-md text-sm">
                  <p className="font-semibold mb-1 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" />
                    No records found for this campaign
                  </p>
                  <p className="text-xs">Campaign ID: {upsertConfirmModal.campaignId}</p>
                  <p className="text-xs mt-1">
                    Make sure you've clicked "Set CID" button to set the campaign_id in data.csv before upserting.
                  </p>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => {
                  setUpsertConfirmModal({ show: false, campaignId: null, campaignName: null });
                  setUpsertPreviewRecords([]);
                }}
                disabled={upserting}
                className="px-4 py-2 border border-[var(--input-border)] rounded-md bg-[var(--input-bg)] text-[var(--foreground)] text-sm font-medium hover:bg-[var(--table-row-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!upsertConfirmModal.campaignId) return;
                  
                  setUpserting(true);
                  try {
                    const response = await api.post('/campaign/upload-records', {
                      campaign_id: upsertConfirmModal.campaignId,
                    });

                    if (!response.ok) {
                      const errorData = await response.json();
                      const errorDetail = errorData.detail || errorData;
                      alert(errorDetail.message || 'Failed to upsert records');
                    } else {
                      const result = await response.json();
                      alert(`Successfully upserted ${result.records_uploaded || 0} records to ${result.campaign_name}`);
                      // Close modal
                      setUpsertConfirmModal({ show: false, campaignId: null, campaignName: null });
                      setUpsertPreviewRecords([]);
                      // Refresh campaigns to get updated record counts
                      if (selectedPhaseId) {
                        await refreshCampaigns();
                      }
                    }
                  } catch (error: any) {
                    console.error('Error upserting records:', error);
                    alert(`Error: ${error.message || 'Failed to upsert records'}`);
                  } finally {
                    setUpserting(false);
                  }
                }}
                disabled={upserting || loadingUpsertPreview || upsertPreviewRecords.length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {upserting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Upserting...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Confirm Upsert
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chunked Campaign Upsert Confirmation Modal */}
      {chunkedUpsertModal.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--card-bg)] rounded-lg border border-[var(--card-border)] shadow-lg p-6 max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">Confirm Upsert Chunked Campaign</h3>
              <button
                onClick={() => {
                  setChunkedUpsertModal({ show: false, campaignId: null, campaignName: null, chunkSize: null });
                  setChunkedUpsertPreviews([]);
                  setTotalChunksCount(0);
                }}
                className="p-1 hover:bg-[var(--table-row-hover)] rounded transition-colors"
                disabled={upsertingChunks}
              >
                <X className="w-5 h-5 text-[var(--secondary)]" />
              </button>
            </div>
            
            {/* Action Buttons at Top */}
            <div className="flex items-center gap-3 justify-end mb-4 pb-4 border-b border-[var(--card-border)]">
              <button
                onClick={() => {
                  setChunkedUpsertModal({ show: false, campaignId: null, campaignName: null, chunkSize: null });
                  setChunkedUpsertPreviews([]);
                  setTotalChunksCount(0);
                }}
                disabled={upsertingChunks}
                className="px-4 py-2 border border-[var(--input-border)] rounded-md bg-[var(--input-bg)] text-[var(--foreground)] text-sm font-medium hover:bg-[var(--table-row-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!chunkedUpsertModal.campaignId) return;
                  
                  console.log('=== Starting Chunked Upsert ===');
                  console.log('Campaign ID:', chunkedUpsertModal.campaignId);
                  console.log('Total Chunks:', totalChunksCount);
                  
                  setUpsertingChunks(true);
                  setChunkProgress({});
                  
                  try {
                    // Fetch all chunks for this campaign
                    const chunksResponse = await api.get(`/chunk/campaign/${chunkedUpsertModal.campaignId}`);
                    if (!chunksResponse.ok) {
                      throw new Error('Failed to fetch chunks');
                    }
                    
                    const chunksData = await chunksResponse.json();
                    const chunks = chunksData.chunks || [];
                    
                    if (chunks.length === 0) {
                      alert('No chunks found for this campaign');
                      setUpsertingChunks(false);
                      return;
                    }
                    
                    // Get chunk_size from the campaign (stored when chunks were created)
                    const chunkSize = chunkedUpsertModal.chunkSize || 25;
                    console.log('Using chunk size:', chunkSize, '(from campaign.chunk_size)');
                    
                    let successCount = 0;
                    let failedChunks: string[] = [];
                    let totalRecords = 0;
                    
                    // Process each chunk sequentially
                    for (let i = 0; i < chunks.length; i++) {
                      const chunk = chunks[i];
                      console.log(`\n--- Processing Chunk ${i + 1}/${chunks.length} ---`);
                      console.log('Chunk Name:', chunk.chunk_name);
                      console.log('Chunk ID:', chunk.id);
                      console.log('Chunk Index:', i);
                      console.log('Chunk Size:', chunkSize);
                      
                      // Update progress: creating
                      setChunkProgress(prev => ({
                        ...prev,
                        [chunk.chunk_name]: {
                          status: 'creating',
                          message: `Processing chunk ${i + 1}/${chunks.length}...`,
                        }
                      }));
                      
                      try {
                        // Call the new single chunk upsert endpoint
                        const response = await api.post('/chunk/upsert-single', {
                          chunk_id: chunk.id,
                          chunk_index: i,
                          chunk_size: chunkSize
                        });
                        
                        if (response.ok) {
                          const result = await response.json();
                          successCount++;
                          totalRecords += result.records_uploaded;
                          
                          console.log('✓ Chunk upserted successfully');
                          console.log('Records uploaded:', result.records_uploaded);
                          console.log('CID:', result.cid);
                          
                          // Update progress: finished
                          setChunkProgress(prev => ({
                            ...prev,
                            [chunk.chunk_name]: {
                              status: 'finished',
                              message: `Uploaded ${result.records_uploaded} records to Millis.ai`,
                              records_count: result.records_uploaded
                            }
                          }));
                        } else {
                          const errorData = await response.json();
                          failedChunks.push(chunk.chunk_name);
                          
                          console.log('✗ Chunk upsert failed');
                          console.log('Error:', errorData.detail);
                          
                          // Update progress: failed
                          setChunkProgress(prev => ({
                            ...prev,
                            [chunk.chunk_name]: {
                              status: 'failed',
                              message: errorData.detail || 'Failed to upsert',
                            }
                          }));
                        }
                      } catch (error: any) {
                        failedChunks.push(chunk.chunk_name);
                        console.error('Error upserting chunk:', error);
                        
                        // Update progress: failed
                        setChunkProgress(prev => ({
                          ...prev,
                          [chunk.chunk_name]: {
                            status: 'failed',
                            message: error.message || 'Failed to upsert',
                          }
                        }));
                      }
                    }
                    
                    console.log('\n=== Upsert Complete ===');
                    console.log('Success:', successCount, '/', chunks.length);
                    console.log('Total Records:', totalRecords);
                    console.log('Failed Chunks:', failedChunks);
                    
                    // Show final message
                    const message = failedChunks.length > 0
                      ? `Successfully upserted ${successCount}/${chunks.length} chunks with ${totalRecords} records. Failed: ${failedChunks.join(', ')}`
                      : `Successfully upserted all ${successCount} chunks with ${totalRecords} records to Millis.ai!`;
                    
                    alert(message);
                    
                    // Refresh campaigns
                    if (selectedPhaseId) {
                      await refreshCampaigns();
                    }
                    
                  } catch (error: any) {
                    console.error('Error during chunked upsert:', error);
                    alert(`Error: ${error.message || 'Failed to upsert chunks'}`);
                  } finally {
                    setUpsertingChunks(false);
                  }
                }}
                disabled={upsertingChunks || loadingChunkedPreviews || chunkedUpsertPreviews.length === 0}
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {upsertingChunks ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Upserting All Chunks...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Confirm Upsert All Chunks
                  </>
                )}
              </button>
            </div>
            
            <div className="mb-6">
              <div className="p-3 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 rounded-md text-sm mb-4">
                <p className="font-semibold">📦 Chunked Campaign: {chunkedUpsertModal.campaignName}</p>
                <p className="text-xs mt-1">You are about to upsert all {totalChunksCount} chunks of this campaign to Millis.ai. Below is a preview of first 2 records from each chunk.</p>
              </div>
              
              {/* Chunks Preview Limit Slider */}
              <div className="mb-4 p-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-md">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-[var(--foreground)]">
                    Preview Limit: <span className="text-[var(--primary)]">{chunksPreviewLimit}</span> / {totalChunksCount} chunks
                    {chunkedUpsertPreviews.length < chunksPreviewLimit && chunksPreviewLimit <= totalChunksCount && (
                      <span className="ml-2 text-xs text-orange-600 dark:text-orange-400">(currently showing {chunkedUpsertPreviews.length})</span>
                    )}
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setChunksPreviewLimit(totalChunksCount)}
                      className="text-xs px-2 py-1 bg-[var(--primary)] text-white rounded hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={chunksPreviewLimit === totalChunksCount || loadingChunkedPreviews || upsertingChunks}
                    >
                      Show All
                    </button>
                    {chunkedUpsertPreviews.length < chunksPreviewLimit && (
                      <button
                        onClick={async () => {
                          if (!chunkedUpsertModal.campaignId) return;
                          
                          setLoadingChunkedPreviews(true);
                          try {
                            const chunksResponse = await api.get(`/chunk/campaign/${chunkedUpsertModal.campaignId}`);
                            if (chunksResponse.ok) {
                              const chunksData = await chunksResponse.json();
                              const chunks = chunksData.chunks || [];
                              
                              const previewsPromises = chunks.slice(0, chunksPreviewLimit).map(async (chunk: any) => {
                                try {
                                  const previewResponse = await api.get(`/get_csv_preview?limit=2&campaign_id=${chunkedUpsertModal.campaignId}`);
                                  if (previewResponse.ok) {
                                    const previewData = await previewResponse.json();
                                    return {
                                      chunk_name: chunk.chunk_name,
                                      chunk_id: chunk.id,
                                      records: previewData.records || []
                                    };
                                  }
                                } catch (error) {
                                  console.error(`Error fetching preview for chunk ${chunk.chunk_name}:`, error);
                                }
                                return {
                                  chunk_name: chunk.chunk_name,
                                  chunk_id: chunk.id,
                                  records: []
                                };
                              });
                              
                              const previews = await Promise.all(previewsPromises);
                              setChunkedUpsertPreviews(previews);
                            }
                          } catch (error) {
                            console.error('Error fetching chunk previews:', error);
                          } finally {
                            setLoadingChunkedPreviews(false);
                          }
                        }}
                        className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        disabled={loadingChunkedPreviews || upsertingChunks}
                      >
                        {loadingChunkedPreviews ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          'Load More'
                        )}
                      </button>
                    )}
                  </div>
                </div>
                <input
                  type="range"
                  min="1"
                  max={totalChunksCount || 10}
                  value={chunksPreviewLimit}
                  onChange={(e) => setChunksPreviewLimit(parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                  disabled={loadingChunkedPreviews || upsertingChunks}
                />
                <div className="flex justify-between text-xs text-[var(--secondary)] mt-1">
                  <span>1</span>
                  <span>{totalChunksCount}</span>
                </div>
              </div>
              
              {loadingChunkedPreviews ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-[var(--primary)]" />
                  <span className="ml-2 text-sm text-[var(--secondary)]">Loading chunk previews...</span>
                </div>
              ) : chunkedUpsertPreviews.length > 0 ? (
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                  {chunkedUpsertPreviews.map((preview, idx) => {
                    const progress = chunkProgress[preview.chunk_name];
                    const isProcessing = progress && ['creating', 'upserting'].includes(progress.status);
                    const isFinished = progress && progress.status === 'finished';
                    const isFailed = progress && progress.status === 'failed';
                    
                    return (
                    <div key={idx} className={`border rounded-md overflow-hidden ${
                      isFinished ? 'border-green-500' : isFailed ? 'border-red-500' : isProcessing ? 'border-yellow-500' : 'border-[var(--card-border)]'
                    }`}>
                      <div className={`px-4 py-2 border-b border-[var(--card-border)] flex items-center justify-between ${
                        isFinished ? 'bg-green-50 dark:bg-green-900/20' : 
                        isFailed ? 'bg-red-50 dark:bg-red-900/20' : 
                        isProcessing ? 'bg-yellow-50 dark:bg-yellow-900/20' :
                        'bg-purple-50 dark:bg-purple-900/20'
                      }`}>
                        <h4 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
                          {preview.chunk_name}
                          {!progress && (
                            <span className="text-xs text-[var(--secondary)]">({preview.records.length} records preview)</span>
                          )}
                          {progress && (
                            <span className={`text-xs font-normal ${
                              isFinished ? 'text-green-600 dark:text-green-400' :
                              isFailed ? 'text-red-600 dark:text-red-400' :
                              isProcessing ? 'text-yellow-600 dark:text-yellow-400' :
                              'text-[var(--secondary)]'
                            }`}>
                              {isProcessing && <Loader2 className="w-3 h-3 inline animate-spin mr-1" />}
                              {isFinished && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                              {isFailed && <XCircle className="w-3 h-3 inline mr-1" />}
                              {progress.message}
                            </span>
                          )}
                        </h4>
                      </div>
                      {!upsertingChunks && preview.records.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-[var(--table-header-bg)]">
                              <tr>
                                {Object.keys(preview.records[0] || {}).map((key) => (
                                  <th key={key} className="px-3 py-2 text-left font-semibold text-[var(--foreground)] border-b border-[var(--card-border)]">
                                    {key}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {preview.records.map((record: any, recordIdx: number) => (
                                <tr key={recordIdx} className={recordIdx % 2 === 0 ? 'bg-[var(--card-bg)]' : 'bg-[var(--input-bg)]'}>
                                  {Object.values(record).map((value: any, colIdx) => (
                                    <td key={colIdx} className="px-3 py-2 text-[var(--foreground)] border-b border-[var(--card-border)]">
                                      {String(value || '')}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : !upsertingChunks ? (
                        <div className="p-4 text-sm text-[var(--secondary)]">No records found for this chunk</div>
                      ) : null}
                    </div>
                    );
                  })}
                  {totalChunksCount > 10 && (
                    <p className="text-xs text-[var(--secondary)] italic mt-4 flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      Showing first 10 of {totalChunksCount} chunks. All {totalChunksCount} chunks will be upserted when you confirm.
                    </p>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 rounded-md text-sm">
                  <p className="font-semibold mb-1 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" />
                    No chunks found for this campaign
                  </p>
                  <p className="text-xs">Please create chunks first before upserting.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Auto-Start Chunks Modal (for multiple-type campaigns) */}
      {autoStartModal.show && autoStartModal.campaign && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--card-bg)] rounded-lg border border-[var(--card-border)] shadow-lg p-6 max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">
                Start Multiple Chunks Campaign: {autoStartModal.campaign.campaign_name}
              </h3>
              <button
                onClick={() => {
                  if (isAutoStarting) {
                    // If auto-start is running, stop it first (same as "Stop Auto Start" button)
                    console.log('[AUTO_START] Stop requested by user via X button');
                    setShouldStopAutoStart(true);
                    shouldStopAutoStartRef.current = true; // Also update ref for immediate access
                  }
                  // Close the modal
                  setAutoStartModal({ show: false, campaign: null });
                  setAutoStartChunks([]);
                  setAutoStartProgress({});
                  setLaunchStatusMessage({ type: null, text: '' });
                }}
                className="p-1 hover:bg-[var(--table-row-hover)] rounded transition-colors"
              >
                <X className="w-5 h-5 text-[var(--secondary)]" />
              </button>
            </div>

            {/* Auto Start Controls */}
            <div className="mb-6 p-4 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg">
              <div className="flex items-center gap-4 mb-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                    Gap Between Chunks (seconds)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={autoStartGap}
                    onChange={(e) => setAutoStartGap(parseInt(e.target.value) || 0)}
                    disabled={isAutoStarting}
                    className="w-full px-3 py-2 border border-[var(--input-border)] rounded-md bg-[var(--input-bg)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] disabled:opacity-50"
                  />
                  <p className="text-xs text-[var(--secondary)] mt-1">
                    Time to wait after each chunk finishes before starting the next one
                  </p>
                </div>
                <div className="flex items-end gap-3">
                  <button
                    onClick={async () => {
                      if (!autoStartModal.campaign) return;
                      console.log('[REFRESH_STATUS] Refreshing all chunk statuses...');
                      setRefreshingChunkStatuses(true);
                      
                      try {
                        // Fetch status for all chunks
                        for (const chunk of autoStartChunks) {
                          if (chunk.cid) {
                            await api.get(`/chunk/${chunk.id}/status`);
                          }
                        }
                        
                        // Refresh chunks list
                        const chunksResponse = await api.get(`/chunk/campaign/${autoStartModal.campaign.id}`);
                        if (chunksResponse.ok) {
                          const chunksResult = await chunksResponse.json();
                          setAutoStartChunks(chunksResult.chunks || []);
                          console.log('[REFRESH_STATUS] All statuses refreshed');
                        }
                      } catch (error) {
                        console.error('[REFRESH_STATUS] Error:', error);
                        alert('Failed to refresh statuses');
                      } finally {
                        setRefreshingChunkStatuses(false);
                      }
                    }}
                    disabled={isAutoStarting || autoStartChunks.length === 0 || refreshingChunkStatuses}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {refreshingChunkStatuses ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Refreshing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        Refresh Status
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleAutoStartChunks}
                    disabled={isAutoStarting || autoStartChunks.length === 0}
                    className="px-6 py-2 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-md hover:from-green-700 hover:to-green-800 transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isAutoStarting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Auto-Starting...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Auto Start All
                      </>
                    )}
                  </button>
                  {isAutoStarting && (
                    <button
                      onClick={() => {
                        console.log('[AUTO_START] Stop requested by user');
                        setShouldStopAutoStart(true);
                        shouldStopAutoStartRef.current = true; // Also update ref for immediate access
                      }}
                      className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm font-medium flex items-center gap-2"
                    >
                      <XCircle className="w-4 h-4" />
                      Stop Auto Start
                    </button>
                  )}
                </div>
              </div>

              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 rounded-md text-xs">
                <p className="font-semibold mb-1">How Auto Start Works:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Starts the first chunk</li>
                  <li>Waits until the chunk status becomes "finished"</li>
                  <li>Counts down the specified gap time</li>
                  <li>Starts the next chunk</li>
                  <li>Repeats until all chunks are completed</li>
                </ol>
              </div>

              {/* Launch Status Check */}
              <div className="mt-4 space-y-2">
                <button
                  onClick={handleCheckLaunchStatus}
                  disabled={checkingLaunchStatus}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {checkingLaunchStatus ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Checking Launch Status...
                    </>
                  ) : (
                    <>
                      <Network className="w-4 h-4" />
                      Check Launch Status
                    </>
                  )}
                </button>
                
                  {launchStatusMessage.type && (
                    <div className={`p-3 rounded-md border flex items-start gap-2 ${
                      launchStatusMessage.type === 'success'
                        ? 'bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400'
                        : 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400'
                    }`}>
                      {launchStatusMessage.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      )}
                      <p className="text-xs font-medium">{launchStatusMessage.text}</p>
                    </div>
                  )}
              </div>
            </div>

            {/* Chunks Table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-[var(--card-border)]">
                <thead className="bg-[var(--table-header-bg)]">
                  <tr>
                    <th className="border border-[var(--card-border)] px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)]">#</th>
                    <th className="border border-[var(--card-border)] px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)]">Chunk Name</th>
                    <th className="border border-[var(--card-border)] px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)]">CID</th>
                    <th className="border border-[var(--card-border)] px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)]">Records</th>
                    <th className="border border-[var(--card-border)] px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)]">Status</th>
                    <th className="border border-[var(--card-border)] px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)]">Phone ID</th>
                    <th className="border border-[var(--card-border)] px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)]">Auto Progress</th>
                    <th className="border border-[var(--card-border)] px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)]">Manual Start</th>
                  </tr>
                </thead>
                <tbody>
                  {autoStartChunks.map((chunk, index) => {
                    const progress = autoStartProgress[chunk.id];
                    return (
                      <tr key={chunk.id} className="hover:bg-[var(--table-row-hover)]">
                        <td className="border border-[var(--card-border)] px-4 py-2 text-sm text-[var(--foreground)]">
                          {index + 1}
                        </td>
                        <td className="border border-[var(--card-border)] px-4 py-2 text-sm text-[var(--foreground)]">
                          {chunk.chunk_name}
                        </td>
                        <td className="border border-[var(--card-border)] px-4 py-2 text-xs text-[var(--foreground)] font-mono">
                          {chunk.cid ? chunk.cid.substring(0, 12) + '...' : 'N/A'}
                        </td>
                        <td className="border border-[var(--card-border)] px-4 py-2 text-sm text-[var(--foreground)]">
                          {chunk.records_count || 0}
                        </td>
                        <td className="border border-[var(--card-border)] px-4 py-2 text-sm">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            chunk.status === 'finished' 
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' 
                              : chunk.status === 'idle'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                              : chunk.status === 'started'
                              ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                          }`}>
                            {chunk.status || 'pending'}
                          </span>
                        </td>
                        <td className="border border-[var(--card-border)] px-4 py-2 text-xs text-[var(--foreground)]">
                          {chunk.phone_id || 'N/A'}
                        </td>
                        <td className="border border-[var(--card-border)] px-4 py-2 text-sm">
                          {progress ? (
                            <div className="flex items-center gap-2">
                              {progress.status === 'starting' && (
                                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                              )}
                              {progress.status === 'started' && (
                                <CheckCircle2 className="w-4 h-4 text-green-600" />
                              )}
                              {progress.status === 'waiting_finish' && (
                                <Loader2 className="w-4 h-4 animate-spin text-yellow-600" />
                              )}
                              {progress.status === 'finished' && (
                                <CheckCircle2 className="w-4 h-4 text-green-600" />
                              )}
                              {progress.status === 'countdown' && (
                                <Clock className="w-4 h-4 text-blue-600" />
                              )}
                              {progress.status === 'failed' && (
                                <XCircle className="w-4 h-4 text-red-600" />
                              )}
                              <span className="text-xs text-[var(--foreground)]">{progress.message}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-[var(--secondary)]">-</span>
                          )}
                        </td>
                        <td className="border border-[var(--card-border)] px-4 py-2 text-sm">
                          {chunk.status === 'idle' ? (
                            <button
                              onClick={() => handleStartIndividualChunk(chunk.id)}
                              disabled={isAutoStarting || startingIndividualChunk === chunk.id || !chunk.cid}
                              className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                            >
                              {(startingIndividualChunk === chunk.id || autoStartProgress[chunk.id]?.status === 'starting') ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  Starting...
                                </>
                              ) : (
                                <>
                                  <Play className="w-3 h-3" />
                                  Start
                                </>
                              )}
                            </button>
                          ) : chunk.status === 'started' || chunk.status === 'finished' ? (
                            <span className="text-xs text-[var(--secondary)]">
                              {chunk.status === 'started' ? 'Running' : 'Completed'}
                            </span>
                          ) : (
                            <span className="text-xs text-[var(--secondary)]">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {autoStartChunks.length === 0 && (
              <div className="p-4 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 rounded-md text-sm text-center">
                No chunks found for this campaign
              </div>
            )}

            {/* Close Button */}
            <div className="flex items-center justify-end mt-6">
              <button
                onClick={() => {
                  if (!isAutoStarting) {
                    setAutoStartModal({ show: false, campaign: null });
                    setAutoStartChunks([]);
                    setAutoStartProgress({});
                  }
                }}
                disabled={isAutoStarting}
                className="px-4 py-2 border border-[var(--input-border)] rounded-md bg-[var(--input-bg)] text-[var(--foreground)] text-sm font-medium hover:bg-[var(--table-row-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAutoStarting ? 'Running...' : 'Close'}
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
                onClick={() => {
                  setCampaignActionModal({ show: false, action: null, campaign: null });
                  setLaunchStatusMessage({ type: null, text: '' });
                }}
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

              {/* Launch Status Check */}
              {campaignActionModal.action === 'start' && (
                <div className="mt-4 space-y-2">
                  <button
                    onClick={handleCheckLaunchStatus}
                    disabled={checkingLaunchStatus}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {checkingLaunchStatus ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Checking Launch Status...
                      </>
                    ) : (
                      <>
                        <Network className="w-4 h-4" />
                        Check Launch Status
                      </>
                    )}
                  </button>
                  
                  {launchStatusMessage.type && (
                    <div className={`p-3 rounded-md border ${
                      launchStatusMessage.type === 'success'
                        ? 'bg-green-500/10 border-green-500/20 text-green-600'
                        : 'bg-red-500/10 border-red-500/20 text-red-600'
                    }`}>
                      <p className="text-xs font-medium">{launchStatusMessage.text}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => {
                  setCampaignActionModal({ show: false, action: null, campaign: null });
                  setLaunchStatusMessage({ type: null, text: '' });
                }}
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

      {/* Create Chunks Modal */}
      {showCreateChunksModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
          <div className="bg-[var(--card-bg)] rounded-lg shadow-xl w-full max-w-2xl mx-4 border border-[var(--card-border)]">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--card-border)]">
              <h2 className="text-lg font-semibold text-[var(--foreground)]">Create Campaign Chunks</h2>
              <button
                onClick={() => {
                  setShowCreateChunksModal({ show: false, campaignId: null, campaignName: '' });
                  setChunksPreview(null);
                }}
                className="p-1 rounded-md hover:bg-[var(--table-row-hover)] transition-colors"
              >
                <X className="w-5 h-5 text-[var(--foreground)]" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                  Campaign Name
                </label>
                <input
                  type="text"
                  value={showCreateChunksModal.campaignName}
                  disabled
                  className="w-full px-3 py-2 border border-[var(--input-border)] rounded-md bg-[var(--input-bg)] text-[var(--foreground)] opacity-60 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                  Chunk Size (records per chunk)
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    value={chunkSize}
                    onChange={(e) => setChunkSize(parseInt(e.target.value) || 1)}
                    className="flex-1 px-3 py-2 border border-[var(--input-border)] rounded-md bg-[var(--input-bg)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                  <button
                    onClick={async () => {
                      if (!showCreateChunksModal.campaignId) return;
                      setCalculatingChunks(true);
                      try {
                        const response = await api.post('/chunk/calculate', {
                          campaign_id: showCreateChunksModal.campaignId,
                          chunk_size: chunkSize
                        });
                        if (response.ok) {
                          const result = await response.json();
                          setChunksPreview(result);
                        } else {
                          const errorData = await response.json();
                          alert(errorData.detail || 'Failed to calculate chunks');
                        }
                      } catch (error: any) {
                        console.error('Error calculating chunks:', error);
                        alert(`Error: ${error.message || 'Failed to calculate chunks'}`);
                      } finally {
                        setCalculatingChunks(false);
                      }
                    }}
                    disabled={calculatingChunks}
                    className="px-4 py-2 bg-[var(--primary)] text-white rounded-md hover:bg-[var(--primary-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {calculatingChunks ? 'Calculating...' : 'Calculate'}
                  </button>
                </div>
              </div>

              {/* Preview */}
              {chunksPreview && (
                <div className="p-4 bg-[var(--table-header-bg)] rounded-md border border-[var(--card-border)]">
                  <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2 flex items-center gap-2">
                    <BarChart className="w-4 h-4" />
                    Preview:
                  </h3>
                  <div className="space-y-1 text-sm text-[var(--foreground)]">
                    <p>• Total Records: <span className="font-bold">{chunksPreview.total_records}</span></p>
                    <p>• Chunk Size: <span className="font-bold">{chunksPreview.chunk_size}</span></p>
                    <p>• Number of Chunks: <span className="font-bold">{chunksPreview.number_of_chunks}</span></p>
                    <div className="mt-2 max-h-32 overflow-y-auto">
                      {chunksPreview.chunks_preview.slice(0, 5).map((chunk: any) => (
                        <p key={chunk.chunk_number} className="text-xs">
                          Chunk {chunk.chunk_number}: {chunk.records_count} records ({chunk.records_range})
                        </p>
                      ))}
                      {chunksPreview.chunks_preview.length > 5 && (
                        <p className="text-xs text-[var(--secondary)]">... and {chunksPreview.chunks_preview.length - 5} more</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 p-4 border-t border-[var(--card-border)]">
              <button
                onClick={() => {
                  setShowCreateChunksModal({ show: false, campaignId: null, campaignName: '' });
                  setChunksPreview(null);
                }}
                className="px-4 py-2 border border-[var(--input-border)] rounded-md text-[var(--foreground)] hover:bg-[var(--table-row-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!showCreateChunksModal.campaignId || !chunksPreview) {
                    alert('Please calculate chunks first');
                    return;
                  }
                  setCreatingChunks(true);
                  try {
                    const response = await api.post('/chunk/create', {
                      campaign_id: showCreateChunksModal.campaignId,
                      chunk_size: chunkSize
                    });
                    if (response.ok) {
                      const result = await response.json();
                      alert(result.message || 'Chunks created successfully!');
                      setShowCreateChunksModal({ show: false, campaignId: null, campaignName: '' });
                      setChunksPreview(null);
                      // Refresh campaigns to update type
                      fetchCampaigns();
                    } else {
                      const errorData = await response.json();
                      alert(errorData.detail || 'Failed to create chunks');
                    }
                  } catch (error: any) {
                    console.error('Error creating chunks:', error);
                    alert(`Error: ${error.message || 'Failed to create chunks'}`);
                  } finally {
                    setCreatingChunks(false);
                  }
                }}
                disabled={creatingChunks || !chunksPreview}
                className="px-4 py-2 bg-[var(--success)] text-white rounded-md hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingChunks ? 'Creating...' : 'Create Chunks'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Show Chunks Modal */}
      {showChunksModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
          <div className="bg-[var(--card-bg)] rounded-lg shadow-xl w-full max-w-4xl mx-4 h-[80vh] flex flex-col border border-[var(--card-border)]">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--card-border)]">
              <h2 className="text-lg font-semibold text-[var(--foreground)]">
                Chunks - {showChunksModal.campaignName}
              </h2>
              <button
                onClick={() => {
                  setShowChunksModal({ show: false, campaignId: null, campaignName: '' });
                  setChunks([]);
                }}
                className="p-1 rounded-md hover:bg-[var(--table-row-hover)] transition-colors"
              >
                <X className="w-5 h-5 text-[var(--foreground)]" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4">
              {loadingChunks ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
                </div>
              ) : chunks.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-[var(--secondary)]">No chunks found</p>
                </div>
              ) : (
                <table className="w-full border-collapse">
                  <thead className="bg-[var(--table-header-bg)] sticky top-0">
                    <tr>
                      <th className="border border-[var(--card-border)] px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)]">#</th>
                      <th className="border border-[var(--card-border)] px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)]">Chunk Name</th>
                      <th className="border border-[var(--card-border)] px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)]">CID</th>
                      <th className="border border-[var(--card-border)] px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)]">Status</th>
                      <th className="border border-[var(--card-border)] px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)]">Records</th>
                      <th className="border border-[var(--card-border)] px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)]">Upload Status</th>
                      <th className="border border-[var(--card-border)] px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)]">Phone ID</th>
                      <th className="border border-[var(--card-border)] px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)]">Agent ID</th>
                      <th className="border border-[var(--card-border)] px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chunks.map((chunk, index) => (
                      <tr key={chunk.id} className="hover:bg-[var(--table-row-hover)] transition-colors">
                        <td className="border border-[var(--card-border)] px-4 py-2 text-sm text-[var(--foreground)]">
                          {index + 1}
                        </td>
                        <td className="border border-[var(--card-border)] px-4 py-2 text-sm text-[var(--foreground)]">
                          {chunk.chunk_name}
                        </td>
                        <td className="border border-[var(--card-border)] px-4 py-2 text-sm text-[var(--foreground)]">
                          {chunk.cid || 'N/A'}
                        </td>
                        <td className="border border-[var(--card-border)] px-4 py-2 text-sm text-[var(--foreground)]">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            chunk.status === 'finished' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                            chunk.status === 'pending' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                            'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                          }`}>
                            {chunk.status || 'N/A'}
                          </span>
                        </td>
                        <td className="border border-[var(--card-border)] px-4 py-2 text-sm text-[var(--foreground)]">
                          {chunk.records_count > 0 ? (
                            <span>{chunk.records_count}</span>
                          ) : (
                            <span className="text-gray-400 italic">Not upserted</span>
                          )}
                        </td>
                        <td className="border border-[var(--card-border)] px-4 py-2 text-sm text-[var(--foreground)]">
                          {chunk.upload_status === 'done' ? (
                            <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 rounded text-xs font-medium flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Done
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded text-xs font-medium">
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="border border-[var(--card-border)] px-4 py-2 text-sm text-[var(--foreground)]">
                          {chunk.phone_id ? (
                            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 rounded text-xs font-medium">
                              {chunk.phone_id}
                            </span>
                          ) : (
                            <span className="text-[var(--secondary)]">N/A</span>
                          )}
                        </td>
                        <td className="border border-[var(--card-border)] px-4 py-2 text-sm text-[var(--foreground)]">
                          {chunk.agent_id || <span className="text-[var(--secondary)]">N/A</span>}
                        </td>
                        <td className="border border-[var(--card-border)] px-4 py-2 text-sm text-[var(--foreground)]">
                          <button
                            onClick={async () => {
                              if (!confirm(`Are you sure you want to delete chunk "${chunk.chunk_name}"? This will also delete it from Millis.ai if it has a CID.`)) {
                                return;
                              }
                              
                              try {
                                const response = await api.delete(`/chunk/${chunk.id}`);
                                if (response.ok) {
                                  alert(`Successfully deleted chunk: ${chunk.chunk_name}`);
                                  // Refresh chunks list
                                  if (showChunksModal.campaignId) {
                                    const chunksResponse = await api.get(`/chunk/campaign/${showChunksModal.campaignId}`);
                                    if (chunksResponse.ok) {
                                      const result = await chunksResponse.json();
                                      setChunks(result.chunks || []);
                                    }
                                  }
                                } else {
                                  const errorData = await response.json();
                                  alert(errorData.detail || 'Failed to delete chunk');
                                }
                              } catch (error: any) {
                                console.error('Error deleting chunk:', error);
                                alert(`Error: ${error.message || 'Failed to delete chunk'}`);
                              }
                            }}
                            className="px-2 py-1 bg-red-600 text-white rounded text-xs font-medium hover:opacity-90 transition-opacity"
                            title="Delete this chunk"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[var(--card-border)] flex items-center justify-between">
              <p className="text-sm text-[var(--secondary)]">
                Total Chunks: {chunks.length}
              </p>
              <button
                onClick={() => {
                  setShowChunksModal({ show: false, campaignId: null, campaignName: '' });
                  setChunks([]);
                }}
                className="px-4 py-2 border border-[var(--input-border)] rounded-md text-[var(--foreground)] hover:bg-[var(--table-row-hover)] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chunk Upsert Warning Modal */}
      {chunkWarningModal.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[var(--card-border)] bg-yellow-50 dark:bg-yellow-900/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/40 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-yellow-800 dark:text-yellow-400 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    Chunks Not Upserted
                  </h2>
                  <p className="text-sm text-yellow-700 dark:text-yellow-500">
                    Please upload records to chunks before setting phone number
                  </p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
              <div className="space-y-4">
                <p className="text-sm text-[var(--foreground)]">
                  The following chunks need to have records uploaded before you can set a phone number:
                </p>
                
                <div className="bg-[var(--input-bg)] border border-[var(--input-border)] rounded-md p-4 max-h-64 overflow-y-auto">
                  <div className="space-y-2">
                    {chunkWarningModal.chunkNames.map((chunkName, index) => (
                      <div key={index} className="flex items-center gap-2 text-sm">
                        <span className="w-6 h-6 rounded-full bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400 flex items-center justify-center text-xs font-medium flex-shrink-0">
                          {index + 1}
                        </span>
                        <span className="text-[var(--foreground)] font-mono">{chunkName}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-4">
                  <div className="flex gap-3">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="text-sm">
                      <p className="font-medium text-blue-800 dark:text-blue-300 mb-1">How to upload records:</p>
                      <ol className="list-decimal list-inside space-y-1 text-blue-700 dark:text-blue-400">
                        <li>Click "Upsert" button on your campaign</li>
                        <li>Click "Confirm Upsert All Chunks" to upload records to all chunks</li>
                        <li>Wait for all chunks to complete uploading</li>
                        <li>Then you can set the phone number</li>
                      </ol>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[var(--card-border)] flex justify-end gap-3">
              <button
                onClick={() => setChunkWarningModal({ show: false, chunkNames: [] })}
                className="px-6 py-2 bg-[var(--primary)] text-white rounded-md hover:opacity-90 transition-opacity font-medium"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Campaign Modal (Single Mode) */}
      {showCreateCampaignModal && selectedPhaseId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--card-bg)] rounded-lg border border-[var(--card-border)] shadow-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">
                Create Campaign
              </h3>
              <button
                onClick={() => {
                  setShowCreateCampaignModal(false);
                  setRangeError(null);
                }}
                className="p-1 hover:bg-[var(--table-row-hover)] rounded transition-colors"
                disabled={creatingCampaign}
              >
                <X className="w-5 h-5 text-[var(--secondary)]" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Full/Partial Toggle */}
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                  Upsert Mode
                </label>
                <div className="flex items-center gap-2 bg-[var(--input-bg)] p-1 rounded-lg border border-[var(--input-border)]">
                  <button
                    onClick={() => {
                      setIsFullUpsert(true);
                      setRangeError(null);
                    }}
                    disabled={creatingCampaign}
                    className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all ${
                      isFullUpsert
                        ? 'bg-[var(--primary)] text-white shadow-sm'
                        : 'text-[var(--secondary)] hover:text-[var(--foreground)]'
                    } disabled:opacity-50`}
                  >
                    Full
                  </button>
                  <button
                    onClick={() => {
                      setIsFullUpsert(false);
                      setRangeError(null);
                    }}
                    disabled={creatingCampaign}
                    className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all ${
                      !isFullUpsert
                        ? 'bg-[var(--primary)] text-white shadow-sm'
                        : 'text-[var(--secondary)] hover:text-[var(--foreground)]'
                    } disabled:opacity-50`}
                  >
                    Partial
                  </button>
                </div>
                <p className="text-xs text-[var(--secondary)] mt-1">
                  {isFullUpsert 
                    ? `Will upsert all ${csvRowCount} records from data.csv (idx: 0, size: ${csvRowCount})`
                    : 'Specify a range of records to upsert from data.csv'
                  }
                </p>
              </div>

              {/* Partial Mode Fields */}
              {!isFullUpsert && (
                <div className="space-y-3 p-4 bg-[var(--input-bg)] rounded-md border border-[var(--input-border)]">
                  <div>
                    <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                      Index (Starting Position)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={csvRowCount - 1}
                      value={campaignIdx}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setCampaignIdx(val);
                        setRangeError(null);
                      }}
                      disabled={creatingCampaign}
                      className="w-full px-3 py-2 border border-[var(--input-border)] rounded-md bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] disabled:opacity-50"
                      placeholder="0"
                    />
                    <p className="text-xs text-[var(--secondary)] mt-1">
                      Starting index in data.csv (0-based). Valid range: 0 to {csvRowCount - 1}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                      Size (Number of Records)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={csvRowCount - campaignIdx}
                      value={campaignSize}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setCampaignSize(val);
                        setRangeError(null);
                      }}
                      disabled={creatingCampaign}
                      className="w-full px-3 py-2 border border-[var(--input-border)] rounded-md bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] disabled:opacity-50"
                      placeholder="100"
                    />
                    <p className="text-xs text-[var(--secondary)] mt-1">
                      Number of records to upsert. Max: {csvRowCount - campaignIdx} (from index {campaignIdx})
                    </p>
                  </div>

                  {rangeError && (
                    <div className="p-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm">
                      <AlertTriangle className="w-4 h-4 inline mr-1" />
                      {rangeError}
                    </div>
                  )}

                  {!rangeError && campaignIdx >= 0 && campaignSize > 0 && (
                    <div className="p-3 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-sm">
                      <Info className="w-4 h-4 inline mr-1" />
                      {campaignIdx + campaignSize > csvRowCount ? (
                        <>
                          Size will be auto-adjusted to fit CSV bounds. Will upsert records {campaignIdx} to {Math.min(campaignIdx + campaignSize - 1, csvRowCount - 1)} ({Math.min(campaignSize, csvRowCount - campaignIdx)} records)
                        </>
                      ) : (
                        <>
                          Will upsert records {campaignIdx} to {campaignIdx + campaignSize - 1} ({campaignSize} records)
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Error Message */}
              {campaignIdMessage && campaignIdMessage.startsWith('Error') && (
                <div className="p-3 rounded-md bg-[var(--danger)] text-white text-sm">
                  {campaignIdMessage}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-3 justify-end pt-4 border-t border-[var(--card-border)]">
                <button
                  onClick={() => {
                    setShowCreateCampaignModal(false);
                    setRangeError(null);
                    setCampaignIdMessage(null);
                  }}
                  disabled={creatingCampaign}
                  className="px-4 py-2 border border-[var(--input-border)] rounded-md bg-[var(--input-bg)] text-[var(--foreground)] text-sm font-medium hover:bg-[var(--table-row-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!selectedPhaseId) return;

                                        // Validate partial mode
                                        if (!isFullUpsert) {
                                          if (campaignIdx < 0) {
                                            setRangeError(`Index must be >= 0`);
                                            return;
                                          }
                                          if (campaignSize <= 0) {
                                            setRangeError(`Size must be > 0`);
                                            return;
                                          }
                                          if (campaignIdx >= csvRowCount) {
                                            setRangeError(`Index (${campaignIdx}) must be less than total CSV rows (${csvRowCount}). Valid range: 0 to ${csvRowCount - 1}`);
                                            return;
                                          }
                                          // Auto-adjust size if it exceeds CSV bounds (like Python list slicing)
                                          // Note: Backend will also auto-adjust, but we do it here to update UI
                                          if (campaignIdx + campaignSize > csvRowCount) {
                                            const adjustedSize = csvRowCount - campaignIdx;
                                            setCampaignSize(adjustedSize);
                                          }
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
                    setRangeError(null);
                    
                    try {
                      // Calculate final size (auto-adjust if needed, like Python list slicing)
                      let finalSize = campaignSize;
                      if (!isFullUpsert && campaignIdx + campaignSize > csvRowCount) {
                        finalSize = csvRowCount - campaignIdx;
                        setCampaignSize(finalSize); // Update UI
                      }
                      
                      const response = await api.post('/campaign/create', {
                        phase_id: selectedPhaseId,
                        phase_name: selectedPhase.name,
                        campaign_type: 'single',
                        is_full: isFullUpsert,
                        idx: isFullUpsert ? undefined : campaignIdx,
                        size: isFullUpsert ? undefined : finalSize,
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
                        phase_id: result.phase_id,
                        idx: result.idx,
                        size: result.size
                      });
                      setShowCreateCampaignModal(false);
                      setRangeError(null);
                    } catch (error: any) {
                      console.error('Error creating campaign:', error);
                      setCampaignIdMessage(`Error: ${error.message || 'Failed to create campaign'}`);
                      setTimeout(() => setCampaignIdMessage(null), 5000);
                    } finally {
                      setCreatingCampaign(false);
                    }
                  }}
                  disabled={creatingCampaign || (!isFullUpsert && (campaignIdx < 0 || campaignSize <= 0))}
                  className="px-6 py-2 bg-[var(--success)] text-white rounded-md hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {creatingCampaign ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Campaign'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

