'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

interface Client {
  id: number;
  name: string;
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
  phase_id: number;
  cid?: string | null;
}

interface PersistentFiltersProps {
  onClientChange?: (clientId: number | null, tableName: string | null) => void;
  onPhaseChange?: (phaseId: number | null) => void;
  onCampaignChange?: (campaignId: number | null) => void;
  showCampaign?: boolean;
}

export function PersistentFilters({ 
  onClientChange, 
  onPhaseChange, 
  onCampaignChange,
  showCampaign = true
}: PersistentFiltersProps) {
  const [clientId, setClientId] = useState<string>('');
  const [clientTableName, setClientTableName] = useState<string>('');
  const [phaseId, setPhaseId] = useState<string>('');
  const [campaignId, setCampaignId] = useState<string>('');
  
  const [clients, setClients] = useState<Client[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  
  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingPhases, setLoadingPhases] = useState(false);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);

  // Auto-load clients on component mount
  useEffect(() => {
    const fetchClients = async () => {
      setLoadingClients(true);
      try {
        const response = await api.get('/client');
        if (!response.ok) {
          throw new Error('Failed to fetch clients');
        }
        const result = await response.json();
        setClients(result.clients || []);
      } catch (error) {
        console.error('Error fetching clients:', error);
        alert('Failed to fetch clients. Please check if the backend is running.');
      } finally {
        setLoadingClients(false);
      }
    };

    fetchClients();
  }, []);

  // Auto-fetch phases when client is selected
  useEffect(() => {
    if (!clientId) {
      setPhases([]);
      setPhaseId('');
      return;
    }

    const fetchPhases = async () => {
      setLoadingPhases(true);
      try {
        const response = await api.get(`/phase?client_id=${clientId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch phases');
        }
        const result = await response.json();
        setPhases(result.phases || []);
      } catch (error) {
        console.error('Error fetching phases:', error);
        alert('Failed to fetch phases. Please check if the backend is running.');
      } finally {
        setLoadingPhases(false);
      }
    };

    fetchPhases();
  }, [clientId]);

  // Auto-fetch campaigns when phase is selected
  useEffect(() => {
    if (!phaseId) {
      setCampaigns([]);
      setCampaignId('');
      return;
    }

    const fetchCampaigns = async () => {
      setLoadingCampaigns(true);
      try {
        const response = await api.get(`/campaign?phase_id=${phaseId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch campaigns');
        }
        const result = await response.json();
        setCampaigns(result.campaigns || []);
      } catch (error) {
        console.error('Error fetching campaigns:', error);
        alert('Failed to fetch campaigns. Please check if the backend is running.');
      } finally {
        setLoadingCampaigns(false);
      }
    };

    fetchCampaigns();
  }, [phaseId]);

  const handleClientChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    setClientId(selectedId);
    
    // Reset phase and campaign when client changes
    setPhaseId('');
    setCampaignId('');
    
    // Find the selected client to get its table_name
    const selectedClient = clients.find(c => c.id.toString() === selectedId);
    if (selectedClient) {
      setClientTableName(selectedClient.table_name);
      onClientChange?.(parseInt(selectedId), selectedClient.table_name);
    } else {
      setClientTableName('');
      onClientChange?.(null, null);
    }
  };

  const handlePhaseChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    setPhaseId(selectedId);
    
    // Reset campaign when phase changes
    setCampaignId('');
    
    onPhaseChange?.(selectedId ? parseInt(selectedId) : null);
  };

  const handleCampaignChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    setCampaignId(selectedId);
    onCampaignChange?.(selectedId ? parseInt(selectedId) : null);
  };

  return (
    <div className="flex gap-2 items-end flex-shrink-0 flex-wrap max-w-full" style={{ maxWidth: 'calc(100vw - 2rem)' }}>
      {/* Client Selection */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-[var(--foreground)] block">
          Client
        </label>
        <div className="relative">
          <select
            value={clientId}
            onChange={handleClientChange}
            className="w-40 px-2.5 py-1.5 pr-7 border border-[var(--input-border)] rounded-md bg-[var(--input-bg)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loadingClients || clients.length === 0}
          >
            <option value="">{loadingClients ? 'Loading...' : 'Select client'}</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name} (ID: {client.id})
              </option>
            ))}
          </select>
          {loadingClients && (
            <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--secondary)] animate-spin" />
          )}
          {!loadingClients && (
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--secondary)] pointer-events-none" />
          )}
        </div>
      </div>

      {/* Phase Selection */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-[var(--foreground)] block">
          Phase
        </label>
        <div className="relative">
          <select
            value={phaseId}
            onChange={handlePhaseChange}
            className="w-40 px-2.5 py-1.5 pr-7 border border-[var(--input-border)] rounded-md bg-[var(--input-bg)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!clientId || loadingPhases}
          >
            <option value="">
              {!clientId 
                ? 'Select client first' 
                : loadingPhases 
                  ? 'Loading...' 
                  : 'Select phase'}
            </option>
            {phases.map((phase) => (
              <option key={phase.id} value={phase.id}>
                {phase.name} (ID: {phase.id})
              </option>
            ))}
          </select>
          {loadingPhases && (
            <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--secondary)] animate-spin" />
          )}
          {!loadingPhases && (
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--secondary)] pointer-events-none" />
          )}
        </div>
      </div>

      {/* Campaign Selection - only show if showCampaign is true */}
      {showCampaign && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-[var(--foreground)] block">
            Campaign
          </label>
          <div className="relative" style={{ position: 'relative' }}>
            <select
              value={campaignId}
              onChange={handleCampaignChange}
              className="w-[416px] px-2.5 py-1.5 pr-7 border border-[var(--input-border)] rounded-md bg-[var(--input-bg)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!phaseId || loadingCampaigns}
            >
              <option value="">
                {!phaseId 
                  ? 'Select phase first' 
                  : loadingCampaigns 
                    ? 'Loading...' 
                    : 'Select campaign'}
              </option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.campaign_name} (ID: {campaign.id})
                </option>
              ))}
            </select>
            {loadingCampaigns && (
              <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--secondary)] animate-spin" />
            )}
            {!loadingCampaigns && (
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--secondary)] pointer-events-none" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

