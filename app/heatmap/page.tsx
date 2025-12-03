"use client";

import React, { Suspense, useState, useCallback, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { HeatmapMode } from "@/lib/coverage-types";
import { CoveragePolicyPanel, ResponseStrategyPanel, ResponseZonesPanel, ALL_TIME_BANDS } from "../components/panels";
import type { ResponseZone } from "../components/panels/ResponseZonesPanel";
import type { TimeBandKey } from "../components/panels/CoveragePolicyPanel";
import CoveragePolicyModal from "../components/CoveragePolicyModal";
import ZoneDrawingModal, { type ZoneDrawingConfig } from "../components/ZoneDrawingModal";
import RegionSettingsModal from "../components/RegionSettingsModal";

// Dynamic import with SSR disabled for Leaflet
const ParishHeatmapMap = dynamic(
  () => import("../components/ParishHeatmapMap"),
  { ssr: false, loading: () => <MapLoadingPlaceholder /> }
);

function MapLoadingPlaceholder() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-slate-100">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin w-10 h-10 border-4 border-[#004437] border-t-transparent rounded-full" />
        <span className="text-slate-500 text-sm">Loading map...</span>
      </div>
    </div>
  );
}

// Sleek panel button component
function PanelButton({
  mode,
  activeMode,
  onClick,
  children
}: {
  mode: HeatmapMode;
  activeMode: HeatmapMode | null;
  onClick: (mode: HeatmapMode) => void;
  children: React.ReactNode;
}) {
  const isActive = mode === activeMode;
  return (
    <button
      onClick={() => onClick(mode)}
      className={`px-3 py-1.5 text-xs font-medium rounded transition-all border ${
        isActive
          ? "bg-[#004437] text-white border-[#004437]"
          : "bg-white text-slate-600 border-slate-300 hover:border-[#004437] hover:text-[#004437]"
      }`}
    >
      {children}
    </button>
  );
}

// Sleek toggle button with mini switch
function ToggleButton({
  label,
  isOn,
  onToggle,
}: {
  label: string;
  isOn: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-all border ${
        isOn
          ? "bg-[#004437] text-white border-[#004437]"
          : "bg-white text-slate-600 border-slate-300 hover:border-[#004437] hover:text-[#004437]"
      }`}
    >
      <span>{label}</span>
      <div className={`w-6 h-3 rounded-full transition-colors relative ${isOn ? 'bg-emerald-300' : 'bg-slate-300'}`}>
        <div className={`absolute top-0.5 w-2 h-2 bg-white rounded-full shadow transition-transform ${isOn ? 'translate-x-3' : 'translate-x-0.5'}`} />
      </div>
    </button>
  );
}

// Region dropdown component
function RegionDropdown({
  regionId,
  regionName,
  onViewSettings,
  onCoveragePolicy,
}: {
  regionId: string;
  regionName: string;
  onViewSettings: () => void;
  onCoveragePolicy: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative z-[1000]">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#004437] hover:bg-[#003329] text-white rounded transition-colors"
      >
        <span>{regionId}</span>
        <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-[999]" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-1 w-48 bg-white rounded shadow-lg border border-slate-200 py-1 z-[1001]">
            <div className="px-3 py-1.5 border-b border-slate-100">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">Region</p>
              <p className="text-sm font-medium text-slate-900">{regionName}</p>
            </div>
            <button
              onClick={() => { onViewSettings(); setIsOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
            >
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>Region Settings</span>
            </button>
            <button
              onClick={() => { onCoveragePolicy(); setIsOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
            >
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              <span>Coverage Policy</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function HeatmapContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const regionId = searchParams.get("region") || "CENLA";

  // Demand Density toggle state (default OFF)
  const [demandDensityOn, setDemandDensityOn] = useState(false);

  // Active panel mode (for side panel)
  const [activeMode, setActiveMode] = useState<HeatmapMode | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [selectedParishId, setSelectedParishId] = useState<number | null>(null);
  const [selectedParishName, setSelectedParishName] = useState<string>("");
  const [callCount, setCallCount] = useState(0);

  // Coverage simulation state
  const [simLevel, setSimLevel] = useState<number | null>(null);
  const [hypotheticalMode, setHypotheticalMode] = useState(false);
  const [hypotheticalUnits, setHypotheticalUnits] = useState<import('../components/panels/CoveragePolicyPanel').HypotheticalUnit[]>([]);
  const [visibleTimeBands, setVisibleTimeBands] = useState<Set<TimeBandKey>>(new Set(ALL_TIME_BANDS));

  // Coverage Policy modal state
  const [showPolicyModal, setShowPolicyModal] = useState(false);

  // Region Settings modal state
  const [showRegionSettings, setShowRegionSettings] = useState(false);

  // Map display controls (lifted from map component)
  const [mapTheme, setMapTheme] = useState<'light' | 'dark'>('light');
  const [mapBaseMode, setMapBaseMode] = useState<'streets' | 'satellite'>('streets');

  // Zone drawing state
  const [selectedZone, setSelectedZone] = useState<ResponseZone | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [showZoneDrawingModal, setShowZoneDrawingModal] = useState(false);
  const [isDrawingZone, setIsDrawingZone] = useState(false);
  const [drawingConfig, setDrawingConfig] = useState<ZoneDrawingConfig | null>(null);
  const [polygonCoords, setPolygonCoords] = useState<[number, number][]>([]);
  const [showZonesOnMap, setShowZonesOnMap] = useState(false);
  const [hoveredZone, setHoveredZone] = useState<ResponseZone | null>(null);
  const [parishBoundary, setParishBoundary] = useState<GeoJSON.Polygon | null>(null);
  const [zonesData, setZonesData] = useState<ResponseZone[]>([]);

  // Map region codes to display names
  const regionDisplayNames: Record<string, string> = {
    CENLA: "Central Louisiana",
    SWLA: "Southwest Louisiana",
    NOLA: "New Orleans",
    NELA: "Northeast Louisiana",
    SELA: "Southeast Louisiana",
  };

  const regionName = regionDisplayNames[regionId.toUpperCase()] || regionId;

  const handleParishSelect = useCallback((info: { id: string | number; name: string; fips?: string | null; contracted?: boolean }) => {
    if (typeof info.id === "number") {
      setSelectedParishId(info.id);
      setSelectedParishName(info.name);
    } else if (info.id === "region") {
      setSelectedParishId(null);
      setSelectedParishName("");
      setParishBoundary(null);
    }
  }, []);

  // Handle parish boundary selection from map
  const handleParishBoundaryLoad = useCallback((boundary: GeoJSON.Polygon | GeoJSON.MultiPolygon | null) => {
    // Convert MultiPolygon to Polygon if needed (take first polygon)
    if (boundary?.type === 'MultiPolygon') {
      const firstPolygon: GeoJSON.Polygon = {
        type: 'Polygon',
        coordinates: boundary.coordinates[0],
      };
      setParishBoundary(firstPolygon);
    } else {
      setParishBoundary(boundary as GeoJSON.Polygon | null);
    }
  }, []);

  // Handle panel button click - opens side panel with that mode
  const handlePanelButtonClick = useCallback((mode: HeatmapMode) => {
    if (activeMode === mode && showPanel) {
      // If same mode is clicked and panel is open, close it
      setShowPanel(false);
      setActiveMode(null);
    } else {
      setActiveMode(mode);
      setShowPanel(true);
    }
  }, [activeMode, showPanel]);

  const handleClosePanel = useCallback(() => {
    setShowPanel(false);
    setActiveMode(null);
  }, []);

  const handleSimulate = useCallback((level: number) => {
    setSimLevel(level);
  }, []);

  const handleHypotheticalMode = useCallback((enabled: boolean, units: import('../components/panels/CoveragePolicyPanel').HypotheticalUnit[]) => {
    setHypotheticalMode(enabled);
    if (!enabled) {
      setHypotheticalUnits([]);
    }
  }, []);

  const handleAddHypotheticalUnit = useCallback((unit: import('../components/panels/CoveragePolicyPanel').HypotheticalUnit) => {
    setHypotheticalUnits(prev => [...prev, unit]);
  }, []);

  const handleClearHypotheticalUnits = useCallback(() => {
    setHypotheticalUnits([]);
  }, []);

  const handleRemoveHypotheticalUnit = useCallback((unitId: string) => {
    setHypotheticalUnits(prev => prev.filter(u => u.id !== unitId));
  }, []);

  const handleTimeBandToggle = useCallback((band: TimeBandKey, visible: boolean) => {
    setVisibleTimeBands(prev => {
      const next = new Set(prev);
      if (visible) {
        next.add(band);
      } else {
        next.delete(band);
      }
      return next;
    });
  }, []);

  // Zone handlers
  const handleZoneSelect = useCallback((zone: ResponseZone) => {
    setSelectedZone(zone);
    setSelectedZoneId(zone.id);
  }, []);

  const handleDrawZone = useCallback((zone: ResponseZone) => {
    setSelectedZone(zone);
    setShowZoneDrawingModal(true);
  }, []);

  // Track refresh trigger for zones panel
  const [zonesRefreshTrigger, setZonesRefreshTrigger] = useState(0);

  const refreshZones = useCallback(() => {
    setZonesRefreshTrigger(prev => prev + 1);
  }, []);

  const handleStartDrawing = useCallback((config: ZoneDrawingConfig) => {
    setDrawingConfig(config);
    setIsDrawingZone(true);
    setPolygonCoords([]);
    // Keep modal open to show drawing status
  }, []);

  const handleSaveZoneBoundary = useCallback(async (zoneId: number, boundary: GeoJSON.Polygon) => {
    // Save boundary to database
    const res = await fetch(`/api/response-zones/${zoneId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boundary }),
    });
    if (!res.ok) {
      throw new Error('Failed to save zone boundary');
    }
    // Reset drawing state
    setIsDrawingZone(false);
    setDrawingConfig(null);
    setPolygonCoords([]);
    setShowZoneDrawingModal(false);
    // Refresh zones list to show updated state
    refreshZones();
  }, [refreshZones]);

  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (isDrawingZone && drawingConfig?.mode === 'polygon') {
      setPolygonCoords(prev => [...prev, [lat, lng]]);
    } else if (isDrawingZone && drawingConfig?.mode === 'circle') {
      // Set center point for circle
      setDrawingConfig(prev => prev ? { ...prev, centerLat: lat, centerLng: lng } : null);
    }
  }, [isDrawingZone, drawingConfig]);

  return (
    <div className="h-screen bg-slate-100 flex flex-col overflow-hidden">
      {/* Top Header Bar */}
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-2.5 flex items-center justify-between shadow-sm z-[900]">
        {/* Left: Back + Title */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/AcadianDashboard")}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-[#004437] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back</span>
          </button>
          <div className="h-5 w-px bg-slate-200" />
          <h1 className="text-sm font-semibold text-slate-800">
            {selectedParishName || regionName}
          </h1>
        </div>

        {/* Center: All Controls - evenly spaced */}
        <div className="flex items-center gap-6">
          {/* Map Display Controls Group */}
          <div className="flex items-center gap-3 px-4 py-1.5 bg-slate-50 rounded-lg">
            <div className="flex">
              <button
                onClick={() => setMapTheme('light')}
                className={`px-3 py-1.5 text-xs font-medium rounded-l border transition-all ${
                  mapTheme === 'light'
                    ? 'bg-[#004437] text-white border-[#004437]'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-[#004437]'
                }`}
              >
                Light
              </button>
              <button
                onClick={() => setMapTheme('dark')}
                className={`px-3 py-1.5 text-xs font-medium rounded-r border-t border-b border-r transition-all ${
                  mapTheme === 'dark'
                    ? 'bg-[#004437] text-white border-[#004437]'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-[#004437]'
                }`}
              >
                Dark
              </button>
            </div>
            <div className="flex">
              <button
                onClick={() => setMapBaseMode('streets')}
                className={`px-3 py-1.5 text-xs font-medium rounded-l border transition-all ${
                  mapBaseMode === 'streets'
                    ? 'bg-[#004437] text-white border-[#004437]'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-[#004437]'
                }`}
              >
                Streets
              </button>
              <button
                onClick={() => setMapBaseMode('satellite')}
                className={`px-3 py-1.5 text-xs font-medium rounded-r border-t border-b border-r transition-all ${
                  mapBaseMode === 'satellite'
                    ? 'bg-[#004437] text-white border-[#004437]'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-[#004437]'
                }`}
              >
                Satellite
              </button>
            </div>
          </div>

          {/* Analysis Tools Group */}
          <div className="flex items-center gap-3 px-4 py-1.5 bg-slate-50 rounded-lg">
            <ToggleButton
              label="Demand Density"
              isOn={demandDensityOn}
              onToggle={() => setDemandDensityOn(!demandDensityOn)}
            />
            <div className="h-5 w-px bg-slate-200" />
            <PanelButton mode="compliance" activeMode={activeMode} onClick={handlePanelButtonClick}>
              Compliance Analyzer
            </PanelButton>
            <PanelButton mode="coverage" activeMode={activeMode} onClick={handlePanelButtonClick}>
              Coverage Policy Engine
            </PanelButton>
            <PanelButton mode="strategy" activeMode={activeMode} onClick={handlePanelButtonClick}>
              Strategic Response
            </PanelButton>
          </div>
        </div>

        {/* Right: Region Dropdown */}
        <RegionDropdown
          regionId={regionId}
          regionName={regionName}
          onViewSettings={() => setShowRegionSettings(true)}
          onCoveragePolicy={() => setShowPolicyModal(true)}
        />
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Map Container */}
        <main className={`flex-1 overflow-hidden transition-all duration-300 ${showPanel ? 'mr-[380px]' : ''}`}>
          <ParishHeatmapMap
            regionId={regionId}
            onParishSelect={handleParishSelect}
            activeMode={activeMode}
            simLevel={simLevel}
            hypotheticalMode={hypotheticalMode}
            hypotheticalUnits={hypotheticalUnits}
            onAddHypotheticalUnit={handleAddHypotheticalUnit}
            responseZones={zonesData}
            visibleTimeBands={visibleTimeBands}
            showDemandDensity={demandDensityOn}
            mapTheme={mapTheme}
            mapBaseMode={mapBaseMode}
            zones={zonesData.map(z => ({
              id: z.id,
              zoneName: z.zoneName,
              thresholdMinutes: z.thresholdMinutes,
              boundary: z.boundary,
              hasPolygon: z.hasPolygon,
            }))}
            showZones={showZonesOnMap && activeMode === 'compliance'}
            selectedZoneId={selectedZoneId}
            hoveredZoneId={hoveredZone?.id ?? null}
            isDrawingZone={isDrawingZone}
            drawingMode={drawingConfig?.mode === 'polygon' ? 'polygon' : drawingConfig?.mode === 'circle' ? 'circle' : null}
            onZoneDrawClick={handleMapClick}
            onParishBoundaryLoad={handleParishBoundaryLoad}
          />
        </main>

        {/* Slide-out Panel */}
        <div
          className={`absolute top-0 right-0 h-full w-[380px] bg-slate-900 shadow-2xl transform transition-transform duration-300 ease-in-out ${
            showPanel ? 'translate-x-0' : 'translate-x-full'
          }`}
          style={{ zIndex: 500 }}
        >
          {activeMode === "compliance" && (
            <ResponseZonesPanel
              parishId={selectedParishId}
              parishName={selectedParishName}
              regionId={regionId}
              onClose={handleClosePanel}
              onZoneSelect={handleZoneSelect}
              onDrawZone={handleDrawZone}
              onZoneHover={setHoveredZone}
              selectedZoneId={selectedZoneId}
              showOnMap={showZonesOnMap}
              onToggleShowOnMap={() => setShowZonesOnMap(!showZonesOnMap)}
              onZonesLoaded={setZonesData}
              refreshTrigger={zonesRefreshTrigger}
            />
          )}
          {activeMode === "coverage" && (
            <CoveragePolicyPanel
              parishId={selectedParishId}
              parishName={selectedParishName}
              regionId={regionId}
              onClose={handleClosePanel}
              onSimulate={handleSimulate}
              onHypotheticalMode={handleHypotheticalMode}
              hypotheticalUnits={hypotheticalUnits}
              onClearUnits={handleClearHypotheticalUnits}
              onRemoveUnit={handleRemoveHypotheticalUnit}
              responseZones={zonesData.map(z => ({
                id: z.id,
                zoneName: z.zoneName,
                thresholdMinutes: z.thresholdMinutes,
                boundary: z.boundary,
              }))}
              visibleTimeBands={visibleTimeBands}
              onTimeBandToggle={handleTimeBandToggle}
            />
          )}
          {activeMode === "strategy" && (
            <ResponseStrategyPanel
              parishId={selectedParishId}
              parishName={selectedParishName}
              regionId={regionId}
              onClose={handleClosePanel}
            />
          )}
        </div>
      </div>

      {/* Coverage Policy Modal */}
      <CoveragePolicyModal
        isOpen={showPolicyModal}
        onClose={() => setShowPolicyModal(false)}
        canViewAllRegions={true}
      />

      {/* Region Settings Modal */}
      <RegionSettingsModal
        isOpen={showRegionSettings}
        onClose={() => setShowRegionSettings(false)}
        regionId={regionId}
        regionName={regionName}
        onOpenCoveragePolicy={() => setShowPolicyModal(true)}
      />

      {/* Zone Drawing Modal */}
      <ZoneDrawingModal
        isOpen={showZoneDrawingModal}
        onClose={() => {
          setShowZoneDrawingModal(false);
          setIsDrawingZone(false);
          setDrawingConfig(null);
          setPolygonCoords([]);
        }}
        zone={selectedZone}
        parishName={selectedParishName}
        parishBoundary={parishBoundary}
        onStartDrawing={handleStartDrawing}
        onSaveBoundary={handleSaveZoneBoundary}
        isDrawing={isDrawingZone}
        currentPolygonCoords={polygonCoords}
      />
    </div>
  );
}

export default function HeatmapPage() {
  return (
    <Suspense fallback={<MapLoadingPlaceholder />}>
      <HeatmapContent />
    </Suspense>
  );
}

