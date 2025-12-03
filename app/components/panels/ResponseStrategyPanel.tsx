'use client';

import React, { useState, useEffect } from 'react';
import type { PanelProps } from '@/lib/coverage-types';

interface ResponseZone {
  id: number;
  parishId: number;
  zoneName: string;
  thresholdMinutes: number | null;
  hasPolygon: boolean;
}

interface CoveragePost {
  id: number;
  name: string;
  lat: number | null;
  lng: number | null;
}

interface AnalysisResult {
  zoneId: number;
  zoneName: string;
  targetMinutes: number;
  compliancePercent: number;
  postsAnalyzed: { postName: string; reachable: boolean }[];
  recommendation: string;
  coveredAreaSqKm: number;
  historicalData: boolean;
  callsAnalyzed?: number;
  onTimeCalls?: number;
  dataSource?: string;
}

interface ResponseStrategyPanelProps extends PanelProps {
  onShowIsochrones?: (postIds: number[], minutes: number) => void;
}

export default function ResponseStrategyPanel({
  parishId,
  parishName,
  regionId = 'CENLA',
  onClose,
  onShowIsochrones,
}: ResponseStrategyPanelProps) {
  // Data state
  const [zones, setZones] = useState<ResponseZone[]>([]);
  const [posts, setPosts] = useState<CoveragePost[]>([]);
  const [loading, setLoading] = useState(true);

  // Configuration state
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [selectedPostIds, setSelectedPostIds] = useState<number[]>([]);
  const [targetMinutes, setTargetMinutes] = useState(8);
  const [unitsAvailable, setUnitsAvailable] = useState(3);

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load zones and posts
  useEffect(() => {
    if (!parishId) return;

    setLoading(true);
    Promise.all([
      fetch(`/api/response-zones?parish_id=${parishId}`).then(r => r.json()),
      fetch(`/api/posts?region_id=${regionId}`).then(r => r.json()),
    ])
      .then(([zonesData, postsData]) => {
        if (zonesData.ok) {
          const zonesWithPolygon = zonesData.zones.map((z: any) => ({
            ...z,
            hasPolygon: !!z.boundary,
          }));
          setZones(zonesWithPolygon);
          // Auto-select first zone with a polygon
          const firstWithPolygon = zonesWithPolygon.find((z: ResponseZone) => z.hasPolygon);
          if (firstWithPolygon) {
            setSelectedZoneId(firstWithPolygon.id);
            if (firstWithPolygon.thresholdMinutes) {
              setTargetMinutes(firstWithPolygon.thresholdMinutes);
            }
          }
        }
        if (postsData.ok) {
          setPosts(postsData.posts);
          // Auto-select all posts with coordinates
          const validPosts = postsData.posts.filter((p: CoveragePost) => p.lat && p.lng);
          setSelectedPostIds(validPosts.map((p: CoveragePost) => p.id));
        }
      })
      .finally(() => setLoading(false));
  }, [parishId, regionId]);

  // Update target when zone changes
  useEffect(() => {
    const zone = zones.find(z => z.id === selectedZoneId);
    if (zone?.thresholdMinutes) {
      setTargetMinutes(zone.thresholdMinutes);
    }
  }, [selectedZoneId, zones]);

  const selectedZone = zones.find(z => z.id === selectedZoneId);

  const runAnalysis = async () => {
    if (!selectedZoneId) return;

    setAnalyzing(true);
    setError(null);

    try {
      const res = await fetch('/api/compliance-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zoneId: selectedZoneId,
          postIds: selectedPostIds,
          targetMinutes,
          unitsAvailable,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Analysis failed');
      } else {
        setResult(data);
        // Show isochrones on map
        if (onShowIsochrones && selectedPostIds.length > 0) {
          onShowIsochrones(selectedPostIds, targetMinutes);
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const getComplianceColor = (pct: number) => {
    if (pct >= 90) return 'text-emerald-400';
    if (pct >= 70) return 'text-amber-400';
    return 'text-red-400';
  };

  const getComplianceBg = (pct: number) => {
    if (pct >= 90) return 'bg-emerald-900/30';
    if (pct >= 70) return 'bg-amber-900/30';
    return 'bg-red-900/30';
  };

  return (
    <div className="h-full flex flex-col bg-slate-900 text-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <div>
          <h2 className="text-sm font-semibold">Response Strategy</h2>
          <p className="text-xs text-slate-400">{parishName || 'Select a parish'}</p>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-slate-700 rounded transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full" />
          </div>
        ) : !parishId ? (
          <div className="text-center py-8 text-slate-400 text-sm">
            Select a parish on the map to analyze response strategy.
          </div>
        ) : (
          <>
            {/* Zone Selection */}
            <div className="bg-slate-800 rounded-lg p-3">
              <label className="block text-xs text-slate-400 mb-2">Response Zone</label>
              <select
                value={selectedZoneId || ''}
                onChange={(e) => setSelectedZoneId(parseInt(e.target.value) || null)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded text-sm text-black"
                style={{ color: selectedZoneId ? 'black' : '#374151' }}
              >
                <option value="" style={{ color: '#374151' }}>Select a zone...</option>
                {zones.map(zone => (
                  <option key={zone.id} value={zone.id} disabled={!zone.hasPolygon} style={{ color: 'black' }}>
                    {zone.zoneName} {zone.thresholdMinutes ? `(${zone.thresholdMinutes}min)` : ''}
                    {!zone.hasPolygon ? ' - No boundary' : ''}
                  </option>
                ))}
              </select>
              {selectedZone && !selectedZone.hasPolygon && (
                <p className="text-xs text-amber-400 mt-1">⚠ Draw this zone's boundary first</p>
              )}
            </div>

            {/* Configuration */}
            <div className="bg-slate-800 rounded-lg p-3 space-y-3">
              <h3 className="text-xs font-medium text-slate-300">Scenario Configuration</h3>

              {/* Target Time Slider */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">Target Response Time</span>
                  <span className="text-white font-medium">{targetMinutes} min</span>
                </div>
                <input
                  type="range"
                  min="4"
                  max="20"
                  value={targetMinutes}
                  onChange={(e) => setTargetMinutes(parseInt(e.target.value))}
                  className="w-full accent-emerald-500"
                />
                <div className="flex justify-between text-xs text-slate-500">
                  <span>4 min</span>
                  <span>20 min</span>
                </div>
              </div>

              {/* Units Available */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">Units Available</span>
                  <span className="text-white font-medium">{unitsAvailable}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={unitsAvailable}
                  onChange={(e) => setUnitsAvailable(parseInt(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>

              {/* Post Selection */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-slate-400">
                    Posts ({selectedPostIds.length} selected)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const validPosts = posts.filter(p => p.lat && p.lng);
                      if (selectedPostIds.length === validPosts.length) {
                        setSelectedPostIds([]);
                      } else {
                        setSelectedPostIds(validPosts.map(p => p.id));
                      }
                    }}
                    className="text-xs text-emerald-400 hover:text-emerald-300"
                  >
                    {selectedPostIds.length === posts.filter(p => p.lat && p.lng).length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div className="max-h-32 overflow-y-auto bg-white border border-slate-300 rounded p-2 space-y-1">
                  {posts.filter(p => p.lat && p.lng).map(post => (
                    <label key={post.id} className="flex items-center gap-2 text-xs cursor-pointer text-gray-800 hover:bg-gray-100 rounded px-1 py-0.5">
                      <input
                        type="checkbox"
                        checked={selectedPostIds.includes(post.id)}
                        onChange={(e) => setSelectedPostIds(
                          e.target.checked
                            ? [...selectedPostIds, post.id]
                            : selectedPostIds.filter(id => id !== post.id)
                        )}
                        className="rounded text-emerald-500"
                      />
                      <span>{post.name}</span>
                    </label>
                  ))}
                  {posts.filter(p => p.lat && p.lng).length === 0 && (
                    <p className="text-xs text-gray-500">No posts configured</p>
                  )}
                </div>
              </div>
            </div>

            {/* Run Analysis Button */}
            <button
              onClick={runAnalysis}
              disabled={analyzing || !selectedZoneId || !selectedZone?.hasPolygon || selectedPostIds.length === 0}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors"
            >
              {analyzing ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Analyzing...
                </span>
              ) : (
                'Analyze Compliance'
              )}
            </button>

            {error && (
              <div className="bg-red-900/30 border border-red-700 rounded p-2 text-xs text-red-300">
                {error}
              </div>
            )}

            {/* Results */}
            {result && (
              <div className="bg-slate-800 rounded-lg p-3 space-y-3">
                {/* Compliance Score */}
                <div className={`text-center py-4 rounded-lg ${getComplianceBg(result.compliancePercent)}`}>
                  <div className={`text-4xl font-bold ${getComplianceColor(result.compliancePercent)}`}>
                    {result.compliancePercent}%
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {result.historicalData ? 'Historical' : 'Estimated'} Compliance at {result.targetMinutes} min
                  </div>
                </div>

                {/* Data Source */}
                {result.dataSource && (
                  <div className="text-xs text-slate-400 text-center bg-slate-700/30 rounded p-2">
                    {result.dataSource}
                  </div>
                )}

                {/* Quick Stats */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-slate-700/50 rounded p-2 text-center">
                    <div className="text-slate-400">Target</div>
                    <div className="text-white font-medium">{result.targetMinutes}m</div>
                  </div>
                  <div className="bg-slate-700/50 rounded p-2 text-center">
                    <div className="text-slate-400">Calls</div>
                    <div className="text-white font-medium">{result.callsAnalyzed ?? '—'}</div>
                  </div>
                  <div className="bg-slate-700/50 rounded p-2 text-center">
                    <div className="text-slate-400">On Time</div>
                    <div className="text-white font-medium">{result.onTimeCalls ?? '—'}</div>
                  </div>
                </div>

                {/* Recommendation */}
                <div className={`p-3 rounded-lg border-l-4 ${
                  result.compliancePercent >= 90
                    ? 'bg-emerald-900/20 border-emerald-500'
                    : result.compliancePercent >= 70
                      ? 'bg-amber-900/20 border-amber-500'
                      : 'bg-red-900/20 border-red-500'
                }`}>
                  <p className="text-xs font-medium text-slate-300 mb-1">Recommendation</p>
                  <p className="text-xs text-slate-400">{result.recommendation}</p>
                </div>

                {/* What-If Suggestions */}
                {result.compliancePercent < 90 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-300">What if...</p>
                    <button
                      onClick={() => { setTargetMinutes(t => t + 2); }}
                      className="w-full text-left text-xs p-2 bg-slate-700 hover:bg-slate-600 rounded text-slate-300"
                    >
                      ⏱ Increase target to <span className="text-emerald-400">{targetMinutes + 2} min</span>?
                    </button>
                    <button
                      onClick={() => { setUnitsAvailable(u => u + 1); }}
                      className="w-full text-left text-xs p-2 bg-slate-700 hover:bg-slate-600 rounded text-slate-300"
                    >
                      🚑 Add <span className="text-emerald-400">1 more unit</span>?
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

