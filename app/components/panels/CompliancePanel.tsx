'use client';

import React, { useState, useEffect, useMemo } from 'react';
import type { PanelProps, CurveKey } from '@/lib/coverage-types';

interface Zone {
  id: string;
  name: string;
  thresholdMinutes: number;
  complianceTarget: number;
}

interface CompliancePanelProps extends PanelProps {
  zones?: Zone[];
}

// Mock compliance curve generator
function generateMockCurve(exclusionRate: number = 0): { minutes: number; compliance: number }[] {
  const curve: { minutes: number; compliance: number }[] = [];
  for (let t = 0; t <= 30; t += 0.5) {
    // Simulated S-curve for compliance
    const rawCompliance = 1 / (1 + Math.exp(-0.5 * (t - 8)));
    const adjustedCompliance = exclusionRate > 0 
      ? Math.min(rawCompliance / (1 - exclusionRate), 1) 
      : rawCompliance;
    curve.push({ minutes: t, compliance: adjustedCompliance });
  }
  return curve;
}

export default function CompliancePanel({
  parishId,
  parishName,
  regionId,
  onClose,
  zones = [],
}: CompliancePanelProps) {
  const [selectedZone, setSelectedZone] = useState<string>(zones[0]?.id || '');
  const [threshold, setThreshold] = useState(8);
  const [requiredPct, setRequiredPct] = useState(90);
  const [exclusionMode, setExclusionMode] = useState<'none' | 'historical' | 'custom'>('none');
  const [historicalExclusion, setHistoricalExclusion] = useState(12);
  const [customExclusion, setCustomExclusion] = useState(10);
  const [showGraph, setShowGraph] = useState(false);
  const [selectedCurves, setSelectedCurves] = useState<CurveKey[]>(['raw', 'juryTarget']);

  // Calculate metrics
  const exclusionRate = useMemo(() => {
    if (exclusionMode === 'none') return 0;
    if (exclusionMode === 'historical') return historicalExclusion / 100;
    return customExclusion / 100;
  }, [exclusionMode, historicalExclusion, customExclusion]);

  // Mock calculations - in production would fetch from API
  const rawCompliance = 0.81; // 81% at 8 min
  const contractCompliance = exclusionRate > 0 ? rawCompliance / (1 - exclusionRate) : rawCompliance;

  const findTimeForTarget = (target: number, exclRate: number) => {
    const curve = generateMockCurve(exclRate);
    const point = curve.find(p => p.compliance >= target / 100);
    return point?.minutes || '>30';
  };

  const toggleCurve = (key: CurveKey) => {
    setSelectedCurves(prev => 
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  return (
    <div className="h-full flex flex-col bg-slate-900 text-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <div>
          <h2 className="text-lg font-semibold">Compliance Evaluation</h2>
          <p className="text-sm text-slate-400">{parishName || regionId}</p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Zone Selector */}
        {zones.length > 0 && (
          <div className="bg-slate-800 rounded-lg p-4">
            <label className="block text-sm font-medium text-slate-400 mb-2">Response Zone</label>
            <select
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg p-2 text-white"
            >
              {zones.map(z => (
                <option key={z.id} value={z.id}>{z.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Jury Expectations */}
        <div className="bg-slate-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-slate-400 mb-3">Jury Expectations</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Threshold (min)</label>
              <input
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg p-2 text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Required %</label>
              <input
                type="number"
                value={requiredPct}
                onChange={(e) => setRequiredPct(Number(e.target.value))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg p-2 text-white"
              />
            </div>
          </div>
        </div>

        {/* Exclusion Mode */}
        <div className="bg-slate-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-slate-400 mb-3">Exclusion Mode</h3>
          <div className="space-y-2">
            {(['none', 'historical', 'custom'] as const).map(mode => (
              <label key={mode} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={exclusionMode === mode}
                  onChange={() => setExclusionMode(mode)}
                  className="text-emerald-500"
                />
                <span className="text-sm capitalize">{mode === 'none' ? 'No Exclusions' : `${mode} (${mode === 'historical' ? historicalExclusion : customExclusion}%)`}</span>
              </label>
            ))}
            {exclusionMode === 'custom' && (
              <input
                type="number"
                value={customExclusion}
                onChange={(e) => setCustomExclusion(Number(e.target.value))}
                className="w-24 bg-slate-700 border border-slate-600 rounded-lg p-2 text-white mt-2"
                placeholder="%"
              />
            )}
          </div>
        </div>

        {/* Key Metrics */}
        <div className="bg-slate-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-slate-400 mb-3">Key Metrics @ {threshold} min</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-2xl font-bold text-amber-400">{(rawCompliance * 100).toFixed(1)}%</p>
              <p className="text-xs text-slate-400">Raw Compliance</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-400">{Math.min(contractCompliance * 100, 100).toFixed(1)}%</p>
              <p className="text-xs text-slate-400">Contract Compliance</p>
            </div>
          </div>
        </div>

        {/* Times Needed */}
        <div className="bg-slate-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-slate-400 mb-3">Time Needed for Target</h3>
          <div className="space-y-2 text-sm">
            {[70, 85, 90, 95].map(target => (
              <div key={target} className="flex justify-between items-center py-1 border-b border-slate-700">
                <span className="text-slate-300">{target}%</span>
                <div className="flex gap-4">
                  <span className="text-amber-400">{findTimeForTarget(target, 0)} min</span>
                  {exclusionRate > 0 && (
                    <span className="text-emerald-400">{findTimeForTarget(target, exclusionRate)} min</span>
                  )}
                </div>
              </div>
            ))}
            <div className="flex justify-end gap-4 text-xs text-slate-400 mt-2">
              <span>Raw</span>
              {exclusionRate > 0 && <span>With Excl.</span>}
            </div>
          </div>
        </div>

        {/* Graph It Button */}
        <button
          onClick={() => setShowGraph(!showGraph)}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 rounded-lg transition-colors"
        >
          {showGraph ? 'Hide Graph' : 'Graph It'}
        </button>

        {/* Graph Section */}
        {showGraph && (
          <div className="bg-slate-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-slate-400 mb-3">Curve Selection</h3>
            <div className="space-y-2 mb-4">
              {([
                { key: 'raw', label: 'Raw (no exclusions)', color: 'amber' },
                { key: 'contractHistorical', label: 'Contract (historical)', color: 'emerald' },
                { key: 'contractCustom', label: 'Contract (custom)', color: 'blue' },
                { key: 'juryTarget', label: 'Jury expectation line', color: 'red' },
              ] as const).map(({ key, label, color }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedCurves.includes(key)}
                    onChange={() => toggleCurve(key)}
                    className={`text-${color}-500`}
                  />
                  <span className={`text-sm text-${color}-400`}>{label}</span>
                </label>
              ))}
            </div>
            {/* Chart placeholder - would use recharts or similar */}
            <div className="h-48 bg-slate-700 rounded-lg flex items-center justify-center text-slate-400 text-sm">
              <div className="text-center">
                <p>📊 Compliance Curve Chart</p>
                <p className="text-xs mt-1">X: Minutes (0-30) | Y: Compliance %</p>
              </div>
            </div>
          </div>
        )}

        {/* Plain-English Summary */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-lg p-4 border-l-4 border-emerald-500">
          <h3 className="text-sm font-medium text-slate-300 mb-2">Summary</h3>
          <p className="text-sm text-slate-300 leading-relaxed">
            At <span className="font-semibold text-amber-400">{threshold} minutes</span>, raw compliance in this zone is{' '}
            <span className="font-semibold text-amber-400">{(rawCompliance * 100).toFixed(0)}%</span>.
            {exclusionRate > 0 && (
              <> With a {exclusionMode} exclusion rate of{' '}
              <span className="font-semibold text-emerald-400">{(exclusionRate * 100).toFixed(0)}%</span>,{' '}
              contract compliance is about{' '}
              <span className="font-semibold text-emerald-400">{Math.min(contractCompliance * 100, 100).toFixed(0)}%</span>.</>
            )}{' '}
            To reach <span className="font-semibold">{requiredPct}%</span> without exclusions, this zone would need a time standard of about{' '}
            <span className="font-semibold text-blue-400">{findTimeForTarget(requiredPct, 0)} minutes</span>.
          </p>
        </div>
      </div>
    </div>
  );
}

