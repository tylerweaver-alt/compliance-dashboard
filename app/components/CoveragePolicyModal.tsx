'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { DbCoverageLevel, DbCoveragePost } from '@/lib/coverage-types';
import { fetchCoveragePolicyData, countPostsNeedingGeocode } from '@/lib/coverage-policy-service';

interface CoveragePolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  userRegion?: string; // For region-locked users
  canViewAllRegions?: boolean;
}

// Region info from the regions API
interface RegionInfo {
  id: number;
  code: string;
  name: string;
}

// Map region names to codes (used for API calls)
const REGION_NAME_TO_CODE: Record<string, string> = {
  'Central Louisiana': 'CENLA',
  'Southwest Louisiana': 'SWLA',
  'Southwest LA': 'SWLA',
  'New Orleans': 'NOLA',
  'Northeast Louisiana': 'NELA',
  'Southeast Louisiana': 'SELA',
  'Capital Region': 'CAPITAL',
  'Bayou Region': 'BAYOU',
  'Hub City': 'HUBCITY',
  'Northshore': 'NORTHSHORE',
};

export default function CoveragePolicyModal({
  isOpen,
  onClose,
  userRegion,
  canViewAllRegions = true,
}: CoveragePolicyModalProps) {
  const [selectedRegionId, setSelectedRegionId] = useState<string>(userRegion || 'CENLA');
  const [regions, setRegions] = useState<RegionInfo[]>([]);
  const [posts, setPosts] = useState<DbCoveragePost[]>([]);
  const [levels, setLevels] = useState<DbCoverageLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editing state for levels
  const [editingLevelId, setEditingLevelId] = useState<number | null>(null);
  const [editingLevelName, setEditingLevelName] = useState('');
  const [editingLevelColor, setEditingLevelColor] = useState('');
  const [editingLevelDescription, setEditingLevelDescription] = useState('');

  // Post assignment modal state
  const [assigningLevelId, setAssigningLevelId] = useState<number | null>(null);
  const [selectedPostIds, setSelectedPostIds] = useState<Set<number>>(new Set());

  // Geocoding state
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeResults, setGeocodeResults] = useState<{ success: number; failed: number } | null>(null);

  // Count posts missing coordinates using shared helper
  const postsNeedingGeocode = countPostsNeedingGeocode(posts);

  // Shared function to fetch posts and levels
  const refreshData = useCallback(async (regionId: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchCoveragePolicyData(regionId);
      setPosts(result.posts);
      setLevels(result.levels);
      if (result.error) {
        setError(result.error);
      }
    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Geocode all posts missing coordinates
  const handleGeocodeAll = async () => {
    setGeocoding(true);
    setGeocodeResults(null);
    setError(null);

    try {
      const res = await fetch('/api/posts/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regionId: selectedRegionId }),
      });

      const data = await res.json();

      if (!data.ok) {
        setError(data.error || 'Geocoding failed');
      } else {
        setGeocodeResults({ success: data.summary.success, failed: data.summary.failed });
        // Refresh posts to show updated coordinates
        await refreshData(selectedRegionId);
      }
    } catch (err: any) {
      setError(err.message || 'Geocoding request failed');
    } finally {
      setGeocoding(false);
    }
  };

  // Fetch regions on mount
  useEffect(() => {
    if (!isOpen) return;

    const fetchRegions = async () => {
      try {
        const res = await fetch('/api/regions');
        const data = await res.json();
        // API returns array directly, not { regions: [...] }
        if (Array.isArray(data)) {
          const regionList = data.map((r: any) => ({
            id: r.id,
            code: REGION_NAME_TO_CODE[r.name] || r.name.toUpperCase().replace(/\s+/g, ''),
            name: r.name,
          }));
          setRegions(regionList);
          // If userRegion is set, use it; otherwise use first region
          if (userRegion) {
            setSelectedRegionId(userRegion);
          } else if (regionList.length > 0) {
            setSelectedRegionId(regionList[0].code);
          }
        }
      } catch (err) {
        console.error('Error fetching regions:', err);
      }
    };
    fetchRegions();
  }, [isOpen, userRegion]);

  // Fetch posts and levels when region changes (using shared service)
  useEffect(() => {
    if (!isOpen || !selectedRegionId) return;
    refreshData(selectedRegionId);
  }, [isOpen, selectedRegionId, refreshData]);

  // Start editing a level
  const startEditingLevel = useCallback((level: DbCoverageLevel) => {
    setEditingLevelId(level.id);
    setEditingLevelName(level.name);
    setEditingLevelColor(level.color || '#6b7280');
    setEditingLevelDescription(level.description || '');
  }, []);

  // Cancel editing
  const cancelEditingLevel = useCallback(() => {
    setEditingLevelId(null);
    setEditingLevelName('');
    setEditingLevelColor('');
    setEditingLevelDescription('');
  }, []);

  // Save level changes
  const saveLevel = useCallback(async () => {
    if (!editingLevelId) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/coverage-levels/${editingLevelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingLevelName.trim(),
          color: editingLevelColor,
          description: editingLevelDescription.trim() || null,
        }),
      });

      const data = await res.json();
      if (data.ok && data.level) {
        setLevels(prev => prev.map(l => l.id === editingLevelId ? data.level : l));
        cancelEditingLevel();
      } else {
        setError(data.error || 'Failed to save level');
      }
    } catch (err: any) {
      setError('Failed to save level');
    } finally {
      setSaving(false);
    }
  }, [editingLevelId, editingLevelName, editingLevelColor, editingLevelDescription, cancelEditingLevel]);

  // Start assigning posts to a level
  const startAssigningPosts = useCallback((level: DbCoverageLevel) => {
    setAssigningLevelId(level.id);
    setSelectedPostIds(new Set(level.posts?.map(p => p.id) || []));
  }, []);

  // Toggle post selection
  const togglePostSelection = useCallback((postId: number) => {
    setSelectedPostIds(prev => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  }, []);

  // Save post assignments
  const savePostAssignments = useCallback(async () => {
    if (!assigningLevelId) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/coverage-levels/${assigningLevelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postIds: Array.from(selectedPostIds),
        }),
      });

      const data = await res.json();
      if (data.ok && data.level) {
        setLevels(prev => prev.map(l => l.id === assigningLevelId ? data.level : l));
        setAssigningLevelId(null);
        setSelectedPostIds(new Set());
      } else {
        setError(data.error || 'Failed to save assignments');
      }
    } catch (err: any) {
      setError('Failed to save assignments');
    } finally {
      setSaving(false);
    }
  }, [assigningLevelId, selectedPostIds]);

  if (!isOpen) return null;

  const filteredRegions = canViewAllRegions
    ? regions
    : regions.filter(r => r.code === userRegion);
  const selectedRegion = regions.find(r => r.code === selectedRegionId);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[2000] p-4">
      <div className="bg-slate-900 rounded-xl w-full max-w-6xl h-[85vh] flex overflow-hidden shadow-2xl">
        {/* Left Column - Regions List */}
        <div className="w-64 bg-slate-800 border-r border-slate-700 flex flex-col">
          <div className="p-4 border-b border-slate-700">
            <h2 className="text-lg font-semibold text-white">Regions</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredRegions.map(region => (
              <button
                key={region.code}
                onClick={() => setSelectedRegionId(region.code)}
                className={`w-full text-left p-4 border-b border-slate-700 transition-colors ${
                  selectedRegionId === region.code
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                <p className="font-medium">{region.name}</p>
                <p className="text-xs opacity-75">{region.code}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Right Column - Policy Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-850">
            <div>
              <h2 className="text-xl font-semibold text-white">{selectedRegion?.name || selectedRegionId}</h2>
              <p className="text-sm text-slate-400">Coverage Policy Configuration</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-white"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mx-6 mt-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">
              {error}
              <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-300">✕</button>
            </div>
          )}

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" />
              </div>
            ) : (
              <>
                {/* Region Summary */}
                <section className="bg-slate-800 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-slate-400 mb-3">Region Summary</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-2xl font-bold text-blue-400">{posts.length}</p>
                      <p className="text-xs text-slate-400">Posts</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-amber-400">{levels.length}</p>
                      <p className="text-xs text-slate-400">Coverage Levels</p>
                    </div>
                  </div>
                </section>

                {/* Posts Table */}
                <section className="bg-slate-800 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-slate-400">Coverage Posts</h3>
                    {postsNeedingGeocode > 0 && (
                      <button
                        onClick={handleGeocodeAll}
                        disabled={geocoding}
                        className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded transition-colors ${
                          geocoding
                            ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                            : 'bg-amber-600 hover:bg-amber-500 text-white'
                        }`}
                      >
                        {geocoding ? (
                          <>
                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Geocoding...
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            Geocode {postsNeedingGeocode} Post{postsNeedingGeocode !== 1 ? 's' : ''}
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Geocode Results */}
                  {geocodeResults && (
                    <div className="mb-3 p-2 bg-slate-700 rounded text-xs">
                      <span className="text-emerald-400">✓ {geocodeResults.success} geocoded</span>
                      {geocodeResults.failed > 0 && (
                        <span className="text-red-400 ml-3">✕ {geocodeResults.failed} failed</span>
                      )}
                    </div>
                  )}

                  {posts.length === 0 ? (
                    <p className="text-sm text-slate-500 italic">No posts configured for this region.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-slate-400 border-b border-slate-700">
                            <th className="pb-2 pr-4">Name</th>
                            <th className="pb-2 pr-4">Address</th>
                            <th className="pb-2 pr-4">Lat</th>
                            <th className="pb-2 pr-4">Lng</th>
                            <th className="pb-2">Units</th>
                          </tr>
                        </thead>
                        <tbody className="text-white">
                          {posts.map(post => (
                            <tr key={post.id} className={`border-b border-slate-700/50 hover:bg-slate-700/30 ${
                              (post.lat === null || post.lng === null) ? 'bg-amber-900/20' : ''
                            }`}>
                              <td className="py-2 pr-4">{post.name}</td>
                              <td className="py-2 pr-4 text-slate-300 text-xs">{post.address || '—'}</td>
                              <td className="py-2 pr-4 text-slate-300">{post.lat?.toFixed(4) ?? <span className="text-amber-400">—</span>}</td>
                              <td className="py-2 pr-4 text-slate-300">{post.lng?.toFixed(4) ?? <span className="text-amber-400">—</span>}</td>
                              <td className="py-2">
                                <span className="bg-emerald-600 px-2 py-0.5 rounded text-xs">{post.defaultUnits}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                {/* Coverage Levels - Editable */}
                <section className="bg-slate-800 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-slate-400 mb-3">Coverage Levels</h3>
                  {levels.length === 0 ? (
                    <p className="text-sm text-slate-500 italic">No coverage levels configured for this region.</p>
                  ) : (
                    <div className="space-y-2">
                      {levels
                        .slice()
                        .sort((a, b) => b.levelNumber - a.levelNumber)
                        .map(level => (
                          <div key={level.id} className="p-3 bg-slate-700 rounded-lg">
                            {editingLevelId === level.id ? (
                              /* Editing Mode */
                              <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="color"
                                    value={editingLevelColor}
                                    onChange={(e) => setEditingLevelColor(e.target.value)}
                                    className="w-8 h-8 rounded cursor-pointer"
                                  />
                                  <input
                                    type="text"
                                    value={editingLevelName}
                                    onChange={(e) => setEditingLevelName(e.target.value)}
                                    className="flex-1 bg-slate-600 text-white px-3 py-1.5 rounded text-sm"
                                    placeholder="Level name"
                                  />
                                </div>
                                <textarea
                                  value={editingLevelDescription}
                                  onChange={(e) => setEditingLevelDescription(e.target.value)}
                                  className="w-full bg-slate-600 text-white px-3 py-2 rounded text-sm"
                                  placeholder="Description (optional)"
                                  rows={2}
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={saveLevel}
                                    disabled={saving}
                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded transition-colors disabled:opacity-50"
                                  >
                                    {saving ? 'Saving...' : 'Save'}
                                  </button>
                                  <button
                                    onClick={cancelEditingLevel}
                                    className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white text-xs rounded transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              /* Display Mode */
                              <>
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="w-3 h-3 rounded-full"
                                      style={{ backgroundColor: level.color || '#6b7280' }}
                                    />
                                    <span className="font-medium text-white">
                                      Level {level.levelNumber} – {level.name}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-400">{level.posts?.length || 0} posts</span>
                                    <button
                                      onClick={() => startEditingLevel(level)}
                                      className="text-xs text-blue-400 hover:text-blue-300"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => startAssigningPosts(level)}
                                      className="text-xs text-emerald-400 hover:text-emerald-300"
                                    >
                                      Assign Posts
                                    </button>
                                  </div>
                                </div>
                                {level.description && (
                                  <p className="text-xs text-slate-400 mb-2">{level.description}</p>
                                )}
                                <p className="text-xs text-slate-400">
                                  Posts: {level.posts?.length > 0 ? level.posts.map(p => p.name).join(', ') : 'None assigned'}
                                </p>
                              </>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </section>

                {/* Placeholder for future rules section */}
                <section className="bg-slate-800 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-slate-400 mb-3">Coverage Rules (Coming Soon)</h3>
                  <p className="text-sm text-slate-500 italic">
                    Rule configuration will be available in a future update.
                  </p>
                </section>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Post Assignment Modal */}
      {assigningLevelId !== null && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[2100] p-4">
          <div className="bg-slate-800 rounded-xl w-full max-w-md max-h-[70vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Assign Posts to Level</h3>
              <button
                onClick={() => { setAssigningLevelId(null); setSelectedPostIds(new Set()); }}
                className="p-1 hover:bg-slate-700 rounded text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {posts.map(post => (
                <label
                  key={post.id}
                  className="flex items-center gap-3 p-2 bg-slate-700/50 rounded hover:bg-slate-700 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedPostIds.has(post.id)}
                    onChange={() => togglePostSelection(post.id)}
                    className="w-4 h-4 rounded border-slate-500 text-emerald-500 focus:ring-emerald-500"
                  />
                  <div>
                    <span className="text-white text-sm">{post.name}</span>
                    {post.address && (
                      <span className="text-slate-400 text-xs ml-2">({post.address})</span>
                    )}
                  </div>
                </label>
              ))}
            </div>
            <div className="p-4 border-t border-slate-700 flex justify-end gap-2">
              <button
                onClick={() => { setAssigningLevelId(null); setSelectedPostIds(new Set()); }}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white text-sm rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={savePostAssignments}
                disabled={saving}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : `Save (${selectedPostIds.size} selected)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

