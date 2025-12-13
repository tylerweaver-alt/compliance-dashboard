'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

const ACADIAN_LOGO_URL = '/Images/Acadian_no_background.png';

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

// ============================================================================
// Status Pill Component
// ============================================================================

function StatusPill({ state }: { state: string }) {
  const colors: Record<string, string> = {
    RUNNING: 'bg-green-100 text-green-700 border-green-300',
    IDLE: 'bg-slate-100 text-slate-700 border-slate-300',
    CONNECTING: 'bg-yellow-100 text-yellow-700 border-yellow-300',
    ERROR: 'bg-red-100 text-red-700 border-red-300',
    DISABLED: 'bg-gray-100 text-gray-500 border-gray-300',
  };
  return (
    <span className={`px-3 py-1 text-sm font-medium rounded-full border ${colors[state] || colors.IDLE}`}>
      {state}
    </span>
  );
}

// ============================================================================
// Card Component
// ============================================================================

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-lg border border-slate-200 shadow-sm ${className}`}>
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ============================================================================
// Main Sysadmin Page
// ============================================================================

export default function SysadminPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const [status, setStatus] = useState<SysadminStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testingNeon, setTestingNeon] = useState(false);
  const [testingVercel, setTestingVercel] = useState(false);
  const [testingSqlServer, setTestingSqlServer] = useState(false);
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [runningTick, setRunningTick] = useState(false);

  // Auth check
  const isSuperadmin = session?.user?.is_superadmin === true;

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
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

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
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [authStatus, session, isSuperadmin, fetchStatus, router]);

  // Test Neon
  const handleTestNeon = async () => {
    setTestingNeon(true);
    try {
      await fetch('/api/sysadmin/neon/test', { method: 'POST' });
      await fetchStatus();
    } finally {
      setTestingNeon(false);
    }
  };

  // Test Vercel
  const handleTestVercel = async () => {
    setTestingVercel(true);
    try {
      await fetch('/api/sysadmin/vercel/test', { method: 'POST' });
      await fetchStatus();
    } finally {
      setTestingVercel(false);
    }
  };

  // Test SQL Server
  const handleTestSqlServer = async () => {
    setTestingSqlServer(true);
    try {
      await fetch('/api/sysadmin/ingestion/test-connection', { method: 'POST' });
      await fetchStatus();
    } finally {
      setTestingSqlServer(false);
    }
  };

  // Toggle enabled
  const handleToggleEnabled = async () => {
    if (!status?.ingestion?.source) return;
    setTogglingEnabled(true);
    try {
      await fetch('/api/sysadmin/ingestion/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !status.ingestion.source.enabled }),
      });
      await fetchStatus();
    } finally {
      setTogglingEnabled(false);
    }
  };

  // Run tick
  const handleRunTick = async () => {
    setRunningTick(true);
    try {
      await fetch('/api/sysadmin/ingestion/tick', { method: 'POST' });
      await fetchStatus();
    } finally {
      setRunningTick(false);
    }
  };

  // Loading state
  if (authStatus === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-600">Loading...</div>
      </div>
    );
  }

  // Error state
  if (error && !status) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
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
  const source = ingestion?.source;
  const worker = ingestion?.worker;
  const logs = ingestion?.recent_logs || [];

  return (
    <div className="h-screen bg-slate-50 overflow-y-auto">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={ACADIAN_LOGO_URL} alt="Acadian" className="h-10" />
            <h1 className="text-xl font-semibold text-slate-800">Sysadmin Portal</h1>
          </div>
          <button
            onClick={() => router.push('/AcadianDashboard')}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded"
          >
            ← Back to Dashboard
          </button>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {/* Neon Card */}
          <Card title="Neon Database">
            <div className="flex items-center justify-between mb-3">
              <StatusPill state={status?.neon?.ok ? 'RUNNING' : 'ERROR'} />
              <span className="text-sm text-slate-500">
                {status?.neon?.latency_ms ? `${status.neon.latency_ms}ms` : '—'}
              </span>
            </div>
            {status?.neon?.error && (
              <p className="text-sm text-red-600 mb-3">{status.neon.error}</p>
            )}
            <button
              onClick={handleTestNeon}
              disabled={testingNeon}
              className="w-full px-3 py-2 text-sm bg-slate-100 text-slate-700 rounded hover:bg-slate-200 disabled:opacity-50"
            >
              {testingNeon ? 'Testing...' : 'Test Connection'}
            </button>
          </Card>

          {/* Vercel Card */}
          <Card title="Vercel API">
            <div className="flex items-center justify-between mb-3">
              <StatusPill state={status?.vercel?.ok ? 'RUNNING' : 'ERROR'} />
            </div>
            <p className="text-sm text-slate-600 mb-3">{status?.vercel?.message || '—'}</p>
            <button
              onClick={handleTestVercel}
              disabled={testingVercel}
              className="w-full px-3 py-2 text-sm bg-slate-100 text-slate-700 rounded hover:bg-slate-200 disabled:opacity-50"
            >
              {testingVercel ? 'Testing...' : 'Test Connection'}
            </button>
          </Card>

          {/* Auto-Exclusion Card */}
          <Card title="Auto-Exclusion Engine">
            <div className="flex items-center justify-between mb-3">
              <StatusPill state={status?.autoExclusion?.status || 'DISABLED'} />
            </div>
            <p className="text-sm text-slate-500">{status?.autoExclusion?.message || 'Not implemented'}</p>
          </Card>
        </div>

        {/* SQL Server Ingestion Section */}
        <h2 className="text-lg font-semibold text-slate-800 mb-4">SQL Server Ingestion</h2>

        {ingestion?.error ? (
          <Card title="Ingestion Error">
            <p className="text-sm text-red-600">{ingestion.error}</p>
          </Card>
        ) : !source ? (
          <Card title="Ingestion Not Configured">
            <p className="text-sm text-slate-500">
              No SQL Server ingestion source found. Run the migration to create the ingestion_sources table.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {/* Connection Card */}
            <Card title="SQL Server Connection">
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Type:</span>
                  <span className="text-slate-700">{source.type}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Batch Size:</span>
                  <span className="text-slate-700">{source.batch_size}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Poll Interval:</span>
                  <span className="text-slate-700">{source.poll_interval_ms}ms</span>
                </div>
              </div>
              <button
                onClick={handleTestSqlServer}
                disabled={testingSqlServer}
                className="w-full px-3 py-2 text-sm bg-slate-100 text-slate-700 rounded hover:bg-slate-200 disabled:opacity-50"
              >
                {testingSqlServer ? 'Testing...' : 'Test SQL Server Connection'}
              </button>
            </Card>

            {/* Control Card */}
            <Card title="Ingestion Control">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-slate-600">Enabled:</span>
                <button
                  onClick={handleToggleEnabled}
                  disabled={togglingEnabled}
                  className={`px-4 py-2 text-sm rounded font-medium ${
                    source.enabled
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  } disabled:opacity-50`}
                >
                  {togglingEnabled ? '...' : source.enabled ? 'ON' : 'OFF'}
                </button>
              </div>
              <button
                onClick={handleRunTick}
                disabled={runningTick || !source.enabled}
                className="w-full px-3 py-2 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50"
              >
                {runningTick ? 'Running...' : 'Run Single Tick'}
              </button>
            </Card>

            {/* Worker Status Card */}
            <Card title="Worker Status">
              <div className="flex items-center gap-3 mb-4">
                <StatusPill state={worker?.state || 'DISABLED'} />
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Last Heartbeat:</span>
                  <span className="text-slate-700">
                    {worker?.last_heartbeat_at ? new Date(worker.last_heartbeat_at).toLocaleTimeString() : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Last Success:</span>
                  <span className="text-slate-700">
                    {worker?.last_success_at ? new Date(worker.last_success_at).toLocaleTimeString() : '—'}
                  </span>
                </div>
                {worker?.last_error_message && (
                  <div className="mt-2 p-2 bg-red-50 rounded text-red-600 text-xs">
                    {worker.last_error_message}
                  </div>
                )}
              </div>
            </Card>

            {/* Metrics Card */}
            <Card title="Ingestion Metrics">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Rows Ingested:</span>
                  <span className="text-slate-700 font-mono">{worker?.rows_ingested_total || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Watermark:</span>
                  <span className="text-slate-700 text-xs">
                    {source.watermark_ts ? new Date(source.watermark_ts).toISOString() : 'None'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Watermark ID:</span>
                  <span className="text-slate-700 font-mono">{source.watermark_id || '—'}</span>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Logs Table */}
        {logs.length > 0 && (
          <Card title="Recent Ingestion Logs" className="mt-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 px-2 text-slate-500 font-medium">Time</th>
                    <th className="text-left py-2 px-2 text-slate-500 font-medium">Level</th>
                    <th className="text-left py-2 px-2 text-slate-500 font-medium">Event</th>
                    <th className="text-left py-2 px-2 text-slate-500 font-medium">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.slice(0, 20).map((log) => (
                    <tr key={log.id} className="border-b border-slate-50">
                      <td className="py-2 px-2 text-slate-600 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleTimeString()}
                      </td>
                      <td className="py-2 px-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          log.level === 'ERROR' ? 'bg-red-100 text-red-700' :
                          log.level === 'WARN' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {log.level}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-slate-700 font-mono text-xs">{log.event_type}</td>
                      <td className="py-2 px-2 text-slate-600 truncate max-w-xs">{log.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}

