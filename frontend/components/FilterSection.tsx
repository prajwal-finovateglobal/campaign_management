'use client';

import { useState, useEffect } from 'react';
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
  Loader2
} from 'lucide-react';

interface FilterSectionProps {
  onApply: (filters: any) => void;
  loading: boolean;
  selectedClientId?: number | null;
  selectedPhaseId?: number | null;
  selectedCampaignId?: number | null;
  onPhaseChange?: (phaseId: number | null) => void;
  onCampaignChange?: (campaignId: number | null) => void;
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
  onPhaseChange,
  onCampaignChange 
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
          throw new Error('Failed to fetch phases');
        }
        const result = await response.json();
        setPhases(result.phases || []);
      } catch (error) {
        console.error('Error fetching phases:', error);
      } finally {
        setLoadingPhases(false);
      }
    };

    fetchPhases();
  }, [selectedClientId, onPhaseChange]);

  // Fetch campaigns when phase changes
  useEffect(() => {
    if (!selectedPhaseId) {
      setCampaigns([]);
      setLocalCampaignId('');
      onCampaignChange?.(null);
      return;
    }

    const fetchCampaigns = async () => {
      setLoadingCampaigns(true);
      try {
        const response = await api.get(`/campaign/simple?phase_id=${selectedPhaseId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch campaigns');
        }
        const result = await response.json();
        setCampaigns(result.campaigns || []);
      } catch (error) {
        console.error('Error fetching campaigns:', error);
      } finally {
        setLoadingCampaigns(false);
      }
    };

    fetchCampaigns();
  }, [selectedPhaseId, onCampaignChange]);

  // Sync local phase ID with prop
  useEffect(() => {
    setLocalPhaseId(selectedPhaseId?.toString() || '');
  }, [selectedPhaseId]);

  // Sync local campaign ID with prop
  useEffect(() => {
    setLocalCampaignId(selectedCampaignId?.toString() || '');
  }, [selectedCampaignId]);

  const handlePhaseChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    setLocalPhaseId(selectedId);
    onPhaseChange?.(selectedId ? parseInt(selectedId) : null);
  };

  const handleCampaignChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    setLocalCampaignId(selectedId);
    onCampaignChange?.(selectedId ? parseInt(selectedId) : null);
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

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-sm p-6">
      <div className="flex items-center gap-2 mb-6">
        <Filter className="w-5 h-5 text-[var(--primary)]" />
        <h2 className="text-xl font-semibold text-[var(--foreground)]">
          Filter Controls
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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

        {/* Campaign Box */}
        <div className="bg-[var(--input-bg)] border border-[var(--card-border)] rounded-lg p-4 space-y-3">
          <label className="text-sm font-semibold text-[var(--foreground)] block">
            Campaign
          </label>
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
              {campaigns.map((campaign) => (
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
        </div>
      </div>

      {/* Apply Button */}
      <div className="flex justify-end pt-4 border-t border-[var(--card-border)]">
        <button
          onClick={handleApply}
          disabled={loading}
          className="px-6 py-2.5 bg-[var(--primary)] text-white rounded-md hover:bg-[var(--primary-hover)] transition-colors font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading...
            </>
          ) : (
            <>
              <Filter className="w-5 h-5" />
              Apply Filters
            </>
          )}
        </button>
      </div>
    </div>
  );
}

