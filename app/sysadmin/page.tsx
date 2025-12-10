'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

// ============================================================================
// TYPES
// ============================================================================

interface HealthComponent {
  id: string;
  name: string;
  group: string;
  status: 'UP' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';
  statusText: string;
  message?: string;
  latencyMs?: number;
  checkedAt: string;
}

interface HealthResponse {
  overall: 'UP' | 'DEGRADED' | 'DOWN';
  checkedAt: string;
  components: HealthComponent[];
}

interface LogEntry {
  id: number;
  createdAt: string;
  category: string;
  componentId: string | null;
  status: string | null;
  statusText: string | null;
  level: string;
  message: string;
  actorEmail: string | null;
  source: string | null;
}

// ============================================================================
// STATUS DOT COMPONENT
// ============================================================================

const STATUS_COLORS: Record<string, string> = {
  UP: 'bg-green-500',
  DEGRADED: 'bg-amber-400',
  DOWN: 'bg-red-500',
  UNKNOWN: 'bg-gray-400',
};

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={`inline-block h-3 w-3 rounded-full ${STATUS_COLORS[status] || STATUS_COLORS.UNKNOWN}`}
      aria-label={status}
    />
  );
}

// ============================================================================
// LEVEL BADGE COMPONENT
// ============================================================================

function LevelBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    INFO: 'bg-blue-100 text-blue-800',
    WARN: 'bg-amber-100 text-amber-800',
    ERROR: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[level] || 'bg-gray-100 text-gray-800'}`}>
      {level}
    </span>
  );
}

// ============================================================================
// CATEGORY BADGE COMPONENT
// ============================================================================

function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    HEALTH: 'bg-emerald-100 text-emerald-800',
    SYSTEM: 'bg-slate-100 text-slate-800',
    AUTH: 'bg-blue-100 text-blue-800',
    CALLS: 'bg-green-100 text-green-800',
    EXCLUSIONS: 'bg-yellow-100 text-yellow-800',
    CRON: 'bg-purple-100 text-purple-800',
    CONFIG: 'bg-orange-100 text-orange-800',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[category] || 'bg-gray-100 text-gray-800'}`}>
      {category}
    </span>
  );
}

// ============================================================================
// HEALTH CARD COMPONENT
// ============================================================================

function HealthCard({ component }: { component: HealthComponent }) {
  const timeAgo = getTimeAgo(component.checkedAt);

  return (
    <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
      <div className="flex items-center gap-3">
        <StatusDot status={component.status} />
        <div>
          <p className="font-medium text-slate-900">{component.name}</p>
          <p className="text-sm text-slate-500">{component.statusText}</p>
        </div>
      </div>
      <div className="text-right">
        {component.latencyMs !== undefined && (
          <p className="text-sm font-mono text-slate-600">{component.latencyMs}ms</p>
        )}
        <p className="text-xs text-slate-400">{timeAgo}</p>
      </div>
    </div>
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getTimeAgo(isoString: string): string {
  const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export default function SysadminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Health state
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);

  // Logs state
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [levelFilter, setLevelFilter] = useState<string>('ALL');

  // Check SuperAdmin from session
  const isSuperAdmin = session?.user?.is_superadmin === true;

  // Redirect non-SuperAdmin users
  useEffect(() => {
    if (status === 'loading') return;
    if (!session || !isSuperAdmin) {
      router.push('/AcadianDashboard');
    }
  }, [session, status, isSuperAdmin, router]);

  // Fetch health data
  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/sysadmin/health');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: HealthResponse = await res.json();
      setHealth(data);
      setHealthError(null);
    } catch (err) {
      setHealthError(err instanceof Error ? err.message : 'Failed to fetch health');
    } finally {
      setHealthLoading(false);
    }
  }, []);

  // Fetch logs
  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (categoryFilter !== 'ALL') params.set('category', categoryFilter);
      if (levelFilter !== 'ALL') params.set('level', levelFilter);

      const res = await fetch(`/api/sysadmin/logs?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLogs(data.logs || []);
      setLogsError(null);
    } catch (err) {
      setLogsError(err instanceof Error ? err.message : 'Failed to fetch logs');
    } finally {
      setLogsLoading(false);
    }
  }, [categoryFilter, levelFilter]);

  // Initial fetch and polling
  useEffect(() => {
    if (!isSuperAdmin) return;

    fetchHealth();
    fetchLogs();

    // Poll health every 30 seconds
    const healthInterval = setInterval(fetchHealth, 30000);
    // Poll logs every 5 seconds
    const logsInterval = setInterval(fetchLogs, 5000);

    return () => {
      clearInterval(healthInterval);
      clearInterval(logsInterval);
    };
  }, [isSuperAdmin, fetchHealth, fetchLogs]);

  // Loading state
  if (status === 'loading' || !isSuperAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-600 text-lg">Loading...</div>
      </div>
    );
  }

  // Separate components by group
  const coreComponents = health?.components.filter((c) => c.group === 'CORE') || [];
  const externalComponents = health?.components.filter((c) => c.group === 'EXTERNAL') || [];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/AcadianDashboard')}
              className="text-slate-500 hover:text-slate-900 transition-colors text-sm"
            >
              Back to Dashboard
            </button>
            <h1 className="text-2xl font-bold text-[#004437]">Sysadmin Console</h1>
          </div>
          <div className="text-sm text-slate-500">
            Logged in as: <span className="text-slate-900 font-medium">{session?.user?.email}</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Overall Status Banner */}
        {health && (
          <div className={`rounded-xl p-4 flex items-center gap-3 ${
            health.overall === 'UP' ? 'bg-green-50 border border-green-200' :
            health.overall === 'DEGRADED' ? 'bg-amber-50 border border-amber-200' :
            'bg-red-50 border border-red-200'
          }`}>
            <StatusDot status={health.overall} />
            <span className="font-medium text-slate-900">
              {health.overall === 'UP' ? 'All Systems Operational' :
               health.overall === 'DEGRADED' ? 'Some Systems Degraded' :
               'System Issues Detected'}
            </span>
            <span className="text-sm text-slate-500 ml-auto">
              Last checked: {getTimeAgo(health.checkedAt)}
            </span>
          </div>
        )}

        {/* Health Error */}
        {healthError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-800">
            Health check error: {healthError}
          </div>
        )}

        {/* Core Platform Health */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Core Platform Health</h2>
          {healthLoading ? (
            <div className="text-slate-500">Loading health status...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {coreComponents.map((c) => (
                <HealthCard key={c.id} component={c} />
              ))}
            </div>
          )}
        </section>

        {/* External Services */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">External Services</h2>
          {healthLoading ? (
            <div className="text-slate-500">Loading health status...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {externalComponents.map((c) => (
                <HealthCard key={c.id} component={c} />
              ))}
            </div>
          )}
        </section>

        {/* System Logs */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">System Logs</h2>
            <div className="flex items-center gap-3">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-700"
              >
                <option value="ALL">All Categories</option>
                <option value="HEALTH">HEALTH</option>
                <option value="SYSTEM">SYSTEM</option>
                <option value="AUTH">AUTH</option>
                <option value="CALLS">CALLS</option>
                <option value="CRON">CRON</option>
                <option value="EXCLUSIONS">EXCLUSIONS</option>
              </select>
              <select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-700"
              >
                <option value="ALL">All Levels</option>
                <option value="INFO">INFO</option>
                <option value="WARN">WARN</option>
                <option value="ERROR">ERROR</option>
              </select>
            </div>
          </div>

          {logsError && (
            <div className="px-6 py-4 bg-red-50 text-red-800">{logsError}</div>
          )}

          {logsLoading ? (
            <div className="px-6 py-8 text-center text-slate-500">Loading logs...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-slate-600 font-medium">Time</th>
                    <th className="px-4 py-3 text-left text-slate-600 font-medium">Category</th>
                    <th className="px-4 py-3 text-left text-slate-600 font-medium">Component</th>
                    <th className="px-4 py-3 text-left text-slate-600 font-medium">Level</th>
                    <th className="px-4 py-3 text-left text-slate-600 font-medium">Message</th>
                    <th className="px-4 py-3 text-left text-slate-600 font-medium">Status</th>
                    <th className="px-4 py-3 text-left text-slate-600 font-medium">Actor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                        No log entries found
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <CategoryBadge category={log.category} />
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {log.componentId || '-'}
                        </td>
                        <td className="px-4 py-3">
                          <LevelBadge level={log.level} />
                        </td>
                        <td className="px-4 py-3 text-slate-900 max-w-md truncate">
                          {log.message}
                        </td>
                        <td className="px-4 py-3">
                          {log.status ? (
                            <div className="flex items-center gap-2">
                              <StatusDot status={log.status} />
                              <span className="text-xs text-slate-600">{log.statusText}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">
                          {log.actorEmail || '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

