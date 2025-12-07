'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface ComplianceStats {
  totalCalls: number;
  includedCalls: number;
  excludedCalls: number;
  compliantCalls: number;
  nonCompliantCalls: number;
  compliancePercent: number;
  manualExclusions: number;
  autoExclusions: number;
}

interface ResponseTimeDistribution {
  avgMinutes: number | null;
  avgFormatted: string;
  medianMinutes: number | null;
  medianFormatted: string;
  p75Minutes: number | null;
  p75Formatted: string;
  p90Minutes: number | null;
  p90Formatted: string;
  p95Minutes: number | null;
  p95Formatted: string;
}

interface DailyTrend {
  date: string;
  totalCalls: number;
  compliantCalls: number;
  nonCompliantCalls: number;
  compliancePercent: number;
  avgResponseMinutes: number | null;
}

interface HourlyVolume {
  hour: number;
  callCount: number;
  avgResponseMinutes: number | null;
}

interface PeakHour {
  hour: number;
  label: string;
  callCount: number;
}

interface RegionStats {
  ok: boolean;
  region: { id: number; name: string };
  dateRange: { start: string | null; end: string | null };
  compliance: ComplianceStats;
  outcomes: {
    totalCalls: number;
    priorityCalls: number;
    excludedCalls: number;
    transports: number;
    refusals: number;
    cancelled: number;
    noPatient: number;
    transfusalRate: number | null;
  };
  responseTimeDistribution: ResponseTimeDistribution;
  dailyTrend: DailyTrend[];
  hourlyVolume: HourlyVolume[];
  peakHours: PeakHour[];
  hospitals: Array<{ name: string; count: number }>;
  exclusions: Array<{ reason: string; count: number }>;
  parishBreakdown: Array<{ id: number; name: string; totalCalls: number; priorityCalls: number; excludedCalls: number; compliancePercent: number | null }>;
}

function RegionStatsContent() {
  const searchParams = useSearchParams();
  const regionId = searchParams.get('regionId');
  const start = searchParams.get('start');
  const end = searchParams.get('end');

  const [stats, setStats] = useState<RegionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!regionId) {
      setError('Region ID is required');
      setLoading(false);
      return;
    }

    const fetchStats = async () => {
      try {
        const params = new URLSearchParams();
        params.set('regionId', regionId);
        if (start) params.set('start', start);
        if (end) params.set('end', end);

        const res = await fetch(`/api/stats/region?${params.toString()}`);
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || 'Failed to fetch stats');
        } else {
          setStats(data);
        }
      } catch (err) {
        setError('Failed to fetch stats');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [regionId, start, end]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-500">Loading statistics...</p>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-6xl mx-auto">
          <button onClick={() => window.history.back()} className="text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1 mb-4">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back to Dashboard
          </button>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700">{error || 'No data available'}</p>
          </div>
        </div>
      </div>
    );
  }

  const { compliance, outcomes, responseTimeDistribution, dailyTrend, hourlyVolume, peakHours, hospitals, exclusions, parishBreakdown } = stats;

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button onClick={() => window.history.back()} className="text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1 mb-4">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back to Dashboard
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">{stats.region.name} Statistics</h1>
              <p className="text-sm text-slate-500 mt-1">
                {stats.dateRange.start || 'All time'} — {stats.dateRange.end || 'Present'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-4xl font-bold text-[#004437]">{compliance.compliancePercent.toFixed(1)}%</p>
              <p className="text-sm text-slate-500">Compliance Rate</p>
            </div>
          </div>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-2xl font-bold text-slate-900">{compliance.totalCalls.toLocaleString()}</p>
            <p className="text-xs text-slate-500">Total Calls</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-2xl font-bold text-green-600">{compliance.compliantCalls.toLocaleString()}</p>
            <p className="text-xs text-slate-500">Compliant</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-2xl font-bold text-red-600">{compliance.nonCompliantCalls.toLocaleString()}</p>
            <p className="text-xs text-slate-500">Non-Compliant</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-2xl font-bold text-amber-600">{compliance.excludedCalls.toLocaleString()}</p>
            <p className="text-xs text-slate-500">Excluded</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-2xl font-bold text-slate-900">{responseTimeDistribution.avgFormatted}</p>
            <p className="text-xs text-slate-500">Avg Response</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Compliance Trend Chart */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm lg:col-span-2">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Compliance Trend</h2>
            {dailyTrend.length === 0 ? (
              <p className="text-slate-400 text-sm">No trend data available</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                    <Legend />
                    <Line type="monotone" dataKey="compliancePercent" name="Compliance %" stroke="#004437" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Response Time Distribution */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Response Time Distribution</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-slate-600 text-sm">Average</span>
                <span className="font-bold text-lg text-slate-900">{responseTimeDistribution.avgFormatted}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600 text-sm">Median (50th)</span>
                <span className="font-semibold text-slate-900">{responseTimeDistribution.medianFormatted}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600 text-sm">75th Percentile</span>
                <span className="font-semibold text-slate-900">{responseTimeDistribution.p75Formatted}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600 text-sm">90th Percentile</span>
                <span className="font-semibold text-amber-600">{responseTimeDistribution.p90Formatted}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600 text-sm">95th Percentile</span>
                <span className="font-semibold text-red-600">{responseTimeDistribution.p95Formatted}</span>
              </div>
            </div>
          </div>

          {/* Hourly Volume Chart */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm lg:col-span-2">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Call Volume by Hour</h2>
              {peakHours && peakHours.length > 0 && (
                <div className="text-xs text-slate-500">
                  Peak: {peakHours.map(h => h.label).join(', ')}
                </div>
              )}
            </div>
            {hourlyVolume.length === 0 ? (
              <p className="text-slate-400 text-sm">No hourly data available</p>
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlyVolume}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="hour" tick={{ fontSize: 10 }} tickFormatter={(h) => `${h}:00`} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip labelFormatter={(h) => `${h}:00 - ${h}:59`} />
                    <Bar dataKey="callCount" name="Calls" fill="#004437" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Exclusion Breakdown */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Exclusions</h2>
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Manual</span>
                <span className="font-semibold text-orange-600">{compliance.manualExclusions.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Auto</span>
                <span className="font-semibold text-blue-600">{compliance.autoExclusions.toLocaleString()}</span>
              </div>
            </div>
            <h3 className="text-sm font-medium text-slate-700 mb-2">By Reason</h3>
            {exclusions.length === 0 ? (
              <p className="text-slate-400 text-xs">No exclusions</p>
            ) : (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {exclusions.map((e, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-slate-600 truncate mr-2">{e.reason}</span>
                    <span className="font-medium text-slate-900">{e.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Parish Breakdown with Compliance */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm lg:col-span-3">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Parish Performance</h2>
            {parishBreakdown.length === 0 ? (
              <p className="text-slate-400 text-sm">No parish data available</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left py-3 px-4 font-medium text-slate-600">Parish</th>
                      <th className="text-right py-3 px-4 font-medium text-slate-600">Total</th>
                      <th className="text-right py-3 px-4 font-medium text-slate-600">Priority</th>
                      <th className="text-right py-3 px-4 font-medium text-slate-600">Excluded</th>
                      <th className="text-right py-3 px-4 font-medium text-slate-600">Compliance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parishBreakdown.map((p) => (
                      <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-4 font-medium text-slate-900">{p.name}</td>
                        <td className="py-3 px-4 text-right text-slate-700">{p.totalCalls.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right text-slate-700">{p.priorityCalls.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right text-amber-600">{p.excludedCalls.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right">
                          {p.compliancePercent !== null ? (
                            <span className={`font-semibold ${p.compliancePercent >= 90 ? 'text-green-600' : p.compliancePercent >= 80 ? 'text-amber-600' : 'text-red-600'}`}>
                              {p.compliancePercent.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-slate-400">--</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RegionStatsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center"><p className="text-slate-500">Loading...</p></div>}>
      <RegionStatsContent />
    </Suspense>
  );
}

