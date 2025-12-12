'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

interface ParishStats {
  ok: boolean;
  parish: { id: number; name: string; region: string };
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
  zones: Array<{ name: string; total: number; active: number }>;
}

function ParishStatsContent() {
  const searchParams = useSearchParams();
  const parishId = searchParams.get('parishId');
  const start = searchParams.get('start');
  const end = searchParams.get('end');

  const [stats, setStats] = useState<ParishStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!parishId) {
      setError('Parish ID is required');
      setLoading(false);
      return;
    }

    const fetchStats = async () => {
      try {
        const params = new URLSearchParams();
        params.set('parishId', parishId);
        if (start) params.set('start', start);
        if (end) params.set('end', end);

        const res = await fetch(`/api/stats/parish?${params.toString()}`);
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
  }, [parishId, start, end]);

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

  const { outcomes, timePerformance, hospitals, exclusions, zones } = stats;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button onClick={() => window.history.back()} className="text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1 mb-4">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back to Dashboard
          </button>
          <h1 className="text-2xl font-bold text-slate-900">{stats.parish.name} Statistics</h1>
          <p className="text-sm text-slate-500 mt-1">
            Region: {stats.parish.region} | Date Range: {stats.dateRange.start || 'All'} to {stats.dateRange.end || 'All'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

          {/* Zone Breakdown */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm md:col-span-2">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Zone Breakdown</h2>
            {zones.length === 0 ? (
              <p className="text-slate-400 text-sm">No zone data available</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {zones.map((z, i) => (
                  <div key={i} className="bg-slate-50 rounded-lg p-3">
                    <p className="text-sm font-medium text-slate-900 truncate">{z.name}</p>
                    <p className="text-xs text-slate-500">{z.total} calls ({z.active} active)</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ParishStatsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center"><p className="text-slate-500">Loading...</p></div>}>
      <ParishStatsContent />
    </Suspense>
  );
}

