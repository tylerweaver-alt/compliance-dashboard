'use client';

import React, { useState, useEffect } from 'react';
import ComplianceFeasibilitySection from '@/app/components/ComplianceFeasibilitySection';

export interface ResponseZone {
  id: number;
  parishId: number;
  zoneName: string;
  thresholdMinutes: number | null;
  locations: string[];
  boundary: GeoJSON.Polygon | null;
  hasPolygon: boolean;
}

interface ResponseZonesPanelProps {
  parishId: number | null;
  parishName: string;
  regionId: string;
  onClose: () => void;
  onZoneSelect: (zone: ResponseZone) => void;
  onDrawZone: (zone: ResponseZone) => void;
  onZoneHover?: (zone: ResponseZone | null) => void;
  selectedZoneId: number | null;
  showOnMap?: boolean;
  onToggleShowOnMap?: () => void;
  onZonesLoaded?: (zones: ResponseZone[]) => void;
  refreshTrigger?: number;
}

export default function ResponseZonesPanel({
  parishId,
  parishName,
  regionId,
  onClose,
  onZoneSelect,
  onDrawZone,
  onZoneHover,
  selectedZoneId,
  showOnMap = false,
  onToggleShowOnMap,
  onZonesLoaded,
  refreshTrigger = 0,
}: ResponseZonesPanelProps) {
  const [zones, setZones] = useState<ResponseZone[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch zones
  useEffect(() => {
    if (!parishId) {
      setZones([]);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`/api/response-zones?parish_id=${parishId}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setZones(data.zones);
          onZonesLoaded?.(data.zones);
        } else {
          setError(data.error || 'Failed to load zones');
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parishId, refreshTrigger]);

  const drawnCount = zones.filter(z => z.hasPolygon).length;
  const notDrawnCount = zones.filter(z => !z.hasPolygon).length;

  return (
    <div className="h-full flex flex-col bg-slate-900 text-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <div>
          <h2 className="text-sm font-semibold">Zone Management</h2>
          <p className="text-xs text-slate-400">{parishName || 'Select a parish'}</p>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-slate-700 rounded transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {/* Unified Compliance Feasibility Curve Section (Three Modes) */}
        <div className="mb-4">
          <ComplianceFeasibilitySection
            regionId={regionId}
            parishId={parishId}
            parishName={parishName}
          />
        </div>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full" />
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded p-3 text-xs text-red-300">{error}</div>
        )}

        {/* Stats */}
        {parishId && zones.length > 0 && (
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-xs text-slate-300">{drawnCount} Drawn</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-xs text-slate-300">{notDrawnCount} Need Drawing</span>
              </div>
            </div>
            {onToggleShowOnMap && (
              <button onClick={onToggleShowOnMap}
                className={`text-xs px-2 py-1 rounded ${showOnMap ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                {showOnMap ? 'Visible' : 'Show'}
              </button>
            )}
          </div>
        )}

        {!parishId && (
          <div className="text-center py-8 text-slate-400 text-xs">
            <svg className="w-10 h-10 mx-auto mb-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            <p>Select a parish to manage its response zones.</p>
            <p className="mt-1 text-slate-500">Draw zone boundaries here, then analyze in Response Strategy.</p>
          </div>
        )}

        {parishId && zones.length === 0 && !loading && (
          <div className="text-center py-8 text-slate-500 text-xs">
            No response zones configured.
            <p className="mt-1 text-slate-400">Add zones in Parish Settings first.</p>
          </div>
        )}

        {zones.length > 0 && (
          <div className="space-y-2">
            {zones.map(zone => (
              <div
                key={zone.id}
                onClick={() => onZoneSelect(zone)}
                onMouseEnter={() => onZoneHover?.(zone)}
                onMouseLeave={() => onZoneHover?.(null)}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                  selectedZoneId === zone.id
                    ? 'bg-emerald-900/30 border-emerald-600'
                    : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${zone.hasPolygon ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                    <span className="text-sm font-medium truncate">{zone.zoneName}</span>
                  </div>
                  <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
                    zone.thresholdMinutes ? 'bg-slate-700 text-slate-300' : 'bg-slate-800 text-slate-500'
                  }`}>
                    {zone.thresholdMinutes ? `${zone.thresholdMinutes} min` : 'No threshold'}
                  </span>
                </div>

                <button
                  onClick={(e) => { e.stopPropagation(); onDrawZone(zone); }}
                  className={`w-full py-1.5 text-xs font-medium rounded transition-colors ${
                    zone.hasPolygon
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      : 'bg-amber-600 text-white hover:bg-amber-700'
                  }`}
                >
                  {zone.hasPolygon ? 'Edit Boundary' : 'Draw Boundary'}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Tip */}
        {parishId && zones.length > 0 && (
          <div className="mt-4 p-3 bg-blue-900/20 border border-blue-800 rounded-lg">
            <p className="text-xs text-blue-300">
              <strong>Tip:</strong> After drawing zone boundaries, use <span className="text-blue-200">Response Strategy</span> to analyze compliance with different unit/post configurations.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

