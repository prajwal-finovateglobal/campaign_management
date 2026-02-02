'use client';

import { useState } from 'react';
import { CheckCircle2, Play, Pause, AlertTriangle, Zap, X, Clock, Circle } from 'lucide-react';

interface CampaignMonitorProps {
  // Add props if needed in the future
}

type JobStatus = 'completed' | 'running' | 'queued' | 'stalled' | 'none';
type JobPriority = 'normal' | 'urgent';

interface GridCell {
  lotId: number;
  phaseId: number;
  phaseName: string;
  campaignName: string;
  status: JobStatus;
  progress?: number;
  priority: JobPriority;
  lastUpdate?: string;
}

type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export function CampaignMonitor({}: CampaignMonitorProps) {
  const [selectedCell, setSelectedCell] = useState<GridCell | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{ lotId: number; phaseId: number } | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPlacement>('top');

  // Dummy data - Generate grid data
  // Default: 10 phases, can grow dynamically
  const generatePhases = (count: number = 10) => {
    return Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      name: `Phase ${i + 1}`
    }));
  };

  const phases = generatePhases(10);

  const lots = [
    { id: 1, name: 'Lot 1' },
    { id: 2, name: 'Lot 2' },
    { id: 3, name: 'Lot 3' },
    { id: 4, name: 'Lot 4' },
    { id: 5, name: 'Lot 5' },
    { id: 6, name: 'Lot 6' },
    { id: 7, name: 'Lot 7' },
    { id: 8, name: 'Lot 8' },
  ];

  const currentGlobalPhase = 2; // Phase 2 is current
  const stalledJobsCount = 1;

  // Generate grid data - Sample data for demonstration
  // In production, this would come from API/database and adapt to any number of phases
  const generateGridData = (phasesList: Array<{ id: number; name: string }>, lotsList: Array<{ id: number; name: string }>): Record<string, GridCell> => {
    const data: Record<string, GridCell> = {};
    
    // Sample data for first few lots and phases (for demo purposes)
    const sampleData = [
      { lotId: 1, phaseId: 1, campaignName: 'Campaign A1', status: 'completed' as JobStatus, priority: 'normal' as JobPriority, lastUpdate: '2h ago' },
      { lotId: 1, phaseId: 2, campaignName: 'Campaign A2', status: 'running' as JobStatus, progress: 65, priority: 'normal' as JobPriority, lastUpdate: '2 min ago' },
      { lotId: 1, phaseId: 3, campaignName: 'Campaign A3', status: 'queued' as JobStatus, priority: 'normal' as JobPriority },
      { lotId: 2, phaseId: 1, campaignName: 'Campaign B1', status: 'completed' as JobStatus, priority: 'normal' as JobPriority, lastUpdate: '1h ago' },
      { lotId: 2, phaseId: 2, campaignName: 'Campaign B2', status: 'running' as JobStatus, progress: 45, priority: 'urgent' as JobPriority, lastUpdate: '1 min ago' },
      { lotId: 2, phaseId: 3, campaignName: 'Campaign B3', status: 'queued' as JobStatus, priority: 'normal' as JobPriority },
      { lotId: 3, phaseId: 1, campaignName: 'Campaign C1', status: 'completed' as JobStatus, priority: 'normal' as JobPriority, lastUpdate: '3h ago' },
      { lotId: 3, phaseId: 2, campaignName: 'Campaign C2', status: 'stalled' as JobStatus, priority: 'normal' as JobPriority, lastUpdate: '15 min ago' },
      { lotId: 3, phaseId: 3, campaignName: 'Campaign C3', status: 'none' as JobStatus, priority: 'normal' as JobPriority },
      { lotId: 4, phaseId: 1, campaignName: 'Campaign D1', status: 'running' as JobStatus, progress: 80, priority: 'normal' as JobPriority, lastUpdate: '5 min ago' },
      { lotId: 4, phaseId: 2, campaignName: 'Campaign D2', status: 'queued' as JobStatus, priority: 'urgent' as JobPriority },
      { lotId: 5, phaseId: 1, campaignName: 'Campaign E1', status: 'queued' as JobStatus, priority: 'normal' as JobPriority },
      { lotId: 5, phaseId: 2, campaignName: 'Campaign E2', status: 'none' as JobStatus, priority: 'normal' as JobPriority },
    ];

    sampleData.forEach((item) => {
      const phase = phasesList.find((p: { id: number; name: string }) => p.id === item.phaseId);
      if (phase) {
        data[`${item.lotId}-${item.phaseId}`] = {
          lotId: item.lotId,
          phaseId: item.phaseId,
          phaseName: phase.name,
          campaignName: item.campaignName,
          status: item.status,
          progress: item.progress,
          priority: item.priority,
          lastUpdate: item.lastUpdate,
        };
      }
    });

    return data;
  };

  const gridData = generateGridData(phases, lots);

  const getStatusIcon = (status: JobStatus) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
      case 'running':
        return <Play className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
      case 'queued':
        return <Pause className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
      case 'stalled':
        return <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: JobStatus) => {
    switch (status) {
      case 'completed':
        return 'bg-emerald-500/20 dark:bg-emerald-500/10 border-emerald-500/30 dark:border-emerald-500/20';
      case 'running':
        return 'bg-blue-500/20 dark:bg-blue-500/10 border-blue-500/30 dark:border-blue-500/20';
      case 'queued':
        return 'bg-amber-500/20 dark:bg-amber-500/10 border-amber-500/30 dark:border-amber-500/20';
      case 'stalled':
        return 'bg-red-500/20 dark:bg-red-500/10 border-red-500/30 dark:border-red-500/20';
      default:
        return 'bg-[var(--input-bg)] border-[var(--card-border)] opacity-40';
    }
  };

  const getCell = (lotId: number, phaseId: number): GridCell | null => {
    return gridData[`${lotId}-${phaseId}`] || null;
  };

  const isCurrentPhase = (phaseId: number) => phaseId === currentGlobalPhase;
  const isPastPhase = (phaseId: number) => phaseId < currentGlobalPhase;
  const isFuturePhase = (phaseId: number) => phaseId > currentGlobalPhase;

  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-[var(--foreground)]">Campaign Monitor</h2>
        <p className="text-sm text-[var(--secondary)] mt-1">Observability dashboard for workflow state and progress</p>
      </div>

      {/* Health & Legend Bar */}
      <div className="flex items-center justify-between flex-wrap gap-4 p-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg">
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[var(--foreground)]">Current Global Phase:</span>
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">Phase {currentGlobalPhase}</span>
          </div>
          {stalledJobsCount > 0 && (
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
              <span className="text-xs font-medium text-red-600 dark:text-red-400">Stalled Jobs: {stalledJobsCount}</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs text-[var(--secondary)]">Completed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Play className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span className="text-xs text-[var(--secondary)]">Running</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Pause className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span className="text-xs text-[var(--secondary)]">Queued</span>
          </div>
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
            <span className="text-xs text-[var(--secondary)]">Stalled</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-500 dark:text-amber-300" />
            <span className="text-xs text-[var(--secondary)]">Urgent</span>
          </div>
        </div>
      </div>

      {/* Grid Container with Sticky Headers */}
      <div className="relative border border-[var(--card-border)] rounded-lg overflow-hidden bg-[var(--card-bg)]">
        <div className="overflow-auto max-h-[70vh] overflow-x-auto overflow-y-auto">
          <div className="inline-block min-w-full">
            {/* Grid */}
            <div className="grid" style={{ gridTemplateColumns: `120px repeat(${phases.length}, minmax(100px, 1fr))` }}>
              {/* Top-left corner (empty) */}
              <div className="sticky top-0 left-0 z-20 bg-[var(--card-bg)] border-r border-b border-[var(--card-border)] p-2"></div>
              
              {/* Sticky Top Row - Phase Headers */}
              {phases.map((phase) => {
                const isCurrent = isCurrentPhase(phase.id);
                const isPast = isPastPhase(phase.id);
                const isFuture = isFuturePhase(phase.id);

                return (
                  <div
                    key={phase.id}
                    className={`sticky top-0 z-10 border-r border-b border-[var(--card-border)] p-2 text-center ${
                      isCurrent
                        ? 'bg-blue-500/15 dark:bg-blue-500/10 border-blue-500/30 dark:border-blue-500/40'
                        : isPast
                        ? 'bg-[var(--card-bg)] opacity-60'
                        : 'bg-[var(--card-bg)] opacity-50'
                    }`}
                  >
                    <div className={`text-xs font-semibold flex items-center justify-center gap-1 ${
                      isCurrent
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-gray-900 dark:text-[var(--foreground)]'
                    }`}>
                      {phase.name}
                      {isCurrent && (
                        <span className="text-[10px] text-gray-900 dark:text-blue-400 font-bold">• Active</span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Grid Rows - Lots */}
              {lots.map((lot) => {
                return (
                  <>
                    {/* Sticky Left Column - Lot Header */}
                    <div
                      key={`lot-${lot.id}`}
                      className="sticky left-0 z-10 bg-[var(--card-bg)] border-r border-b border-[var(--card-border)] p-2"
                    >
                      <div className="text-xs font-semibold text-[var(--foreground)]">{lot.name}</div>
                    </div>

                    {/* Cells for this lot (across phases) */}
                    {phases.map((phase) => {
                      const cell = getCell(lot.id, phase.id);
                      const isHovered = hoveredCell?.lotId === lot.id && hoveredCell?.phaseId === phase.id;
                      const isUrgent = cell?.priority === 'urgent';
                      const isCurrent = isCurrentPhase(phase.id);

                      // Get hover glow color based on status
                      const getHoverGlowColor = (status: JobStatus | null) => {
                        if (!status || status === 'none') return 'shadow-gray-500/20 dark:shadow-gray-500/30';
                        switch (status) {
                          case 'completed':
                            return 'shadow-emerald-500/25 dark:shadow-emerald-500/35';
                          case 'running':
                            return 'shadow-blue-500/25 dark:shadow-blue-500/35';
                          case 'queued':
                            return 'shadow-amber-500/25 dark:shadow-amber-500/35';
                          case 'stalled':
                            return 'shadow-red-500/25 dark:shadow-red-500/35';
                          default:
                            return 'shadow-gray-500/20 dark:shadow-gray-500/30';
                        }
                      };

                      return (
                        <div
                          key={`${lot.id}-${phase.id}`}
                          className={`border-r border-b border-[var(--card-border)] p-2 min-h-[80px] flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all duration-200 relative group ${
                            isHovered 
                              ? `bg-[var(--card-bg)] dark:bg-[var(--card-bg)] scale-105 shadow-xl ${getHoverGlowColor(cell?.status || null)} z-30 rounded-lg` 
                              : cell 
                                ? getStatusColor(cell.status) 
                                : 'bg-[var(--input-bg)] opacity-30'
                          } ${
                            isUrgent && !isHovered
                              ? 'ring-1 ring-amber-500/50 dark:ring-amber-400/50 shadow-[0_0_8px_rgba(251,191,36,0.4)] dark:shadow-[0_0_12px_rgba(251,191,36,0.5)]' 
                              : ''
                          } ${
                            isCurrent && cell && !isHovered ? 'bg-blue-500/10 dark:bg-blue-500/5 border-blue-500/20 dark:border-blue-500/30' : ''
                          }`}
                          onMouseEnter={(e) => {
                            if (cell) {
                              setHoveredCell({ lotId: lot.id, phaseId: phase.id });
                              // Calculate available space in all 4 directions
                              const rect = e.currentTarget.getBoundingClientRect();
                              const tooltipHeight = 150; // Approximate tooltip height
                              const tooltipWidth = 200; // Approximate tooltip width
                              
                              const spaceAbove = rect.top;
                              const spaceBelow = window.innerHeight - rect.bottom;
                              const spaceLeft = rect.left;
                              const spaceRight = window.innerWidth - rect.right;
                              
                              // Find the direction with the most available space
                              // Prefer top/bottom if there's enough space, otherwise use left/right
                              let placement: TooltipPlacement = 'top';
                              if (spaceAbove >= tooltipHeight) {
                                placement = 'top';
                              } else if (spaceBelow >= tooltipHeight) {
                                placement = 'bottom';
                              } else if (spaceRight >= tooltipWidth) {
                                placement = 'right';
                              } else if (spaceLeft >= tooltipWidth) {
                                placement = 'left';
                              } else {
                                // Fallback: use the direction with the most space
                                const maxSpace = Math.max(spaceAbove, spaceBelow, spaceLeft, spaceRight);
                                if (maxSpace === spaceAbove) placement = 'top';
                                else if (maxSpace === spaceBelow) placement = 'bottom';
                                else if (maxSpace === spaceRight) placement = 'right';
                                else placement = 'left';
                              }
                              
                              setTooltipPosition(placement);
                            }
                          }}
                          onMouseLeave={() => setHoveredCell(null)}
                          onClick={() => cell && setSelectedCell(cell)}
                          title={cell ? `${cell.campaignName} - ${cell.status}` : 'No campaign job'}
                        >
                          {/* Status Icon */}
                          {cell ? (
                            <>
                              <div className="flex items-center gap-1">
                                {getStatusIcon(cell.status)}
                                {isUrgent && (
                                  <Zap className="w-3 h-3 text-amber-500 dark:text-amber-300 drop-shadow-[0_0_4px_rgba(245,158,11,0.8)]" />
                                )}
                              </div>

                              {/* Progress Bar (for running and stalled) */}
                              {(cell.status === 'running' || cell.status === 'stalled') && cell.progress !== undefined && (
                                <div className="w-full max-w-[60px]">
                                  <div className="w-full h-1 bg-[var(--input-bg)] rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all duration-500 ease-linear ${
                                        cell.status === 'running' 
                                          ? 'bg-blue-600 dark:bg-blue-400' 
                                          : 'bg-red-600 dark:bg-red-400'
                                      }`}
                                      style={{ width: `${cell.progress}%` }}
                                    />
                                  </div>
                                  <div className="text-[10px] text-[var(--secondary)] mt-0.5">{cell.progress}%</div>
                                </div>
                              )}

                              {/* Tooltip on hover */}
                              {isHovered && (
                                <div className={`absolute px-3 py-2 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-md shadow-lg z-[9999] min-w-[200px] pointer-events-none ${
                                  tooltipPosition === 'top' 
                                    ? 'bottom-full left-1/2 -translate-x-1/2 mb-2'
                                    : tooltipPosition === 'bottom'
                                    ? 'top-full left-1/2 -translate-x-1/2 mt-2'
                                    : tooltipPosition === 'left'
                                    ? 'right-full top-1/2 -translate-y-1/2 mr-2'
                                    : 'left-full top-1/2 -translate-y-1/2 ml-2'
                                }`}>
                                  <div className="text-xs space-y-1">
                                    <div className="font-semibold text-[var(--foreground)]">{cell.campaignName}</div>
                                    <div className="text-[var(--secondary)]">
                                      {lot.name} · {phase.name}
                                    </div>
                                    <div className="text-[var(--secondary)] capitalize">
                                      Status: {cell.status}
                                    </div>
                                    {cell.progress !== undefined && (
                                      <div className="text-[var(--secondary)]">
                                        Progress: {cell.progress}%
                                      </div>
                                    )}
                                    {cell.lastUpdate && (
                                      <div className="text-[var(--secondary)] flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {cell.lastUpdate}
                                      </div>
                                    )}
                                    {isUrgent && (
                                      <div className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                        <Zap className="w-3 h-3" />
                                        Urgent
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </>
                          ) : (
                            // Empty cell - show grey circle
                            <Circle className="w-3 h-3 text-[var(--secondary)] opacity-40" />
                          )}
                        </div>
                      );
                    })}
                  </>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Side Panel */}
      {selectedCell && (
        <div className="fixed inset-y-0 right-0 w-96 bg-[var(--card-bg)] border-l border-[var(--card-border)] shadow-2xl z-50 flex flex-col">
          {/* Panel Header */}
          <div className="flex items-center justify-between p-4 border-b border-[var(--card-border)]">
            <h3 className="text-lg font-semibold text-[var(--foreground)]">Campaign Details</h3>
            <button
              onClick={() => setSelectedCell(null)}
              className="p-1.5 hover:bg-[var(--table-row-hover)] rounded-md transition-colors"
            >
              <X className="w-5 h-5 text-[var(--foreground)]" />
            </button>
          </div>

          {/* Panel Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <div className="text-xs text-[var(--secondary)] mb-1">Campaign</div>
              <div className="text-sm font-medium text-[var(--foreground)]">{selectedCell.campaignName}</div>
            </div>

            <div>
              <div className="text-xs text-[var(--secondary)] mb-1">Location</div>
              <div className="text-sm text-[var(--foreground)]">
                Lot {selectedCell.lotId} · {selectedCell.phaseName}
              </div>
            </div>

            <div>
              <div className="text-xs text-[var(--secondary)] mb-1">Status</div>
              <div className="flex items-center gap-2">
                {getStatusIcon(selectedCell.status)}
                <span className="text-sm font-medium text-[var(--foreground)] capitalize">{selectedCell.status}</span>
              </div>
            </div>

            {selectedCell.progress !== undefined && (
              <div>
                <div className="text-xs text-[var(--secondary)] mb-2">Progress</div>
                <div className="w-full h-2 bg-[var(--input-bg)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 dark:bg-blue-400 rounded-full transition-all duration-500"
                    style={{ width: `${selectedCell.progress}%` }}
                  />
                </div>
                <div className="text-xs text-[var(--secondary)] mt-1">{selectedCell.progress}%</div>
              </div>
            )}

            {selectedCell.priority === 'urgent' && (
              <div className="flex items-center gap-2 p-2 bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/20 dark:border-amber-500/30 rounded-md">
                <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span className="text-sm font-medium text-amber-600 dark:text-amber-400">Urgent Priority</span>
              </div>
            )}

            {selectedCell.lastUpdate && (
              <div>
                <div className="text-xs text-[var(--secondary)] mb-1">Last Update</div>
                <div className="text-sm text-[var(--foreground)] flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {selectedCell.lastUpdate}
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-[var(--card-border)]">
              <div className="text-xs text-[var(--secondary)] mb-2">Stage Breakdown</div>
              <div className="space-y-2">
                <div className="text-xs text-[var(--foreground)]">Campaign: {selectedCell.status === 'completed' ? '✓' : selectedCell.status === 'running' ? '▶' : '⏸'}</div>
                <div className="text-xs text-[var(--secondary)]">Data Manager: Pending</div>
                <div className="text-xs text-[var(--secondary)]">Disposition: Pending</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Backdrop for side panel */}
      {selectedCell && (
        <div
          className="fixed inset-0 bg-black/20 dark:bg-black/40 z-40"
          onClick={() => setSelectedCell(null)}
        />
      )}
      </div>
  );
}
