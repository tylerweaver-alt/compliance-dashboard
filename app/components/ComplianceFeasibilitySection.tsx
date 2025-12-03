'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  ComposedChart,
} from 'recharts';
import type {
  FeasibilityResponse,
  FeasibilityPoint,
} from '@/lib/feasibility-types';

interface ComplianceFeasibilitySectionProps {
  regionId: string;
  parishId: number | null;
  parishName: string;
  zoneId?: number | null;
}

type FeasibilityMode = 'feasibility' | 'target';

// Format minutes to MM:SS
function formatMinutesToMMSS(minutes: number): string {
  const totalSeconds = Math.round(minutes * 60);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Target compliance options (expanded range)
const TARGET_OPTIONS = [25, 40, 50, 60, 70, 80, 90, 95, 100];

// Default X-axis max for chart display
const DEFAULT_X_MAX = 24;

// Maximum X-axis for extended view
const MAX_X_AXIS = 60;

export default function ComplianceFeasibilitySection({
  regionId,
  parishId,
  parishName,
  zoneId,
}: ComplianceFeasibilitySectionProps) {
  const [mode, setMode] = useState<FeasibilityMode>('feasibility');
  const [data, setData] = useState<FeasibilityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetPercent, setTargetPercent] = useState(90);
  const [isPrinting, setIsPrinting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // Fetch feasibility data
  useEffect(() => {
    if (!regionId) {
      setData(null);
      return;
    }

    setLoading(true);
    setError(null);

    fetch('/api/compliance/feasibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        regionId,
        parishId: parishId ?? undefined,
        zoneId: zoneId ?? undefined,
        targetCompliance: targetPercent,
      }),
    })
      .then(r => r.json())
      .then((res: FeasibilityResponse) => {
        if (res.error) {
          setError(res.error);
        } else {
          setData(res);
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [regionId, parishId, zoneId, targetPercent]);

  // Print handler
  const handlePrint = () => {
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  // Listen for afterprint
  useEffect(() => {
    const handler = () => setIsPrinting(false);
    window.addEventListener('afterprint', handler);
    return () => window.removeEventListener('afterprint', handler);
  }, []);

  // Use intersection data from API (already calculated with extended thresholds up to 60 min)
  const intersectionFound = data?.summary?.intersection?.found ?? false;
  const intersectionMinutes = data?.summary?.intersection?.minutes ?? null;

  // For backward compatibility, also check targetMinutesCurrent
  const targetMinutes = intersectionMinutes ?? data?.summary?.targetMinutesCurrent ?? null;

  // Determine if intersection is beyond the standard range
  const isIntersectionBeyondStandard = targetMinutes !== null && targetMinutes > DEFAULT_X_MAX;

  const dateRangeStr = data?.dateRange
    ? `${data.dateRange.start} – ${data.dateRange.end}`
    : 'Last 90 days';

  // Calculate X-axis domain based on mode and intersection
  const getXAxisDomain = (): [number, number] => {
    if (mode === 'target' && intersectionFound && intersectionMinutes !== null) {
      // Extend X-axis to show intersection point, capped at MAX_X_AXIS
      const maxX = Math.min(MAX_X_AXIS, Math.max(DEFAULT_X_MAX, Math.ceil(intersectionMinutes) + 2));
      return [0, maxX];
    }
    return [0, DEFAULT_X_MAX];
  };

  const xAxisDomain = getXAxisDomain();

  // Chart data with both current and projected lines
  // Filter to only include points within the X-axis domain
  const chartData = data?.currentCurve?.filter(p => p.minutes <= xAxisDomain[1]).map((p, i) => ({
    minutes: p.minutes,
    minutesFormatted: formatMinutesToMMSS(p.minutes),
    current: p.calculatedCompliance,
    projected: data.projectedCurve?.[i]?.calculatedCompliance ?? p.calculatedCompliance,
    raw: p.rawCompliance,
  })) || [];

  // Check if projected differs from current
  const hasProjectedDiff = data?.projectedCurve?.some((p, i) =>
    Math.abs(p.calculatedCompliance - (data.currentCurve?.[i]?.calculatedCompliance ?? 0)) > 0.1
  );

  const modeButtons: { key: FeasibilityMode; label: string }[] = [
    { key: 'feasibility', label: 'Feasibility' },
    { key: 'target', label: 'Target Intersect' },
  ];

  // Mode labels for print
  const modeLabel = mode === 'feasibility' ? 'Feasibility' : 'Target Intersect';

  return (
    <div
      ref={printRef}
      className={`compliance-feasibility-print-root bg-slate-800 rounded-lg border border-slate-700 p-4 ${isPrinting ? 'printing' : ''}`}
    >
      {/* Print-only header with full context */}
      <div className="hidden print:block mb-4">
        <h1 className="text-lg font-bold text-slate-900">
          Compliance Feasibility – {parishId ? parishName : regionId}
        </h1>
        <p className="text-sm text-slate-600">
          Mode: {modeLabel} | Date Range: {dateRangeStr}
        </p>
      </div>

      {/* Screen Title */}
      <div className="flex items-center justify-between mb-2 print:hidden">
        <h3 className="text-sm font-semibold text-slate-200">Compliance Feasibility Curve</h3>
        <button
          onClick={handlePrint}
          className="text-xs px-2 py-1 border border-slate-600 rounded hover:bg-slate-700 text-slate-300"
        >
          Print Graph
        </button>
      </div>

      {/* Subtitle (screen only) */}
      <p className="text-xs text-slate-400 mb-3 print:hidden">
        {parishId ? parishName : regionId} • {dateRangeStr}
      </p>

      {/* Mode Toggle */}
      <div className="flex gap-1 mb-4">
        {modeButtons.map(btn => (
          <button
            key={btn.key}
            onClick={() => setMode(btn.key)}
            className={`flex-1 py-1.5 text-xs font-medium rounded-full transition-colors ${
              mode === btn.key
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600 border border-slate-600'
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full" />
          <span className="ml-2 text-sm text-slate-400">Loading feasibility data...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* No Data */}
      {!loading && !error && !data && (
        <div className="text-center py-6 text-slate-500 text-sm">
          Not enough call data to build a feasibility curve.
        </div>
      )}

      {/* Main Content */}
      {!loading && !error && data && (
        <>
          {/* Target Selector (for Target Intersect mode) */}
          {mode === 'target' && (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-slate-400">Target Compliance:</span>
              <select
                value={targetPercent}
                onChange={(e) => setTargetPercent(Number(e.target.value))}
                className="text-xs px-2 py-1 border border-slate-600 rounded bg-slate-700 text-slate-200"
              >
                {TARGET_OPTIONS.map(t => (
                  <option key={t} value={t}>{t}%</option>
                ))}
              </select>
            </div>
          )}

          {/* Chart */}
          <div className="h-[200px] w-full mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="minutes"
                  stroke="#9ca3af"
                  tick={{ fontSize: 10, fill: '#d1d5db' }}
                  tickFormatter={(v) => formatMinutesToMMSS(v)}
                  domain={xAxisDomain}
                  type="number"
                />
                <YAxis
                  stroke="#9ca3af"
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fill: '#d1d5db' }}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #475569',
                    borderRadius: '6px',
                    fontSize: '11px',
                  }}
                  formatter={(value: number, name: string) => [
                    `${value.toFixed(1)}%`,
                    name === 'current' ? 'Current' : name === 'projected' ? 'Projected' : 'Raw',
                  ]}
                  labelFormatter={(label) => `Threshold: ${formatMinutesToMMSS(label)}`}
                />

                {/* Area fill under current line */}
                <Area
                  type="monotone"
                  dataKey="current"
                  stroke="none"
                  fill="#16a34a"
                  fillOpacity={0.15}
                />

                {/* Current curve (dark green) */}
                <Line
                  type="monotone"
                  dataKey="current"
                  stroke="#16a34a"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, fill: '#16a34a' }}
                  name="current"
                />

                {/* Projected curve (neon orange) - only if different from current */}
                {hasProjectedDiff && (
                  <Line
                    type="monotone"
                    dataKey="projected"
                    stroke="#f97316"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    activeDot={{ r: 4, fill: '#f97316' }}
                    name="projected"
                  />
                )}

                {/* Target horizontal line (for Target Intersect mode) */}
                {mode === 'target' && (
                  <ReferenceLine
                    y={targetPercent}
                    stroke="#ef4444"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    label={{ value: `${targetPercent}%`, position: 'right', fontSize: 10, fill: '#ef4444' }}
                  />
                )}

                {/* Vertical line at intersection (for Target Intersect mode) */}
                {mode === 'target' && targetMinutes !== null && (
                  <ReferenceLine
                    x={targetMinutes}
                    stroke="#3b82f6"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    label={{ value: formatMinutesToMMSS(targetMinutes), position: 'top', fontSize: 10, fill: '#3b82f6' }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="flex gap-4 mb-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-[#16a34a]" />
              <span className="text-slate-300">Current</span>
            </div>
            {hasProjectedDiff && (
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 bg-[#f97316]" style={{ borderTop: '2px dashed #f97316' }} />
                <span className="text-slate-300">Projected</span>
              </div>
            )}
          </div>

          {/* Summary Text (Mode-specific) */}
          <div className="bg-slate-700/50 rounded-lg p-3 border border-slate-600">
            {mode === 'feasibility' && (
              <div className="text-sm text-slate-200 space-y-1">
                <p>
                  <span className="font-medium">Expected compliance:</span> {data.metrics.expectedPercent}%.{' '}
                  <span className="font-medium">Raw:</span> {data.metrics.rawPercent.toFixed(1)}%.{' '}
                  After exclusions, <span className="font-medium text-emerald-400">calculated compliance is {data.metrics.calculatedPercent.toFixed(1)}%</span>.
                </p>
                <p className="text-slate-400">
                  Out of {data.metrics.rawCallCount.toLocaleString()} raw calls,{' '}
                  {data.metrics.excludedCallCount.toLocaleString()} were excluded,{' '}
                  leaving {data.metrics.countedCallCount.toLocaleString()} that counted toward compliance.
                </p>
              </div>
            )}

            {mode === 'target' && (
              <div className="text-sm text-slate-200 space-y-2">
                <p><span className="font-medium">Target:</span> {targetPercent}%</p>

                {/* Case A: Intersection found within standard range (≤24 min) */}
                {intersectionFound && targetMinutes !== null && !isIntersectionBeyondStandard && (
                  <>
                    <p>
                      To reach <span className="font-semibold text-emerald-400">{targetPercent}%</span> in this area,
                      you would need a zone standard of{' '}
                      <span className="text-blue-400 font-semibold">{formatMinutesToMMSS(targetMinutes)}</span>.
                    </p>
                    <p className="text-slate-400">
                      Delta: {targetMinutes > 8 ? '+' : ''}{formatMinutesToMMSS(Math.abs(targetMinutes - 8))} from 08:00 zone
                    </p>
                  </>
                )}

                {/* Case B: Intersection found but beyond standard range (>24 min, ≤60 min) */}
                {intersectionFound && targetMinutes !== null && isIntersectionBeyondStandard && (
                  <>
                    <p className="text-amber-400">
                      Within the standard 0–{DEFAULT_X_MAX} minute window, a {targetPercent}% threshold is not
                      statistically reachable for this area.
                    </p>
                    <p>
                      If you extended the zone, you would need approximately{' '}
                      <span className="text-blue-400 font-semibold">{formatMinutesToMMSS(targetMinutes)}</span>{' '}
                      to achieve {targetPercent}% compliance.
                    </p>
                  </>
                )}

                {/* Case C: No intersection found even at 60 minutes */}
                {!intersectionFound && (
                  <>
                    <p className="text-amber-400">
                      Based on the calls in this date range, a {targetPercent}% threshold is not statistically
                      reachable for this area with the current configuration.
                    </p>
                    <p className="text-slate-400">
                      Even at 60 minutes, the compliance curve does not reach {targetPercent}%.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="bg-emerald-900/30 rounded p-2 text-center">
              <div className="text-lg font-bold text-emerald-400">{data.metrics.calculatedPercent.toFixed(1)}%</div>
              <div className="text-[10px] text-emerald-500 uppercase">Calculated</div>
            </div>
            <div className="bg-slate-700/50 rounded p-2 text-center">
              <div className="text-lg font-bold text-slate-200">{data.metrics.rawPercent.toFixed(1)}%</div>
              <div className="text-[10px] text-slate-400 uppercase">Raw</div>
            </div>
            <div className="bg-amber-900/30 rounded p-2 text-center">
              <div className="text-lg font-bold text-amber-400">{data.metrics.excludedCallCount.toLocaleString()}</div>
              <div className="text-[10px] text-amber-500 uppercase">Excluded</div>
            </div>
          </div>
        </>
      )}

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          /* Hide everything by default */
          body * {
            visibility: hidden;
          }

          /* Show only the feasibility section */
          .compliance-feasibility-print-root,
          .compliance-feasibility-print-root * {
            visibility: visible !important;
          }

          /* Position and style the print root */
          .compliance-feasibility-print-root {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 2rem !important;
            background: white !important;
            border: none !important;
            box-shadow: none !important;
          }

          /* Hide interactive buttons */
          .compliance-feasibility-print-root button,
          .compliance-feasibility-print-root select {
            display: none !important;
          }

          /* Ensure chart is visible */
          .compliance-feasibility-print-root .recharts-wrapper,
          .compliance-feasibility-print-root .recharts-surface {
            visibility: visible !important;
          }

          /* Ensure text is dark and readable */
          .compliance-feasibility-print-root p,
          .compliance-feasibility-print-root span,
          .compliance-feasibility-print-root div {
            color: #1e293b !important;
          }

          /* Show print-only elements */
          .compliance-feasibility-print-root .print\\:block {
            display: block !important;
          }

          /* Hide screen-only elements */
          .compliance-feasibility-print-root .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}

