'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { PanelProps, DbCoverageLevel, DbCoveragePost } from '@/lib/coverage-types';
import {
  fetchCoveragePolicyData,
  buildLevelMap,
  getLevelLabel as getLabel,
  DEFAULT_LEVEL_LABELS,
} from '@/lib/coverage-policy-service';

// Hypothetical unit placed on map
export interface HypotheticalUnit {
  id: string;
  lat: number;
  lng: number;
  zoneId: number | null;
  zoneName: string | null;
  thresholdMinutes: number | null;
}

// Response zone for matching
export interface ResponseZoneInfo {
  id: number;
  zoneName: string;
  thresholdMinutes: number | null;
  boundary: GeoJSON.Polygon | null;
}

// Time bands that can be toggled
export type TimeBandKey = '0-8' | '8-12' | '12-20' | '20-25' | '25-30';
export const ALL_TIME_BANDS: TimeBandKey[] = ['0-8', '8-12', '12-20', '20-25', '25-30'];

interface CoveragePolicyPanelProps extends PanelProps {
  onSimulate?: (level: number) => void;
  onHypotheticalMode?: (enabled: boolean, units: HypotheticalUnit[]) => void;
  hypotheticalUnits?: HypotheticalUnit[];
  onClearUnits?: () => void;
  onRemoveUnit?: (unitId: string) => void;
  responseZones?: ResponseZoneInfo[];
  visibleTimeBands?: Set<TimeBandKey>;
  onTimeBandToggle?: (band: TimeBandKey, visible: boolean) => void;
}

// DEFAULT_LEVEL_LABELS is now imported from coverage-policy-service

export default function CoveragePolicyPanel({
  parishId,
  parishName,
  regionId,
  onClose,
  onSimulate,
  onHypotheticalMode,
  hypotheticalUnits = [],
  onClearUnits,
  onRemoveUnit,
  responseZones = [],
  visibleTimeBands = new Set(ALL_TIME_BANDS),
  onTimeBandToggle,
}: CoveragePolicyPanelProps) {
  const [selectedLevel, setSelectedLevel] = useState<number>(3);
  const [hypotheticalMode, setHypotheticalMode] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [allPosts, setAllPosts] = useState<DbCoveragePost[]>([]);
  const [levels, setLevels] = useState<DbCoverageLevel[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch posts and levels from database using shared service
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const result = await fetchCoveragePolicyData(regionId);
        setAllPosts(result.posts);
        setLevels(result.levels);
        if (result.error) {
          console.error('Error loading coverage data:', result.error);
        }
      } catch (err) {
        console.error('Error fetching coverage data:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [regionId]);

  // Build a map of levelNumber -> level for easy lookup (using shared helper)
  const levelMap = useMemo(() => buildLevelMap(levels), [levels]);

  // Get posts for a specific level from the junction table data
  const getPostsForLevel = useCallback((levelNumber: number): { id: number; name: string }[] => {
    const level = levelMap[levelNumber];
    if (!level) return [];
    return level.posts || [];
  }, [levelMap]);

  // Get label for a level (from DB or fallback, using shared helper)
  const getLevelLabel = useCallback((levelNumber: number): string => {
    return getLabel(levelNumber, levelMap);
  }, [levelMap]);

  // Posts at the selected level (from junction table)
  const postsAtLevel = useMemo(() => {
    const levelPosts = getPostsForLevel(selectedLevel);
    const postIds = new Set(levelPosts.map(p => p.id));
    return allPosts.filter(p => postIds.has(p.id));
  }, [selectedLevel, allPosts, getPostsForLevel]);

  // Get count of posts per level for display
  const getPostCountForLevel = useCallback((levelNumber: number): number => {
    return getPostsForLevel(levelNumber).length;
  }, [getPostsForLevel]);

  const handleSimulate = () => {
    if (onSimulate) {
      setIsSimulating(true);
      onSimulate(selectedLevel);
      // Reset simulating state after a moment
      setTimeout(() => setIsSimulating(false), 500);
    }
  };

  const toggleHypotheticalMode = () => {
    const newMode = !hypotheticalMode;
    setHypotheticalMode(newMode);
    if (onHypotheticalMode) {
      onHypotheticalMode(newMode, []);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-900 text-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <div>
          <h2 className="text-sm font-semibold">Coverage Policy</h2>
          <p className="text-xs text-slate-400">{parishName || regionId}</p>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-slate-700 rounded transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Hypothetical Mode Toggle - Always visible at top */}
        <div className="bg-slate-800 rounded-lg p-3">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <span className="text-xs font-medium">Hypothetical Post Mode</span>
              <p className="text-[10px] text-slate-500">Click map to test coverage from any point</p>
            </div>
            <button
              onClick={toggleHypotheticalMode}
              className={`w-10 h-5 rounded-full transition-colors relative ${hypotheticalMode ? 'bg-blue-600' : 'bg-slate-600'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${hypotheticalMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </label>
        </div>

        {/* === HYPOTHETICAL MODE CONTENT === */}
        {hypotheticalMode ? (
          <>
            {/* Units Counter */}
            <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-blue-200 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Placed Units ({hypotheticalUnits.length})
                </h3>
                {hypotheticalUnits.length > 0 && onClearUnits && (
                  <button
                    onClick={onClearUnits}
                    className="text-[10px] text-blue-300 hover:text-blue-100 transition-colors"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {hypotheticalUnits.length === 0 ? (
                <p className="text-xs text-blue-200">
                  <span className="font-medium">Click anywhere on the map</span> to place a unit and see coverage.
                </p>
              ) : (
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {hypotheticalUnits.map((unit, idx) => (
                    <div key={unit.id} className="bg-blue-800/50 rounded p-2 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-blue-100">Unit #{idx + 1}</span>
                        {onRemoveUnit && (
                          <button
                            onClick={() => onRemoveUnit(unit.id)}
                            className="text-blue-300 hover:text-red-400 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                      <div className="text-blue-200 space-y-0.5">
                        <div className="flex items-center gap-1">
                          <span className="text-blue-400">Zone:</span>
                          <span className="font-medium">{unit.zoneName || 'Unknown Zone'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-blue-400">Threshold:</span>
                          <span className={`font-medium ${unit.thresholdMinutes ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {unit.thresholdMinutes ? `${unit.thresholdMinutes} min` : 'Not set'}
                          </span>
                        </div>
                        <div className="text-[10px] text-blue-400">
                          {unit.lat.toFixed(4)}, {unit.lng.toFixed(4)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Legend for coverage areas with toggles */}
            {hypotheticalUnits.length > 0 && (
              <div className="bg-slate-800 rounded-lg p-3">
                <h3 className="text-xs font-medium text-slate-400 mb-2">Reachable Area by Time</h3>
                <p className="text-[10px] text-slate-500 mb-2">Based on actual road network</p>
                <div className="space-y-1.5 text-[10px]">
                  {([
                    { band: '0-8' as TimeBandKey, color: '#22c55e', label: '0-8 min' },
                    { band: '8-12' as TimeBandKey, color: '#eab308', label: '8-12 min' },
                    { band: '12-20' as TimeBandKey, color: '#f97316', label: '12-20 min' },
                    { band: '20-25' as TimeBandKey, color: '#ef4444', label: '20-25 min' },
                    { band: '25-30' as TimeBandKey, color: '#a855f7', label: '25-30 min' },
                  ]).map(({ band, color, label }) => (
                    <label key={band} className="flex items-center gap-2 cursor-pointer hover:bg-slate-700/50 rounded px-1 py-0.5 -mx-1">
                      <input
                        type="checkbox"
                        checked={visibleTimeBands.has(band)}
                        onChange={(e) => onTimeBandToggle?.(band, e.target.checked)}
                        className="w-3 h-3 rounded border-slate-500 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 bg-slate-700"
                      />
                      <div className="w-3 h-3 rounded flex-shrink-0" style={{ backgroundColor: color }} />
                      <span className={`${visibleTimeBands.has(band) ? 'text-slate-300' : 'text-slate-500'}`}>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* === NORMAL MODE CONTENT === */}
            {/* Posts at Selected Level */}
            <div className="bg-slate-800 rounded-lg p-3">
              <h3 className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Posts at Level {selectedLevel}
              </h3>
              {loading ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full" />
                </div>
              ) : postsAtLevel.length === 0 ? (
                <div className="text-xs text-slate-500 py-2">
                  <p>No posts configured.</p>
                  <p className="mt-1">Add posts via Region Settings (gear icon in dropdown).</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {postsAtLevel.map(post => (
                    <div key={post.id} className="flex items-center justify-between p-2 bg-slate-700/50 rounded text-xs">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${post.lat && post.lng ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                        <div>
                          <span className="font-medium">{post.name}</span>
                          {post.address && <span className="text-slate-500 ml-1.5 text-[10px]">({post.address})</span>}
                        </div>
                      </div>
                      <span className="text-slate-400">{post.defaultUnits} unit{post.defaultUnits !== 1 ? 's' : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Level Selector */}
            <div className="bg-slate-800 rounded-lg p-3">
              <h3 className="text-xs font-medium text-slate-400 mb-2">Coverage Level</h3>
              {loading ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full" />
                </div>
              ) : levels.length === 0 ? (
                <div className="text-xs text-slate-500 py-2">
                  <p>No coverage levels configured for this region.</p>
                  <p className="mt-1">Use the Coverage Policy modal to set up levels.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {levels
                    .slice()
                    .sort((a, b) => b.levelNumber - a.levelNumber)
                    .map(level => (
                      <button
                        key={level.id}
                        onClick={() => setSelectedLevel(level.levelNumber)}
                        className={`w-full text-left px-3 py-2 rounded transition-colors flex items-center justify-between text-xs ${
                          selectedLevel === level.levelNumber
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {level.color && (
                            <div
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: level.color }}
                            />
                          )}
                          <div>
                            <span className="font-medium">Level {level.levelNumber}</span>
                            <span className="opacity-75 ml-1.5">– {level.name}</span>
                          </div>
                        </div>
                        <span className="opacity-75">{level.posts?.length || 0} posts</span>
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Simulate Button */}
            <button
              onClick={handleSimulate}
              disabled={isSimulating}
              className={`w-full font-medium py-2.5 rounded-lg transition-all text-sm ${
                isSimulating
                  ? 'bg-emerald-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              {isSimulating ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Simulating...
                </span>
              ) : (
                `Simulate Level ${selectedLevel} Coverage`
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

