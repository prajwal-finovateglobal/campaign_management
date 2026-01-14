'use client';

import { useState, useEffect, useRef } from 'react';
import './FilterSection.css';
import DatePicker from 'react-datepicker';
import { format } from 'date-fns';
import { api } from '@/lib/api';
import { 
  Calendar, 
  Filter, 
  Clock, 
  ToggleLeft, 
  ToggleRight,
  ChevronDown,
  Loader2,
  X,
  CheckCircle2,
  Eye,
  Trash2,
  RotateCcw,
  Sparkles,
  Paintbrush,
  Spool
} from 'lucide-react';

interface FilterSectionProps {
  onApply: (filters: any) => void;
  loading: boolean;
  selectedClientId?: number | null;
  selectedPhaseId?: number | null;
  selectedCampaignId?: number | null;
  selectedCampaignIds?: number[] | null;
  onPhaseChange?: (phaseId: number | null) => void;
  onCampaignChange?: (campaignId: number | null) => void;
  onCampaignIdsChange?: (campaignIds: number[] | null) => void;
  onCleanCD?: () => void;
  onClearTD?: () => void;
  loadingCleanCD?: boolean;
  loadingClearTD?: boolean;
}

interface Phase {
  id: number;
  name: string;
  client_id: number;
}

interface Campaign {
  id: number;
  campaign_name: string;
}

export function FilterSection({ 
  onApply, 
  loading, 
  selectedClientId,
  selectedPhaseId, 
  selectedCampaignId,
  selectedCampaignIds,
  onPhaseChange,
  onCampaignChange,
  onCampaignIdsChange,
  onCleanCD,
  onClearTD,
  loadingCleanCD = false,
  loadingClearTD = false
}: FilterSectionProps) {
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);
  const [conStatus, setConStatus] = useState<boolean | null>(null);
  const [direction, setDirection] = useState<string>('');
  const [language, setLanguage] = useState<string>('');
  const [durationUnit, setDurationUnit] = useState<'sec' | 'min'>('sec');
  const [durationMin, setDurationMin] = useState<number>(0);
  const [durationMax, setDurationMax] = useState<number>(0);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingPhases, setLoadingPhases] = useState(false);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [localPhaseId, setLocalPhaseId] = useState<string>(selectedPhaseId?.toString() || '');
  const [localCampaignId, setLocalCampaignId] = useState<string>(selectedCampaignId?.toString() || '');
  
  // Campaign selection mode: 'single' or 'multiple'
  const [campaignMode, setCampaignMode] = useState<'single' | 'multiple'>('single');
  
  // Multiple campaign selection state
  const [selectedCampaignIdsLocal, setSelectedCampaignIdsLocal] = useState<Set<number>>(
    new Set(selectedCampaignIds || [])
  );
  
  // All campaigns across all phases (for persistence)
  const [allCampaignsMap, setAllCampaignsMap] = useState<Map<number, Campaign>>(new Map());
  
  // Modal states
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [showSelectedCampaignsModal, setShowSelectedCampaignsModal] = useState(false);
  
  // Local state for modal checkbox selections (only updates parent on Done)
  const [modalSelectedCampaignIds, setModalSelectedCampaignIds] = useState<Set<number>>(new Set());
  
  // Undo/redo state for selected campaigns modal
  // History can store either Set<number> (multiple mode) or number | null (single mode)
  const [campaignHistory, setCampaignHistory] = useState<(Set<number> | number | null)[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Fetch phases when client changes
  useEffect(() => {
    if (!selectedClientId) {
      setPhases([]);
      setLocalPhaseId('');
      onPhaseChange?.(null);
      return;
    }

    const fetchPhases = async () => {
      setLoadingPhases(true);
      try {
        const response = await api.get(`/phase?client_id=${selectedClientId}`);
        if (!response.ok) {
          if (response.status === 401) {
            return;
          }
          throw new Error('Failed to fetch phases');
        }
        const result = await response.json();
        const phasesList = result.phases || [];
        // Sort phases by name (natural/numeric sorting)
        phasesList.sort((a: Phase, b: Phase) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        setPhases(phasesList);
      } catch (error) {
        console.error('Error fetching phases:', error);
      } finally {
        setLoadingPhases(false);
      }
    };

    fetchPhases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClientId]);

  // Fetch campaigns when phase changes - but preserve selected campaigns
  useEffect(() => {
    if (!selectedPhaseId) {
      // Don't clear campaigns, just don't load new ones
      return;
    }

    const fetchCampaigns = async () => {
      setLoadingCampaigns(true);
      try {
        const response = await api.get(`/campaign/simple?phase_id=${selectedPhaseId}`);
        if (!response.ok) {
          if (response.status === 401) {
            return;
          }
          throw new Error('Failed to fetch campaigns');
        }
        const result = await response.json();
        const newCampaigns = result.campaigns || [];
        // Sort campaigns by name (natural/numeric sorting)
        newCampaigns.sort((a: Campaign, b: Campaign) => a.campaign_name.localeCompare(b.campaign_name, undefined, { numeric: true, sensitivity: 'base' }));
        setCampaigns(newCampaigns);
        
        // Update all campaigns map (for persistence across phases)
        const newMap = new Map(allCampaignsMap);
        newCampaigns.forEach((campaign: Campaign) => {
          newMap.set(campaign.id, campaign);
        });
        setAllCampaignsMap(newMap);
      } catch (error) {
        console.error('Error fetching campaigns:', error);
      } finally {
        setLoadingCampaigns(false);
      }
    };

    fetchCampaigns();
  }, [selectedPhaseId]);

  // Sync local phase ID with prop
  useEffect(() => {
    setLocalPhaseId(selectedPhaseId?.toString() || '');
  }, [selectedPhaseId]);

  // Sync local campaign ID with prop (single mode)
  useEffect(() => {
    setLocalCampaignId(selectedCampaignId?.toString() || '');
  }, [selectedCampaignId]);

  // Sync selected campaign IDs with prop (multiple mode)
  useEffect(() => {
    if (selectedCampaignIds && selectedCampaignIds.length > 0) {
      setSelectedCampaignIdsLocal(new Set(selectedCampaignIds));
      console.log('FilterSection - syncing selectedCampaignIds from prop:', selectedCampaignIds);
    } else {
      // Clear if null or empty array
      setSelectedCampaignIdsLocal(new Set());
      console.log('FilterSection - clearing selectedCampaignIds (received:', selectedCampaignIds, ')');
    }
  }, [selectedCampaignIds]);

  const handlePhaseChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    setLocalPhaseId(selectedId);
    onPhaseChange?.(selectedId ? parseInt(selectedId) : null);
    // Don't clear selected campaigns - they persist across phase changes
  };

  const handleCampaignChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    setLocalCampaignId(selectedId);
    // For single mode, also update campaign_ids as array for consistency
    if (selectedId) {
      const campaignId = parseInt(selectedId);
      console.log('Single mode - campaign selected:', campaignId);
      onCampaignChange?.(campaignId);
      onCampaignIdsChange?.([campaignId]); // Send as array [id]
    } else {
      console.log('Single mode - All campaigns selected (clearing selection)');
      onCampaignChange?.(null);
      onCampaignIdsChange?.(null); // Clear when "All campaigns" is selected
    }
  };

  const handleCampaignModeToggle = () => {
    const newMode = campaignMode === 'single' ? 'multiple' : 'single';
    setCampaignMode(newMode);
    
    // When switching to single mode, clear multiple selections
    if (newMode === 'single') {
      setSelectedCampaignIdsLocal(new Set());
      onCampaignIdsChange?.(null);
    } else {
      // When switching to multiple mode, clear single selection
      setLocalCampaignId('');
      onCampaignChange?.(null);
    }
  };

  const handleOpenCampaignModal = () => {
    // Initialize modal state with current selections
    setModalSelectedCampaignIds(new Set(selectedCampaignIdsLocal));
    setShowCampaignModal(true);
  };

  const handleCloseCampaignModal = () => {
    setShowCampaignModal(false);
  };

  const handleDoneInCampaignModal = () => {
    // Update parent state only when Done is clicked
    const campaignIdsArray = modalSelectedCampaignIds.size > 0 ? Array.from(modalSelectedCampaignIds) : null;
    console.log('Modal Done clicked - updating campaign_ids:', campaignIdsArray);
    setSelectedCampaignIdsLocal(modalSelectedCampaignIds);
    onCampaignIdsChange?.(campaignIdsArray);
    setShowCampaignModal(false);
  };

  const handleCampaignCheckboxChange = (campaignId: number, checked: boolean) => {
    // Only update local modal state - instant response
    const newSet = new Set(modalSelectedCampaignIds);
    if (checked) {
      newSet.add(campaignId);
    } else {
      newSet.delete(campaignId);
    }
    setModalSelectedCampaignIds(newSet);
  };

  const handleSelectAllCampaigns = () => {
    // Only update local modal state
    const allIds = new Set(campaigns.map(c => c.id));
    setModalSelectedCampaignIds(allIds);
  };

  const handleDeselectAllCampaigns = () => {
    // Only update local modal state
    setModalSelectedCampaignIds(new Set());
  };

  const handleOpenSelectedCampaignsModal = () => {
    if (campaignMode === 'single') {
      // For single mode, save the current campaign ID to history
      const currentCampaignId = localCampaignId ? parseInt(localCampaignId) : null;
      setCampaignHistory([...campaignHistory.slice(0, historyIndex + 1), currentCampaignId]);
      setHistoryIndex(historyIndex + 1);
    } else {
      // For multiple mode, save the current set to history
      setCampaignHistory([...campaignHistory.slice(0, historyIndex + 1), new Set(selectedCampaignIdsLocal)]);
      setHistoryIndex(historyIndex + 1);
    }
    setShowSelectedCampaignsModal(true);
  };

  const handleCloseSelectedCampaignsModal = () => {
    setShowSelectedCampaignsModal(false);
    // Reset history when closing
    setCampaignHistory([]);
    setHistoryIndex(-1);
  };

  const handleDeleteCampaignFromModal = (campaignId: number) => {
    if (campaignMode === 'single') {
      // For single mode, clear the selection
      if (historyIndex >= 0) {
        const newHistory = [...campaignHistory.slice(0, historyIndex + 1), null];
        setCampaignHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
      }
      setLocalCampaignId('');
      onCampaignChange?.(null);
    } else {
      // For multiple mode, remove from set
      if (historyIndex >= 0) {
        const newHistory = [...campaignHistory.slice(0, historyIndex + 1), new Set(selectedCampaignIdsLocal)];
        setCampaignHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
      }
      const newSet = new Set(selectedCampaignIdsLocal);
      newSet.delete(campaignId);
      setSelectedCampaignIdsLocal(newSet);
      onCampaignIdsChange?.(Array.from(newSet));
    }
  };

  const handleUndoInModal = () => {
    if (historyIndex > 0) {
      const previousState = campaignHistory[historyIndex - 1];
      if (campaignMode === 'single') {
        // For single mode, restore the campaign ID
        const campaignId = typeof previousState === 'number' ? previousState : null;
        setLocalCampaignId(campaignId?.toString() || '');
        onCampaignChange?.(campaignId);
      } else {
        // For multiple mode, restore the set
        const previousSet = previousState instanceof Set ? previousState : new Set<number>();
        setSelectedCampaignIdsLocal(previousSet);
        onCampaignIdsChange?.(Array.from(previousSet));
      }
      setHistoryIndex(historyIndex - 1);
    }
  };

  const handleApply = () => {
    const filters: any = {};

    if (startTime) {
      filters.start_time = format(startTime, 'yyyy-MM-dd HH:mm:ss');
    }
    if (endTime) {
      filters.end_time = format(endTime, 'yyyy-MM-dd HH:mm:ss');
    }
    if (conStatus !== null) {
      filters.con_status = conStatus;
    }
    if (direction) {
      filters.direction = direction;
    }
    if (language) {
      filters.language = language;
    }
    // Send duration range if either min or max is set
    if (durationMin > 0 || durationMax > 0) {
      // Convert to seconds: if unit is 'min', multiply by 60
      const multiplier = durationUnit === 'min' ? 60 : 1;
      if (durationMin > 0) {
        filters.duration_min = durationMin * multiplier;
      }
      if (durationMax > 0) {
        filters.duration_max = durationMax * multiplier;
      }
    }

    onApply(filters);
  };


  // Get selected campaign names for display
  const getSelectedCampaignNames = () => {
    return Array.from(selectedCampaignIdsLocal)
      .map(id => allCampaignsMap.get(id))
      .filter(Boolean)
      .map(c => c!.campaign_name);
  };

  const selectedCampaignNames = getSelectedCampaignNames();
  const selectedCampaignsCount = selectedCampaignIdsLocal.size;

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-sm p-6">
      <div className="flex items-center gap-2 mb-6">
        <Filter className="w-5 h-5 text-[var(--primary)]" />
        <h2 className="text-xl font-semibold text-[var(--foreground)]">
          Filter Controls
        </h2>
      </div>

      {/* Row 1: Time Range, Connection Status, Direction, Language */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {/* Time Range Box */}
        <div className="bg-[var(--input-bg)] border border-[var(--card-border)] rounded-lg p-4 space-y-3">
          <label className="text-sm font-semibold text-[var(--foreground)] block flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[var(--primary)]" />
            Time Range
          </label>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-[var(--secondary)] block mb-1">Start Time</label>
              <DatePicker
                selected={startTime}
                onChange={(date) => setStartTime(date)}
                showTimeSelect
                timeIntervals={1}
                dateFormat="yyyy-MM-dd HH:mm:ss"
                placeholderText="Select start time"
                className="w-full px-3 py-2 border border-[var(--input-border)] rounded-md bg-[var(--card-bg)] text-[var(--foreground)] text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-[var(--secondary)] block mb-1">End Time</label>
              <DatePicker
                selected={endTime}
                onChange={(date) => setEndTime(date)}
                showTimeSelect
                timeIntervals={1}
                dateFormat="yyyy-MM-dd HH:mm:ss"
                placeholderText="Select end time"
                className="w-full px-3 py-2 border border-[var(--input-border)] rounded-md bg-[var(--card-bg)] text-[var(--foreground)] text-sm"
              />
            </div>
          </div>
        </div>

        {/* Connection Status Box */}
        <div className="bg-[var(--input-bg)] border border-[var(--card-border)] rounded-lg p-4 space-y-3">
          <label className="text-sm font-semibold text-[var(--foreground)] block">
            Connection Status
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setConStatus(true)}
              className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                conStatus === true
                  ? 'bg-[var(--success)] text-white'
                  : 'bg-[var(--card-bg)] border border-[var(--input-border)] text-[var(--foreground)] hover:bg-[var(--table-row-hover)]'
              }`}
            >
              Connected
            </button>
            <button
              onClick={() => setConStatus(false)}
              className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                conStatus === false
                  ? 'bg-[var(--danger)] text-white'
                  : 'bg-[var(--card-bg)] border border-[var(--input-border)] text-[var(--foreground)] hover:bg-[var(--table-row-hover)]'
              }`}
            >
              Disconnected
            </button>
            <button
              onClick={() => setConStatus(null)}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                conStatus === null
                  ? 'bg-[var(--secondary)] text-white'
                  : 'bg-[var(--card-bg)] border border-[var(--input-border)] text-[var(--foreground)] hover:bg-[var(--table-row-hover)]'
              }`}
            >
              All
            </button>
          </div>
        </div>

        {/* Direction Box */}
        <div className="bg-[var(--input-bg)] border border-[var(--card-border)] rounded-lg p-4 space-y-3">
          <label className="text-sm font-semibold text-[var(--foreground)] block">
            Direction
          </label>
          <div className="relative">
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              className="w-full px-3 py-2 pr-8 border border-[var(--input-border)] rounded-md bg-[var(--card-bg)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] appearance-none"
            >
              <option value="">All directions</option>
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--secondary)] pointer-events-none" />
          </div>
        </div>

        {/* Language Box */}
        <div className="bg-[var(--input-bg)] border border-[var(--card-border)] rounded-lg p-4 space-y-3">
          <label className="text-sm font-semibold text-[var(--foreground)] block">
            Language
          </label>
          <div className="relative">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-3 py-2 pr-8 border border-[var(--input-border)] rounded-md bg-[var(--card-bg)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] appearance-none"
            >
              <option value="">All languages</option>
              <option value="hi">Hindi (hi)</option>
              <option value="te">Telugu (te)</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--secondary)] pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Row 2: Duration, Phase, Campaign (merged 2-4), Selected Campaigns View */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Duration Box */}
        <div className="bg-[var(--input-bg)] border border-[var(--card-border)] rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-[var(--foreground)] block flex items-center gap-2">
              <Clock className="w-4 h-4 text-[var(--primary)]" />
              Duration
            </label>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium ${durationUnit === 'sec' ? 'text-[var(--primary)]' : 'text-[var(--secondary)]'}`}>
                sec
              </span>
              <button
                onClick={() => setDurationUnit(durationUnit === 'sec' ? 'min' : 'sec')}
                className="flex items-center gap-1"
              >
                {durationUnit === 'min' ? (
                  <ToggleRight className="w-5 h-5 text-[var(--primary)]" />
                ) : (
                  <ToggleLeft className="w-5 h-5 text-[var(--secondary)]" />
                )}
              </button>
              <span className={`text-xs font-medium ${durationUnit === 'min' ? 'text-[var(--primary)]' : 'text-[var(--secondary)]'}`}>
                min
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-[var(--secondary)] block mb-1">Min</label>
              <input
                type="number"
                value={durationMin || ''}
                onChange={(e) => setDurationMin(Number(e.target.value))}
                placeholder="Min"
                className="w-full px-3 py-2 border border-[var(--input-border)] rounded-md bg-[var(--card-bg)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-[var(--secondary)] block mb-1">Max</label>
              <input
                type="number"
                value={durationMax || ''}
                onChange={(e) => setDurationMax(Number(e.target.value))}
                placeholder="Max"
                className="w-full px-3 py-2 border border-[var(--input-border)] rounded-md bg-[var(--card-bg)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              />
            </div>
          </div>
        </div>

        {/* Phase Box */}
        <div className="bg-[var(--input-bg)] border border-[var(--card-border)] rounded-lg p-4 space-y-3">
          <label className="text-sm font-semibold text-[var(--foreground)] block">
            Phase
          </label>
          <div className="relative">
            <select
              value={localPhaseId}
              onChange={handlePhaseChange}
              className="w-full px-3 py-2 pr-8 border border-[var(--input-border)] rounded-md bg-[var(--card-bg)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loadingPhases || !selectedClientId}
            >
              <option value="">
                {!selectedClientId 
                  ? 'Select client first' 
                  : loadingPhases 
                    ? 'Loading...' 
                    : 'All phases'}
              </option>
              {phases.map((phase) => (
                <option key={phase.id} value={phase.id}>
                  {phase.name}
                </option>
              ))}
            </select>
            {loadingPhases && (
              <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--secondary)] animate-spin" />
            )}
            {!loadingPhases && (
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--secondary)] pointer-events-none" />
            )}
          </div>
        </div>

        {/* Campaign Box - Single column */}
        <div className="bg-[var(--input-bg)] border border-[var(--card-border)] rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold text-[var(--foreground)] block">
              Campaign
            </label>
            <button
              onClick={handleCampaignModeToggle}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-[var(--card-bg)] border border-[var(--input-border)] text-[var(--foreground)] hover:bg-[var(--table-row-hover)] transition-colors"
              title={campaignMode === 'single' ? 'Switch to multiple selection' : 'Switch to single selection'}
            >
              <span>{campaignMode === 'single' ? 'Single' : 'Multiple'}</span>
              {campaignMode === 'single' ? (
                <ToggleLeft className="w-4 h-4" />
              ) : (
                <ToggleRight className="w-4 h-4 text-[var(--primary)]" />
              )}
            </button>
          </div>
          
          {campaignMode === 'single' ? (
            <div className="relative">
              <select
                value={localCampaignId}
                onChange={handleCampaignChange}
                className="w-full px-3 py-2 pr-8 border border-[var(--input-border)] rounded-md bg-[var(--card-bg)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={loadingCampaigns || !selectedPhaseId}
              >
                <option value="">
                  {!selectedPhaseId 
                    ? 'Select phase first' 
                    : loadingCampaigns 
                      ? 'Loading...' 
                      : 'All campaigns'}
                </option>
                {[...campaigns].sort((a, b) => a.campaign_name.localeCompare(b.campaign_name, undefined, { numeric: true, sensitivity: 'base' })).map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.campaign_name}
                  </option>
                ))}
              </select>
              {loadingCampaigns && (
                <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--secondary)] animate-spin" />
              )}
              {!loadingCampaigns && (
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--secondary)] pointer-events-none" />
              )}
            </div>
          ) : (
            <button
              onClick={handleOpenCampaignModal}
              disabled={loadingCampaigns || !selectedPhaseId}
              className="w-full px-3 py-2 border border-[var(--input-border)] rounded-md bg-[var(--card-bg)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--table-row-hover)] transition-colors flex items-center justify-between"
            >
              <span>
                {selectedCampaignsCount > 0 
                  ? `${selectedCampaignsCount} campaign${selectedCampaignsCount > 1 ? 's' : ''} selected`
                  : !selectedPhaseId 
                    ? 'Select phase first' 
                    : loadingCampaigns 
                      ? 'Loading...' 
                      : 'Select campaigns'}
              </span>
              <ChevronDown className="w-4 h-4 text-[var(--secondary)]" />
            </button>
          )}
        </div>

        {/* Selected Campaigns View - Always visible for both single and multiple */}
        <div className="bg-[var(--input-bg)] border border-[var(--card-border)] rounded-lg p-4 space-y-3">
          <label className="text-sm font-semibold text-[var(--foreground)] block">
            Selected Campaigns
          </label>
          <div className="space-y-2">
            {campaignMode === 'single' ? (
              // Single mode: show selected campaign if any
              localCampaignId ? (
                <>
                  {(() => {
                    const campaign = campaigns.find(c => c.id.toString() === localCampaignId) || 
                                   Array.from(allCampaignsMap.values()).find(c => c.id.toString() === localCampaignId);
                    return campaign ? (
                      <>
                        <div className="text-xs text-[var(--secondary)] mb-2">
                          1 campaign selected
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-[var(--card-bg)] border border-[var(--input-border)] rounded text-[var(--foreground)]">
                            {campaign.campaign_name}
                          </span>
                        </div>
                        <button
                          onClick={handleOpenSelectedCampaignsModal}
                          className="w-full px-3 py-2 text-sm border border-[var(--input-border)] rounded-md bg-[var(--card-bg)] text-[var(--foreground)] hover:bg-[var(--table-row-hover)] transition-colors flex items-center justify-center gap-2"
                        >
                          <Eye className="w-4 h-4" />
                          View
                        </button>
                      </>
                    ) : null;
                  })()}
                </>
              ) : (
                <div className="text-xs text-[var(--secondary)] text-center py-2">
                  No campaign selected
                </div>
              )
            ) : (
              // Multiple mode: show selected campaigns
              selectedCampaignsCount > 0 ? (
                <>
                  <div className="text-xs text-[var(--secondary)]">
                    {selectedCampaignsCount} campaign{selectedCampaignsCount > 1 ? 's' : ''} selected
                  </div>
                  <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                    {Array.from(selectedCampaignIdsLocal).slice(0, 3).map((id) => {
                      const campaign = allCampaignsMap.get(id);
                      return campaign ? (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-[var(--card-bg)] border border-[var(--input-border)] rounded text-[var(--foreground)]"
                        >
                          {campaign.campaign_name}
                        </span>
                      ) : null;
                    })}
                    {selectedCampaignsCount > 3 && (
                      <span className="inline-flex items-center px-2 py-1 text-xs text-[var(--secondary)]">
                        +{selectedCampaignsCount - 3} more
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleOpenSelectedCampaignsModal}
                    className="w-full px-3 py-2 text-sm border border-[var(--input-border)] rounded-md bg-[var(--card-bg)] text-[var(--foreground)] hover:bg-[var(--table-row-hover)] transition-colors flex items-center justify-center gap-2"
                  >
                    <Eye className="w-4 h-4" />
                    View All
                  </button>
                </>
              ) : (
                <div className="text-xs text-[var(--secondary)] text-center py-2">
                  No campaigns selected
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* Campaign Selection Modal */}
      {showCampaignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-lg max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-[var(--card-border)]">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">Select Campaigns</h3>
              <button
                onClick={handleCloseCampaignModal}
                className="text-[var(--secondary)] hover:text-[var(--foreground)] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {loadingCampaigns ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-[var(--primary)]" />
                </div>
              ) : campaigns.length === 0 ? (
                <div className="text-center py-8 text-[var(--secondary)]">
                  No campaigns available
                </div>
              ) : (
                <>
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={handleSelectAllCampaigns}
                      className="px-3 py-1.5 text-sm border border-[var(--input-border)] rounded-md bg-[var(--card-bg)] text-[var(--foreground)] hover:bg-[var(--table-row-hover)] transition-colors"
                    >
                      Select All
                    </button>
                    <button
                      onClick={handleDeselectAllCampaigns}
                      className="px-3 py-1.5 text-sm border border-[var(--input-border)] rounded-md bg-[var(--card-bg)] text-[var(--foreground)] hover:bg-[var(--table-row-hover)] transition-colors"
                    >
                      Deselect All
                    </button>
                  </div>
                  <div className="space-y-2">
                    {[...campaigns].sort((a, b) => a.campaign_name.localeCompare(b.campaign_name, undefined, { numeric: true, sensitivity: 'base' })).map((campaign) => {
                      const isChecked = modalSelectedCampaignIds.has(campaign.id);
                      return (
                        <label
                          key={campaign.id}
                          className="flex items-center gap-3 p-3 border border-[var(--input-border)] rounded-md hover:bg-[var(--table-row-hover)] cursor-pointer transition-colors group"
                        >
                          <div className="relative flex items-center flex-shrink-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => handleCampaignCheckboxChange(campaign.id, e.target.checked)}
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
                          <span className="text-sm text-[var(--foreground)] flex-1">
                            {campaign.campaign_name}
                          </span>
                          <span className="text-xs text-[var(--secondary)]">
                            ID: {campaign.id}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-[var(--card-border)]">
              <button
                onClick={handleCloseCampaignModal}
                className="px-4 py-2 text-sm font-medium border border-[var(--input-border)] rounded-md bg-[var(--card-bg)] text-[var(--foreground)] hover:bg-[var(--table-row-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDoneInCampaignModal}
                className="px-4 py-2 text-sm font-medium bg-[var(--primary)] text-white rounded-md hover:bg-[var(--primary-hover)] transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Selected Campaigns View Modal */}
      {showSelectedCampaignsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-lg max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-[var(--card-border)]">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">Selected Campaigns</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleUndoInModal}
                  disabled={historyIndex <= 0}
                  className="p-1.5 text-[var(--secondary)] hover:text-[var(--foreground)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Undo"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
                <button
                  onClick={handleCloseSelectedCampaignsModal}
                  className="text-[var(--secondary)] hover:text-[var(--foreground)] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {campaignMode === 'single' ? (
                // Single mode: show the selected campaign
                localCampaignId ? (
                  (() => {
                    const campaignId = parseInt(localCampaignId);
                    const campaign = campaigns.find(c => c.id === campaignId) || 
                                   Array.from(allCampaignsMap.values()).find(c => c.id === campaignId);
                    return campaign ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between p-3 border border-[var(--input-border)] rounded-md hover:bg-[var(--table-row-hover)] transition-colors">
                          <div className="flex-1">
                            <div className="text-sm font-medium text-[var(--foreground)]">
                              {campaign.campaign_name}
                            </div>
                            <div className="text-xs text-[var(--secondary)]">
                              ID: {campaign.id}
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteCampaignFromModal(campaign.id)}
                            className="p-1.5 text-[var(--danger)] hover:bg-[var(--danger)] hover:text-white rounded transition-colors"
                            title="Clear selection"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-[var(--secondary)]">
                        Campaign not found
                      </div>
                    );
                  })()
                ) : (
                  <div className="text-center py-8 text-[var(--secondary)]">
                    No campaign selected
                  </div>
                )
              ) : (
                // Multiple mode: show all selected campaigns
                selectedCampaignsCount === 0 ? (
                  <div className="text-center py-8 text-[var(--secondary)]">
                    No campaigns selected
                  </div>
                ) : (
                  <div className="space-y-2">
                    {Array.from(selectedCampaignIdsLocal)
                      .map((id) => allCampaignsMap.get(id))
                      .filter((campaign): campaign is Campaign => campaign !== undefined)
                      .sort((a, b) => a.campaign_name.localeCompare(b.campaign_name, undefined, { numeric: true, sensitivity: 'base' }))
                      .map((campaign) => (
                        <div
                          key={campaign.id}
                          className="flex items-center justify-between p-3 border border-[var(--input-border)] rounded-md hover:bg-[var(--table-row-hover)] transition-colors"
                        >
                          <div className="flex-1">
                            <div className="text-sm font-medium text-[var(--foreground)]">
                              {campaign.campaign_name}
                            </div>
                            <div className="text-xs text-[var(--secondary)]">
                              ID: {campaign.id}
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteCampaignFromModal(campaign.id)}
                            className="p-1.5 text-[var(--danger)] hover:bg-[var(--danger)] hover:text-white rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                  </div>
                )
              )}
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-[var(--card-border)]">
              <button
                onClick={handleCloseSelectedCampaignsModal}
                className="px-4 py-2 text-sm font-medium bg-[var(--primary)] text-white rounded-md hover:bg-[var(--primary-hover)] transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-between items-center pt-4 border-t border-[var(--card-border)]">
        <div className="flex items-center gap-3">
          {onCleanCD && (
            <button
              onClick={onCleanCD}
              disabled={loadingCleanCD}
              className="group relative px-6 py-2.5 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-md font-medium flex items-center gap-2 overflow-hidden transition-all duration-300 hover:from-purple-600 hover:to-purple-700 hover:shadow-lg hover:shadow-purple-500/50 hover:scale-105 active:scale-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
            >
              {/* Animated background shimmer */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out"></div>
              
              {/* Brush icon with animation */}
              <Paintbrush className={`w-5 h-5 relative z-10 transition-all duration-300 ${loadingCleanCD ? 'brush-cleaning' : 'group-hover:-rotate-45 group-hover:scale-110'}`} />
              
              {/* Button text */}
              <span className="relative z-10">{loadingCleanCD ? 'Cleaning...' : 'Clean CD'}</span>
              
              {/* Glow effect on hover */}
              <div className="absolute inset-0 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-purple-400/20 via-purple-500/30 to-purple-400/20 blur-sm"></div>
            </button>
          )}
          {onClearTD && (
            <button
              onClick={onClearTD}
              disabled={loadingClearTD}
              className="group relative px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white rounded-md font-medium flex items-center gap-2 overflow-hidden transition-all duration-300 hover:from-indigo-600 hover:to-indigo-700 hover:shadow-lg hover:shadow-indigo-500/50 hover:scale-105 active:scale-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
            >
              {/* Animated background shimmer */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out"></div>
              
              {/* Spool icon with bounce animation */}
              <Spool className="w-5 h-5 relative z-10 transition-all duration-200 group-hover:animate-bounce group-hover:scale-110" />
              
              {/* Button text */}
              <span className="relative z-10">{loadingClearTD ? 'Clearing...' : 'Clear TD'}</span>
              
              {/* Glow effect on hover */}
              <div className="absolute inset-0 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-indigo-400/20 via-indigo-500/30 to-indigo-400/20 blur-sm"></div>
            </button>
          )}
        </div>
        <button
          onClick={handleApply}
          disabled={loading}
          className="group relative px-6 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-md font-medium flex items-center gap-2 overflow-hidden transition-all duration-300 hover:from-blue-600 hover:to-blue-700 hover:shadow-lg hover:shadow-blue-500/50 hover:scale-105 active:scale-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
        >
          {/* Animated background shimmer */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out"></div>
          
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin relative z-10" />
              <span className="relative z-10">Loading...</span>
            </>
          ) : (
            <>
              {/* Filter icon with injection-to-ground animation */}
              <Filter className="w-5 h-5 relative z-10 filter-inject-icon" />
              {/* Button text */}
              <span className="relative z-10">Apply Filters</span>
            </>
          )}
          
          {/* Glow effect on hover */}
          <div className="absolute inset-0 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-blue-400/20 via-blue-500/30 to-blue-400/20 blur-sm"></div>
        </button>
      </div>
    </div>
  );
}
