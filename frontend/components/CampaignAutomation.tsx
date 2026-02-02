'use client';

import { useState } from 'react';
import { 
  Play, 
  Pause, 
  Clock, 
  Zap, 
  Activity, 
  GitBranch, 
  Database,
  ChevronDown,
  ChevronUp,
  Plus,
  Settings,
  X,
  Circle,
  RotateCw
} from 'lucide-react';

interface CampaignAutomationProps {}

// Mock data structure
type CampaignStatus = 'queued' | 'running' | 'completed';
type HealthStatus = 'healthy' | 'degraded' | 'stalled';

interface ActiveItem {
  id?: string;
  name: string;
  lot: number;
  phase: number;
  campaign: string;
  progress: number;
  eta: string;
  priority: 'high' | 'medium' | 'low';
  status: CampaignStatus;
  health: HealthStatus;
  tasks?: number;
  items?: number;
  records?: number;
  lastUpdate: string;
  defaultConfigName?: string;
  enableDisposition?: boolean;
  enableDataManager?: boolean;
  batchSize?: number;
  maxPhases?: number;
}

interface UpcomingItem {
  id?: string;
  name: string;
  lot: number;
  phase: number;
  sourceCampaign: string;
  priority: 'high' | 'medium' | 'low';
  status: CampaignStatus;
  health: HealthStatus;
  defaultConfigName?: string;
  enableDisposition?: boolean;
  enableDataManager?: boolean;
  batchSize?: number;
  maxPhases?: number;
}

interface CampaignConfig {
  enableDisposition: boolean;
  enableDataManager: boolean;
  batchSize: number;
  maxPhases: number;
  priority: 'high' | 'medium' | 'low';
}

export function CampaignAutomation({}: CampaignAutomationProps) {
  const [expandedSections, setExpandedSections] = useState({
    campaign: true,
    disposition: true,
    dataManager: true
  });

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<ActiveItem | UpcomingItem | null>(null);
  const [createStep, setCreateStep] = useState(1);
  const [useDefaultConfig, setUseDefaultConfig] = useState(true);
  
  // Awake states
  const [showAwakeModal, setShowAwakeModal] = useState(false);
  const [awakeTarget, setAwakeTarget] = useState<{ type: 'campaign' | 'disposition' | 'datamanager'; item: ActiveItem | UpcomingItem } | null>(null);
  const [awakeLoading, setAwakeLoading] = useState(false);

  // Form states for create
  const [createForm, setCreateForm] = useState({
    name: '',
    lotId: '',
    priority: 'medium' as 'high' | 'medium' | 'low',
    config: {
      enableDisposition: true,
      enableDataManager: true,
      batchSize: 100,
      maxPhases: 10,
      priority: 'medium' as 'high' | 'medium' | 'low'
    }
  });

  // Form states for edit
  const [editForm, setEditForm] = useState<CampaignConfig>({
    enableDisposition: true,
    enableDataManager: true,
    batchSize: 100,
    maxPhases: 10,
    priority: 'medium'
  });

  const toggleSection = (section: 'campaign' | 'disposition' | 'dataManager') => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleCreateCampaign = () => {
    setShowCreateModal(true);
    setCreateStep(1);
    setUseDefaultConfig(true);
    setCreateForm({
      name: '',
      lotId: '',
      priority: 'medium',
      config: {
        enableDisposition: true,
        enableDataManager: true,
        batchSize: 100,
        maxPhases: 10,
        priority: 'medium'
      }
    });
  };

  const handleEditCampaign = (campaign: ActiveItem | UpcomingItem) => {
    if (campaign.status === 'queued') {
      setEditingCampaign(campaign);
      setEditForm({
        enableDisposition: campaign.enableDisposition ?? true,
        enableDataManager: campaign.enableDataManager ?? true,
        batchSize: campaign.batchSize ?? 100,
        maxPhases: campaign.maxPhases ?? 10,
        priority: campaign.priority
      });
      setShowEditModal(true);
    }
  };

  const handleSaveCreate = () => {
    // In production, this would call an API
    console.log('Creating campaign:', createForm);
    setShowCreateModal(false);
    setCreateStep(1);
  };

  const handleSaveEdit = () => {
    if (editingCampaign && editingCampaign.status === 'queued') {
      // In production, this would call an API
      console.log('Updating campaign config:', editForm);
      setShowEditModal(false);
      setEditingCampaign(null);
    }
  };

  const getHealthIcon = (health: HealthStatus) => {
    switch (health) {
      case 'healthy':
        return (
          <div className="relative inline-flex items-center justify-center">
            <Circle className="w-3 h-3 text-emerald-500 fill-emerald-500 health-pulse" />
            <Circle className="w-3 h-3 text-emerald-500 fill-emerald-500 absolute health-ping" />
          </div>
        );
      case 'degraded':
        return <Circle className="w-3 h-3 text-amber-500 fill-amber-500" />;
      case 'stalled':
        return <Circle className="w-3 h-3 text-red-500 fill-red-500" />;
    }
  };

  const getHealthTooltip = (health: HealthStatus) => {
    switch (health) {
      case 'healthy':
        return 'All stages reporting heartbeat';
      case 'degraded':
        return 'One stage delayed';
      case 'stalled':
        return 'Heartbeat timeout exceeded';
    }
  };

  const handleAwakeClick = (type: 'campaign' | 'disposition' | 'datamanager', item: ActiveItem | UpcomingItem) => {
    // Only allow awake for running/queued with degraded/stalled health
    if ((item.status === 'running' || item.status === 'queued') && 
        (item.health === 'degraded' || item.health === 'stalled')) {
      setAwakeTarget({ type, item });
      setShowAwakeModal(true);
    }
  };

  const handleAwakeConfirm = async () => {
    if (!awakeTarget) return;
    
    setAwakeLoading(true);
    try {
      // In production, this would call the backend awake endpoint
      // await fetch(`/api/automation/${awakeTarget.type}/${awakeTarget.item.id}/awake`, { method: 'POST' });
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Update health status (in production, this would come from the API response)
      // For now, we'll simulate improvement
      console.log(`Awaking ${awakeTarget.type} ${awakeTarget.item.id}`);
      
      // Close modal and reset
      setShowAwakeModal(false);
      setAwakeTarget(null);
      
      // In production, refresh the data here
      // The health status would be updated from the API response
    } catch (error) {
      console.error('Awake failed:', error);
      // Show error message (would be handled by error state in production)
    } finally {
      setAwakeLoading(false);
    }
  };

  const getAwakeTooltip = (type: 'campaign' | 'disposition' | 'datamanager') => {
    switch (type) {
      case 'campaign':
        return 'Rechecks status and resumes execution from last safe point.';
      case 'disposition':
        return 'Resumes from last processed cursor.';
      case 'datamanager':
        return 'Resumes from last completed step.';
    }
  };

  const canAwake = (item: ActiveItem | UpcomingItem) => {
    return (item.status === 'running' || item.status === 'queued') && 
           (item.health === 'degraded' || item.health === 'stalled');
  };

  // Mock data
  const activeCampaign: ActiveItem = {
    id: 'camp-1',
    name: 'Summer Product Launch',
    lot: 3,
    phase: 2,
    campaign: 'C7',
    progress: 65,
    eta: '32 min',
    priority: 'high',
    status: 'running',
    health: 'healthy',
    tasks: 1247,
    lastUpdate: '2 min ago',
    enableDisposition: true,
    enableDataManager: true,
    batchSize: 100,
    maxPhases: 10
  };

  const upcomingCampaigns: UpcomingItem[] = [
    { 
      id: 'camp-2',
      name: 'Q4 Outreach', 
      lot: 4, 
      phase: 1, 
      sourceCampaign: 'C8', 
      priority: 'medium',
      status: 'queued',
      health: 'healthy',
      defaultConfigName: 'Standard Config',
      enableDisposition: true,
      enableDataManager: true,
      batchSize: 100,
      maxPhases: 10
    },
    { 
      id: 'camp-3',
      name: 'Holiday Campaign', 
      lot: 2, 
      phase: 3, 
      sourceCampaign: 'C5', 
      priority: 'high',
      status: 'queued',
      health: 'degraded',
      enableDisposition: true,
      enableDataManager: false,
      batchSize: 150,
      maxPhases: 8
    },
    { 
      id: 'camp-4',
      name: 'Winter Follow-up', 
      lot: 5, 
      phase: 1, 
      sourceCampaign: 'C9', 
      priority: 'low',
      status: 'queued',
      health: 'healthy',
      defaultConfigName: 'Standard Config'
    }
  ];

  const activeDisposition: ActiveItem = {
    id: 'disp-1',
    name: 'Spring Campaign Disposition',
    lot: 1,
    phase: 1,
    campaign: 'C3',
    progress: 80,
    eta: '12 min',
    priority: 'high',
    status: 'running',
    health: 'healthy',
    items: 3420,
    lastUpdate: '1 min ago'
  };

  const upcomingDispositions: UpcomingItem[] = [
    { 
      id: 'disp-2',
      name: 'Q3 Disposition', 
      lot: 2, 
      phase: 1, 
      sourceCampaign: 'C5', 
      priority: 'medium',
      status: 'queued',
      health: 'healthy'
    },
    { 
      id: 'disp-3',
      name: 'Follow-up Disposition', 
      lot: 4, 
      phase: 2, 
      sourceCampaign: 'C8', 
      priority: 'low',
      status: 'queued',
      health: 'healthy'
    }
  ];

  const activeDataManager: ActiveItem = {
    id: 'dm-1',
    name: 'Data Processing Pipeline',
    lot: 2,
    phase: 1,
    campaign: 'C5',
    progress: 45,
    eta: '18 min',
    priority: 'medium',
    status: 'running',
    health: 'degraded',
    records: 85420,
    lastUpdate: '3 min ago'
  };

  const upcomingDataManagers: UpcomingItem[] = [
    { 
      id: 'dm-2',
      name: 'Archive Processing', 
      lot: 3, 
      phase: 2, 
      sourceCampaign: 'C7', 
      priority: 'low',
      status: 'queued',
      health: 'healthy'
    },
    { 
      id: 'dm-3',
      name: 'Cleanup Task', 
      lot: 1, 
      phase: 3, 
      sourceCampaign: 'C3', 
      priority: 'medium',
      status: 'queued',
      health: 'healthy'
    }
  ];

  return (
    <>
      <style jsx global>{`
        :root[data-theme="light"] {
          --ops-bg-main: #f8f9fa;
          --ops-bg-card: #ffffff;
          --ops-bg-surface: #f3f4f6;
          --ops-border: #e5e7eb;
          --ops-border-hover: #d1d5db;
          --ops-text-primary: #111827;
          --ops-text-secondary: #6b7280;
          --ops-text-muted: #9ca3af;
          
          --ops-accent-campaign: #8b5cf6;
          --ops-accent-campaign-light: #a78bfa;
          --ops-accent-campaign-bg: rgba(139, 92, 246, 0.08);
          --ops-accent-campaign-hover: rgba(139, 92, 246, 0.15);
          --ops-accent-campaign-border: rgba(139, 92, 246, 0.25);
          
          --ops-accent-disposition: #f59e0b;
          --ops-accent-disposition-light: #fbbf24;
          --ops-accent-disposition-bg: rgba(245, 158, 11, 0.08);
          --ops-accent-disposition-hover: rgba(245, 158, 11, 0.15);
          --ops-accent-disposition-border: rgba(245, 158, 11, 0.25);
          
          --ops-accent-datamanager: #10b981;
          --ops-accent-datamanager-light: #34d399;
          --ops-accent-datamanager-bg: rgba(16, 185, 129, 0.08);
          --ops-accent-datamanager-hover: rgba(16, 185, 129, 0.15);
          --ops-accent-datamanager-border: rgba(16, 185, 129, 0.25);
          
          --ops-status-success: #059669;
          --ops-status-warning: #d97706;
          --ops-status-error: #dc2626;
        }

        :root[data-theme="dark"] {
          --ops-bg-main: #0f1117;
          --ops-bg-card: #1a1d29;
          --ops-bg-surface: #13151f;
          --ops-border: #2d3142;
          --ops-border-hover: #3d4152;
          --ops-text-primary: #f9fafb;
          --ops-text-secondary: #9ca3af;
          --ops-text-muted: #6b7280;
          
          --ops-accent-campaign: #a78bfa;
          --ops-accent-campaign-light: #c4b5fd;
          --ops-accent-campaign-bg: rgba(167, 139, 250, 0.1);
          --ops-accent-campaign-hover: rgba(167, 139, 250, 0.2);
          --ops-accent-campaign-border: rgba(167, 139, 250, 0.3);
          
          --ops-accent-disposition: #fbbf24;
          --ops-accent-disposition-light: #fcd34d;
          --ops-accent-disposition-bg: rgba(251, 191, 36, 0.1);
          --ops-accent-disposition-hover: rgba(251, 191, 36, 0.2);
          --ops-accent-disposition-border: rgba(251, 191, 36, 0.3);
          
          --ops-accent-datamanager: #34d399;
          --ops-accent-datamanager-light: #6ee7b7;
          --ops-accent-datamanager-bg: rgba(52, 211, 153, 0.1);
          --ops-accent-datamanager-hover: rgba(52, 211, 153, 0.2);
          --ops-accent-datamanager-border: rgba(52, 211, 153, 0.3);
          
          --ops-status-success: #10b981;
          --ops-status-warning: #f59e0b;
          --ops-status-error: #ef4444;
        }

        .ops-dashboard {
          background: transparent;
          min-height: 100vh;
        }

        .ops-card {
          background: transparent;
          border: 1px solid var(--ops-border);
          transition: all 0.3s ease;
        }

        .ops-card:hover {
          border-color: var(--ops-border-hover);
        }

        /* Campaign Column Styles */
        .ops-card-campaign:hover {
          box-shadow: 0 0 30px rgba(139, 92, 246, 0.3);
          border-color: var(--ops-accent-campaign-border);
          background: transparent;
        }

        .ops-card-campaign-active {
          border-width: 2px;
          border-color: var(--ops-accent-campaign-border);
        }

        .ops-card-campaign-active:hover {
          box-shadow: 0 0 40px rgba(139, 92, 246, 0.4);
        }

        /* Disposition Column Styles */
        .ops-card-disposition:hover {
          box-shadow: 0 0 25px rgba(245, 158, 11, 0.3);
          border-color: var(--ops-accent-disposition-border);
          background: transparent;
        }

        /* Data Manager Column Styles */
        .ops-card-datamanager:hover {
          box-shadow: 0 0 25px rgba(16, 185, 129, 0.3);
          border-color: var(--ops-accent-datamanager-border);
          background: transparent;
        }

        .ops-progress-campaign {
          background: linear-gradient(90deg, var(--ops-accent-campaign) 0%, var(--ops-accent-campaign-light) 100%);
        }

        .ops-progress-disposition {
          background: linear-gradient(90deg, var(--ops-accent-disposition) 0%, var(--ops-accent-disposition-light) 100%);
        }

        .ops-progress-datamanager {
          background: linear-gradient(90deg, var(--ops-accent-datamanager) 0%, var(--ops-accent-datamanager-light) 100%);
        }

        /* Glass Modal Styles */
        .glass-modal {
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.3);
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
        }

        :root[data-theme="dark"] .glass-modal {
          background: rgba(26, 29, 41, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.5);
        }

        .glass-input {
          background: rgba(255, 255, 255, 0.6);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        :root[data-theme="dark"] .glass-input {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .glass-input:focus {
          background: rgba(255, 255, 255, 0.8);
          border-color: var(--ops-accent-campaign-border);
          outline: none;
        }

        :root[data-theme="dark"] .glass-input:focus {
          background: rgba(255, 255, 255, 0.1);
        }

        /* Health Pulse Animation */
        @keyframes healthPulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.8;
            transform: scale(1.1);
          }
        }

        @keyframes healthPing {
          0% {
            opacity: 0.8;
            transform: scale(1);
          }
          100% {
            opacity: 0;
            transform: scale(2.5);
          }
        }

        .health-pulse {
          animation: healthPulse 2s ease-in-out infinite;
          filter: drop-shadow(0 0 4px rgba(16, 185, 129, 0.6));
        }

        .health-ping {
          animation: healthPing 2s ease-out infinite;
          filter: drop-shadow(0 0 6px rgba(16, 185, 129, 0.8));
        }
      `}</style>

      <div className="ops-dashboard w-full space-y-6">
        {/* Header with Create Button */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold" style={{ color: 'var(--ops-text-primary)' }}>
              Campaign Automation
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--ops-text-secondary)' }}>
              Real-time workflow monitoring and control
            </p>
          </div>
          <button
            onClick={handleCreateCampaign}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              color: 'var(--ops-accent-campaign)',
              border: '1px solid var(--ops-accent-campaign-border)',
              background: 'var(--ops-accent-campaign-bg)'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--ops-accent-campaign-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'var(--ops-accent-campaign-bg)'}
          >
            <Plus className="w-4 h-4" />
            Create Campaign
          </button>
        </div>

        {/* Three Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Campaign Column - Stage 1 (PRIMARY) */}
          <div className="space-y-4">
            {/* Column Header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ background: 'var(--ops-accent-campaign-bg)', border: '1px solid var(--ops-accent-campaign-border)' }}
                >
                  <Activity className="w-5 h-5" style={{ color: 'var(--ops-accent-campaign)' }} />
                </div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold" style={{ color: 'var(--ops-text-primary)' }}>
                    Campaign
                  </h2>
                  {canAwake(activeCampaign) && (
                    <button 
                      onClick={() => handleAwakeClick('campaign', activeCampaign)}
                      disabled={awakeLoading}
                      className="px-2 py-1 rounded text-xs font-medium transition-all border"
                      style={{ 
                        color: 'var(--ops-text-secondary)',
                        borderColor: 'var(--ops-border)',
                        background: 'transparent',
                        opacity: awakeLoading ? 0.5 : 1
                      }}
                      onMouseEnter={(e) => !awakeLoading && (e.currentTarget.style.background = 'var(--ops-bg-surface)')}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      title={getAwakeTooltip('campaign')}
                    >
                      <RotateCw className={`w-3 h-3 inline mr-1 ${awakeLoading ? 'animate-spin' : ''}`} />
                      {awakeLoading ? 'Waking...' : 'Awake'}
                    </button>
                  )}
                  <span 
                    className="text-xs font-medium px-2 py-0.5 rounded"
                    style={{ 
                      color: 'var(--ops-accent-campaign)',
                      background: 'var(--ops-accent-campaign-bg)',
                      border: '1px solid var(--ops-accent-campaign-border)'
                    }}
                  >
                    Stage 1
                  </span>
                </div>
              </div>
            </div>

            {/* ACTIVE Section */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span 
                  className="text-xs font-bold uppercase tracking-wider"
                  style={{ color: 'var(--ops-text-muted)' }}
                >
                  ACTIVE
                </span>
                <div className="flex-1 h-px" style={{ background: 'var(--ops-border)' }}></div>
              </div>

              {/* Active Card - Larger and prominent */}
              <div className="ops-card ops-card-campaign ops-card-campaign-active rounded-xl p-6 group">
                <div className="space-y-4">
                  {/* Title, Priority, and Health */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold" style={{ color: 'var(--ops-text-primary)' }}>
                        {activeCampaign.name}
                      </h3>
                      <div 
                        className="cursor-help"
                        title={getHealthTooltip(activeCampaign.health)}
                      >
                        {getHealthIcon(activeCampaign.health)}
                      </div>
                    </div>
                    <span 
                      className={`text-xs font-bold px-2 py-1 rounded ${
                        activeCampaign.priority === 'high' 
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                          : activeCampaign.priority === 'medium'
                          ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                          : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                      }`}
                    >
                      {activeCampaign.priority.toUpperCase()}
                    </span>
                  </div>

                  {/* Stats and Progress Layout */}
                  <div className="grid grid-cols-2 gap-4 items-center mb-4">
                    {/* Left: Stats (2 rows) */}
                    <div className="space-y-3">
                      <div className="ops-card p-3 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <Clock className="w-3.5 h-3.5" style={{ color: 'var(--ops-text-muted)' }} />
                          <span className="text-xs font-medium" style={{ color: 'var(--ops-text-muted)' }}>
                            ETA
                          </span>
                        </div>
                        <span className="text-sm font-bold" style={{ color: 'var(--ops-text-primary)' }}>
                          {activeCampaign.eta}
                        </span>
                      </div>
                      <div className="ops-card p-3 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <Database className="w-3.5 h-3.5" style={{ color: 'var(--ops-text-muted)' }} />
                          <span className="text-xs font-medium" style={{ color: 'var(--ops-text-muted)' }}>
                            Records
                          </span>
                        </div>
                        <span className="text-sm font-bold" style={{ color: 'var(--ops-text-primary)' }}>
                          {activeCampaign.tasks?.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Right: Circular Progress */}
                    <div className="flex items-center justify-center">
                      <div className="relative w-32 h-32">
                        <svg className="transform -rotate-90 w-32 h-32">
                          <circle
                            cx="64"
                            cy="64"
                            r="56"
                            stroke="var(--ops-bg-surface)"
                            strokeWidth="8"
                            fill="none"
                          />
                          <circle
                            cx="64"
                            cy="64"
                            r="56"
                            stroke="var(--ops-accent-campaign)"
                            strokeWidth="8"
                            fill="none"
                            strokeDasharray={`${2 * Math.PI * 56}`}
                            strokeDashoffset={`${2 * Math.PI * 56 * (1 - activeCampaign.progress / 100)}`}
                            strokeLinecap="round"
                            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center flex-col">
                          <span className="text-3xl font-bold" style={{ color: 'var(--ops-text-primary)' }}>
                            {activeCampaign.progress}%
                          </span>
                          <span className="text-xs" style={{ color: 'var(--ops-text-muted)' }}>
                            Complete
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Hover Details */}
                  <div 
                    className="text-xs opacity-0 group-hover:opacity-100 transition-opacity pt-2 border-t mb-4"
                    style={{ borderColor: 'var(--ops-border)', color: 'var(--ops-text-muted)' }}
                  >
                    <div className="flex justify-between">
                      <span>Lot {activeCampaign.lot} · Phase {activeCampaign.phase}</span>
                      <span>Updated {activeCampaign.lastUpdate}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 flex-wrap">
                    <button 
                      className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
                      style={{ 
                        color: 'var(--ops-accent-campaign)',
                        border: '1px solid var(--ops-accent-campaign-border)',
                        background: 'transparent'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--ops-accent-campaign-bg)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <Play className="w-4 h-4 inline mr-1" />
                      Resume
                    </button>
                    <button 
                      className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
                      style={{ 
                        color: 'var(--ops-text-primary)',
                        border: '1px solid var(--ops-border)',
                        background: 'transparent'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--ops-bg-surface)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <Pause className="w-4 h-4 inline mr-1" />
                      Pause
                    </button>
                    <button 
                      className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
                      style={{ 
                        color: 'var(--ops-text-primary)',
                        border: '1px solid var(--ops-border)',
                        background: 'transparent'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--ops-bg-surface)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      Details
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* UPCOMING Section */}
            <div>
              <div 
                className="flex items-center gap-2 mb-3 cursor-pointer"
                onClick={() => toggleSection('campaign')}
              >
                <span 
                  className="text-xs font-bold uppercase tracking-wider"
                  style={{ color: 'var(--ops-text-muted)' }}
                >
                  UPCOMING
                </span>
                <div className="flex-1 h-px" style={{ background: 'var(--ops-border)' }}></div>
                {expandedSections.campaign ? (
                  <ChevronUp className="w-4 h-4" style={{ color: 'var(--ops-text-muted)' }} />
                ) : (
                  <ChevronDown className="w-4 h-4" style={{ color: 'var(--ops-text-muted)' }} />
                )}
              </div>

              {expandedSections.campaign && (
                <div className="space-y-2">
                  {upcomingCampaigns.map((item, idx) => (
                    <div 
                      key={idx}
                      className="ops-card ops-card-campaign rounded-lg p-4 cursor-pointer relative group"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold" style={{ color: 'var(--ops-text-primary)' }}>
                            {item.name}
                          </span>
                          <div 
                            className="cursor-help"
                            title={getHealthTooltip(item.health)}
                          >
                            {getHealthIcon(item.health)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span 
                            className={`text-xs px-2 py-0.5 rounded ${
                              item.priority === 'high' 
                                ? 'bg-red-500/20 text-red-400' 
                                : item.priority === 'medium'
                                ? 'bg-yellow-500/20 text-yellow-400'
                                : 'bg-gray-500/20 text-gray-400'
                            }`}
                          >
                            {item.priority}
                          </span>
                          {item.status === 'queued' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditCampaign(item);
                              }}
                              className="p-1 rounded hover:bg-[var(--ops-bg-surface)] transition-colors"
                              title="Edit configuration (queued campaigns only)"
                            >
                              <Settings className="w-3.5 h-3.5" style={{ color: 'var(--ops-text-secondary)' }} />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="text-xs" style={{ color: 'var(--ops-text-muted)' }}>
                        Lot {item.lot} · Phase {item.phase} · {item.sourceCampaign}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Disposition Column - Stage 2 (SUBORDINATE) */}
          <div className="space-y-4">
            {/* Column Header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ background: 'var(--ops-accent-disposition-bg)', border: '1px solid var(--ops-accent-disposition-border)' }}
                >
                  <GitBranch className="w-5 h-5" style={{ color: 'var(--ops-accent-disposition)' }} />
                </div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold" style={{ color: 'var(--ops-text-primary)' }}>
                    Disposition
                  </h2>
                  {canAwake(activeDisposition) && (
                    <button 
                      onClick={() => handleAwakeClick('disposition', activeDisposition)}
                      disabled={awakeLoading}
                      className="px-2 py-1 rounded text-xs font-medium transition-all border"
                      style={{ 
                        color: 'var(--ops-text-secondary)',
                        borderColor: 'var(--ops-border)',
                        background: 'transparent',
                        opacity: awakeLoading ? 0.5 : 1
                      }}
                      onMouseEnter={(e) => !awakeLoading && (e.currentTarget.style.background = 'var(--ops-bg-surface)')}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      title={getAwakeTooltip('disposition')}
                    >
                      <RotateCw className={`w-3 h-3 inline mr-1 ${awakeLoading ? 'animate-spin' : ''}`} />
                      {awakeLoading ? 'Waking...' : 'Awake'}
                    </button>
                  )}
                  <span 
                    className="text-xs font-medium px-2 py-0.5 rounded"
                    style={{ 
                      color: 'var(--ops-accent-disposition)',
                      background: 'var(--ops-accent-disposition-bg)',
                      border: '1px solid var(--ops-accent-disposition-border)'
                    }}
                  >
                    Stage 2
                  </span>
                </div>
              </div>
            </div>

            {/* ACTIVE Section */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span 
                  className="text-xs font-bold uppercase tracking-wider"
                  style={{ color: 'var(--ops-text-muted)' }}
                >
                  ACTIVE
                </span>
                <div className="flex-1 h-px" style={{ background: 'var(--ops-border)' }}></div>
              </div>

              {/* Active Card */}
              <div className="ops-card ops-card-disposition rounded-xl p-6 group">
                <div className="space-y-4">
                  {/* Title, Priority, and Health */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold" style={{ color: 'var(--ops-text-primary)' }}>
                        {activeDisposition.name}
                      </h3>
                      <div 
                        className="cursor-help"
                        title={getHealthTooltip(activeDisposition.health)}
                      >
                        {getHealthIcon(activeDisposition.health)}
                      </div>
                    </div>
                    <span 
                      className={`text-xs font-bold px-2 py-1 rounded ${
                        activeDisposition.priority === 'high' 
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                          : activeDisposition.priority === 'medium'
                          ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                          : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                      }`}
                    >
                      {activeDisposition.priority.toUpperCase()}
                    </span>
                  </div>

                  {/* Stats and Progress Layout */}
                  <div className="grid grid-cols-2 gap-4 items-center mb-4">
                    {/* Left: Stats (2 rows) */}
                    <div className="space-y-3">
                      <div className="ops-card p-3 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <Clock className="w-3.5 h-3.5" style={{ color: 'var(--ops-text-muted)' }} />
                          <span className="text-xs font-medium" style={{ color: 'var(--ops-text-muted)' }}>
                            ETA
                          </span>
                        </div>
                        <span className="text-sm font-bold" style={{ color: 'var(--ops-text-primary)' }}>
                          {activeDisposition.eta}
                        </span>
                      </div>
                      <div className="ops-card p-3 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <Database className="w-3.5 h-3.5" style={{ color: 'var(--ops-text-muted)' }} />
                          <span className="text-xs font-medium" style={{ color: 'var(--ops-text-muted)' }}>
                            Records
                          </span>
                        </div>
                        <span className="text-sm font-bold" style={{ color: 'var(--ops-text-primary)' }}>
                          {activeDisposition.items?.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Right: Circular Progress */}
                    <div className="flex items-center justify-center">
                      <div className="relative w-32 h-32">
                        <svg className="transform -rotate-90 w-32 h-32">
                          <circle
                            cx="64"
                            cy="64"
                            r="56"
                            stroke="var(--ops-bg-surface)"
                            strokeWidth="8"
                            fill="none"
                          />
                          <circle
                            cx="64"
                            cy="64"
                            r="56"
                            stroke="var(--ops-accent-disposition)"
                            strokeWidth="8"
                            fill="none"
                            strokeDasharray={`${2 * Math.PI * 56}`}
                            strokeDashoffset={`${2 * Math.PI * 56 * (1 - activeDisposition.progress / 100)}`}
                            strokeLinecap="round"
                            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center flex-col">
                          <span className="text-3xl font-bold" style={{ color: 'var(--ops-text-primary)' }}>
                            {activeDisposition.progress}%
                          </span>
                          <span className="text-xs" style={{ color: 'var(--ops-text-muted)' }}>
                            Complete
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Hover Details */}
                  <div 
                    className="text-xs opacity-0 group-hover:opacity-100 transition-opacity pt-2 border-t mb-4"
                    style={{ borderColor: 'var(--ops-border)', color: 'var(--ops-text-muted)' }}
                  >
                    <div className="flex justify-between">
                      <span>Lot {activeDisposition.lot} · Phase {activeDisposition.phase}</span>
                      <span>Updated {activeDisposition.lastUpdate}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 flex-wrap">
                    <button 
                      className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
                      style={{ 
                        color: 'var(--ops-accent-disposition)',
                        border: '1px solid var(--ops-accent-disposition-border)',
                        background: 'transparent'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--ops-accent-disposition-bg)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <Play className="w-4 h-4 inline mr-1" />
                      Resume
                    </button>
                    <button 
                      className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
                      style={{ 
                        color: 'var(--ops-text-primary)',
                        border: '1px solid var(--ops-border)',
                        background: 'transparent'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--ops-bg-surface)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <Pause className="w-4 h-4 inline mr-1" />
                      Pause
                    </button>
                    <button 
                      className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
                      style={{ 
                        color: 'var(--ops-text-primary)',
                        border: '1px solid var(--ops-border)',
                        background: 'transparent'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--ops-bg-surface)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      Details
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* UPCOMING Section */}
            <div>
              <div 
                className="flex items-center gap-2 mb-3 cursor-pointer"
                onClick={() => toggleSection('disposition')}
              >
                <span 
                  className="text-xs font-bold uppercase tracking-wider"
                  style={{ color: 'var(--ops-text-muted)' }}
                >
                  UPCOMING
                </span>
                <div className="flex-1 h-px" style={{ background: 'var(--ops-border)' }}></div>
                {expandedSections.disposition ? (
                  <ChevronUp className="w-4 h-4" style={{ color: 'var(--ops-text-muted)' }} />
                ) : (
                  <ChevronDown className="w-4 h-4" style={{ color: 'var(--ops-text-muted)' }} />
                )}
              </div>

              {expandedSections.disposition && (
                <div className="space-y-2">
                  {upcomingDispositions.map((item, idx) => (
                    <div 
                      key={idx}
                      className="ops-card ops-card-disposition rounded-lg p-4 cursor-pointer relative group"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold" style={{ color: 'var(--ops-text-primary)' }}>
                            {item.name}
                          </span>
                          <div 
                            className="cursor-help"
                            title={getHealthTooltip(item.health)}
                          >
                            {getHealthIcon(item.health)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span 
                            className={`text-xs px-2 py-0.5 rounded ${
                              item.priority === 'high' 
                                ? 'bg-red-500/20 text-red-400' 
                                : item.priority === 'medium'
                                ? 'bg-yellow-500/20 text-yellow-400'
                                : 'bg-gray-500/20 text-gray-400'
                            }`}
                          >
                            {item.priority}
                          </span>
                          {item.status === 'queued' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditCampaign(item);
                              }}
                              className="p-1 rounded hover:bg-[var(--ops-bg-surface)] transition-colors"
                              title="Edit configuration (queued campaigns only)"
                            >
                              <Settings className="w-3.5 h-3.5" style={{ color: 'var(--ops-text-secondary)' }} />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="text-xs" style={{ color: 'var(--ops-text-muted)' }}>
                        Lot {item.lot} · Phase {item.phase} · {item.sourceCampaign}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Data Manager Column - Stage 3 (SUBORDINATE) */}
          <div className="space-y-4">
            {/* Column Header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ background: 'var(--ops-accent-datamanager-bg)', border: '1px solid var(--ops-accent-datamanager-border)' }}
                >
                  <Database className="w-5 h-5" style={{ color: 'var(--ops-accent-datamanager)' }} />
                </div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold" style={{ color: 'var(--ops-text-primary)' }}>
                    Data Manager
                  </h2>
                  {canAwake(activeDataManager) && (
                    <button 
                      onClick={() => handleAwakeClick('datamanager', activeDataManager)}
                      disabled={awakeLoading}
                      className="px-2 py-1 rounded text-xs font-medium transition-all border"
                      style={{ 
                        color: 'var(--ops-text-secondary)',
                        borderColor: 'var(--ops-border)',
                        background: 'transparent',
                        opacity: awakeLoading ? 0.5 : 1
                      }}
                      onMouseEnter={(e) => !awakeLoading && (e.currentTarget.style.background = 'var(--ops-bg-surface)')}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      title={getAwakeTooltip('datamanager')}
                    >
                      <RotateCw className={`w-3 h-3 inline mr-1 ${awakeLoading ? 'animate-spin' : ''}`} />
                      {awakeLoading ? 'Waking...' : 'Awake'}
                    </button>
                  )}
                  <span 
                    className="text-xs font-medium px-2 py-0.5 rounded"
                    style={{ 
                      color: 'var(--ops-accent-datamanager)',
                      background: 'var(--ops-accent-datamanager-bg)',
                      border: '1px solid var(--ops-accent-datamanager-border)'
                    }}
                  >
                    Stage 3
                  </span>
                </div>
              </div>
            </div>

            {/* ACTIVE Section */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span 
                  className="text-xs font-bold uppercase tracking-wider"
                  style={{ color: 'var(--ops-text-muted)' }}
                >
                  ACTIVE
                </span>
                <div className="flex-1 h-px" style={{ background: 'var(--ops-border)' }}></div>
              </div>

              {/* Active Card */}
              <div className="ops-card ops-card-datamanager rounded-xl p-6 group">
                <div className="space-y-4">
                  {/* Title, Priority, and Health */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold" style={{ color: 'var(--ops-text-primary)' }}>
                        {activeDataManager.name}
                      </h3>
                      <div 
                        className="cursor-help"
                        title={getHealthTooltip(activeDataManager.health)}
                      >
                        {getHealthIcon(activeDataManager.health)}
                      </div>
                    </div>
                    <span 
                      className={`text-xs font-bold px-2 py-1 rounded ${
                        activeDataManager.priority === 'high' 
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                          : activeDataManager.priority === 'medium'
                          ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                          : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                      }`}
                    >
                      {activeDataManager.priority.toUpperCase()}
                    </span>
                  </div>

                  {/* Stats and Progress Layout */}
                  <div className="grid grid-cols-2 gap-4 items-center mb-4">
                    {/* Left: Stats (2 rows) */}
                    <div className="space-y-3">
                      <div className="ops-card p-3 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <Clock className="w-3.5 h-3.5" style={{ color: 'var(--ops-text-muted)' }} />
                          <span className="text-xs font-medium" style={{ color: 'var(--ops-text-muted)' }}>
                            ETA
                          </span>
                        </div>
                        <span className="text-sm font-bold" style={{ color: 'var(--ops-text-primary)' }}>
                          {activeDataManager.eta}
                        </span>
                      </div>
                      <div className="ops-card p-3 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <Database className="w-3.5 h-3.5" style={{ color: 'var(--ops-text-muted)' }} />
                          <span className="text-xs font-medium" style={{ color: 'var(--ops-text-muted)' }}>
                            Records
                          </span>
                        </div>
                        <span className="text-sm font-bold" style={{ color: 'var(--ops-text-primary)' }}>
                          {activeDataManager.records?.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Right: Circular Progress */}
                    <div className="flex items-center justify-center">
                      <div className="relative w-32 h-32">
                        <svg className="transform -rotate-90 w-32 h-32">
                          <circle
                            cx="64"
                            cy="64"
                            r="56"
                            stroke="var(--ops-bg-surface)"
                            strokeWidth="8"
                            fill="none"
                          />
                          <circle
                            cx="64"
                            cy="64"
                            r="56"
                            stroke="var(--ops-accent-datamanager)"
                            strokeWidth="8"
                            fill="none"
                            strokeDasharray={`${2 * Math.PI * 56}`}
                            strokeDashoffset={`${2 * Math.PI * 56 * (1 - activeDataManager.progress / 100)}`}
                            strokeLinecap="round"
                            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center flex-col">
                          <span className="text-3xl font-bold" style={{ color: 'var(--ops-text-primary)' }}>
                            {activeDataManager.progress}%
                          </span>
                          <span className="text-xs" style={{ color: 'var(--ops-text-muted)' }}>
                            Complete
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Hover Details */}
                  <div 
                    className="text-xs opacity-0 group-hover:opacity-100 transition-opacity pt-2 border-t mb-4"
                    style={{ borderColor: 'var(--ops-border)', color: 'var(--ops-text-muted)' }}
                  >
                    <div className="flex justify-between">
                      <span>Lot {activeDataManager.lot} · Phase {activeDataManager.phase}</span>
                      <span>Updated {activeDataManager.lastUpdate}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 flex-wrap">
                    <button 
                      className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
                      style={{ 
                        color: 'var(--ops-accent-datamanager)',
                        border: '1px solid var(--ops-accent-datamanager-border)',
                        background: 'transparent'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--ops-accent-datamanager-bg)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <Play className="w-4 h-4 inline mr-1" />
                      Resume
                    </button>
                    <button 
                      className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
                      style={{ 
                        color: 'var(--ops-text-primary)',
                        border: '1px solid var(--ops-border)',
                        background: 'transparent'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--ops-bg-surface)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <Pause className="w-4 h-4 inline mr-1" />
                      Pause
                    </button>
                    <button 
                      className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
                      style={{ 
                        color: 'var(--ops-text-primary)',
                        border: '1px solid var(--ops-border)',
                        background: 'transparent'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--ops-bg-surface)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      Details
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* UPCOMING Section */}
            <div>
              <div 
                className="flex items-center gap-2 mb-3 cursor-pointer"
                onClick={() => toggleSection('dataManager')}
              >
                <span 
                  className="text-xs font-bold uppercase tracking-wider"
                  style={{ color: 'var(--ops-text-muted)' }}
                >
                  UPCOMING
                </span>
                <div className="flex-1 h-px" style={{ background: 'var(--ops-border)' }}></div>
                {expandedSections.dataManager ? (
                  <ChevronUp className="w-4 h-4" style={{ color: 'var(--ops-text-muted)' }} />
                ) : (
                  <ChevronDown className="w-4 h-4" style={{ color: 'var(--ops-text-muted)' }} />
                )}
              </div>

              {expandedSections.dataManager && (
                <div className="space-y-2">
                  {upcomingDataManagers.map((item, idx) => (
                    <div 
                      key={idx}
                      className="ops-card ops-card-datamanager rounded-lg p-4 cursor-pointer relative group"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold" style={{ color: 'var(--ops-text-primary)' }}>
                            {item.name}
                          </span>
                          <div 
                            className="cursor-help"
                            title={getHealthTooltip(item.health)}
                          >
                            {getHealthIcon(item.health)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span 
                            className={`text-xs px-2 py-0.5 rounded ${
                              item.priority === 'high' 
                                ? 'bg-red-500/20 text-red-400' 
                                : item.priority === 'medium'
                                ? 'bg-yellow-500/20 text-yellow-400'
                                : 'bg-gray-500/20 text-gray-400'
                            }`}
                          >
                            {item.priority}
                          </span>
                          {item.status === 'queued' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditCampaign(item);
                              }}
                              className="p-1 rounded hover:bg-[var(--ops-bg-surface)] transition-colors"
                              title="Edit configuration (queued campaigns only)"
                            >
                              <Settings className="w-3.5 h-3.5" style={{ color: 'var(--ops-text-secondary)' }} />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="text-xs" style={{ color: 'var(--ops-text-muted)' }}>
                        Lot {item.lot} · Phase {item.phase} · {item.sourceCampaign}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Create Campaign Modal */}
      {showCreateModal && (
        <>
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-md z-50"
            onClick={() => setShowCreateModal(false)}
          />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div 
              className="glass-modal rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold" style={{ color: 'var(--ops-text-primary)' }}>
                  Create Campaign Automation
                </h3>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-1 rounded hover:bg-[var(--ops-bg-surface)]"
                >
                  <X className="w-5 h-5" style={{ color: 'var(--ops-text-secondary)' }} />
                </button>
              </div>

              {createStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--ops-text-primary)' }}>
                      Campaign Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={createForm.name}
                      onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                      className="glass-input w-full px-3 py-2 rounded-lg transition-all"
                      style={{ 
                        color: 'var(--ops-text-primary)'
                      }}
                      placeholder="Enter campaign name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--ops-text-primary)' }}>
                      Data Lot <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={createForm.lotId}
                      onChange={(e) => setCreateForm({ ...createForm, lotId: e.target.value })}
                      className="glass-input w-full px-3 py-2 rounded-lg transition-all"
                      style={{ 
                        color: 'var(--ops-text-primary)'
                      }}
                    >
                      <option value="">Select a lot</option>
                      <option value="1">Lot 1</option>
                      <option value="2">Lot 2</option>
                      <option value="3">Lot 3</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--ops-text-primary)' }}>
                      Priority
                    </label>
                    <select
                      value={createForm.priority}
                      onChange={(e) => setCreateForm({ ...createForm, priority: e.target.value as 'high' | 'medium' | 'low' })}
                      className="glass-input w-full px-3 py-2 rounded-lg transition-all"
                      style={{ 
                        color: 'var(--ops-text-primary)'
                      }}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={() => setShowCreateModal(false)}
                      className="flex-1 px-4 py-2 rounded-lg text-sm font-medium border"
                      style={{ 
                        borderColor: 'var(--ops-border)',
                        color: 'var(--ops-text-primary)',
                        background: 'transparent'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => setCreateStep(2)}
                      disabled={!createForm.name || !createForm.lotId}
                      className="flex-1 px-4 py-2 rounded-lg text-sm font-medium"
                      style={{ 
                        background: 'var(--ops-accent-campaign)',
                        color: 'white',
                        opacity: (!createForm.name || !createForm.lotId) ? 0.5 : 1
                      }}
                    >
                      Next: Configuration
                    </button>
                  </div>
                </div>
              )}

              {createStep === 2 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-3" style={{ color: 'var(--ops-text-primary)' }}>
                      Configuration
                    </label>
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 p-3 rounded-lg glass-input cursor-pointer transition-all hover:opacity-90">
                        <input
                          type="radio"
                          checked={useDefaultConfig}
                          onChange={() => setUseDefaultConfig(true)}
                          className="w-4 h-4"
                        />
                        <div>
                          <div className="font-medium" style={{ color: 'var(--ops-text-primary)' }}>
                            Use Default Configuration (recommended)
                          </div>
                          <div className="text-xs" style={{ color: 'var(--ops-text-secondary)' }}>
                            Standard Config
                          </div>
                        </div>
                      </label>

                      <label className="flex items-center gap-3 p-3 rounded-lg glass-input cursor-pointer transition-all hover:opacity-90">
                        <input
                          type="radio"
                          checked={!useDefaultConfig}
                          onChange={() => setUseDefaultConfig(false)}
                          className="w-4 h-4"
                        />
                        <div>
                          <div className="font-medium" style={{ color: 'var(--ops-text-primary)' }}>
                            Customize Configuration
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>

                  {!useDefaultConfig && (
                    <div className="space-y-4 p-4 rounded-lg glass-input">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={createForm.config.enableDisposition}
                          onChange={(e) => setCreateForm({
                            ...createForm,
                            config: { ...createForm.config, enableDisposition: e.target.checked }
                          })}
                          className="w-4 h-4"
                        />
                        <label className="text-sm" style={{ color: 'var(--ops-text-primary)' }}>
                          Enable Disposition
                        </label>
                      </div>

                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={createForm.config.enableDataManager}
                          onChange={(e) => setCreateForm({
                            ...createForm,
                            config: { ...createForm.config, enableDataManager: e.target.checked }
                          })}
                          className="w-4 h-4"
                        />
                        <label className="text-sm" style={{ color: 'var(--ops-text-primary)' }}>
                          Enable Data Manager
                        </label>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--ops-text-primary)' }}>
                          Batch Size
                        </label>
                        <input
                          type="number"
                          value={createForm.config.batchSize}
                          onChange={(e) => setCreateForm({
                            ...createForm,
                            config: { ...createForm.config, batchSize: parseInt(e.target.value) || 100 }
                          })}
                          className="glass-input w-full px-3 py-2 rounded-lg transition-all"
                          style={{ 
                            color: 'var(--ops-text-primary)'
                          }}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--ops-text-primary)' }}>
                          Max Phases
                        </label>
                        <input
                          type="number"
                          value={createForm.config.maxPhases}
                          onChange={(e) => setCreateForm({
                            ...createForm,
                            config: { ...createForm.config, maxPhases: parseInt(e.target.value) || 10 }
                          })}
                          className="glass-input w-full px-3 py-2 rounded-lg transition-all"
                          style={{ 
                            color: 'var(--ops-text-primary)'
                          }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="p-3 rounded-lg glass-input">
                    <p className="text-xs" style={{ color: 'var(--ops-text-secondary)' }}>
                      Configuration will be locked once the campaign starts.
                    </p>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={() => setCreateStep(1)}
                      className="flex-1 px-4 py-2 rounded-lg text-sm font-medium border"
                      style={{ 
                        borderColor: 'var(--ops-border)',
                        color: 'var(--ops-text-primary)',
                        background: 'transparent'
                      }}
                    >
                      Back
                    </button>
                    <button
                      onClick={handleSaveCreate}
                      className="flex-1 px-4 py-2 rounded-lg text-sm font-medium"
                      style={{ 
                        background: 'var(--ops-accent-campaign)',
                        color: 'white'
                      }}
                    >
                      Create & Queue Campaign
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Edit Campaign Configuration Modal */}
      {showEditModal && editingCampaign && (
        <>
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-md z-50"
            onClick={() => setShowEditModal(false)}
          />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div 
              className="glass-modal rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold" style={{ color: 'var(--ops-text-primary)' }}>
                  Edit Campaign Configuration
                </h3>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="p-1 rounded hover:bg-[var(--ops-bg-surface)]"
                >
                  <X className="w-5 h-5" style={{ color: 'var(--ops-text-secondary)' }} />
                </button>
              </div>

              {editingCampaign.status === 'queued' && (
                <>
                  <div className="p-3 rounded-lg mb-4" style={{ background: 'var(--ops-accent-campaign-bg)', border: '1px solid var(--ops-accent-campaign-border)' }}>
                    <p className="text-sm font-medium" style={{ color: 'var(--ops-accent-campaign)' }}>
                      This campaign has not started yet. Changes are allowed.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--ops-text-primary)' }}>
                        Priority
                      </label>
                      <select
                        value={editForm.priority}
                        onChange={(e) => setEditForm({ ...editForm, priority: e.target.value as 'high' | 'medium' | 'low' })}
                        className="glass-input w-full px-3 py-2 rounded-lg transition-all"
                        style={{ 
                          color: 'var(--ops-text-primary)'
                        }}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--ops-text-primary)' }}>
                        Batch Size
                      </label>
                      <input
                        type="number"
                        value={editForm.batchSize}
                        onChange={(e) => setEditForm({ ...editForm, batchSize: parseInt(e.target.value) || 100 })}
                        className="glass-input w-full px-3 py-2 rounded-lg transition-all"
                        style={{ 
                          color: 'var(--ops-text-primary)'
                        }}
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={editForm.enableDisposition}
                        onChange={(e) => setEditForm({ ...editForm, enableDisposition: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <label className="text-sm" style={{ color: 'var(--ops-text-primary)' }}>
                        Enable Disposition
                      </label>
                    </div>

                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={editForm.enableDataManager}
                        onChange={(e) => setEditForm({ ...editForm, enableDataManager: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <label className="text-sm" style={{ color: 'var(--ops-text-primary)' }}>
                        Enable Data Manager
                      </label>
                    </div>

                    {editingCampaign.defaultConfigName && (
                      <div className="p-3 rounded-lg glass-input">
                        <div className="text-xs font-medium mb-1" style={{ color: 'var(--ops-text-secondary)' }}>
                          Default Config Used
                        </div>
                        <div className="text-sm" style={{ color: 'var(--ops-text-primary)' }}>
                          {editingCampaign.defaultConfigName}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-3 pt-4">
                      <button
                        onClick={() => setShowEditModal(false)}
                        className="flex-1 px-4 py-2 rounded-lg text-sm font-medium border"
                        style={{ 
                          borderColor: 'var(--ops-border)',
                          color: 'var(--ops-text-primary)',
                          background: 'transparent'
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Changes will affect how this campaign runs. Continue?')) {
                            handleSaveEdit();
                          }
                        }}
                        className="flex-1 px-4 py-2 rounded-lg text-sm font-medium"
                        style={{ 
                          background: 'var(--ops-accent-campaign)',
                          color: 'white'
                        }}
                      >
                        Save Changes
                      </button>
                    </div>
                  </div>
                </>
              )}

              {editingCampaign.status !== 'queued' && (
                <div className="p-4 rounded-lg text-center" style={{ background: 'var(--ops-bg-surface)' }}>
                  <p className="text-sm" style={{ color: 'var(--ops-text-secondary)' }}>
                    Configuration is locked once execution begins.
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Awake Confirmation Modal */}
      {showAwakeModal && awakeTarget && (
        <>
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-md z-50"
            onClick={() => !awakeLoading && setShowAwakeModal(false)}
          />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div 
              className="glass-modal rounded-2xl p-6 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold" style={{ color: 'var(--ops-text-primary)' }}>
                  Awake Recovery
                </h3>
                {!awakeLoading && (
                  <button
                    onClick={() => setShowAwakeModal(false)}
                    className="p-1 rounded hover:bg-[var(--ops-bg-surface)]"
                  >
                    <X className="w-5 h-5" style={{ color: 'var(--ops-text-secondary)' }} />
                  </button>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg" style={{ background: 'var(--ops-bg-surface)' }}>
                    <RotateCw className={`w-5 h-5 ${awakeLoading ? 'animate-spin' : ''}`} style={{ color: 'var(--ops-accent-campaign)' }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm mb-2" style={{ color: 'var(--ops-text-primary)' }}>
                      Awake will safely resume this job from its last known state.
                    </p>
                    <p className="text-sm" style={{ color: 'var(--ops-text-secondary)' }}>
                      No data will be reprocessed.
                    </p>
                    <p className="text-sm font-medium mt-2" style={{ color: 'var(--ops-text-primary)' }}>
                      Proceed?
                    </p>
                  </div>
                </div>

                {awakeLoading && (
                  <div className="p-3 rounded-lg glass-input">
                    <p className="text-sm text-center" style={{ color: 'var(--ops-text-secondary)' }}>
                      Waking up...
                    </p>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setShowAwakeModal(false)}
                    disabled={awakeLoading}
                    className="flex-1 px-4 py-2 rounded-lg text-sm font-medium border transition-all"
                    style={{ 
                      borderColor: 'var(--ops-border)',
                      color: 'var(--ops-text-primary)',
                      background: 'transparent',
                      opacity: awakeLoading ? 0.5 : 1
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAwakeConfirm}
                    disabled={awakeLoading}
                    className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                    style={{ 
                      background: awakeLoading ? 'var(--ops-text-muted)' : 'var(--ops-accent-campaign)',
                      color: 'white',
                      opacity: awakeLoading ? 0.7 : 1
                    }}
                  >
                    {awakeLoading ? 'Processing...' : 'Awake Now'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
