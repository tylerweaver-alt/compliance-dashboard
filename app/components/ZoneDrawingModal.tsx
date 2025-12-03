'use client';

import React, { useState, useEffect } from 'react';

export type DrawingMode = 'none' | 'circle' | 'polygon' | 'street' | 'parishwide' | 'citytown';

export interface ZoneDrawingConfig {
  mode: DrawingMode;
  // Circle mode
  centerLat?: number;
  centerLng?: number;
  radiusMiles?: number;
  // Street mode
  streetParams?: {
    startStreet: string;
    endStreet: string;
    crossStreet1?: string;
    crossStreet2?: string;
  };
  // Polygon mode - coordinates set by map clicks
  polygonCoords?: [number, number][];
  // Options
  snapToRoads: boolean;
}

interface ResponseZone {
  id: number;
  parishId: number;
  zoneName: string;
  thresholdMinutes: number | null;
  locations: string[];
  boundary: GeoJSON.Polygon | null;
  hasPolygon: boolean;
}

interface ZoneDrawingModalProps {
  isOpen: boolean;
  onClose: () => void;
  zone: ResponseZone | null;
  parishName: string;
  parishBoundary?: GeoJSON.Polygon | null;
  onStartDrawing: (config: ZoneDrawingConfig) => void;
  onSaveBoundary: (zoneId: number, boundary: GeoJSON.Polygon) => Promise<void>;
  isDrawing: boolean;
  currentPolygonCoords: [number, number][];
}

export default function ZoneDrawingModal({
  isOpen,
  onClose,
  zone,
  parishName,
  parishBoundary,
  onStartDrawing,
  onSaveBoundary,
  isDrawing,
  currentPolygonCoords,
}: ZoneDrawingModalProps) {
  const [drawingMode, setDrawingMode] = useState<DrawingMode>('none');
  const [radiusMiles, setRadiusMiles] = useState('5');
  const [snapToRoads, setSnapToRoads] = useState(true);
  const [streetStart, setStreetStart] = useState('');
  const [streetEnd, setStreetEnd] = useState('');
  const [crossStreet1, setCrossStreet1] = useState('');
  const [crossStreet2, setCrossStreet2] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cityTownBoundary, setCityTownBoundary] = useState<GeoJSON.Polygon | null>(null);
  const [loadingCityTown, setLoadingCityTown] = useState(false);

  // Check if zone name suggests parishwide
  const isParishwideZone = zone?.zoneName.toLowerCase().includes('all of') ||
    zone?.zoneName.toLowerCase().includes('parishwide') ||
    zone?.zoneName.toLowerCase().includes('parish-wide') ||
    zone?.zoneName.toLowerCase() === parishName.toLowerCase();

  useEffect(() => {
    if (isOpen && isParishwideZone && parishBoundary) {
      setDrawingMode('parishwide');
    } else {
      setDrawingMode('none');
    }
  }, [isOpen, isParishwideZone, parishBoundary]);

  if (!isOpen || !zone) return null;

  const handleStartDrawing = () => {
    const config: ZoneDrawingConfig = {
      mode: drawingMode,
      snapToRoads,
      radiusMiles: drawingMode === 'circle' ? parseFloat(radiusMiles) : undefined,
      streetParams: drawingMode === 'street' ? {
        startStreet: streetStart,
        endStreet: streetEnd,
        crossStreet1: crossStreet1 || undefined,
        crossStreet2: crossStreet2 || undefined,
      } : undefined,
    };
    onStartDrawing(config);
  };

  const handleUseParishBoundary = async () => {
    if (!parishBoundary || !zone) return;
    setSaving(true);
    setError(null);
    try {
      await onSaveBoundary(zone.id, parishBoundary);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save boundary');
    } finally {
      setSaving(false);
    }
  };

  // Fetch city/town boundary from API
  const fetchCityTownBoundary = async () => {
    if (!zone) return;
    setLoadingCityTown(true);
    setError(null);
    try {
      // TODO: Replace with actual city/town boundary API when available
      const response = await fetch(`/api/geo/city-boundary?name=${encodeURIComponent(zone.zoneName)}&parish=${encodeURIComponent(parishName)}`);
      if (!response.ok) {
        throw new Error('City/town boundary not found. Try drawing manually.');
      }
      const data = await response.json();
      if (data.boundary) {
        setCityTownBoundary(data.boundary);
      } else {
        throw new Error('No boundary data returned. Try drawing manually.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch city/town boundary');
      setCityTownBoundary(null);
    } finally {
      setLoadingCityTown(false);
    }
  };

  const handleUseCityTownBoundary = async () => {
    if (!cityTownBoundary || !zone) return;
    setSaving(true);
    setError(null);
    try {
      await onSaveBoundary(zone.id, cityTownBoundary);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save boundary');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePolygon = async () => {
    if (currentPolygonCoords.length < 3 || !zone) {
      setError('Need at least 3 points to create a polygon');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Close the polygon by adding first point at end
      const coords = [...currentPolygonCoords];
      if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
        coords.push(coords[0]);
      }
      const polygon: GeoJSON.Polygon = {
        type: 'Polygon',
        coordinates: [coords.map(c => [c[1], c[0]])], // Convert [lat,lng] to [lng,lat] for GeoJSON
      };
      await onSaveBoundary(zone.id, polygon);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save boundary');
    } finally {
      setSaving(false);
    }
  };

  // Modal styles
  const overlayStyle = "fixed inset-0 bg-black/60 flex items-center justify-center z-[2000] p-4";
  const modalStyle = "bg-white rounded-lg w-full max-w-lg shadow-2xl max-h-[90vh] overflow-hidden flex flex-col";

  return (
    <div className={overlayStyle} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={modalStyle}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Define Zone Boundary</h2>
            <p className="text-xs text-slate-500 mt-0.5">{zone.zoneName} • {zone.thresholdMinutes ? `${zone.thresholdMinutes} min` : 'No threshold'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded transition-colors">
            <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-xs">
              {error}
            </div>
          )}

          {/* Parishwide auto-detection */}
          {isParishwideZone && parishBoundary && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-emerald-800">Parishwide Zone Detected</p>
                  <p className="text-xs text-emerald-600 mt-1">
                    This zone covers the entire parish. Use the existing parish boundary instead of drawing.
                  </p>
                  <button
                    onClick={handleUseParishBoundary}
                    disabled={saving}
                    className="mt-3 px-4 py-2 bg-emerald-600 text-white text-xs font-medium rounded hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                  >
                    {saving ? 'Saving...' : 'Use Parish Boundary'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Drawing Mode Selection */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-2">Drawing Method</label>
            <div className="grid grid-cols-2 gap-2">
              {/* Parish Boundary option - always show if boundary is available */}
              {parishBoundary && (
                <button
                  onClick={() => setDrawingMode('parishwide')}
                  className={`p-3 rounded-lg border text-left transition-all col-span-2 min-h-[72px] ${
                    drawingMode === 'parishwide'
                      ? 'border-[#004437] bg-[#004437]/10 ring-2 ring-[#004437]/30'
                      : 'border-slate-200 hover:border-[#004437] hover:bg-[#004437]/5'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-[#004437] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                    <span className="text-sm font-medium text-slate-800 flex-1">Use Parish Boundary</span>
                    <span className={`text-xs ml-auto ${isParishwideZone ? 'text-[#004437]' : 'invisible'}`}>Recommended</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Use the existing parish boundary polygon</p>
                </button>
              )}
              {/* City/Town Boundary option - always show */}
              <button
                onClick={() => setDrawingMode('citytown')}
                className={`p-3 rounded-lg border text-left transition-all col-span-2 min-h-[72px] ${
                  drawingMode === 'citytown'
                    ? 'border-[#004437] bg-[#004437]/10 ring-2 ring-[#004437]/30'
                    : 'border-slate-200 hover:border-[#004437] hover:bg-[#004437]/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-[#004437] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  <span className="text-sm font-medium text-slate-800 flex-1">Use City/Town Boundary</span>
                  <span className={`text-xs ml-auto ${!isParishwideZone ? 'text-[#004437]' : 'invisible'}`}>Recommended</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">Use the official city/town boundary polygon</p>
              </button>
              {[
                { id: 'polygon', label: 'Point-by-Point', icon: '📍', desc: 'Click to place points' },
                { id: 'circle', label: 'Circle Radius', icon: '⭕', desc: 'Center + radius in miles' },
                { id: 'street', label: 'Street Bounds', icon: '🛣️', desc: 'Define by street names' },
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setDrawingMode(opt.id as DrawingMode)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    drawingMode === opt.id
                      ? 'border-[#004437] bg-[#004437]/10 ring-2 ring-[#004437]/30'
                      : 'border-slate-200 hover:border-[#004437] hover:bg-[#004437]/5'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span>{opt.icon}</span>
                    <span className="text-sm font-medium text-slate-800">{opt.label}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Circle Options */}
          {drawingMode === 'circle' && (
            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <p className="text-xs text-slate-600">Click on the map to set the center point, then specify the radius.</p>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Radius (miles)</label>
                <input
                  type="number"
                  value={radiusMiles}
                  onChange={(e) => setRadiusMiles(e.target.value)}
                  step="0.5"
                  min="0.1"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-[#004437] focus:border-transparent"
                />
              </div>
            </div>
          )}

          {/* Street Bounds Options */}
          {drawingMode === 'street' && (
            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <p className="text-xs text-slate-600">Define the zone boundaries using street names.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">From Street</label>
                  <input type="text" value={streetStart} onChange={(e) => setStreetStart(e.target.value)}
                    placeholder="e.g., 1st Street" className="w-full px-3 py-2 text-sm border border-slate-300 rounded" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">To Street</label>
                  <input type="text" value={streetEnd} onChange={(e) => setStreetEnd(e.target.value)}
                    placeholder="e.g., 5th Street" className="w-full px-3 py-2 text-sm border border-slate-300 rounded" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Cross Street 1 (optional)</label>
                  <input type="text" value={crossStreet1} onChange={(e) => setCrossStreet1(e.target.value)}
                    placeholder="e.g., Main Ave" className="w-full px-3 py-2 text-sm border border-slate-300 rounded" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Cross Street 2 (optional)</label>
                  <input type="text" value={crossStreet2} onChange={(e) => setCrossStreet2(e.target.value)}
                    placeholder="e.g., Oak Blvd" className="w-full px-3 py-2 text-sm border border-slate-300 rounded" />
                </div>
              </div>
            </div>
          )}

          {/* Polygon Drawing Status */}
          {drawingMode === 'polygon' && isDrawing && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                <span className="text-sm font-medium text-blue-800">Drawing Mode Active</span>
              </div>
              <p className="text-xs text-blue-600 mt-1">
                Click on the map to add points. {currentPolygonCoords.length} point(s) placed.
              </p>
            </div>
          )}

          {/* Snap to Roads Toggle */}
          {(drawingMode === 'polygon' || drawingMode === 'circle') && (
            <label className="flex items-center gap-3 cursor-pointer">
              <div className={`w-10 h-5 rounded-full transition-colors relative ${snapToRoads ? 'bg-[#004437]' : 'bg-slate-300'}`}
                onClick={() => setSnapToRoads(!snapToRoads)}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${snapToRoads ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
              <div>
                <span className="text-sm font-medium text-slate-800">Snap to Roads</span>
                <p className="text-xs text-slate-500">Automatically align points to nearby roads</p>
              </div>
            </label>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors">
            Cancel
          </button>
          {drawingMode === 'parishwide' && parishBoundary && (
            <button onClick={handleUseParishBoundary} disabled={saving}
              className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded hover:bg-emerald-700 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : 'Use Parish Boundary'}
            </button>
          )}
          {drawingMode === 'citytown' && !cityTownBoundary && (
            <button onClick={fetchCityTownBoundary} disabled={loadingCityTown}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {loadingCityTown ? 'Fetching...' : 'Fetch Boundary'}
            </button>
          )}
          {drawingMode === 'citytown' && cityTownBoundary && (
            <button onClick={handleUseCityTownBoundary} disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : 'Use City/Town Boundary'}
            </button>
          )}
          {drawingMode === 'polygon' && isDrawing && currentPolygonCoords.length >= 3 && (
            <button onClick={handleSavePolygon} disabled={saving}
              className="px-4 py-2 bg-[#004437] text-white text-sm font-medium rounded hover:bg-[#003329] disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : 'Save Polygon'}
            </button>
          )}
          {drawingMode !== 'none' && drawingMode !== 'parishwide' && drawingMode !== 'citytown' && !isDrawing && (
            <button onClick={handleStartDrawing}
              className="px-4 py-2 bg-[#004437] text-white text-sm font-medium rounded hover:bg-[#003329] transition-colors">
              Start Drawing
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

