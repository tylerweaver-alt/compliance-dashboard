'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

interface RegionStats {
  ok: boolean;
  region: { id: number; name: string };
  dateRange: { start: string | null; end: string | null };
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
  timePerformance: {
    avgResponseMinutes: number | null;
    avgResponseFormatted: string;
    medianResponseMinutes: number | null;
    medianResponseFormatted: string;
    p90ResponseMinutes: number | null;
    p90ResponseFormatted: string;
  };
  hospitals: Array<{ name: string; count: number }>;
  exclusions: Array<{ reason: string; count: number }>;
  parishBreakdown: Array<{ id: number; name: string; totalCalls: number; priorityCalls: number; excludedCalls: number }>;
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

  const { outcomes, timePerformance, hospitals, exclusions, parishBreakdown } = stats;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button onClick={() => window.history.back()} className="text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1 mb-4">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back to Dashboard
          </button>
          <h1 className="text-2xl font-bold text-slate-900">{stats.region.name} Statistics</h1>
          <p className="text-sm text-slate-500 mt-1">
            Date Range: {stats.dateRange.start || 'All'} to {stats.dateRange.end || 'All'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Regional Overview */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm md:col-span-2">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Regional Overview</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-slate-900">{outcomes.totalCalls.toLocaleString()}</p>
                <p className="text-sm text-slate-500">Total Calls</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{outcomes.transports.toLocaleString()}</p>
                <p className="text-sm text-slate-500">Transports</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-slate-900">{timePerformance.avgResponseFormatted}</p>
                <p className="text-sm text-slate-500">Avg Response</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-red-600">{outcomes.excludedCalls.toLocaleString()}</p>
                <p className="text-sm text-slate-500">Excluded</p>
              </div>
            </div>
          </div>

          {/* Call Outcome Breakdown */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Call Outcome Breakdown</h2>
            <div className="space-y-3">
              <div className="flex justify-between"><span className="text-slate-600">Total Calls</span><span className="font-semibold text-slate-900">{outcomes.totalCalls.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Priority Calls (P1-P3)</span><span className="font-semibold text-slate-900">{outcomes.priorityCalls.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Transports</span><span className="font-semibold text-green-600">{outcomes.transports.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Refusals</span><span className="font-semibold text-amber-600">{outcomes.refusals.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Cancelled</span><span className="font-semibold text-slate-500">{outcomes.cancelled.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">No Patient</span><span className="font-semibold text-slate-500">{outcomes.noPatient.toLocaleString()}</span></div>
              <div className="flex justify-between border-t pt-2"><span className="text-slate-600">Excluded</span><span className="font-semibold text-red-600">{outcomes.excludedCalls.toLocaleString()}</span></div>
              {outcomes.transfusalRate !== null && (
                <div className="flex justify-between border-t pt-2">
                  <span className="text-slate-600">Transfusal Rate</span>
                  <span className="font-semibold text-blue-600">{outcomes.transfusalRate.toFixed(2)} calls per transport/refusal</span>
                </div>
              )}
            </div>
            {outcomes.transfusalRate !== null && (
              <p className="text-xs text-slate-500 mt-3">
                For every {outcomes.transfusalRate.toFixed(2)} calls, one patient was either transported or refused care.
              </p>
            )}
          </div>

          {/* Time & Performance */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Time &amp; Performance</h2>
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-sm text-slate-500 mb-1">Average Response Time</p>
                <p className="text-2xl font-bold text-slate-900">{timePerformance.avgResponseFormatted}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">Median</p>
                  <p className="text-lg font-semibold text-slate-900">{timePerformance.medianResponseFormatted}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">90th Percentile</p>
                  <p className="text-lg font-semibold text-slate-900">{timePerformance.p90ResponseFormatted}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Hospital Flow */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Top Destinations</h2>
            {hospitals.length === 0 ? (
              <p className="text-slate-400 text-sm">No hospital data available</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {hospitals.map((h, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-slate-600 truncate mr-2">{h.name}</span>
                    <span className="font-medium text-slate-900">{h.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Exclusions */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Exclusion Reasons</h2>
            {exclusions.length === 0 ? (
              <p className="text-slate-400 text-sm">No exclusions in this period</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {exclusions.map((e, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-slate-600 truncate mr-2">{e.reason}</span>
                    <span className="font-medium text-red-600">{e.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Parish Breakdown */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm md:col-span-2">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Parish Breakdown</h2>
            {parishBreakdown.length === 0 ? (
              <p className="text-slate-400 text-sm">No parish data available</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 px-3 font-medium text-slate-600">Parish</th>
                      <th className="text-right py-2 px-3 font-medium text-slate-600">Total Calls</th>
                      <th className="text-right py-2 px-3 font-medium text-slate-600">Priority Calls</th>
                      <th className="text-right py-2 px-3 font-medium text-slate-600">Excluded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parishBreakdown.map((p) => (
                      <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-2 px-3 text-slate-900">{p.name}</td>
                        <td className="py-2 px-3 text-right text-slate-900">{p.totalCalls.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right text-slate-900">{p.priorityCalls.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right text-red-600">{p.excludedCalls.toLocaleString()}</td>
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

