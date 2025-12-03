'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

const HEATMAP_SETTINGS_ROLES = ['OS', 'OM', 'Director', 'VP', 'Admin'];

interface Region {
  id: number;
  name: string;
}

interface Parish {
  id: number;
  name: string;
}

interface Zone {
  id: number;
  name: string;
  threshold_minutes: number;
  has_polygon: boolean;
}

interface Site {
  id: number;
  name: string;
  type: 'station' | 'post';
  address: string;
}

type TabType = 'zones' | 'stations';

function HeatmapSettingsContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get regionId from URL once
  const regionIdFromUrl = searchParams.get('regionId');

  // State
  const [activeTab, setActiveTab] = useState<TabType>('zones');
  const [regions, setRegions] = useState<Region[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
  const [parishes, setParishes] = useState<Parish[]>([]);
  const [selectedParish, setSelectedParish] = useState<Parish | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedParishes, setExpandedParishes] = useState<Set<number>>(new Set());

  // Form state for adding stations/posts
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteType, setNewSiteType] = useState<'station' | 'post'>('station');
  const [newSiteAddress, setNewSiteAddress] = useState('');

  // Toggle parish expansion
  const toggleParishExpand = (parishId: number) => {
    setExpandedParishes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(parishId)) {
        newSet.delete(parishId);
      } else {
        newSet.add(parishId);
      }
      return newSet;
    });
  };

  // Get zones for a parish (mock data for now - will be replaced with API call)
  const getZonesForParish = (parish: Parish): Zone[] => {
    return [
      { id: parish.id * 100 + 1, name: `All of ${parish.name}`, threshold_minutes: 0, has_polygon: false },
      { id: parish.id * 100 + 2, name: `${parish.name} - Urban (5 min)`, threshold_minutes: 5, has_polygon: false },
      { id: parish.id * 100 + 3, name: `${parish.name} - Suburban (8 min)`, threshold_minutes: 8, has_polygon: false },
      { id: parish.id * 100 + 4, name: `${parish.name} - Rural (12 min)`, threshold_minutes: 12, has_polygon: false },
    ];
  };

  // Get contracted parishes from the selected region
  const contractedParishes = (selectedRegion as any)?.parishes || [];

  // Check authorization
  const sessionUser: any = session?.user;
  const userRole = sessionUser?.role;
  const isAuthorized = userRole && HEATMAP_SETTINGS_ROLES.includes(userRole);

  // Redirect if not authorized
  useEffect(() => {
    if (status === 'loading') return;
    if (!session || !isAuthorized) {
      router.push('/AcadianDashboard');
    }
  }, [session, status, isAuthorized, router]);

  // Load regions on mount and select the one from URL if provided
  useEffect(() => {
    const fetchRegions = async () => {
      try {
        const res = await fetch('/api/regions');
        const data = await res.json();
        // API returns array directly, not { ok, regions }
        const regionsArray = Array.isArray(data) ? data : (data.regions || []);
        if (regionsArray.length > 0) {
          setRegions(regionsArray);
          // If regionId was passed in URL, select that region
          if (regionIdFromUrl) {
            const targetRegion = regionsArray.find((r: Region) => r.id === Number(regionIdFromUrl));
            if (targetRegion) {
              setSelectedRegion(targetRegion);
            } else {
              setSelectedRegion(regionsArray[0]);
            }
          } else {
            setSelectedRegion(regionsArray[0]);
          }
        }
      } catch (err) {
        console.error('Failed to fetch regions:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchRegions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load parishes when region changes
  useEffect(() => {
    if (!selectedRegion) return;
    const fetchParishes = async () => {
      try {
        const res = await fetch(`/api/regions?id=${selectedRegion.id}`);
        const data = await res.json();
        if (data.ok && data.parishes) {
          setParishes(data.parishes);
          if (data.parishes.length > 0) {
            setSelectedParish(data.parishes[0]);
          }
        }
      } catch (err) {
        console.error('Failed to fetch parishes:', err);
      }
    };
    fetchParishes();
  }, [selectedRegion]);

  // Load zones/sites when parish changes
  useEffect(() => {
    if (!selectedParish) return;
    // Mock zones data for now
    setZones([
      { id: 1, name: `${selectedParish.name} 5 min`, threshold_minutes: 5, has_polygon: false },
      { id: 2, name: `${selectedParish.name} 8 min`, threshold_minutes: 8, has_polygon: false },
      { id: 3, name: `${selectedParish.name} 12 min`, threshold_minutes: 12, has_polygon: true },
    ]);
    // Mock sites data
    setSites([
      { id: 1, name: 'Main Station', type: 'station', address: '123 Main St' },
      { id: 2, name: 'Post Alpha', type: 'post', address: '456 Oak Ave' },
    ]);
  }, [selectedParish]);

  const handleAddSite = () => {
    if (!newSiteName.trim()) return;
    console.log('Adding site:', { name: newSiteName, type: newSiteType, address: newSiteAddress });
    // Mock add
    setSites([...sites, { 
      id: Date.now(), 
      name: newSiteName, 
      type: newSiteType, 
      address: newSiteAddress 
    }]);
    setNewSiteName('');
    setNewSiteAddress('');
  };

  if (status === 'loading' || loading) {
    return (
      <div className="h-screen bg-[#f5f5f5] flex items-center justify-center">
        <div className="text-slate-500">Loading...</div>
      </div>
    );
  }

  if (!isAuthorized) {
    return null; // Will redirect
  }

  return (
    <div className="h-screen bg-[#f5f5f5] flex flex-col overflow-hidden">
      {/* Header */}
      <header className="w-full bg-white border-b border-slate-200 flex-shrink-0 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/AcadianDashboard')}
              className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              title="Back to Dashboard"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div>
              <h1 className="text-2xl font-bold text-[#004437]">Heatmap Settings</h1>
              <p className="text-sm text-slate-500 mt-1">Configure Response Zones and Station/Post locations.</p>
            </div>
          </div>
          {/* Display current region (read-only) */}
          <div className="text-right">
            <p className="text-xs text-slate-500">Viewing settings for</p>
            <p className="text-lg font-semibold text-[#004437]">{selectedRegion?.name || 'Loading...'}</p>
          </div>
        </div>
      </header>

      {/* Main Content - Two Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column - Tabs and Content */}
        <div className="w-80 bg-white border-r border-slate-200 flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setActiveTab('zones')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'zones'
                  ? 'text-[#004437] border-b-2 border-[#004437] bg-emerald-50'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              Zones
            </button>
            <button
              onClick={() => setActiveTab('stations')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'stations'
                  ? 'text-[#004437] border-b-2 border-[#004437] bg-emerald-50'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              Stations & Posts
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'zones' && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 mb-3">Response zones for {selectedRegion?.name || 'selected region'}</p>
                {contractedParishes.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">No contracted parishes in this region.</p>
                ) : (
                  contractedParishes.map((parish: Parish) => {
                    const isExpanded = expandedParishes.has(parish.id);
                    const parishZones = getZonesForParish(parish);
                    return (
                      <div key={parish.id} className="border border-slate-200 rounded-lg overflow-hidden">
                        {/* Parish Header - Clickable */}
                        <button
                          onClick={() => toggleParishExpand(parish.id)}
                          className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <svg
                              className={`w-4 h-4 text-slate-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            <span className="text-sm font-medium text-slate-800">{parish.name}</span>
                          </div>
                          <span className="text-xs text-slate-500">{parishZones.length} zones</span>
                        </button>

                        {/* Zones List - Collapsible */}
                        {isExpanded && (
                          <div className="border-t border-slate-200 bg-white">
                            {parishZones.map((zone, idx) => (
                              <div
                                key={zone.id}
                                className={`flex items-center justify-between px-4 py-2 ${idx !== parishZones.length - 1 ? 'border-b border-slate-100' : ''}`}
                              >
                                <div className="flex items-center gap-2 pl-4">
                                  <div className={`w-2 h-2 rounded-full ${zone.threshold_minutes === 0 ? 'bg-blue-400' : 'bg-emerald-400'}`} />
                                  <span className="text-sm text-slate-700">{zone.name}</span>
                                </div>
                                <span className={`px-2 py-0.5 text-xs rounded ${
                                  zone.has_polygon
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {zone.has_polygon ? 'Drawn' : 'Not drawn'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {activeTab === 'stations' && (
              <div className="space-y-4">
                {/* Add Station/Post Form */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                  <p className="text-xs font-medium text-slate-600">Add New Station/Post</p>
                  <input
                    type="text"
                    placeholder="Name"
                    value={newSiteName}
                    onChange={(e) => setNewSiteName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                  <select
                    value={newSiteType}
                    onChange={(e) => setNewSiteType(e.target.value as 'station' | 'post')}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  >
                    <option value="station">Station</option>
                    <option value="post">Post</option>
                  </select>
                  <textarea
                    placeholder="Address"
                    value={newSiteAddress}
                    onChange={(e) => setNewSiteAddress(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
                  />
                  <button
                    onClick={handleAddSite}
                    className="w-full px-4 py-2 text-sm font-medium bg-[#004437] text-white rounded-lg hover:bg-[#003329] transition-colors"
                  >
                    Save
                  </button>
                </div>

                {/* Existing Sites List */}
                <div className="space-y-3">
                  <p className="text-xs text-slate-500">Existing locations</p>
                  {sites.map(site => (
                    <div
                      key={site.id}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-lg"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-800">{site.name}</p>
                          <p className="text-xs text-slate-500">{site.address}</p>
                        </div>
                        <span className={`px-2 py-1 text-xs rounded ${
                          site.type === 'station'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-purple-100 text-purple-700'
                        }`}>
                          {site.type}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Map Placeholder */}
        <div className="flex-1 bg-slate-50 flex items-center justify-center">
          <div className="text-center p-8">
            <div className="w-16 h-16 mx-auto mb-4 bg-slate-200 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-slate-700 mb-2">Map Panel</h3>
            <p className="text-sm text-slate-500 max-w-md">
              Map and drawing tools will appear here for defining Response Zones and station/post locations.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Wrap in Suspense for useSearchParams
export default function HeatmapSettingsPage() {
  return (
    <Suspense fallback={
      <div className="h-screen bg-[#f5f5f5] flex items-center justify-center">
        <div className="text-slate-500">Loading...</div>
      </div>
    }>
      <HeatmapSettingsContent />
    </Suspense>
  );
}
