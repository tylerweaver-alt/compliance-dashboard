'use client';

import React from 'react';
import type { PanelProps } from '@/lib/coverage-types';

interface DensityPanelProps extends PanelProps {
  callCount: number;
  dateRange?: { start: string; end: string };
}

export default function DensityPanel({
  parishId,
  parishName,
  regionId,
  onClose,
  callCount,
  dateRange,
}: DensityPanelProps) {
  return (
    <div className="h-full flex flex-col bg-slate-900 text-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <div>
          <h2 className="text-lg font-semibold">Call Density</h2>
          <p className="text-sm text-slate-400">{parishName || regionId}</p>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
          aria-label="Close panel"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Stats Summary */}
        <div className="bg-slate-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-slate-400 mb-3">Overview</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-2xl font-bold text-emerald-400">{callCount.toLocaleString()}</p>
              <p className="text-xs text-slate-400">Total Calls</p>
            </div>
            {dateRange && (
              <div>
                <p className="text-sm font-medium text-white">{dateRange.start}</p>
                <p className="text-sm font-medium text-white">to {dateRange.end}</p>
                <p className="text-xs text-slate-400">Date Range</p>
              </div>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="bg-slate-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-slate-400 mb-3">Map Legend</h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-[#e63946]" />
              <span className="text-sm">Call Location</span>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Each dot represents an individual emergency call. Click on a parish to filter calls by location.
            </p>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-slate-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-slate-400 mb-3">How to Use</h3>
          <ul className="text-sm space-y-2 text-slate-300">
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 mt-0.5">•</span>
              <span>Click on a contracted parish to zoom in and filter calls</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 mt-0.5">•</span>
              <span>Use the Region button to reset to the full region view</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 mt-0.5">•</span>
              <span>Switch to other modes to analyze compliance and coverage</span>
            </li>
          </ul>
        </div>

        {/* Parish Info */}
        {parishId && (
          <div className="bg-slate-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-slate-400 mb-3">Selected Parish</h3>
            <p className="text-lg font-semibold text-white">{parishName}</p>
            <p className="text-xs text-slate-400">Parish ID: {parishId}</p>
          </div>
        )}
      </div>
    </div>
  );
}

