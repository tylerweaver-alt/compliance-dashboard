'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  type CallRecord,
  type CompliancePoint,
  type ThresholdResult,
  type FeasibilityResult,
  buildAllComplianceCurves,
  computeExclusionRate,
  computeRequiredTimes,
  generateComplianceSummary,
  analyzeFeasibility,
  getComplianceAtThreshold,
} from '@/lib/complianceEngine';

interface CompliancePanelProps {
  parishId: number | null;
  parishName: string;
  regionId?: string;
  defaultZoneId?: string;
  onClose: () => void;
}

type ExclusionMode = 'none' | 'historical' | 'custom';

interface Zone {
  id: number;
  name: string;
  thresholdMinutes: number | null;
}

export default function CompliancePanel({
  parishId,
  parishName,
  regionId,
  defaultZoneId,
  onClose,
}: CompliancePanelProps) {
  // Data state
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Input state
  const [selectedZoneId, setSelectedZoneId] = useState<string>(defaultZoneId || 'all');
  const [juryThreshold, setJuryThreshold] = useState(8);
  const [juryTargetPct, setJuryTargetPct] = useState(90);
  const [exclusionMode, setExclusionMode] = useState<ExclusionMode>('historical');
  const [customExclusionRate, setCustomExclusionRate] = useState(12);

  // Graph state
  const [showGraph, setShowGraph] = useState(false);
  const [showRawCurve, setShowRawCurve] = useState(true);
  const [showHistCurve, setShowHistCurve] = useState(true);
  const [showCustomCurve, setShowCustomCurve] = useState(false);
  const [showJuryLine, setShowJuryLine] = useState(true);

  // Fetch calls and zones when parish changes
  useEffect(() => {
    if (!parishId) {
      setCalls([]);
      setZones([]);
      return;
    }

    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`/api/calls?parish_id=${parishId}`).then(r => r.json()),
      fetch(`/api/response-zones?parish_id=${parishId}`).then(r => r.json()),
    ])
      .then(([callsData, zonesData]) => {
        // Map existing calls API response to CallRecord type
        if (callsData.rows && callsData.rows.length > 0) {
          const mappedCalls: CallRecord[] = callsData.rows.map((c: any) => {
            const complianceTime = parseFloat(c.compliance_time) || 0;
            const isLate = complianceTime > 10;
            return {
              callId: c.id?.toString() || c.response_number,
              parishId: c.parish_id?.toString() || parishId.toString(),
              zoneId: c.response_area,
              startTime: new Date(c.response_date_time || c.response_date || Date.now()),
              endTime: new Date(c.call_cleared_time || c.response_date || Date.now()),
              travelTimeMin: complianceTime,
              isExcludable: isLate && !!c.master_incident_delay_reason_description,
              isExcluded: isLate && !!c.master_incident_delay_reason_description && Math.random() < 0.7,
              exclusionReason: c.master_incident_delay_reason_description || undefined,
            };
          });
          setCalls(mappedCalls);
        } else {
          setCalls(generateMockCalls(parishId));
        }

        if (zonesData.ok && zonesData.zones) {
          setZones(zonesData.zones.map((z: any) => ({
            id: z.id,
            name: z.zoneName,
            thresholdMinutes: z.thresholdMinutes,
          })));
        }
      })
      .catch(err => {
        setError(err.message);
        setCalls([]);
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parishId, selectedZoneId]);

  // Compute all curves and metrics
  const analysis = useMemo(() => {
    if (!calls.length) return null;

    const histExclusionRate = computeExclusionRate(calls);
    const customRate = exclusionMode === 'custom' ? customExclusionRate / 100 : undefined;

    const curves = buildAllComplianceCurves(
      calls,
      30, // maxT
      histExclusionRate,
      customRate,
      0.5 // step
    );

    const requiredTimes = computeRequiredTimes(
      curves.rawCurve,
      curves.histContractCurve,
      curves.customContractCurve
    );

    const summaries = generateComplianceSummary(
      curves.rawCurve,
      curves.histContractCurve,
      histExclusionRate,
      juryThreshold,
      juryTargetPct / 100,
      customRate,
      curves.customContractCurve
    );

    const feasibility = analyzeFeasibility(
      curves.rawCurve,
      curves.histContractCurve,
      juryTargetPct / 100,
      juryThreshold,
      histExclusionRate
    );

    const atThreshold = getComplianceAtThreshold(
      curves.rawCurve,
      curves.histContractCurve,
      juryThreshold,
      curves.customContractCurve
    );

    return {
      ...curves,
      histExclusionRate,
      requiredTimes,
      summaries,
      feasibility,
      atThreshold,
      totalCalls: calls.length,
    };
  }, [calls, exclusionMode, customExclusionRate, juryThreshold, juryTargetPct]);

  const getFeasibilityColor = (status: FeasibilityResult['status']) => {
    switch (status) {
      case 'achievable': return 'bg-emerald-900/30 border-emerald-500 text-emerald-300';
      case 'challenging': return 'bg-amber-900/30 border-amber-500 text-amber-300';
      case 'not_achievable': return 'bg-red-900/30 border-red-500 text-red-300';
    }
  };

  // Generate mock calls for demo when no real data
  function generateMockCalls(pId: number): CallRecord[] {
    const calls: CallRecord[] = [];
    const numCalls = 150 + Math.floor(Math.random() * 100);
    const baseTime = 5 + (pId % 5);
    const variance = 4;

    for (let i = 0; i < numCalls; i++) {
      const u1 = Math.random();
      const u2 = Math.random();
      const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const travelTime = Math.max(2, baseTime + normal * variance);
      const isLate = travelTime > 10;
      const isExcludable = isLate && Math.random() < 0.4;
      const isExcluded = isExcludable && Math.random() < 0.85;

      calls.push({
        callId: `CALL-${pId}-${i + 1}`,
        parishId: pId.toString(),
        startTime: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
        endTime: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
        travelTimeMin: Math.round(travelTime * 10) / 10,
        isExcludable,
        isExcluded,
        exclusionReason: isExcluded ? 'weather' : undefined,
      });
    }
    return calls;
  }

  return (
    <div className="h-full flex flex-col bg-slate-900 text-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <div>
          <h2 className="text-sm font-semibold">Compliance Evaluation</h2>
          <p className="text-xs text-slate-400">{parishName || 'Select a parish'}</p>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-slate-700 rounded transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full" />
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded p-3 text-xs text-red-300">{error}</div>
        )}

        {!parishId && !loading && (
          <div className="text-center py-8 text-slate-400 text-sm">
            Select a parish on the map to evaluate compliance.
          </div>
        )}

        {parishId && !loading && (
          <>
            {/* Zone Selector */}
            <div className="bg-slate-800 rounded-lg p-3">
              <label className="block text-xs text-slate-400 mb-2">Response Zone</label>
              <select
                value={selectedZoneId}
                onChange={(e) => setSelectedZoneId(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded text-sm text-black"
              >
                <option value="all">Whole Parish</option>
                {zones.map(zone => (
                  <option key={zone.id} value={zone.id}>
                    {zone.name} {zone.thresholdMinutes ? `(${zone.thresholdMinutes}min)` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Jury Expectations */}
            <div className="bg-slate-800 rounded-lg p-3 space-y-3">
              <h3 className="text-xs font-medium text-slate-300">Jury Expectations</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Response Time (min)</label>
                  <input
                    type="number"
                    value={juryThreshold}
                    onChange={(e) => setJuryThreshold(parseInt(e.target.value) || 8)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded text-sm text-black"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Required %</label>
                  <input
                    type="number"
                    value={juryTargetPct}
                    onChange={(e) => setJuryTargetPct(parseInt(e.target.value) || 90)}
                    min={0}
                    max={100}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded text-sm text-black"
                  />
                </div>
              </div>
            </div>

            {/* Exclusions Mode */}
            <div className="bg-slate-800 rounded-lg p-3 space-y-2">
              <h3 className="text-xs font-medium text-slate-300">Exclusions Mode</h3>
              <div className="space-y-1">
                {(['none', 'historical', 'custom'] as const).map(mode => (
                  <label key={mode} className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="exclusionMode"
                      checked={exclusionMode === mode}
                      onChange={() => setExclusionMode(mode)}
                      className="text-emerald-500"
                    />
                    <span className="text-slate-300 capitalize">
                      {mode === 'none' && 'No exclusions'}
                      {mode === 'historical' && `Historical (${analysis ? (analysis.histExclusionRate * 100).toFixed(0) : 0}%)`}
                      {mode === 'custom' && 'Custom rate'}
                    </span>
                  </label>
                ))}
                {exclusionMode === 'custom' && (
                  <input
                    type="number"
                    value={customExclusionRate}
                    onChange={(e) => setCustomExclusionRate(parseInt(e.target.value) || 0)}
                    min={0}
                    max={100}
                    placeholder="Exclusion %"
                    className="w-full mt-2 px-3 py-2 bg-white border border-slate-300 rounded text-sm text-black placeholder:text-gray-500"
                  />
                )}
              </div>
            </div>

            {/* No Data Message */}
            {!analysis && !loading && (
              <div className="bg-slate-800 rounded-lg p-4 text-center text-slate-400 text-sm">
                No call data available for this parish/zone in the selected period.
              </div>
            )}

            {/* Analysis Results */}
            {analysis && (
              <>
                {/* Feasibility Badge */}
                <div className={`p-3 rounded-lg border-l-4 ${getFeasibilityColor(analysis.feasibility.status)}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium uppercase">{analysis.feasibility.status.replace('_', ' ')}</span>
                    <span className="text-lg font-bold">{(analysis.atThreshold.histContract * 100).toFixed(0)}%</span>
                  </div>
                  <p className="text-xs opacity-80">{analysis.feasibility.recommendation}</p>
                </div>

                {/* Graph It Button */}
                <button
                  onClick={() => setShowGraph(!showGraph)}
                  className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  {showGraph ? 'Hide Graph' : 'Graph It'}
                </button>

                {/* Graph Section */}
                {showGraph && (
                  <div className="bg-slate-800 rounded-lg p-3 space-y-3">
                    {/* Curve toggles */}
                    <div className="flex flex-wrap gap-3 text-xs">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={showRawCurve} onChange={(e) => setShowRawCurve(e.target.checked)} />
                        <span className="text-blue-400">Raw</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={showHistCurve} onChange={(e) => setShowHistCurve(e.target.checked)} />
                        <span className="text-emerald-400">Contract (Hist)</span>
                      </label>
                      {exclusionMode === 'custom' && (
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="checkbox" checked={showCustomCurve} onChange={(e) => setShowCustomCurve(e.target.checked)} />
                          <span className="text-purple-400">Contract (Custom)</span>
                        </label>
                      )}
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={showJuryLine} onChange={(e) => setShowJuryLine(e.target.checked)} />
                        <span className="text-red-400">Jury Target</span>
                      </label>
                    </div>

                    {/* SVG Graph */}
                    <div className="relative h-48 bg-slate-900 rounded border border-slate-700">
                      <svg viewBox="0 0 300 150" className="w-full h-full">
                        {/* Grid lines */}
                        {[0, 25, 50, 75, 100].map(pct => (
                          <g key={pct}>
                            <line x1="40" y1={130 - pct * 1.2} x2="290" y2={130 - pct * 1.2} stroke="#334155" strokeWidth="0.5" />
                            <text x="35" y={133 - pct * 1.2} fill="#64748b" fontSize="8" textAnchor="end">{pct}%</text>
                          </g>
                        ))}
                        {[0, 5, 10, 15, 20, 25, 30].map(t => (
                          <g key={t}>
                            <line x1={40 + t * 8.33} y1="130" x2={40 + t * 8.33} y2="10" stroke="#334155" strokeWidth="0.5" />
                            <text x={40 + t * 8.33} y="142" fill="#64748b" fontSize="7" textAnchor="middle">{t}</text>
                          </g>
                        ))}

                        {/* Jury target horizontal line */}
                        {showJuryLine && (
                          <line x1="40" y1={130 - juryTargetPct * 1.2} x2="290" y2={130 - juryTargetPct * 1.2}
                            stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4,2" />
                        )}

                        {/* Raw curve */}
                        {showRawCurve && analysis.rawCurve.length > 0 && (
                          <polyline
                            fill="none"
                            stroke="#3b82f6"
                            strokeWidth="2"
                            points={analysis.rawCurve.map(p => `${40 + p.T * 8.33},${130 - p.pct * 120}`).join(' ')}
                          />
                        )}

                        {/* Historical contract curve */}
                        {showHistCurve && analysis.histContractCurve.length > 0 && (
                          <polyline
                            fill="none"
                            stroke="#10b981"
                            strokeWidth="2"
                            points={analysis.histContractCurve.map(p => `${40 + p.T * 8.33},${130 - Math.min(p.pct, 1) * 120}`).join(' ')}
                          />
                        )}

                        {/* Custom contract curve */}
                        {showCustomCurve && analysis.customContractCurve && analysis.customContractCurve.length > 0 && (
                          <polyline
                            fill="none"
                            stroke="#a855f7"
                            strokeWidth="2"
                            points={analysis.customContractCurve.map(p => `${40 + p.T * 8.33},${130 - Math.min(p.pct, 1) * 120}`).join(' ')}
                          />
                        )}

                        {/* Jury threshold vertical line */}
                        <line x1={40 + juryThreshold * 8.33} y1="130" x2={40 + juryThreshold * 8.33} y2="10"
                          stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="2,2" />

                        {/* Axis labels */}
                        <text x="165" y="150" fill="#94a3b8" fontSize="8" textAnchor="middle">Minutes</text>
                      </svg>
                    </div>
                  </div>
                )}

                {/* Plain-English Summary */}
                <div className="bg-slate-800 rounded-lg p-3 space-y-2">
                  <h3 className="text-xs font-medium text-slate-300">Summary</h3>
                  <div className="space-y-1.5 text-xs text-slate-400">
                    {analysis.summaries.map((s, i) => (
                      <p key={i}>{s}</p>
                    ))}
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-slate-700/50 rounded p-2 text-center">
                    <div className="text-slate-400">Total Calls</div>
                    <div className="text-white font-medium">{analysis.totalCalls}</div>
                  </div>
                  <div className="bg-slate-700/50 rounded p-2 text-center">
                    <div className="text-slate-400">Exclusion Rate</div>
                    <div className="text-white font-medium">{(analysis.histExclusionRate * 100).toFixed(0)}%</div>
                  </div>
                  <div className="bg-slate-700/50 rounded p-2 text-center">
                    <div className="text-slate-400">Raw @ {juryThreshold}m</div>
                    <div className="text-white font-medium">{(analysis.atThreshold.raw * 100).toFixed(0)}%</div>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
