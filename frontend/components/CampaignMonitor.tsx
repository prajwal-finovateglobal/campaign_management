'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  CheckCircle2, Play, Pause, Square, Clock, AlertTriangle,
  RefreshCw, X, ChevronRight, Loader2, RotateCcw, Zap,
  Circle, Timer, Calendar, Settings, Eye,
} from 'lucide-react';
import { api } from '@/lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AutoRunSummary {
  status: string;       // idle|running|paused|stopped|completed|scheduled
  is_running: boolean;
  current_chunk_index: number;
  total_chunks: number;
  gap_seconds: number;
  start_time: string | null;
  end_time: string | null;
  next_resume_at: string | null;
  chunks_done: number;
  started_at: string | null;
  ended_at: string | null;
  updated_at: string | null;
}

interface MonitorCampaign {
  id: number;
  campaign_name: string;
  campaign_index: number;
  type: string | null;
  millis_status: string | null;
  records_count: number | null;
  auto_run: AutoRunSummary | null;
}

interface MonitorPhase {
  id: number;
  name: string;
  campaigns: MonitorCampaign[];
}

interface MonitorData {
  client_id: number;
  phases: MonitorPhase[];
}

// Full detail response from /auto-run/status/{id}
interface ChunkDetail {
  chunk_id: number;
  chunk_name: string;
  status: string;
  message: string;
  millis_status: string | null;
}

interface FullCampaignStatus {
  campaign_id: number;
  status: string;
  action: string;
  is_running: boolean;
  gap_seconds: number;
  current_chunk_index: number;
  total_chunks: number;
  chunk_progress: ChunkDetail[];
  start_time: string | null;
  end_time: string | null;
  next_resume_at: string | null;
  started_at: string | null;
  ended_at: string | null;
}

interface CampaignMonitorProps {
  selectedClientId: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function fmtHHMM(hhmm: string | null): string {
  if (!hhmm) return '—';
  try {
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date(2000, 0, 1, h, m);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch { return hhmm; }
}

type StatusKey = 'idle' | 'running' | 'paused' | 'scheduled' | 'stopped' | 'completed' | 'unknown';

const STATUS_CONFIG: Record<StatusKey, {
  label: string;
  bg: string;
  border: string;
  text: string;
  iconColor: string;
}> = {
  idle:      { label: 'Idle',      bg: 'bg-[var(--input-bg)]',                  border: 'border-[var(--card-border)]',       text: 'text-[var(--secondary)]',              iconColor: 'text-[var(--secondary)]' },
  running:   { label: 'Running',   bg: 'bg-blue-500/20 dark:bg-blue-500/10',     border: 'border-blue-500/30 dark:border-blue-500/20',   text: 'text-blue-700 dark:text-blue-300',      iconColor: 'text-blue-600 dark:text-blue-400' },
  paused:    { label: 'Paused',    bg: 'bg-amber-500/20 dark:bg-amber-500/10',    border: 'border-amber-500/30 dark:border-amber-500/20',  text: 'text-amber-700 dark:text-amber-300',    iconColor: 'text-amber-600 dark:text-amber-400' },
  scheduled: { label: 'Scheduled', bg: 'bg-purple-500/20 dark:bg-purple-500/10', border: 'border-purple-500/30 dark:border-purple-500/20', text: 'text-purple-700 dark:text-purple-300',  iconColor: 'text-purple-600 dark:text-purple-400' },
  stopped:   { label: 'Stopped',   bg: 'bg-red-500/20 dark:bg-red-500/10',       border: 'border-red-500/30 dark:border-red-500/20',     text: 'text-red-700 dark:text-red-300',        iconColor: 'text-red-600 dark:text-red-400' },
  completed: { label: 'Completed', bg: 'bg-emerald-500/20 dark:bg-emerald-500/10', border: 'border-emerald-500/30 dark:border-emerald-500/20', text: 'text-emerald-700 dark:text-emerald-300', iconColor: 'text-emerald-600 dark:text-emerald-400' },
  unknown:   { label: 'Unknown',   bg: 'bg-[var(--input-bg)]',                  border: 'border-[var(--card-border)]',       text: 'text-[var(--secondary)]',              iconColor: 'text-[var(--secondary)]' },
};

function getStatusCfg(status: string | null | undefined) {
  return STATUS_CONFIG[(status as StatusKey) ?? 'unknown'] ?? STATUS_CONFIG.unknown;
}

/** Hover glow shadow class matching cell status (for popover on hover). */
function getHoverGlow(status: string | null | undefined): string {
  switch (status) {
    case 'completed': return 'shadow-emerald-500/25 dark:shadow-emerald-500/35';
    case 'running':   return 'shadow-blue-500/25 dark:shadow-blue-500/35';
    case 'paused':    return 'shadow-amber-500/25 dark:shadow-amber-500/35';
    case 'scheduled': return 'shadow-purple-500/25 dark:shadow-purple-500/35';
    case 'stopped':   return 'shadow-red-500/25 dark:shadow-red-500/35';
    default:          return 'shadow-gray-500/20 dark:shadow-gray-500/30';
  }
}

function StatusIcon({ status, className = 'w-3.5 h-3.5' }: { status: string; className?: string }) {
  const cfg = getStatusCfg(status);
  switch (status) {
    case 'running':   return <Play      className={`${className} ${cfg.iconColor}`} />;
    case 'paused':    return <Pause     className={`${className} ${cfg.iconColor}`} />;
    case 'scheduled': return <Clock     className={`${className} ${cfg.iconColor}`} />;
    case 'stopped':   return <Square    className={`${className} ${cfg.iconColor}`} />;
    case 'completed': return <CheckCircle2 className={`${className} ${cfg.iconColor}`} />;
    default:          return <Circle    className={`${className} ${cfg.iconColor} opacity-40`} />;
  }
}

function ChunkAutoStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'finished':      return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
    case 'running':
    case 'waiting_finish':
    case 'starting':      return <Play className="w-3.5 h-3.5 text-blue-500 animate-pulse" />;
    case 'countdown':     return <Timer className="w-3.5 h-3.5 text-amber-500" />;
    case 'failed':        return <AlertTriangle className="w-3.5 h-3.5 text-red-500" />;
    default:              return <Clock className="w-3.5 h-3.5 text-[var(--secondary)] opacity-60" />;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cell content (no wrapper — wrapper is in grid with hover/popover styles)
// ─────────────────────────────────────────────────────────────────────────────

function CampaignCellContent({ campaign }: { campaign: MonitorCampaign }) {
  const ar = campaign.auto_run;
  const status = ar?.status ?? 'idle';
  const cfg = getStatusCfg(status);
  const hasProgress = ar && ar.total_chunks > 0;
  const pct = hasProgress ? Math.round((ar!.chunks_done / ar!.total_chunks) * 100) : 0;

  return (
    <>
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1">
          <StatusIcon status={status} />
          <span className={`text-[10px] font-semibold uppercase tracking-wide ${cfg.text}`}>
            {cfg.label}
          </span>
        </div>
        {ar?.is_running && (
          <span className="flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-1.5 w-1.5 rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
          </span>
        )}
      </div>
      {hasProgress ? (
        <div className="space-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[var(--secondary)]">
              {ar!.chunks_done}/{ar!.total_chunks} chunks
            </span>
            <span className="text-[10px] font-medium text-[var(--secondary)]">{pct}%</span>
          </div>
          <div className="w-full h-1 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                status === 'completed' ? 'bg-emerald-500' :
                status === 'running'   ? 'bg-blue-500' :
                status === 'paused'    ? 'bg-amber-500' :
                status === 'scheduled' ? 'bg-purple-500' :
                'bg-[var(--secondary)]'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="text-[10px] text-[var(--secondary)] opacity-60">No auto-run data</div>
      )}
      {campaign.records_count != null && (
        <div className="text-[10px] text-[var(--secondary)]">
          {campaign.records_count.toLocaleString()} records
        </div>
      )}
    </>
  );
}

function EmptyCellContent() {
  return (
    <div className="flex items-center justify-center min-h-[80px]">
      <Circle className="w-3 h-3 text-[var(--secondary)] opacity-40" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Side panel — View tab
// ─────────────────────────────────────────────────────────────────────────────

function ViewTab({ fullStatus, campaign }: { fullStatus: FullCampaignStatus | null; campaign: MonitorCampaign }) {
  const ar = fullStatus ?? null;
  const cfg = getStatusCfg(ar?.status ?? campaign.auto_run?.status ?? 'idle');

  if (!ar) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-[var(--secondary)]">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading details…
      </div>
    );
  }

  const progress = ar.chunk_progress ?? [];
  const done  = progress.filter(c => c.status === 'finished').length;
  const total = ar.total_chunks;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-4 p-4">
      {/* Status badge */}
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold ${cfg.bg} ${cfg.border} ${cfg.text}`}>
        <StatusIcon status={ar.status} />
        {cfg.label}
        {ar.is_running && <span className="text-[10px] opacity-70">• live</span>}
      </div>

      {/* Progress */}
      {total > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-[var(--secondary)]">
            <span>Chunks completed</span>
            <span className="font-medium text-[var(--foreground)]">{done} / {total} ({pct}%)</span>
          </div>
          <div className="w-full h-2 bg-[var(--input-bg)] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                ar.status === 'completed' ? 'bg-emerald-500' :
                ar.status === 'running'   ? 'bg-blue-500' :
                ar.status === 'paused'    ? 'bg-amber-500' :
                'bg-purple-500'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Key-value rows */}
      <div className="space-y-2 text-xs">
        {[
          ['Gap between chunks', ar.gap_seconds ? `${ar.gap_seconds}s` : '—'],
          ['Records',            campaign.records_count?.toLocaleString() ?? '—'],
          ['Run window',         (ar.start_time && ar.end_time)
              ? `${fmtHHMM(ar.start_time)} → ${fmtHHMM(ar.end_time)} IST`
              : '24 × 7 (no restriction)'],
          ['Started at',         fmtTime(ar.started_at)],
          ['Ended at',           fmtTime(ar.ended_at)],
          ...(ar.status === 'scheduled' && ar.next_resume_at
              ? [['Resumes at', fmtTime(ar.next_resume_at)] as [string, string]]
              : []),
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2">
            <span className="text-[var(--secondary)] shrink-0">{label}</span>
            <span className="text-[var(--foreground)] text-right">{value}</span>
          </div>
        ))}
      </div>

      {/* Chunk list */}
      {progress.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-[var(--foreground)] mb-2">Chunk Progress</div>
          <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
            {progress.map((c, i) => (
              <div
                key={c.chunk_id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-[var(--input-bg)] border border-[var(--card-border)]"
              >
                <span className="text-[10px] text-[var(--secondary)] w-5 shrink-0">{i + 1}</span>
                <ChunkAutoStatusIcon status={c.status} />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium text-[var(--foreground)] truncate">{c.chunk_name}</div>
                  <div className="text-[10px] text-[var(--secondary)] truncate">{c.message}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Side panel — Control tab
// ─────────────────────────────────────────────────────────────────────────────

function ControlTab({
  campaign,
  clientId,
  fullStatus,
  onAction,
}: {
  campaign: MonitorCampaign;
  clientId: number;
  fullStatus: FullCampaignStatus | null;
  onAction: () => void;
}) {
  const ar = fullStatus ?? campaign.auto_run;
  const status  = ar?.status ?? 'idle';
  const isRunning   = ar?.is_running ?? false;
  const isPaused    = status === 'paused';
  const isScheduled = status === 'scheduled';
  const isActive    = isRunning || isPaused || isScheduled;

  const [gap, setGap]           = useState(ar?.gap_seconds ?? 20);
  const [twStart, setTwStart]   = useState(ar?.start_time ?? '09:30');
  const [twEnd, setTwEnd]       = useState(ar?.end_time   ?? '19:30');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg]         = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Update local state when fullStatus loads/changes
  useEffect(() => {
    if (fullStatus) {
      setGap(fullStatus.gap_seconds ?? 20);
      setTwStart(fullStatus.start_time ?? '09:30');
      setTwEnd(fullStatus.end_time   ?? '19:30');
    }
  }, [fullStatus?.status]);

  const twError = (() => {
    if (!twStart && !twEnd) return null;
    if (twStart && !twEnd)  return 'Set an end time.';
    if (!twStart && twEnd)  return 'Set a start time.';
    if (twStart > twEnd)    return 'Start cannot be greater than end.';
    return null;
  })();

  const equalTimes = twStart && twEnd && twStart === twEnd;

  async function doAction(action: string) {
    setActionLoading(action);
    setActionMsg(null);
    try {
      let res: Response;
      if (action === 'start') {
        res = await api.post('/auto-run/start', {
          campaign_id: campaign.id,
          client_id:   clientId,
          gap_seconds: gap,
          start_time:  (twStart && !equalTimes) ? twStart : null,
          end_time:    (twEnd   && !equalTimes) ? twEnd   : null,
        });
      } else {
        res = await api.post(`/auto-run/${action}/${campaign.id}`);
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setActionMsg({ type: 'err', text: err.detail ?? `${action} failed` });
      } else {
        setActionMsg({ type: 'ok', text: `${action} successful` });
        onAction();
      }
    } catch (e) {
      setActionMsg({ type: 'err', text: String(e) });
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* Status read-out */}
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold w-fit
        ${getStatusCfg(status).bg} ${getStatusCfg(status).border} ${getStatusCfg(status).text}`}>
        <StatusIcon status={status} />
        {getStatusCfg(status).label}
      </div>

      {/* Action feedback */}
      {actionMsg && (
        <div className={`text-xs px-3 py-2 rounded-md border ${
          actionMsg.type === 'ok'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
            : 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300'
        }`}>
          {actionMsg.text}
        </div>
      )}

      {/* Gap between chunks */}
      <div>
        <label className="block text-xs font-medium text-[var(--foreground)] mb-1.5">
          Gap Between Chunks (seconds)
        </label>
        <input
          type="number"
          min={0}
          value={gap}
          onChange={e => setGap(Number(e.target.value))}
          disabled={isActive}
          className="w-full px-3 py-2 text-sm border rounded-md bg-[var(--input-bg)] text-[var(--foreground)] border-[var(--input-border)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] disabled:opacity-50"
        />
      </div>

      {/* Run window */}
      <div>
        <label className="block text-xs font-medium text-[var(--foreground)] mb-1.5">
          Run Window (IST)
          <span className="ml-1 text-[var(--secondary)] font-normal">optional — blank or equal = 24×7</span>
        </label>
        <div className="flex items-center gap-2">
          <input
            type="time" step="60"
            value={twStart}
            onChange={e => setTwStart(e.target.value)}
            disabled={isActive}
            className={`flex-1 px-2 py-1.5 text-sm border rounded-md bg-[var(--input-bg)] text-[var(--foreground)] focus:outline-none focus:ring-2 disabled:opacity-50 [color-scheme:light] dark:[color-scheme:dark] ${
              twError ? 'border-red-500 focus:ring-red-500' : 'border-[var(--input-border)] focus:ring-[var(--primary)]'
            }`}
          />
          <span className="text-xs text-[var(--secondary)]">to</span>
          <input
            type="time" step="60"
            value={twEnd}
            onChange={e => setTwEnd(e.target.value)}
            disabled={isActive}
            className={`flex-1 px-2 py-1.5 text-sm border rounded-md bg-[var(--input-bg)] text-[var(--foreground)] focus:outline-none focus:ring-2 disabled:opacity-50 [color-scheme:light] dark:[color-scheme:dark] ${
              twError ? 'border-red-500 focus:ring-red-500' : 'border-[var(--input-border)] focus:ring-[var(--primary)]'
            }`}
          />
        </div>
        {twError
          ? <p className="text-[10px] text-red-500 mt-1">{twError}</p>
          : equalTimes
            ? <p className="text-[10px] text-[var(--secondary)] mt-1">Start = End → runs 24×7</p>
            : <p className="text-[10px] text-[var(--secondary)] mt-1">Pauses outside window, resumes at start next day</p>
        }
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-2">
        {/* Auto Start — only when not active */}
        {!isActive && (
          <button
            onClick={() => doAction('start')}
            disabled={!!twError || actionLoading === 'start'}
            className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-md text-sm font-medium bg-[var(--primary)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {actionLoading === 'start' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Auto Start All
          </button>
        )}

        {/* Pause — only when running (not scheduled) */}
        {isRunning && !isScheduled && (
          <button
            onClick={() => doAction('pause')}
            disabled={actionLoading === 'pause'}
            className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-md text-sm font-medium bg-amber-500/20 border border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/30 disabled:opacity-50 transition-colors"
          >
            {actionLoading === 'pause' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pause className="w-4 h-4" />}
            Pause
          </button>
        )}

        {/* Resume — only when paused */}
        {isPaused && (
          <button
            onClick={() => doAction('resume')}
            disabled={actionLoading === 'resume'}
            className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-md text-sm font-medium bg-blue-500/20 border border-blue-500/40 text-blue-700 dark:text-blue-300 hover:bg-blue-500/30 disabled:opacity-50 transition-colors"
          >
            {actionLoading === 'resume' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Resume
          </button>
        )}

        {/* Stop — when running, paused, or scheduled */}
        {isActive && (
          <button
            onClick={() => doAction('stop')}
            disabled={actionLoading === 'stop'}
            className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-md text-sm font-medium bg-red-500/15 border border-red-500/30 text-red-700 dark:text-red-300 hover:bg-red-500/25 disabled:opacity-50 transition-colors"
          >
            {actionLoading === 'stop' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
            Stop
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Side panel wrapper
// ─────────────────────────────────────────────────────────────────────────────

function SidePanel({
  campaign,
  phase,
  clientId,
  onClose,
  onAction,
}: {
  campaign: MonitorCampaign;
  phase: MonitorPhase;
  clientId: number;
  onClose: () => void;
  onAction: () => void;
}) {
  const [tab, setTab] = useState<'view' | 'control'>('view');
  const [fullStatus, setFullStatus] = useState<FullCampaignStatus | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false);

  const fetchFull = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const res = await api.get(`/auto-run/status/${campaign.id}`);
      if (res.ok) setFullStatus(await res.json());
    } catch { /* silent */ } finally {
      inFlightRef.current = false;
    }
  }, [campaign.id]);

  useEffect(() => {
    fetchFull();
    pollingRef.current = setInterval(fetchFull, 3000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [fetchFull]);

  const handleAction = () => { fetchFull(); onAction(); };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/25 dark:bg-black/50 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 w-[420px] bg-[var(--card-bg)] border-l border-[var(--card-border)] shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-[var(--card-border)]">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-[var(--secondary)] mb-0.5">
              {phase.name} · Campaign {campaign.campaign_index}
            </div>
            <div className="text-sm font-semibold text-[var(--foreground)] truncate">{campaign.campaign_name}</div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-[var(--table-row-hover)] rounded-md ml-2 shrink-0">
            <X className="w-4 h-4 text-[var(--foreground)]" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--card-border)] px-4">
          {(['view', 'control'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors capitalize ${
                tab === t
                  ? 'border-[var(--primary)] text-[var(--primary)]'
                  : 'border-transparent text-[var(--secondary)] hover:text-[var(--foreground)]'
              }`}
            >
              {t === 'view' ? <Eye className="w-3.5 h-3.5" /> : <Settings className="w-3.5 h-3.5" />}
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'view'
            ? <ViewTab fullStatus={fullStatus} campaign={campaign} />
            : <ControlTab campaign={campaign} clientId={clientId} fullStatus={fullStatus} onAction={handleAction} />
          }
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats bar
// ─────────────────────────────────────────────────────────────────────────────

function StatsBar({ data }: { data: MonitorData }) {
  const counts: Record<string, number> = {};
  for (const phase of data.phases) {
    for (const c of phase.campaigns) {
      const s = c.auto_run?.status ?? 'idle';
      counts[s] = (counts[s] ?? 0) + 1;
    }
  }
  const pills = [
    { key: 'running',   label: 'Running',   color: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30' },
    { key: 'paused',    label: 'Paused',    color: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30' },
    { key: 'scheduled', label: 'Scheduled', color: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30' },
    { key: 'completed', label: 'Completed', color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' },
    { key: 'stopped',   label: 'Stopped',   color: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30' },
    { key: 'idle',      label: 'Idle',      color: 'bg-[var(--input-bg)] text-[var(--secondary)] border-[var(--card-border)]' },
  ].filter(p => counts[p.key] > 0);

  const totalCampaigns = data.phases.reduce((s, p) => s + p.campaigns.length, 0);

  return (
    <div className="flex items-center gap-3 flex-wrap text-xs">
      <span className="text-[var(--secondary)]">
        {data.phases.length} phases · {totalCampaigns} campaigns
      </span>
      <div className="w-px h-3 bg-[var(--card-border)]" />
      {pills.map(p => (
        <span key={p.key} className={`px-2 py-0.5 rounded-full border font-medium ${p.color}`}>
          {counts[p.key]} {p.label}
        </span>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function CampaignMonitor({ selectedClientId }: CampaignMonitorProps) {
  const [data, setData]           = useState<MonitorData | null>(null);
  const [loading, setLoading]     = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [selected, setSelected]   = useState<{ campaign: MonitorCampaign; phase: MonitorPhase } | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{ phaseId: number; rowIndex: number } | null>(null);

  const pollingRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false);

  const fetchMonitor = useCallback(async (showSpinner = false) => {
    if (!selectedClientId) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    if (showSpinner) setLoading(true);
    try {
      const res = await api.get(`/auto-run/monitor/${selectedClientId}`);
      if (res.ok) {
        setData(await res.json());
        setLastRefresh(new Date());
      }
    } catch { /* silent */ } finally {
      inFlightRef.current = false;
      if (showSpinner) setLoading(false);
    }
  }, [selectedClientId]);

  // Start/stop polling when client changes
  useEffect(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    setData(null);
    setSelected(null);
    if (!selectedClientId) return;
    fetchMonitor(true);
    pollingRef.current = setInterval(() => fetchMonitor(false), 5000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [selectedClientId, fetchMonitor]);

  // ── Derived grid dimensions ──────────────────────────────────────────────

  const phases = data?.phases ?? [];
  // Maximum number of campaigns in any single phase → determines row count
  const maxRows = phases.reduce((m, p) => Math.max(m, p.campaigns.length), 0);

  // ── No client ─────────────────────────────────────────────────────────────

  if (!selectedClientId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-[var(--secondary)]">
        <AlertTriangle className="w-8 h-8 opacity-40" />
        <p className="text-sm">Select a client to view the monitor.</p>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-[var(--secondary)]">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading monitor…</span>
      </div>
    );
  }

  // ── Empty ─────────────────────────────────────────────────────────────────

  if (data && phases.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-[var(--secondary)]">
        <Circle className="w-8 h-8 opacity-40" />
        <p className="text-sm">No phases found for this client.</p>
      </div>
    );
  }

  // ── Grid ──────────────────────────────────────────────────────────────────

  return (
    <div className="w-full space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-[var(--foreground)]">Monitor</h2>
          {lastRefresh && (
            <p className="text-xs text-[var(--secondary)] mt-0.5">
              Last updated {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          )}
        </div>
        <button
          onClick={() => fetchMonitor(true)}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[var(--card-border)] hover:bg-[var(--table-row-hover)] text-[var(--foreground)] disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      {data && <StatsBar data={data} />}

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap text-[10px] text-[var(--secondary)]">
        {Object.entries(STATUS_CONFIG).filter(([k]) => k !== 'unknown').map(([key, cfg]) => (
          <span key={key} className="flex items-center gap-1">
            <StatusIcon status={key} className="w-3 h-3" />
            {cfg.label}
          </span>
        ))}
      </div>

      {/* Grid */}
      {data && phases.length > 0 && (
        <div className="relative border border-[var(--card-border)] rounded-lg overflow-hidden bg-[var(--card-bg)]">
          <div className="overflow-auto max-h-[70vh] overflow-x-auto overflow-y-auto">
            <div
              className="inline-grid min-w-full"
              style={{
                gridTemplateColumns: `64px repeat(${phases.length}, minmax(100px, 1fr))`,
                minWidth: `${64 + phases.length * 100}px`,
              }}
            >
              {/* ── Row 0: headers ────────────────────────────────────────── */}

              {/* Top-left corner */}
              <div className="sticky top-0 left-0 z-20 bg-[var(--card-bg)] border-r border-b border-[var(--card-border)] p-2" />

              {/* Phase headers — P1, P2, P3... */}
              {phases.map((phase, idx) => (
                <div
                  key={phase.id}
                  className="sticky top-0 z-10 border-r border-b border-[var(--card-border)] p-2 text-center bg-[var(--card-bg)]"
                  title={phase.name}
                >
                  <div className="text-xs font-semibold text-[var(--foreground)]">P{idx + 1}</div>
                  <div className="text-[10px] text-[var(--secondary)] mt-0.5">
                    {phase.campaigns.length} campaign{phase.campaigns.length !== 1 ? 's' : ''}
                  </div>
                </div>
              ))}

              {/* ── Rows 1..maxRows: campaign cells ───────────────────────── */}

              {Array.from({ length: maxRows }, (_, rowIdx) => (
                <React.Fragment key={`row-${rowIdx}`}>
                  {/* Row header — sticky left */}
                  <div
                    className="sticky left-0 z-10 bg-[var(--card-bg)] border-r border-b border-[var(--card-border)] p-2 flex items-center justify-center"
                  >
                    <span className="text-xs font-semibold text-[var(--foreground)]">{rowIdx + 1}</span>
                  </div>

                  {/* Cells across phases — color fills cell; on hover cell pops over (scale, rounded, glow, z-30) */}
                  {phases.map((phase, phaseIdx) => {
                    const campaign = phase.campaigns[rowIdx] ?? null;
                    const isHovered = hoveredCell?.phaseId === phase.id && hoveredCell?.rowIndex === rowIdx;
                    const status = campaign?.auto_run?.status ?? 'idle';
                    const cfg = getStatusCfg(status);

                    // Keep tooltip inside table: position so it never crops on edge/corner cells
                    const isFirstRow = rowIdx === 0;
                    const isLastRow = rowIdx === maxRows - 1;
                    const isFirstCol = phaseIdx === 0;
                    const isLastCol = phaseIdx === phases.length - 1;
                    const tooltipAbove = 'bottom-full mb-2';
                    const tooltipBelow = 'top-full mt-2';
                    const tooltipH =
                      isFirstCol ? 'left-0' : isLastCol ? 'right-0' : 'left-1/2 -translate-x-1/2';
                    const tooltipPos = isFirstRow ? `${tooltipBelow} ${tooltipH}` : `${tooltipAbove} ${tooltipH}`;

                    const cellClassName = campaign
                      ? isHovered
                        ? `bg-[var(--card-bg)] dark:bg-[var(--card-bg)] scale-105 shadow-xl z-30 rounded-lg ${getHoverGlow(status)}`
                        : `${cfg.bg} ${cfg.border}`
                      : 'bg-[var(--input-bg)] opacity-30';

                    return (
                      <div
                        key={`${phase.id}-${rowIdx}`}
                        className={`
                          border-r border-b border-[var(--card-border)] p-2 min-h-[80px]
                          flex flex-col items-center justify-center gap-1.5 cursor-pointer
                          transition-all duration-200 relative group
                          ${cellClassName}
                        `}
                        onMouseEnter={() => campaign && setHoveredCell({ phaseId: phase.id, rowIndex: rowIdx })}
                        onMouseLeave={() => setHoveredCell(null)}
                        onClick={() => campaign && setSelected({ campaign, phase })}
                        title={campaign ? `${campaign.campaign_name} · ${cfg.label}` : undefined}
                      >
                        {campaign ? (
                          <>
                            <CampaignCellContent campaign={campaign} />
                            {/* Tooltip — positioned to stay inside table (no crop on edge/corner cells) */}
                            {isHovered && (
                              <div
                                className={`absolute ${tooltipPos} px-3 py-2 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-md shadow-lg z-[9999] min-w-[180px] max-w-[240px] pointer-events-none`}
                              >
                                <div className="text-xs space-y-1">
                                  <div className="font-semibold text-[var(--foreground)] truncate" title={campaign.campaign_name}>{campaign.campaign_name}</div>
                                  <div className="text-[var(--secondary)]">
                                    {phase.name} · Campaign {campaign.campaign_index}
                                  </div>
                                  <div className="text-[var(--secondary)] capitalize">
                                    Status: {cfg.label}
                                  </div>
                                  {campaign.auto_run && campaign.auto_run.total_chunks > 0 && (
                                    <div className="text-[var(--secondary)]">
                                      Chunks: {campaign.auto_run.chunks_done}/{campaign.auto_run.total_chunks}
                                    </div>
                                  )}
                                  {campaign.records_count != null && (
                                    <div className="text-[var(--secondary)] flex items-center gap-1">
                                      <Clock className="w-3 h-3 shrink-0" />
                                      {campaign.records_count.toLocaleString()} records
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <EmptyCellContent />
                        )}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Side panel */}
      {selected && (
        <SidePanel
          campaign={selected.campaign}
          phase={selected.phase}
          clientId={selectedClientId}
          onClose={() => setSelected(null)}
          onAction={() => fetchMonitor(false)}
        />
      )}
    </div>
  );
}
