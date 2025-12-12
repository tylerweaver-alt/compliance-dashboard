"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import type { Map as LeafletMap, PathOptions } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import type { HeatmapMode, TimeBand } from "@/lib/coverage-types";
import { TIME_BAND_COLORS } from "@/lib/coverage-types";
import type { HypotheticalUnit, ResponseZoneInfo, TimeBandKey } from "./panels/CoveragePolicyPanel";
import { ALL_TIME_BANDS } from "./panels/CoveragePolicyPanel";

// Types
type ParishInfo = { id: string | number; name: string; fips?: string | null; contracted?: boolean };

export type ResponseZoneData = {
  id: number;
  zoneName: string;
  thresholdMinutes: number | null;
  boundary: GeoJSON.Polygon | null;
  hasPolygon: boolean;
};

type Props = {
  regionId: string;
  onParishSelect?: (info: ParishInfo) => void;
  activeMode?: HeatmapMode | null;
  simLevel?: number | null;
  hypotheticalMode?: boolean;
  hypotheticalUnits?: HypotheticalUnit[];
  onAddHypotheticalUnit?: (unit: HypotheticalUnit) => void;
  responseZones?: ResponseZoneInfo[];
  visibleTimeBands?: Set<TimeBandKey>;
  showDemandDensity?: boolean;
  // Map display props (controlled from parent)
  mapTheme?: 'light' | 'dark';
  mapBaseMode?: 'streets' | 'satellite';
  onRegionReset?: () => void;
  // Zone drawing props
  zones?: ResponseZoneData[];
  showZones?: boolean;
  selectedZoneId?: number | null;
  hoveredZoneId?: number | null;
  isDrawingZone?: boolean;
  drawingMode?: 'polygon' | 'circle' | null;
  onZoneDrawClick?: (lat: number, lng: number) => void;
  onParishBoundaryLoad?: (boundary: GeoJSON.Polygon | GeoJSON.MultiPolygon | null) => void;
};
type FeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, any>;
type Hotspot = { lat: number; lng: number; intensity: number };
type OptimalPost = { lat: number; lng: number; score: number; size?: number; coverage?: number; ooc?: boolean; parish?: string };
type ForecastInterval = "12h" | "24h" | "1w" | "1m" | "6m" | "12m";

// Style function for coverage veins by time band
function styleByTimeBand(feature: any): L.PathOptions {
  const band = feature.properties?.time_band as TimeBand | undefined;
  const color = band ? TIME_BAND_COLORS[band] : '#6b7280';

  if (band === '0-8')   return { color, weight: 5, opacity: 0.95 };
  if (band === '8-12')  return { color, weight: 4, opacity: 0.9 };
  if (band === '12-20') return { color, weight: 3, opacity: 0.85 };
  if (band === '20-25') return { color, weight: 2.5, opacity: 0.8 };
  if (band === '25-30') return { color, weight: 2, opacity: 0.75 };

  return { color, weight: 1.5, opacity: 0.5 };
}

const TILE_SOURCES = {
  streetsLight: { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: "&copy; OpenStreetMap" },
  streetsDark: { url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", attribution: "&copy; CARTO" },
  satellite: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attribution: "Tiles Esri" },
};

// Legacy button styles - kept for potential future use
// const btnBase: React.CSSProperties = { padding: "6px 14px", borderRadius: 999, borderWidth: 1, borderStyle: "solid", borderColor: "#ccc", cursor: "pointer", fontWeight: 500, transition: "all 0.15s", fontSize: 13 };

export default function ParishHeatmapMap({
  regionId,
  onParishSelect,
  activeMode = null,
  simLevel = null,
  hypotheticalMode = false,
  hypotheticalUnits = [],
  onAddHypotheticalUnit,
  responseZones = [],
  visibleTimeBands,
  showDemandDensity = false,
  mapTheme = 'light',
  mapBaseMode = 'streets',
  onRegionReset,
  zones = [],
  showZones = false,
  selectedZoneId = null,
  hoveredZoneId = null,
  isDrawingZone = false,
  drawingMode = null,
  onZoneDrawClick,
  onParishBoundaryLoad,
}: Props) {
  // Use props for theme/baseMode, with fallback to internal state for backwards compatibility
  const [internalBaseMode, setInternalBaseMode] = useState<"streets" | "satellite">("streets");
  const [internalTheme, setInternalTheme] = useState<"light" | "dark">("light");
  const baseMode = mapBaseMode || internalBaseMode;
  const theme = mapTheme || internalTheme;
  const [isMounted, setIsMounted] = useState(false);
  const mapRef = useRef<LeafletMap | null>(null);

  // Heatmap state
  const [callHeatPoints, setCallHeatPoints] = useState<[number, number, number][]>([]);

  // Forecast state
  const [forecastMode, setForecastMode] = useState(false);
  const [forecastInterval, setForecastInterval] = useState<ForecastInterval>("24h");
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [forecastSummary, setForecastSummary] = useState<{ expected_calls: number; risk_score: number } | null>(null);

  // Coverage veins state
  const [coverageGeoJson, setCoverageGeoJson] = useState<GeoJSON.FeatureCollection | null>(null);

  // Hypothetical units isochrone data (map unitId -> GeoJSON)
  const [hypotheticalIsochrones, setHypotheticalIsochrones] = useState<Record<string, GeoJSON.FeatureCollection>>({});

  // Selected parish for filtering
  const [selectedParishId, setSelectedParishId] = useState<number | null>(null);

  // Store initial region bounds for "Region" button reset
  const regionBoundsRef = useRef<L.LatLngBounds | null>(null);

  useEffect(() => {
    setIsMounted(true);
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
      iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
      shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    });
  }, []);

  // Fetch call density heatmap data
  useEffect(() => {
    if (!showDemandDensity) return;
    const url = selectedParishId
      ? `/api/heatmap/calls?region=${regionId}&parishId=${selectedParishId}`
      : `/api/heatmap/calls?region=${regionId}`;
    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (data.points) {
          setCallHeatPoints(data.points.map((p: any) => [p.lat, p.lng, p.weight || 1]));
        }
      })
      .catch(err => console.error("Error fetching call heatmap:", err));
  }, [showDemandDensity, regionId, selectedParishId]);

  // Fetch forecast data
  useEffect(() => {
    if (!forecastMode) return;
    fetch(`/api/forecast/region/${regionId}?interval=${forecastInterval}`)
      .then(r => r.json())
      .then(data => {
        if (data.hotspots) setHotspots(data.hotspots);
        if (data.summary) setForecastSummary(data.summary);
      })
      .catch(err => console.error("Error fetching forecast:", err));
  }, [forecastMode, regionId, forecastInterval]);

  // Helper: Find which zone a point is in
  const findZoneForPoint = useCallback((lat: number, lng: number): { zoneId: number | null; zoneName: string | null; thresholdMinutes: number | null } => {
    if (!responseZones || responseZones.length === 0) {
      return { zoneId: null, zoneName: null, thresholdMinutes: null };
    }

    const point = [lng, lat]; // GeoJSON uses [lng, lat]

    for (const zone of responseZones) {
      if (!zone.boundary) continue;

      // Check if point is inside polygon using ray-casting algorithm
      const coords = zone.boundary.coordinates[0];
      let inside = false;
      for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
        const xi = coords[i][0], yi = coords[i][1];
        const xj = coords[j][0], yj = coords[j][1];

        if (((yi > point[1]) !== (yj > point[1])) &&
            (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi)) {
          inside = !inside;
        }
      }

      if (inside) {
        return { zoneId: zone.id, zoneName: zone.zoneName, thresholdMinutes: zone.thresholdMinutes };
      }
    }

    return { zoneId: null, zoneName: null, thresholdMinutes: null };
  }, [responseZones]);

  // Handle hypothetical unit click - add to list with zone info and fetch isochrone
  const handleHypotheticalClick = useCallback(async (lat: number, lng: number) => {
    if (!onAddHypotheticalUnit) return;

    // Find zone info
    const zoneInfo = findZoneForPoint(lat, lng);

    // Generate unique ID
    const unitId = `hyp-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

    // Create unit
    const newUnit: HypotheticalUnit = {
      id: unitId,
      lat,
      lng,
      zoneId: zoneInfo.zoneId,
      zoneName: zoneInfo.zoneName,
      thresholdMinutes: zoneInfo.thresholdMinutes,
    };

    // Add unit to list
    onAddHypotheticalUnit(newUnit);

    // Fetch isochrone for this unit
    try {
      const url = `/api/coverage-from-point?lat=${lat}&lng=${lng}&maxMinutes=30`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.type === 'FeatureCollection') {
        setHypotheticalIsochrones(prev => ({
          ...prev,
          [unitId]: data as GeoJSON.FeatureCollection
        }));
      }
    } catch (err) {
      console.error('Error fetching isochrone for hypothetical unit:', err);
    }
  }, [onAddHypotheticalUnit, findZoneForPoint]);

  // Fetch coverage data when in coverage mode (for non-hypothetical mode)
  useEffect(() => {
    if (activeMode !== 'coverage') {
      setCoverageGeoJson(null);
      return;
    }

    // If hypothetical mode is on, we handle it separately with multiple units
    if (hypotheticalMode) {
      setCoverageGeoJson(null);
      return;
    }

    // Determine which API to call for normal coverage simulation
    const fetchCoverage = async () => {
      try {
        let url: string;
        if (simLevel !== null) {
          url = `/api/coverage-level?level=${simLevel}&maxMinutes=30`;
          if (selectedParishId) {
            url += `&parishId=${selectedParishId}`;
          }
        } else {
          // Default to level 3
          url = `/api/coverage-level?level=3&maxMinutes=30`;
        }

        const response = await fetch(url);
        const data = await response.json();
        if (data.type === 'FeatureCollection') {
          setCoverageGeoJson(data as GeoJSON.FeatureCollection);
        }
      } catch (err) {
        console.error('Error fetching coverage:', err);
      }
    };

    fetchCoverage();
  }, [activeMode, simLevel, selectedParishId, hypotheticalMode]);

  // Clear hypothetical isochrones when units are cleared
  useEffect(() => {
    if (hypotheticalUnits.length === 0) {
      setHypotheticalIsochrones({});
    } else {
      // Remove isochrones for units that no longer exist
      setHypotheticalIsochrones(prev => {
        const validIds = new Set(hypotheticalUnits.map(u => u.id));
        const filtered: Record<string, GeoJSON.FeatureCollection> = {};
        for (const [id, iso] of Object.entries(prev)) {
          if (validIds.has(id)) {
            filtered[id] = iso;
          }
        }
        return filtered;
      });
    }
  }, [hypotheticalUnits]);

  const tileKey: keyof typeof TILE_SOURCES = baseMode === "satellite" ? "satellite" : theme === "dark" ? "streetsDark" : "streetsLight";
  const tile = TILE_SOURCES[tileKey];

  // Expose region reset functionality - called from parent via onRegionReset
  useEffect(() => {
    if (onRegionReset) {
      // Parent will call this when region reset is triggered
    }
  }, [onRegionReset]);

  const doRegionReset = useCallback(() => {
    if (mapRef.current) {
      // Zoom to the same view as initial load (contracted parishes)
      if (regionBoundsRef.current && regionBoundsRef.current.isValid()) {
        mapRef.current.fitBounds(regionBoundsRef.current, { padding: [10, 10] });
        // Zoom in slightly more after fitting (same as initial load)
        setTimeout(() => {
          const currentZoom = mapRef.current?.getZoom();
          if (currentZoom) mapRef.current?.setZoom(currentZoom + 0.5);
        }, 100);
      }
      setSelectedParishId(null);
      onParishSelect?.({ id: "region", name: regionId + " Region", fips: null, contracted: false });
    }
  }, [regionId, onParishSelect]);

  const handleParishClick = useCallback((info: ParishInfo) => {
    if (typeof info.id === "number") {
      setSelectedParishId(info.id);
    }
    onParishSelect?.(info);
  }, [onParishSelect]);

  if (!isMounted) {
    return <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#e5e5e5" }}><span>Loading map...</span></div>;
  }

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      <MapContainer center={[31.2, -92.4] as [number, number]} zoom={7} style={{ width: "100%", flex: 1, minHeight: 0, borderRadius: 8, overflow: "hidden" }} preferCanvas>
        <TileLayer key={tileKey} url={tile.url} attribution={tile.attribution} />
        <ParishBoundaryLayer
          regionId={regionId}
          onParishSelect={handleParishClick}
          regionBoundsRef={regionBoundsRef}
          onParishBoundarySelect={onParishBoundaryLoad}
        />
        {showDemandDensity && <HeatmapLayer points={callHeatPoints} />}
        {forecastMode && <HotspotsLayer hotspots={hotspots} />}
        {/* Coverage veins layer - only show in normal mode */}
        {activeMode === "coverage" && !hypotheticalMode && coverageGeoJson && (
          <CoverageVeinsLayer geojson={coverageGeoJson} visibleTimeBands={visibleTimeBands} />
        )}
        {/* Hypothetical units isochrones - show each unit's coverage */}
        {activeMode === "coverage" && hypotheticalMode && Object.entries(hypotheticalIsochrones).map(([unitId, geojson]) => (
          <CoverageVeinsLayer key={unitId} geojson={geojson} visibleTimeBands={visibleTimeBands} />
        ))}
        {/* Hypothetical click handler */}
        {activeMode === "coverage" && hypotheticalMode && (
          <HypotheticalClickHandler
            onPointClick={handleHypotheticalClick}
          />
        )}
        {/* Hypothetical unit markers */}
        {activeMode === "coverage" && hypotheticalMode && hypotheticalUnits.map((unit, idx) => (
          <HypotheticalMarkerLayer key={unit.id} point={{ lat: unit.lat, lng: unit.lng }} label={`${idx + 1}`} />
        ))}
        {/* Response zones layer */}
        {showZones && zones.length > 0 && (
          <ResponseZonesLayer
            zones={zones}
            selectedZoneId={selectedZoneId}
            hoveredZoneId={hoveredZoneId}
          />
        )}
        {/* Zone drawing click handler */}
        {isDrawingZone && drawingMode === 'polygon' && onZoneDrawClick && (
          <ZoneDrawingClickHandler onDrawClick={onZoneDrawClick} />
        )}
        <MapRefSetter mapRef={mapRef} />
      </MapContainer>
    </div>
  );
}

function MapRefSetter({ mapRef }: { mapRef: React.RefObject<LeafletMap | null> }) {
  const map = useMap();
  useEffect(() => { (mapRef as any).current = map; }, [map, mapRef]);
  return null;
}

function ParishBoundaryLayer({
  regionId,
  onParishSelect,
  regionBoundsRef,
  onParishBoundarySelect,
}: {
  regionId: string;
  onParishSelect?: (info: ParishInfo) => void;
  regionBoundsRef?: React.RefObject<L.LatLngBounds | null>;
  onParishBoundarySelect?: (boundary: GeoJSON.Polygon | GeoJSON.MultiPolygon | null) => void;
}) {
  const map = useMap();
  const [data, setData] = useState<FeatureCollection | null>(null);
  const [selectedLayer, setSelectedLayer] = useState<L.Path | null>(null);

  useEffect(() => {
    // Create a pane for parish boundaries that sits above call dots
    if (!map.getPane("parishPane")) {
      const pane = map.createPane("parishPane");
      pane.style.zIndex = "400"; // Above callDotsPane (350)
    }

    fetch("/api/parish-boundaries?region=" + regionId + "&withFlags=true")
      .then((r) => r.json())
      .then((geojson: FeatureCollection) => {
        if (!geojson?.features) return;
        setData(geojson);

        // Only fit bounds to CONTRACTED parishes (the region we care about)
        const contractedFeatures = geojson.features.filter(f => f.properties?.contracted === true);
        if (contractedFeatures.length > 0) {
          const contractedGeoJSON = { type: "FeatureCollection", features: contractedFeatures } as FeatureCollection;
          const tmp = L.geoJSON(contractedGeoJSON as any);
          const bounds = tmp.getBounds();
          if (bounds.isValid()) {
            // Store bounds for "Region" button reset
            if (regionBoundsRef) {
              regionBoundsRef.current = bounds;
            }
            // Fit to bounds first, then zoom in a bit more
            map.fitBounds(bounds, { padding: [10, 10] });
            // Zoom in slightly more after fitting
            setTimeout(() => {
              const currentZoom = map.getZoom();
              map.setZoom(currentZoom + 0.5);
            }, 100);
          }
        }
      })
      .catch((err) => console.error("Error loading parish boundaries:", err));
  }, [regionId, map]);

  if (!data) return null;

  // Styles - using low fill opacity so dots show through, but parish is still clickable
  // pane: "parishPane" ensures these render above call dots
  const baseStyle: PathOptions = { color: "#666", weight: 1, fillColor: "#444", fillOpacity: 0.02, pane: "parishPane" };
  const contractedStyle: PathOptions = { color: "#10b981", weight: 3, fillColor: "#00ff99", fillOpacity: 0.05, pane: "parishPane" };
  const hoverStyle: PathOptions = { color: "#fbbf24", weight: 4, fillColor: "#fef08a", fillOpacity: 0.15, pane: "parishPane" };
  const selectedStyle: PathOptions = { color: "#06b6d4", weight: 4, fillColor: "#22d3ee", fillOpacity: 0.1, pane: "parishPane" };

  return (
    <GeoJSON
      key={regionId}
      data={data as any}
      style={(f: any) => (f?.properties?.contracted ? contractedStyle : baseStyle)}
      pane="parishPane"
      onEachFeature={(feature: any, layer: L.Layer) => {
        const l = layer as L.Path;
        const p = feature.properties || {};
        const parishName = p.ParishName || "Unknown";
        const parishFips = p.ParishFIPS || null;
        const parishId = p.parishId ?? parishName;
        const isContracted = p.contracted === true;
        if (!isContracted) return;
        l.on("mouseover", () => { if (selectedLayer !== l) l.setStyle(hoverStyle); });
        l.on("mouseout", () => { l.setStyle(selectedLayer === l ? selectedStyle : contractedStyle); });
        l.on("click", () => {
          if (selectedLayer && selectedLayer !== l) (selectedLayer as any).setStyle(contractedStyle);
          setSelectedLayer(l);
          l.setStyle(selectedStyle);
          const bounds = (l as any).getBounds?.();
          if (bounds) {
            // Get the center of the parish (the "hottest" spot conceptually)
            const center = bounds.getCenter();
            // Calculate a zoom level that shows most but not all of the parish
            // Fit bounds first to calculate appropriate zoom, then adjust
            map.fitBounds(bounds, { padding: [30, 30], maxZoom: 11 });
            // After fitting, pan to center and zoom out slightly so edges are cut off
            setTimeout(() => {
              const currentZoom = map.getZoom();
              // Zoom in a bit more so edges are slightly off screen
              map.setView(center, currentZoom + 0.3, { animate: true });
            }, 150);
          }
          onParishSelect?.({ id: parishId, name: parishName, fips: parishFips, contracted: true });
          // Pass the parish boundary geometry to parent
          onParishBoundarySelect?.(feature.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon);
        });
      }}
    />
  );
}

// Call density layer - shows individual dots for each call location
function HeatmapLayer({ points }: { points: [number, number, number][] }) {
  const map = useMap();
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!map || points.length === 0) return;

    // Create a custom pane for dots that sits BELOW overlays but above tiles
    if (!map.getPane("callDotsPane")) {
      const pane = map.createPane("callDotsPane");
      pane.style.zIndex = "350"; // Below overlayPane (400) so parishes are clickable
      pane.style.pointerEvents = "none"; // Don't block clicks on parishes
    }

    // Remove existing layer group
    if (layerGroupRef.current) {
      map.removeLayer(layerGroupRef.current);
    }

    // Create new layer group
    layerGroupRef.current = L.layerGroup();

    // Add a circle marker for each call location
    // Use a warm red/orange color to indicate call activity
    points.forEach(([lat, lng]) => {
      const circle = L.circleMarker([lat, lng], {
        radius: 5,
        fillColor: "#e63946",    // Warm red
        fillOpacity: 0.6,
        color: "#fff",
        weight: 1,
        opacity: 0.9,
        pane: "callDotsPane",
      });

      layerGroupRef.current?.addLayer(circle);
    });

    layerGroupRef.current.addTo(map);

    return () => {
      if (layerGroupRef.current) {
        map.removeLayer(layerGroupRef.current);
      }
    };
  }, [map, points]);

  return null;
}

// Hotspots layer for forecast visualization
function HotspotsLayer({ hotspots }: { hotspots: Hotspot[] }) {
  const map = useMap();
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!map) return;

    // Remove existing layer group
    if (layerGroupRef.current) {
      map.removeLayer(layerGroupRef.current);
    }

    // Create new layer group
    layerGroupRef.current = L.layerGroup();

    hotspots.forEach((hotspot, idx) => {
      const radius = 5000 + hotspot.intensity * 15000; // 5-20km radius based on intensity
      const color = hotspot.intensity > 0.7 ? "#ef4444" : hotspot.intensity > 0.4 ? "#f59e0b" : "#22c55e";

      const circle = L.circle([hotspot.lat, hotspot.lng], {
        radius,
        color,
        fillColor: color,
        fillOpacity: 0.2,
        weight: 2,
        dashArray: "5, 5",
      });

      circle.bindPopup(`
        <div style="font-family: system-ui; min-width: 120px;">
          <strong>Hotspot #${idx + 1}</strong><br/>
          <span style="color: ${color}">Intensity: ${(hotspot.intensity * 100).toFixed(1)}%</span>
        </div>
      `);

      layerGroupRef.current?.addLayer(circle);
    });

    layerGroupRef.current.addTo(map);

    return () => {
      if (layerGroupRef.current) {
        map.removeLayer(layerGroupRef.current);
      }
    };
  }, [map, hotspots]);

  return null;
}

// Coverage layer - draws isochrone polygons and post markers colored by travel time bands
function CoverageVeinsLayer({ geojson, visibleTimeBands }: { geojson: GeoJSON.FeatureCollection; visibleTimeBands?: Set<TimeBandKey> }) {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!map || !geojson) return;

    // Create coverage pane if it doesn't exist
    if (!map.getPane("coveragePane")) {
      const pane = map.createPane("coveragePane");
      pane.style.zIndex = "420"; // Above parishes but below other overlays
    }
    if (!map.getPane("coverageMarkersPane")) {
      const pane = map.createPane("coverageMarkersPane");
      pane.style.zIndex = "500";
    }

    // Remove existing layer
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
    }

    layerRef.current = L.layerGroup();

    // Process features - handle points, polygons, and line strings
    geojson.features.forEach(feature => {
      const props = feature.properties || {};
      const geomType = feature.geometry.type;

      // Check if this time band should be visible
      const timeBand = props.time_band as TimeBandKey | undefined;
      if (timeBand && visibleTimeBands && !visibleTimeBands.has(timeBand)) {
        return; // Skip this feature if its time band is not visible
      }

      if (geomType === 'Point' && props.type === 'post_marker') {
        // Create post marker
        const coords = feature.geometry as GeoJSON.Point;
        const marker = L.circleMarker([coords.coordinates[1], coords.coordinates[0]], {
          radius: 10,
          fillColor: '#004437',
          color: '#fff',
          weight: 3,
          fillOpacity: 1,
          pane: 'coverageMarkersPane',
        });
        marker.bindPopup(`
          <div style="font-family: system-ui; min-width: 150px;">
            <strong style="font-size: 14px;">${props.post_name}</strong>
            <hr style="margin: 6px 0; border: none; border-top: 1px solid #e5e7eb;"/>
            <div style="font-size: 12px;">
              <span>Units: <strong>${props.default_units || 0}</strong></span>
            </div>
          </div>
        `);
        marker.addTo(layerRef.current!);
      } else if (geomType === 'LineString') {
        // Create road/vein line - used for hypothetical coverage
        const color = props.color || TIME_BAND_COLORS[props.time_band as TimeBand] || '#6b7280';
        const timeBand = props.time_band || 'unknown';

        // Determine line weight based on time band (closer = thicker)
        let weight = 3;
        if (timeBand === '0-8') weight = 5;
        else if (timeBand === '8-12') weight = 4;
        else if (timeBand === '12-20') weight = 3.5;
        else if (timeBand === '20-25') weight = 3;
        else weight = 2.5;

        const line = L.geoJSON(feature as any, {
          style: {
            color: color,
            weight: weight,
            opacity: 0.85,
            lineCap: 'round',
            lineJoin: 'round',
          },
          pane: 'coveragePane',
        });

        line.bindPopup(`
          <div style="font-family: system-ui; min-width: 140px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <div style="width: 12px; height: 12px; background: ${color}; border-radius: 2px;"></div>
              <span><strong>${timeBand} min</strong> travel time</span>
            </div>
          </div>
        `);
        line.addTo(layerRef.current!);
      } else if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
        // Create isochrone polygon
        const color = props.color || TIME_BAND_COLORS[props.time_band as TimeBand] || '#6b7280';
        const timeBand = props.time_band || 'unknown';

        const polygon = L.geoJSON(feature as any, {
          style: {
            color: color,
            weight: 2,
            opacity: 0.8,
            fillColor: color,
            fillOpacity: 0.15,
          },
          pane: 'coveragePane',
        });

        polygon.bindPopup(`
          <div style="font-family: system-ui; min-width: 160px;">
            <strong style="font-size: 14px;">Coverage Zone</strong>
            <hr style="margin: 6px 0; border: none; border-top: 1px solid #e5e7eb;"/>
            <div style="font-size: 12px;">
              <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                <div style="width: 12px; height: 12px; background: ${color}; border-radius: 2px;"></div>
                <span><strong>${timeBand} min</strong> response time</span>
              </div>
              <span>From: ${props.post_name || 'Post'}</span>
              ${props.approximate ? '<br/><span style="color: #94a3b8; font-size: 11px;">(Approximate coverage)</span>' : ''}
            </div>
          </div>
        `);
        polygon.addTo(layerRef.current!);
      }
    });

    layerRef.current.addTo(map);

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
      }
    };
  }, [map, geojson, visibleTimeBands]);

  return null;
}

// Hypothetical click handler for coverage simulation
function HypotheticalClickHandler({ onPointClick }: { onPointClick: (lat: number, lng: number) => void }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const handleClick = (e: L.LeafletMouseEvent) => {
      onPointClick(e.latlng.lat, e.latlng.lng);
    };

    map.on('click', handleClick);

    return () => {
      map.off('click', handleClick);
    };
  }, [map, onPointClick]);

  return null;
}

// Hypothetical point marker with optional numbered label
function HypotheticalMarkerLayer({ point, label }: { point: { lat: number; lng: number }; label?: string }) {
  const map = useMap();
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!map || !point) return;

    // Remove existing marker
    if (markerRef.current) {
      map.removeLayer(markerRef.current);
    }

    // Create marker with custom icon - show number label if provided
    const icon = L.divIcon({
      className: "hypothetical-marker",
      html: `
        <div style="
          width: 28px;
          height: 28px;
          background: #3b82f6;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 3px 10px rgba(0,0,0,0.4);
          border: 3px solid white;
          color: white;
          font-weight: bold;
          font-size: 14px;
          font-family: system-ui;
        ">
          ${label || '●'}
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    markerRef.current = L.marker([point.lat, point.lng], { icon, zIndexOffset: 1000 });
    markerRef.current.bindPopup(`
      <div style="font-family: system-ui;">
        <strong>Hypothetical Unit ${label || ''}</strong><br/>
        <span style="font-size: 12px; color: #666;">
          ${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}
        </span>
      </div>
    `);
    markerRef.current.addTo(map);

    return () => {
      if (markerRef.current) {
        map.removeLayer(markerRef.current);
      }
    };
  }, [map, point]);

  return null;
}

// Response zones layer - renders zone polygons on the map
function ResponseZonesLayer({
  zones,
  selectedZoneId,
  hoveredZoneId,
}: {
  zones: ResponseZoneData[];
  selectedZoneId: number | null;
  hoveredZoneId: number | null;
}) {
  const map = useMap();
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!map) return;

    // Create or clear layer group
    if (!layerGroupRef.current) {
      layerGroupRef.current = L.layerGroup().addTo(map);
    } else {
      layerGroupRef.current.clearLayers();
    }

    // Add zone polygons
    zones.forEach(zone => {
      if (!zone.boundary) return;

      const isSelected = zone.id === selectedZoneId;
      const isHovered = zone.id === hoveredZoneId;

      const polygon = L.geoJSON(zone.boundary as any, {
        style: {
          color: isSelected ? '#10b981' : isHovered ? '#3b82f6' : '#6366f1',
          weight: isSelected ? 3 : isHovered ? 2.5 : 2,
          opacity: isSelected ? 1 : isHovered ? 0.9 : 0.7,
          fillColor: isSelected ? '#10b981' : isHovered ? '#3b82f6' : '#6366f1',
          fillOpacity: isSelected ? 0.25 : isHovered ? 0.2 : 0.1,
        },
      });

      polygon.bindPopup(`
        <div style="font-family: system-ui; min-width: 120px;">
          <strong style="font-size: 13px;">${zone.zoneName}</strong>
          <hr style="margin: 6px 0; border: none; border-top: 1px solid #e5e7eb;"/>
          <span style="font-size: 12px; color: #666;">
            ${zone.thresholdMinutes ? `${zone.thresholdMinutes} min threshold` : 'No threshold set'}
          </span>
        </div>
      `);

      polygon.addTo(layerGroupRef.current!);
    });

    return () => {
      if (layerGroupRef.current) {
        layerGroupRef.current.clearLayers();
      }
    };
  }, [map, zones, selectedZoneId, hoveredZoneId]);

  return null;
}

// Zone drawing click handler
function ZoneDrawingClickHandler({
  onDrawClick,
}: {
  onDrawClick: (lat: number, lng: number) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    // Change cursor to crosshair
    map.getContainer().style.cursor = 'crosshair';

    const handleClick = (e: L.LeafletMouseEvent) => {
      onDrawClick(e.latlng.lat, e.latlng.lng);
    };

    map.on('click', handleClick);

    return () => {
      map.getContainer().style.cursor = '';
      map.off('click', handleClick);
    };
  }, [map, onDrawClick]);

  return null;
}

// Drawing points layer - shows points being placed for polygon drawing
function DrawingPointsLayer({ points }: { points: [number, number][] }) {
  const map = useMap();
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!map) return;

    if (!layerGroupRef.current) {
      layerGroupRef.current = L.layerGroup().addTo(map);
    } else {
      layerGroupRef.current.clearLayers();
    }

    // Add markers for each point
    points.forEach((point, idx) => {
      const marker = L.circleMarker([point[0], point[1]], {
        radius: 6,
        color: '#fff',
        fillColor: '#3b82f6',
        fillOpacity: 1,
        weight: 2,
      });
      marker.bindTooltip(`Point ${idx + 1}`);
      marker.addTo(layerGroupRef.current!);
    });

    // Draw connecting lines if more than 1 point
    if (points.length > 1) {
      const latLngs = points.map(p => L.latLng(p[0], p[1]));
      const polyline = L.polyline(latLngs, {
        color: '#3b82f6',
        weight: 2,
        dashArray: '5, 5',
      });
      polyline.addTo(layerGroupRef.current!);
    }

    return () => {
      if (layerGroupRef.current) {
        layerGroupRef.current.clearLayers();
      }
    };
  }, [map, points]);

  return null;
}

// Optimal posts layer with numbered markers and coverage radius
function OptimalPostsLayer({ posts }: { posts: OptimalPost[] }) {
  const map = useMap();
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!map) return;

    // Remove existing layer group
    if (layerGroupRef.current) {
      map.removeLayer(layerGroupRef.current);
    }

    // Create new layer group
    layerGroupRef.current = L.layerGroup();

    // Color palette for posts
    const colors = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444"];

    posts.forEach((post, idx) => {
      const color = colors[idx % colors.length];

      // Add a coverage radius circle (~8 min drive = ~10 miles = ~16km)
      const radiusCircle = L.circle([post.lat, post.lng], {
        radius: 16000, // 16km in meters (~10 miles, ~8 min drive)
        color: color,
        weight: 2,
        opacity: 0.6,
        fillColor: color,
        fillOpacity: 0.08,
        dashArray: "5, 5",
      });
      layerGroupRef.current?.addLayer(radiusCircle);

      // Create numbered marker icon
      const icon = L.divIcon({
        className: "optimal-post-marker",
        html: `
          <div style="
            width: 36px;
            height: 36px;
            background: ${color};
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 16px;
            box-shadow: 0 3px 10px rgba(0,0,0,0.4);
            border: 3px solid white;
          ">${idx + 1}</div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      const marker = L.marker([post.lat, post.lng], { icon, zIndexOffset: 1000 });

      const coveragePercent = post.coverage ? (post.coverage * 100).toFixed(1) : "N/A";
      const oocLabel = post.ooc
        ? '<span style="color: #ef4444; font-weight: bold;">⚠️ Out of Compliance Risk</span>'
        : '<span style="color: #22c55e;">✓ Good Coverage</span>';

      const parishLabel = post.parish ? `<span style="color: #64748b; font-size: 12px;">${post.parish} Parish</span><br/>` : "";

      marker.bindPopup(`
        <div style="font-family: system-ui; min-width: 180px;">
          ${parishLabel}
          <strong style="font-size: 15px; color: ${color};">📍 Suggested Post #${idx + 1}</strong><br/>
          <hr style="margin: 8px 0; border: none; border-top: 1px solid #e5e7eb;"/>
          <div style="display: flex; flex-direction: column; gap: 6px; font-size: 13px;">
            <span>🎯 Priority Score: <strong>${post.score.toFixed(1)}</strong></span>
            <span>📊 Est. Coverage: <strong>${coveragePercent}%</strong></span>
            <span>🚑 Calls in area: <strong>${post.size || "N/A"}</strong></span>
            <div style="margin-top: 4px;">${oocLabel}</div>
          </div>
          <hr style="margin: 8px 0; border: none; border-top: 1px solid #e5e7eb;"/>
          <div style="font-size: 11px; color: #666;">
            Circle shows ~8 min drive radius
          </div>
        </div>
      `);

      layerGroupRef.current?.addLayer(marker);
    });

    layerGroupRef.current.addTo(map);

    return () => {
      if (layerGroupRef.current) {
        map.removeLayer(layerGroupRef.current);
      }
    };
  }, [map, posts]);

  return null;
}

// Isochrone coverage layer - renders coverage polygons from optimal posts
function IsochroneLayer({ features }: { features: GeoJSON.Feature[] }) {
  const map = useMap();
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!map || features.length === 0) return;

    // Remove existing layer group
    if (layerGroupRef.current) {
      map.removeLayer(layerGroupRef.current);
    }

    // Create new layer group
    layerGroupRef.current = L.layerGroup();

    // Color palette for different posts
    const colors = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444"];

    features.forEach((feature, idx) => {
      if (!feature.geometry) return;

      const color = colors[idx % colors.length];

      const layer = L.geoJSON(feature as any, {
        style: {
          color: color,
          weight: 2,
          opacity: 0.8,
          fillColor: color,
          fillOpacity: 0.15,
        },
      });

      // Add popup with coverage info
      const props = feature.properties || {};
      const minutes = props.minutes || "?";
      const areaSqm = props.area_sqm;
      const areaSqMiles = areaSqm ? (areaSqm / 2589988.11).toFixed(2) : null;

      layer.bindPopup(`
        <div style="font-family: system-ui; min-width: 140px;">
          <strong style="font-size: 14px;">Post #${idx + 1} Coverage</strong>
          <hr style="margin: 6px 0; border: none; border-top: 1px solid #e5e7eb;"/>
          <div style="font-size: 12px;">
            <span>⏱️ Drive time: <strong>${minutes} min</strong></span><br/>
            ${areaSqMiles ? `<span>📐 Area: <strong>${areaSqMiles} sq mi</strong></span>` : ""}
          </div>
        </div>
      `);

      layerGroupRef.current?.addLayer(layer);
    });

    layerGroupRef.current.addTo(map);

    return () => {
      if (layerGroupRef.current) {
        map.removeLayer(layerGroupRef.current);
      }
    };
  }, [map, features]);

  return null;
}
