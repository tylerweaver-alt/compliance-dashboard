'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

// ============================================================================
// Constants
// ============================================================================

const ACADIAN_LOGO_URL = '/Images/Acadian_no_background.png';
const NEON_ICON_URL = '/Images/Neon_without_background.png';
const VERCEL_ICON_URL = '/Images/Vercel_no_background.png';
const SQL_ICON_URL = '/Images/SQL_Logo_Without_Background.png';

const NEON_BRANCH_NAME = 'production';
const NEON_DB_FRIENDLY_NAME = 'CADalytix - Acadian Ambulance Compliance Database';
const VERCEL_PROJECT_FRIENDLY_NAME = 'CADalytix - Acadian Ambulance Compliance Dashboard';

// ============================================================================
// Types
// ============================================================================

interface NeonStatus {
  ok: boolean;
  latency_ms: number;
  error: string | null;
}

interface VercelStatus {
  ok: boolean;
  message: string;
}

interface AutoExclusionStatus {
  status: string;
  message: string;
}

interface IngestionSource {
  id: number;
  type: string;
  enabled: boolean;
  watermark_ts: string | null;
  watermark_id: number | null;
  batch_size: number;
  poll_interval_ms: number;
  updated_at: string;
}

interface WorkerStatus {
  state: string;
  last_heartbeat_at: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
  last_ingested_call_id: string | null;
  last_ingested_ts: string | null;
  rows_ingested_total: number;
  rows_ingested_last_60s: number;
  avg_rows_per_sec_60s: number;
  current_lag_seconds: number;
  uptime_seconds: number;
  downtime_seconds: number | null;
}

interface IngestionLog {
  id: number;
  level: string;
  event_type: string;
  message: string;
  metadata: any;
  created_at: string;
}

interface ServiceLog {
  id: number;
  run_id: string;
  service: string;
  action: string;
  step: string | null;
  level: string;
  message: string;
  latency_ms: number | null;
  actor_email: string | null;
  metadata: any;
  created_at: string;
}

interface SysadminStatus {
  neon: NeonStatus;
  vercel: VercelStatus;
  autoExclusion: AutoExclusionStatus;
  ingestion: {
    source: IngestionSource | null;
    worker: WorkerStatus | null;
    recent_logs: IngestionLog[];
    error?: string;
  } | null;
}

interface SqlIngestConfig {
  source_id: number;
  host: string | null;
  port: number;
  database: string | null;
  username: string | null;
  has_password: boolean;
  encrypt_connection: boolean;
  trust_server_cert: boolean;
  batch_size: number;
  poll_interval_ms: number;
  enabled: boolean;
  encryption_configured: boolean;
}

interface SqlIngestStatus {
  source: IngestionSource | null;
  secrets: {
    host: string | null;
    port: number;
    database: string | null;
    username: string | null;
    has_password: boolean;
    encrypt_connection: boolean;
    trust_server_cert: boolean;
  } | null;
  worker: WorkerStatus | null;
  credentials_configured: boolean;
  encryption_configured: boolean;
  worker_alive: boolean;
  effective_state: string;
}

// ============================================================================
// Status Pill Component (Premium)
// ============================================================================

function StatusPill({ state }: { state: string }) {
  const colors: Record<string, string> = {
    RUNNING: 'bg-green-50 text-green-700 border-green-200 shadow-sm shadow-green-100',
    IDLE: 'bg-slate-50 text-slate-600 border-slate-200 shadow-sm shadow-slate-100',
    CONNECTING: 'bg-amber-50 text-amber-700 border-amber-200 shadow-sm shadow-amber-100',
    ERROR: 'bg-red-50 text-red-700 border-red-200 shadow-sm shadow-red-100',
    DISABLED: 'bg-slate-50 text-slate-400 border-slate-200',
    SUCCESS: 'bg-green-50 text-green-700 border-green-200 shadow-sm shadow-green-100',
    INFO: 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm shadow-blue-100',
    WARN: 'bg-amber-50 text-amber-700 border-amber-200 shadow-sm shadow-amber-100',
    NOT_IMPLEMENTED: 'bg-slate-100 text-slate-500 border-slate-300',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded-full border ${colors[state] || colors.IDLE}`}>
      {state.replace('_', ' ')}
    </span>
  );
}

// ============================================================================
// Card Label Component (Premium Typography)
// ============================================================================

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">
      {children}
    </p>
  );
}

// ============================================================================
// Card Message Component (Premium Typography)
// ============================================================================

function CardMessage({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'error' | 'muted' }) {
  const styles = {
    default: 'text-xs font-medium text-slate-800',
    error: 'text-xs font-medium text-red-600',
    muted: 'text-xs text-slate-500 italic',
  };
  return <p className={styles[variant]}>{children}</p>;
}

// ============================================================================
// Card Component (Compact & Crisp)
// ============================================================================

interface CardProps {
  title?: string;
  iconSrc?: string;
  iconOnly?: boolean;  // If true, show only the icon (larger) with no title text
  iconSize?: 'sm' | 'md' | 'lg' | 'xl' | 'xxl' | 'xxxl';  // Icon size: sm=h-5, md=h-8, lg=h-12, xl=h-16, xxl=h-20, xxxl=h-[7.5rem]
  mode?: 'tile' | 'panel';  // tile = compact top-row cards, panel = larger content cards
  right?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

function Card({ title, iconSrc, iconOnly = false, iconSize = 'sm', mode = 'panel', right, footer, children, className = '' }: CardProps) {
  const iconSizeClass = {
    sm: 'h-5 w-5',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16',
    xxl: 'h-20 w-20',
    xxxl: 'h-[7.5rem] w-[7.5rem]',
  }[iconSize];

  // Mode-based padding
  const bodyPadding = mode === 'tile' ? 'px-3 py-2' : 'px-4 py-3';
  const footerPadding = mode === 'tile' ? 'px-3 py-2' : 'px-4 py-3';

  // Monitor-first separation: darker border, stronger ring, more obvious shadow, no translate hover
  const wrapperClasses = 'bg-white rounded-lg border border-slate-300 ring-1 ring-black/10 shadow-[0_10px_30px_rgba(15,23,42,0.12)] flex flex-col transition-shadow duration-150 hover:shadow-[0_14px_38px_rgba(15,23,42,0.16)] hover:ring-black/15';

  // Icon-only header: centered layout with absolute right element
  if (iconOnly) {
    return (
      <div className={`${wrapperClasses} ${className}`}>
        <div className="relative flex items-center justify-center p-2 border-b border-slate-200/80">
          {iconSrc && (
            <img src={iconSrc} alt="" className={`${iconSizeClass} object-contain drop-shadow-[0_1px_0_rgba(0,0,0,0.08)]`} />
          )}
          {right && <div className="absolute top-2 right-2">{right}</div>}
        </div>
        <div className={`${bodyPadding} flex-1`}>{children}</div>
        {footer && (
          <div className={`${footerPadding} border-t border-slate-200/80 bg-slate-50/60`}>
            {footer}
          </div>
        )}
      </div>
    );
  }

  // Standard header: row layout
  return (
    <div className={`${wrapperClasses} ${className}`}>
      <div className="px-3 py-2 border-b border-slate-200/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {iconSrc && (
            <img src={iconSrc} alt="" className={`${iconSizeClass} object-contain drop-shadow-[0_1px_0_rgba(0,0,0,0.08)]`} />
          )}
          {title && (
            <h3 className="text-sm font-semibold text-slate-900 tracking-tight">{title}</h3>
          )}
        </div>
        {right && <div className="flex items-center gap-2">{right}</div>}
      </div>
      <div className={`${bodyPadding} flex-1`}>{children}</div>
      {footer && (
        <div className={`${footerPadding} border-t border-slate-200/80 bg-slate-50/60`}>
          {footer}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Primary Button Component
// ============================================================================

function PrimaryButton({
  children,
  onClick,
  disabled = false,
  loading = false,
  className = ''
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300/80 bg-slate-50 shadow-sm hover:bg-slate-100 hover:border-slate-400 hover:shadow text-slate-700 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 ${className}`}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-1.5">
          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading...
        </span>
      ) : children}
    </button>
  );
}

// ============================================================================
// Secondary Button Component
// ============================================================================

function SecondaryButton({
  children,
  onClick,
  disabled = false,
  className = ''
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300/80 bg-white shadow-sm hover:bg-slate-50 hover:border-slate-400 hover:shadow text-slate-600 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 ${className}`}
    >
      {children}
    </button>
  );
}

// ============================================================================
// Log Level Badge
// ============================================================================

function LogLevelBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    ERROR: 'bg-red-100 text-red-700',
    WARN: 'bg-amber-100 text-amber-700',
    INFO: 'bg-slate-100 text-slate-600',
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[level] || colors.INFO}`}>
      {level}
    </span>
  );
}

// ============================================================================
// Main Sysadmin Page
// ============================================================================

export default function SysadminPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const logsRef = useRef<HTMLDivElement>(null);

  // Status state
  const [status, setStatus] = useState<SysadminStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Action states
  const [testingNeon, setTestingNeon] = useState(false);
  const [testingVercel, setTestingVercel] = useState(false);
  const [testingSqlServer, setTestingSqlServer] = useState(false);
  const [runningTick, setRunningTick] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Unified logs state
  const [serviceLogs, setServiceLogs] = useState<ServiceLog[]>([]);
  const [logFilter, setLogFilter] = useState<'all' | 'neon' | 'vercel' | 'sqlserver'>('all');
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);

  // SQL Server Ingestion Config state
  const [sqlIngestStatus, setSqlIngestStatus] = useState<SqlIngestStatus | null>(null);
  const [sqlConfigForm, setSqlConfigForm] = useState({
    host: '',
    port: 1433,
    database: '',
    username: '',
    password: '',
    encrypt_connection: true,
    trust_server_cert: false,
    batch_size: 500,
    poll_interval_ms: 10000,
  });
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaveMessage, setConfigSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Auth check
  const isSuperadmin = session?.user?.is_superadmin === true;

  // Fetch unified logs
  const fetchLogs = useCallback(async (filter: string = 'all') => {
    try {
      const res = await fetch(`/api/sysadmin/logs?service=${filter}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setServiceLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    }
  }, []);

  // Fetch status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/sysadmin/status');
      if (res.status === 403) {
        setError('Access denied. Superadmin privileges required.');
        return;
      }
      if (!res.ok) throw new Error('Failed to fetch status');
      const data = await res.json();
      setStatus(data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch SQL Ingest Status
  const fetchSqlIngestStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/sysadmin/sql-ingest/status');
      if (res.ok) {
        const data = await res.json();
        setSqlIngestStatus(data);
        // Populate form with existing config (but not password)
        if (data.secrets) {
          setSqlConfigForm(prev => ({
            ...prev,
            host: data.secrets.host || '',
            port: data.secrets.port || 1433,
            database: data.secrets.database || '',
            username: data.secrets.username || '',
            encrypt_connection: data.secrets.encrypt_connection ?? true,
            trust_server_cert: data.secrets.trust_server_cert ?? false,
          }));
        }
        if (data.source) {
          setSqlConfigForm(prev => ({
            ...prev,
            batch_size: data.source.batch_size || 500,
            poll_interval_ms: data.source.poll_interval_ms || 10000,
          }));
        }
      }
    } catch (err) {
      console.error('Failed to fetch SQL ingest status:', err);
    }
  }, []);

  // Manual refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchStatus(), fetchLogs(logFilter), fetchSqlIngestStatus()]);
    setRefreshing(false);
  };

  // Save SQL Config
  const handleSaveConfig = async () => {
    setSavingConfig(true);
    setConfigSaveMessage(null);
    try {
      const res = await fetch('/api/sysadmin/sql-ingest/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sqlConfigForm),
      });
      const data = await res.json();
      if (res.ok) {
        setConfigSaveMessage({ type: 'success', text: 'Configuration saved successfully' });
        setSqlConfigForm(prev => ({ ...prev, password: '' })); // Clear password after save
        await fetchSqlIngestStatus();
      } else {
        setConfigSaveMessage({ type: 'error', text: data.error || 'Failed to save configuration' });
      }
    } catch (err: any) {
      setConfigSaveMessage({ type: 'error', text: err.message });
    } finally {
      setSavingConfig(false);
    }
  };

  // Connect (enable ingestion)
  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await fetch('/api/sysadmin/sql-ingest/connect', { method: 'POST' });
      if (res.ok) {
        await Promise.all([fetchStatus(), fetchSqlIngestStatus(), fetchLogs(logFilter)]);
      }
    } finally {
      setConnecting(false);
    }
  };

  // Disconnect (disable ingestion)
  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch('/api/sysadmin/sql-ingest/disconnect', { method: 'POST' });
      if (res.ok) {
        await Promise.all([fetchStatus(), fetchSqlIngestStatus(), fetchLogs(logFilter)]);
      }
    } finally {
      setDisconnecting(false);
    }
  };

  // Scroll to logs and set filter
  const scrollToLogs = (filter: 'neon' | 'vercel' | 'sqlserver') => {
    setLogFilter(filter);
    fetchLogs(filter);
    logsRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Initial fetch and polling
  useEffect(() => {
    if (authStatus === 'loading') return;
    if (!session) {
      router.push('/AcadianDashboard');
      return;
    }
    if (!isSuperadmin) {
      setError('Access denied. Superadmin privileges required.');
      setLoading(false);
      return;
    }

    fetchStatus();
    fetchLogs(logFilter);
    fetchSqlIngestStatus();
    const interval = setInterval(() => {
      fetchStatus();
      fetchLogs(logFilter);
      fetchSqlIngestStatus();
    }, 5000);
    return () => clearInterval(interval);
  }, [authStatus, session, isSuperadmin, fetchStatus, fetchLogs, fetchSqlIngestStatus, logFilter, router]);

  // Test Neon
  const handleTestNeon = async () => {
    setTestingNeon(true);
    try {
      await fetch('/api/sysadmin/neon/test', { method: 'POST' });
      await Promise.all([fetchStatus(), fetchLogs(logFilter)]);
    } finally {
      setTestingNeon(false);
    }
  };

  // Test Vercel
  const handleTestVercel = async () => {
    setTestingVercel(true);
    try {
      await fetch('/api/sysadmin/vercel/test', { method: 'POST' });
      await Promise.all([fetchStatus(), fetchLogs(logFilter)]);
    } finally {
      setTestingVercel(false);
    }
  };

  // Test SQL Server
  const handleTestSqlServer = async () => {
    setTestingSqlServer(true);
    try {
      await fetch('/api/sysadmin/sql-ingest/test-connection', { method: 'POST' });
      await Promise.all([fetchStatus(), fetchSqlIngestStatus(), fetchLogs(logFilter)]);
    } finally {
      setTestingSqlServer(false);
    }
  };

  // Run tick
  const handleRunTick = async () => {
    setRunningTick(true);
    try {
      await fetch('/api/sysadmin/ingestion/tick', { method: 'POST' });
      await Promise.all([fetchStatus(), fetchLogs(logFilter)]);
    } finally {
      setRunningTick(false);
    }
  };

  // Loading state
  if (authStatus === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-slate-600">Loading...</div>
      </div>
    );
  }

  // Error state
  if (error && !status) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="bg-white p-6 rounded-lg border border-red-200 shadow-sm">
          <h2 className="text-lg font-semibold text-red-700 mb-2">Access Denied</h2>
          <p className="text-slate-600">{error}</p>
          <button
            onClick={() => router.push('/AcadianDashboard')}
            className="mt-4 px-4 py-2 bg-slate-100 text-slate-700 rounded hover:bg-slate-200"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const ingestion = status?.ingestion;
  const ingestionLogs = ingestion?.recent_logs || [];

  return (
    <div className="h-screen bg-slate-100 overflow-y-auto">
      {/* Header */}
      <header className="bg-white border-b border-slate-300 px-4 py-2.5 sticky top-0 z-10 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <img src={ACADIAN_LOGO_URL} alt="Acadian" className="h-8" />
            <div>
              <h1 className="text-base font-semibold text-slate-900 tracking-tight">Sysadmin Portal</h1>
              {lastUpdated && (
                <p className="text-[10px] text-slate-400 font-medium">
                  Last updated: {lastUpdated.toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-2.5 py-1.5 text-xs font-medium bg-white text-slate-700 rounded-md border border-slate-300/80 shadow-sm hover:bg-slate-50 hover:border-slate-400 hover:shadow disabled:opacity-50 flex items-center gap-1 transition-all duration-150 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1"
            >
              <svg className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <div className="relative group">
              <button
                disabled
                className="px-2.5 py-1.5 text-xs font-medium bg-white text-slate-400 rounded-md border border-slate-300/80 shadow-sm cursor-not-allowed"
              >
                Archives
              </button>
              <div className="absolute right-0 top-full mt-1 px-2 py-1 bg-slate-900 text-white text-[10px] rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-lg">
                Coming soon
              </div>
            </div>
            <button
              onClick={() => router.push('/AcadianDashboard')}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-50 rounded-md border border-slate-300/80 shadow-sm transition-all duration-150 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1"
            >
              ← Back
            </button>
          </div>
        </div>
      </header>

      <main className="p-4 max-w-7xl mx-auto space-y-4">
        {/* Top Row: Service Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Neon Card - Icon only header, extra large icon */}
          <Card
            iconSrc={NEON_ICON_URL}
            iconOnly={true}
            iconSize="xxxl"
            mode="tile"
            right={
              <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] text-slate-400 font-mono bg-slate-100 rounded border border-slate-200">
                {status?.neon?.latency_ms ? `${status.neon.latency_ms}ms` : '—'}
              </span>
            }
            footer={
              <div className="flex gap-1.5">
                <PrimaryButton onClick={handleTestNeon} loading={testingNeon}>
                  Test Connection
                </PrimaryButton>
                <SecondaryButton onClick={() => scrollToLogs('neon')}>
                  View Logs
                </SecondaryButton>
              </div>
            }
          >
            <CardLabel>Connectivity</CardLabel>
            <div className="mb-1">
              <StatusPill state={status?.neon?.ok ? 'RUNNING' : 'ERROR'} />
            </div>
            {status?.neon?.error ? (
              <CardMessage variant="error">{status.neon.error}</CardMessage>
            ) : (
              <CardMessage>Database connection healthy</CardMessage>
            )}
            <div className="mt-1.5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Branch</span>
                <span className="text-xs font-semibold text-slate-800 font-mono">{NEON_BRANCH_NAME}</span>
              </div>
              <div className="text-[11px] font-semibold text-slate-800 leading-snug">
                {NEON_DB_FRIENDLY_NAME}
              </div>
            </div>
          </Card>

          {/* Vercel Card - Icon only header, extra large icon */}
          <Card
            iconSrc={VERCEL_ICON_URL}
            iconOnly={true}
            iconSize="xxxl"
            mode="tile"
            footer={
              <div className="flex gap-1.5">
                <PrimaryButton onClick={handleTestVercel} loading={testingVercel}>
                  Test Connection
                </PrimaryButton>
                <SecondaryButton onClick={() => scrollToLogs('vercel')}>
                  View Logs
                </SecondaryButton>
              </div>
            }
          >
            <CardLabel>Platform Health</CardLabel>
            <div className="mb-1">
              <StatusPill state={status?.vercel?.ok ? 'RUNNING' : 'ERROR'} />
            </div>
            <CardMessage>{status?.vercel?.message || '—'}</CardMessage>
            <div className="mt-1.5 text-[11px] font-semibold text-slate-800 leading-snug">
              {VERCEL_PROJECT_FRIENDLY_NAME}
            </div>
          </Card>

          {/* Auto-Exclusion Card */}
          <Card title="Auto-Exclusion Engine" mode="tile">
            <CardLabel>Automation</CardLabel>
            <div className="mb-1">
              <StatusPill state={status?.autoExclusion?.status === 'NOT_IMPLEMENTED' ? 'NOT_IMPLEMENTED' : (status?.autoExclusion?.status || 'DISABLED')} />
            </div>
            <CardMessage variant="muted">{status?.autoExclusion?.message || 'Not implemented'}</CardMessage>
          </Card>
        </div>

        {/* SQL Server Ingestion Section */}
        <section>
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <div className="p-1 bg-slate-50 rounded border border-slate-200">
                <img src={SQL_ICON_URL} alt="" className="h-5 w-auto object-contain" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900 tracking-tight">SQL Server Live Ingestion</h2>
                <p className="text-[9px] text-slate-500 uppercase tracking-wider font-medium">Configuration + Pipeline Control + Telemetry</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill state={sqlIngestStatus?.effective_state || 'NOT_CONFIGURED'} />
              {sqlIngestStatus?.encryption_configured === false && (
                <span className="text-[10px] text-amber-600 font-medium">⚠ APP_MASTER_KEY not set</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* Configuration Card */}
            <Card title="Connection Configuration" mode="tile" className="lg:col-span-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Host</label>
                  <input
                    type="text"
                    value={sqlConfigForm.host}
                    onChange={(e) => setSqlConfigForm(prev => ({ ...prev, host: e.target.value }))}
                    placeholder="sql-server.example.com"
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Port</label>
                  <input
                    type="number"
                    value={sqlConfigForm.port}
                    onChange={(e) => setSqlConfigForm(prev => ({ ...prev, port: parseInt(e.target.value) || 1433 }))}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-blue-400 focus:border-blue-400 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Database</label>
                  <input
                    type="text"
                    value={sqlConfigForm.database}
                    onChange={(e) => setSqlConfigForm(prev => ({ ...prev, database: e.target.value }))}
                    placeholder="CAD_Database"
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Username</label>
                  <input
                    type="text"
                    value={sqlConfigForm.username}
                    onChange={(e) => setSqlConfigForm(prev => ({ ...prev, username: e.target.value }))}
                    placeholder="sa"
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">
                    Password {sqlIngestStatus?.secrets?.has_password && <span className="text-green-600">(saved)</span>}
                  </label>
                  <input
                    type="password"
                    value={sqlConfigForm.password}
                    onChange={(e) => setSqlConfigForm(prev => ({ ...prev, password: e.target.value }))}
                    placeholder={sqlIngestStatus?.secrets?.has_password ? '••••••••' : 'Enter password'}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-[10px] text-slate-600">
                    <input
                      type="checkbox"
                      checked={sqlConfigForm.encrypt_connection}
                      onChange={(e) => setSqlConfigForm(prev => ({ ...prev, encrypt_connection: e.target.checked }))}
                      className="rounded border-slate-300"
                    />
                    Encrypt
                  </label>
                  <label className="flex items-center gap-1.5 text-[10px] text-slate-600">
                    <input
                      type="checkbox"
                      checked={sqlConfigForm.trust_server_cert}
                      onChange={(e) => setSqlConfigForm(prev => ({ ...prev, trust_server_cert: e.target.checked }))}
                      className="rounded border-slate-300"
                    />
                    Trust Cert
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Batch</label>
                    <input
                      type="number"
                      value={sqlConfigForm.batch_size}
                      onChange={(e) => setSqlConfigForm(prev => ({ ...prev, batch_size: parseInt(e.target.value) || 500 }))}
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-blue-400 focus:border-blue-400 font-mono"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Poll (ms)</label>
                    <input
                      type="number"
                      value={sqlConfigForm.poll_interval_ms}
                      onChange={(e) => setSqlConfigForm(prev => ({ ...prev, poll_interval_ms: parseInt(e.target.value) || 10000 }))}
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-blue-400 focus:border-blue-400 font-mono"
                    />
                  </div>
                </div>
              </div>
              {configSaveMessage && (
                <div className={`mt-2 p-1.5 rounded text-[10px] font-medium ${configSaveMessage.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {configSaveMessage.text}
                </div>
              )}
              <div className="flex gap-1.5 mt-3">
                <PrimaryButton onClick={handleSaveConfig} loading={savingConfig} disabled={!sqlIngestStatus?.encryption_configured}>
                  Save Configuration
                </PrimaryButton>
                <PrimaryButton onClick={handleTestSqlServer} loading={testingSqlServer} disabled={!sqlIngestStatus?.credentials_configured}>
                  Test Connection
                </PrimaryButton>
              </div>
            </Card>

            {/* Control Card */}
            <Card title="Pipeline Control" mode="tile">
              <div className="space-y-2">
                <div className="flex items-center justify-between py-1 border-b border-slate-100">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">State</span>
                  <StatusPill state={sqlIngestStatus?.effective_state || 'NOT_CONFIGURED'} />
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-100">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Worker Alive</span>
                  <span className={`text-xs font-medium ${sqlIngestStatus?.worker_alive ? 'text-green-600' : 'text-slate-400'}`}>
                    {sqlIngestStatus?.worker_alive ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  {!sqlIngestStatus?.source?.enabled ? (
                    <PrimaryButton
                      onClick={handleConnect}
                      loading={connecting}
                      disabled={!sqlIngestStatus?.credentials_configured}
                      className="flex-1"
                    >
                      Connect
                    </PrimaryButton>
                  ) : (
                    <SecondaryButton
                      onClick={handleDisconnect}
                      disabled={disconnecting}
                      className="flex-1"
                    >
                      {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                    </SecondaryButton>
                  )}
                </div>
                <button
                  onClick={handleRunTick}
                  disabled={runningTick || !sqlIngestStatus?.source?.enabled}
                  className="w-full px-2 py-1.5 text-[10px] font-medium rounded border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-300 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                  {runningTick ? 'Running...' : 'Run Single Tick'}
                </button>
              </div>
            </Card>

            {/* Worker Status Card */}
            <Card title="Worker Status" mode="tile">
              <div className="mb-1">
                <StatusPill state={sqlIngestStatus?.worker?.state || 'NOT_CONFIGURED'} />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between items-center py-1 border-b border-slate-100">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Last Heartbeat</span>
                  <span className="text-xs font-medium text-slate-800">
                    {sqlIngestStatus?.worker?.last_heartbeat_at ? new Date(sqlIngestStatus.worker.last_heartbeat_at).toLocaleTimeString() : '—'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-100">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Last Success</span>
                  <span className="text-xs font-medium text-slate-800">
                    {sqlIngestStatus?.worker?.last_success_at ? new Date(sqlIngestStatus.worker.last_success_at).toLocaleTimeString() : '—'}
                  </span>
                </div>
                {sqlIngestStatus?.worker?.last_error_message && (
                  <div className="p-1.5 bg-red-50 rounded border border-red-200 text-red-600 text-[10px] font-medium">
                    {sqlIngestStatus.worker.last_error_message}
                  </div>
                )}
              </div>
            </Card>

            {/* Metrics Card */}
            <Card title="Ingestion Metrics" mode="tile">
              <div className="space-y-1">
                <div className="flex justify-between items-center py-1 border-b border-slate-100">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Total Rows</span>
                  <span className="text-xs font-medium text-slate-800 font-mono">{sqlIngestStatus?.worker?.rows_ingested_total || 0}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-100">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Watermark</span>
                  <span className="text-[10px] font-medium text-slate-800">
                    {sqlIngestStatus?.source?.watermark_ts ? new Date(sqlIngestStatus.source.watermark_ts).toISOString().slice(0, 19) : 'None'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Watermark ID</span>
                  <span className="text-xs font-medium text-slate-800 font-mono">{sqlIngestStatus?.source?.watermark_id || '—'}</span>
                </div>
              </div>
            </Card>

            {/* Logs Card */}
            <Card title="Recent Logs" mode="tile" className="lg:col-span-1">
              <div className="max-h-32 overflow-y-auto space-y-1">
                {ingestionLogs.length === 0 ? (
                  <p className="text-[10px] text-slate-400 italic">No recent logs</p>
                ) : (
                  ingestionLogs.slice(0, 5).map((log) => (
                    <div key={log.id} className="flex items-start gap-1.5 py-1 border-b border-slate-50 last:border-0">
                      <LogLevelBadge level={log.level} />
                      <span className="text-[10px] text-slate-600 flex-1 truncate">{log.message}</span>
                    </div>
                  ))
                )}
              </div>
              <SecondaryButton onClick={() => scrollToLogs('sqlserver')} className="w-full mt-2">
                View All Logs
              </SecondaryButton>
            </Card>
          </div>
        </section>

        {/* Ingestion Logs (Legacy) */}
        {ingestionLogs.length > 0 && (
          <Card title="Recent Ingestion Logs" className="mt-3">
            <div className="overflow-x-auto -mx-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left py-2 px-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Time</th>
                    <th className="text-left py-2 px-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Level</th>
                    <th className="text-left py-2 px-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Event</th>
                    <th className="text-left py-2 px-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {ingestionLogs.slice(0, 10).map((log: IngestionLog) => (
                    <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                      <td className="py-2 px-3 text-slate-600 whitespace-nowrap font-mono">
                        {new Date(log.created_at).toLocaleTimeString()}
                      </td>
                      <td className="py-2 px-3">
                        <LogLevelBadge level={log.level} />
                      </td>
                      <td className="py-2 px-3 text-slate-700 font-mono">{log.event_type}</td>
                      <td className="py-2 px-3 text-slate-600 truncate max-w-xs">{log.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Unified Service Logs */}
        <div ref={logsRef} className="scroll-mt-16 mt-3">
          <Card
            title="Service Logs"
            right={
              <div className="flex gap-1">
                {(['all', 'neon', 'vercel', 'sqlserver'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => { setLogFilter(filter); fetchLogs(filter); }}
                    className={`px-2 py-1 text-[10px] font-medium rounded transition-all duration-150 ${
                      logFilter === filter
                        ? 'bg-slate-800 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                    }`}
                  >
                    {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                  </button>
                ))}
              </div>
            }
          >
            {serviceLogs.length === 0 ? (
              <div className="text-center py-3">
                <p className="text-xs text-slate-500">No logs yet. Run a test to generate logs.</p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left py-2 px-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Time</th>
                      <th className="text-left py-2 px-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Service</th>
                      <th className="text-left py-2 px-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Action</th>
                      <th className="text-left py-2 px-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Step</th>
                      <th className="text-left py-2 px-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Level</th>
                      <th className="text-left py-2 px-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Message</th>
                      <th className="text-left py-2 px-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {serviceLogs.map((log: ServiceLog) => (
                      <tr
                        key={log.id}
                        className={`border-b border-slate-100 cursor-pointer transition-colors ${expandedLogId === log.id ? 'bg-slate-50' : 'hover:bg-slate-50/80'}`}
                        onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                      >
                        <td className="py-2 px-3 text-slate-600 whitespace-nowrap font-mono">
                          {new Date(log.created_at).toLocaleTimeString()}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide ${
                            log.service === 'neon' ? 'bg-green-50 text-green-700 border border-green-200' :
                            log.service === 'vercel' ? 'bg-slate-800 text-white' :
                            log.service === 'sqlserver' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                            'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}>
                            {log.service}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-700 font-mono">{log.action}</td>
                        <td className="py-2 px-3 text-slate-600">{log.step || '—'}</td>
                        <td className="py-2 px-3">
                          <LogLevelBadge level={log.level} />
                        </td>
                        <td className="py-2 px-3 text-slate-600 truncate max-w-xs">{log.message}</td>
                        <td className="py-2 px-3 text-slate-500 font-mono">
                          {log.latency_ms ? `${log.latency_ms}ms` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}

