'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

// Format zone name for display (fix common typos without changing underlying data)
const formatZoneName = (zoneName) => {
  if (!zoneName) return zoneName;
  // Fix "5mi" → "5min", "8mi" → "8min", etc. (missing 'n' at end)
  return zoneName.replace(/(\d+)\s*mi\b/gi, '$1 Min');
};

// Radial Gauge Component
function ComplianceGauge({ percentage, thresholds }) {
  // Default thresholds if not provided
  const { red = 60, yellow = 80 } = thresholds || {};

  // Calculate color based on percentage and thresholds
  const getColor = (pct) => {
    if (pct < red) return '#ef4444'; // red-500
    if (pct < yellow) return '#f59e0b'; // amber-500
    return '#22c55e'; // green-500
  };

  const color = getColor(percentage);
  const radius = 70;
  const strokeWidth = 12;
  const circumference = 2 * Math.PI * radius;
  const progress = (percentage / 100) * circumference;

  return (
    <div className="relative w-48 h-48 print:w-24 print:h-24">
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 180 180">
        {/* Background circle */}
        <circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold print:text-lg" style={{ color }}>{percentage}%</span>
        <span className="text-sm text-slate-500 uppercase tracking-wider print:text-[8px]">Compliant</span>
      </div>
    </div>
  );
}

// Stat Card Component
function StatCard({ label, value, accent = false }) {
  return (
    <div className={`p-4 print:p-1 rounded-lg print:bg-white print:border print:border-slate-200 ${accent ? 'bg-[#004437]/10 border-l-4 border-[#004437]' : 'bg-slate-100'}`}>
      <div className="text-xs print:text-[8px] text-slate-500 uppercase tracking-wider mb-1 print:mb-0 print:text-slate-600">{label}</div>
      <div className={`text-3xl print:text-base font-bold print:text-slate-900 ${accent ? 'text-[#004437]' : 'text-slate-800'}`}>
        {value !== undefined && value !== null ? value : '—'}
      </div>
    </div>
  );
}

// Call Breakdown Item
function BreakdownItem({ label, value, isPercentage = false, highlight = false }) {
  return (
    <div className={`text-center p-4 rounded-lg ${highlight ? 'bg-[#004437]/10 border border-[#004437]/20' : 'bg-slate-50'}`}>
      <div className={`text-2xl font-bold mb-1 ${highlight ? 'text-[#004437]' : 'text-slate-800'}`}>
        {value}{isPercentage ? '%' : ''}
      </div>
      <div className="text-xs text-slate-500 uppercase tracking-wider">{label}</div>
    </div>
  );
}

// Exclusion Modal
// Weather Exclusion Details Modal - shows weather alert info for auto-excluded calls
function WeatherExclusionModal({ isOpen, onClose, callId }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    if (isOpen && callId) {
      setLoading(true);
      setError(null);
      fetch(`/api/calls/${callId}/weather-matches`)
        .then(res => res.json())
        .then(json => {
          if (json.error) throw new Error(json.error);
          setData(json);
        })
        .catch(err => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [isOpen, callId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-slate-800">Weather Exclusion Details</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading && (
          <div className="py-8 text-center text-slate-500">Loading weather data...</div>
        )}

        {error && (
          <div className="py-4 text-center text-red-600">{error}</div>
        )}

        {!loading && !error && data && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                {data.call.auto_exclusion_reason || 'Call excluded due to overlapping NWS weather alert.'}
              </p>
            </div>

            {data.weatherMatches && data.weatherMatches.length > 0 ? (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-700">Matching Weather Alerts:</h4>
                {data.weatherMatches.map((wm, idx) => (
                  <div key={idx} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        wm.weather_severity === 'Severe'
                          ? 'bg-red-100 text-red-800'
                          : wm.weather_severity === 'Moderate'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {wm.weather_severity}
                      </span>
                      <span className="font-medium text-slate-800">{wm.weather_event_type}</span>
                    </div>
                    <p className="text-xs text-slate-600 mb-1">{wm.weather_area_desc}</p>
                    <p className="text-xs text-slate-500">
                      Overlap: {new Date(wm.overlap_start).toLocaleString()} – {new Date(wm.overlap_end).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No weather alert details available.</p>
            )}
          </div>
        )}

        <div className="mt-6 text-right">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ExclusionModal({ isOpen, onClose, onExclude, callId }) {
  const [selectedReason, setSelectedReason] = useState('');

  const exclusionReasons = [
    'Weather Delay',
    'Road Construction',
    'Traffic Accident',
    'Unit Mechanical Issue',
    'Incorrect Address Provided',
    'Patient Not Ready',
    'Hospital Diversion',
    'System Downtime',
    'Training Call',
    'Mutual Aid Request',
    'Other (Admin Approved)',
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
        <h3 className="text-xl font-bold text-white mb-4">Select Exclusion Reason</h3>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {exclusionReasons.map((reason) => (
            <label
              key={reason}
              className={`flex items-center p-3 rounded-lg cursor-pointer transition-colors ${
                selectedReason === reason ? 'bg-[#004437] text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              <input
                type="radio"
                name="exclusionReason"
                value={reason}
                checked={selectedReason === reason}
                onChange={(e) => setSelectedReason(e.target.value)}
                className="sr-only"
              />
              <span>{reason}</span>
            </label>
          ))}
        </div>
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-500"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (selectedReason) {
                onExclude(callId, selectedReason);
                onClose();
              }
            }}
            disabled={!selectedReason}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Apply Exclusion
          </button>
        </div>
      </div>
    </div>
  );
}

// All available columns with their definitions
// Supports both legacy short names and new database column names
const ALL_COLUMNS = {
  // Legacy short names (for backwards compatibility)
  date: { label: 'Date', getValue: (call) => call.response_date, className: 'text-slate-700' },
  time: { label: 'Time', getValue: (call, parseTimeOnly) => parseTimeOnly(call.call_in_que_time), className: 'text-slate-700' },
  call_number: { label: 'Call #', getValue: (call, parseTimeOnly, parseCallNumber) => parseCallNumber(call.response_number), className: 'font-mono text-slate-800' },
  unit: { label: 'Unit', getValue: (call) => call.radio_name || '—', className: 'text-slate-700' },
  address: {
    label: 'Address',
    getValue: (call) => {
      const addr = call.origin_address || '—';
      // Truncate long addresses for display
      return addr.length > 22 ? addr.substring(0, 22) + '...' : addr;
    },
    className: 'text-slate-700',
    title: true // Enable tooltip with full address
  },
  received: { label: 'Rcvd', getValue: (call, parseTimeOnly) => parseTimeOnly(call.call_in_que_time), className: 'text-slate-600' },
  dispatched: { label: 'Disp', getValue: (call, parseTimeOnly) => parseTimeOnly(call.assigned_time), className: 'text-slate-600' },
  enroute: { label: 'Enrt', getValue: (call, parseTimeOnly) => parseTimeOnly(call.enroute_time), className: 'text-slate-600' },
  staged: { label: 'Stgd', getValue: (call, parseTimeOnly) => parseTimeOnly(call.staged_time), className: 'text-slate-600' },
  on_scene: { label: 'OnScn', getValue: (call, parseTimeOnly) => parseTimeOnly(call.arrived_at_scene_time), className: 'text-slate-600' },
  depart: { label: 'Dept', getValue: (call, parseTimeOnly) => parseTimeOnly(call.depart_scene_time), className: 'text-slate-600' },
  arrived: { label: 'Arvd', getValue: (call, parseTimeOnly) => parseTimeOnly(call.arrived_destination_time), className: 'text-slate-600' },
  available: { label: 'Avail', getValue: (call, parseTimeOnly) => parseTimeOnly(call.call_cleared_time), className: 'text-slate-600' },
  response: { label: 'Resp', isResponseTime: true },
  status: { label: 'Status', isStatus: true },
  priority: { label: 'Pri', getValue: (call) => call.priority, className: 'text-slate-700' },
  response_area: { label: 'Zone', getValue: (call) => formatZoneName(call.response_area) || '—', className: 'text-slate-700' },
  problem: { label: 'Problem', getValue: (call) => call.problem || '—', className: 'text-slate-700' },
  origin_city: { label: 'City', getValue: (call) => call.origin_city || '—', className: 'text-slate-700' },
  destination: { label: 'Destination', getValue: (call) => call.destination_name || '—' },

  // Core columns (database names)
  response_number: { label: 'Response Number', getValue: (call, parseTimeOnly, parseCallNumber) => parseCallNumber(call.response_number), className: 'font-mono text-slate-800' },
  response_date: { label: 'Response Date', getValue: (call) => call.response_date },
  response_date_time: { label: 'Response Date/Time', getValue: (call) => call.response_date_time || '—' },
  radio_name: { label: 'Radio Name', getValue: (call) => call.radio_name || '—' },

  // Origin columns
  origin_description: { label: 'Origin Description', getValue: (call) => call.origin_description || '—' },
  origin_address: { label: 'Origin Address', getValue: (call) => call.origin_address || '—' },
  origin_location_city: { label: 'Origin City', getValue: (call) => call.origin_location_city || '—' },
  origin_zip: { label: 'Origin Zip', getValue: (call) => call.origin_zip || '—' },
  origin_latitude: { label: 'Origin Lat', getValue: (call) => call.origin_latitude || '—' },
  origin_longitude: { label: 'Origin Lon', getValue: (call) => call.origin_longitude || '—' },

  // Destination columns
  destination_description: { label: 'Dest Description', getValue: (call) => call.destination_description || '—' },
  destination_address: { label: 'Dest Address', getValue: (call) => call.destination_address || '—' },
  destination_location_city: { label: 'Dest City', getValue: (call) => call.destination_location_city || '—' },
  destination_zip: { label: 'Dest Zip', getValue: (call) => call.destination_zip || '—' },

  // Call detail columns
  caller_type: { label: 'Caller Type', getValue: (call) => call.caller_type || '—' },
  problem_description: { label: 'Problem', getValue: (call) => call.problem_description || '—' },
  transport_mode: { label: 'Transport Mode', getValue: (call) => call.transport_mode || '—' },
  cad_is_transport: { label: 'Is Transport', getValue: (call) => call.cad_is_transport || '—' },
  master_incident_cancel_reason: { label: 'Cancel Reason', getValue: (call) => call.master_incident_cancel_reason || '—' },
  master_incident_delay_reason_description: { label: 'Delay Reason', getValue: (call) => call.master_incident_delay_reason_description || '—' },
  vehicle_assigned_delay_reason: { label: 'Vehicle Delay', getValue: (call) => call.vehicle_assigned_delay_reason || '—' },

  // Timestamp columns
  call_in_que_time: { label: 'Call In Queue', getValue: (call, parseTimeOnly) => parseTimeOnly(call.call_in_que_time) },
  call_taking_complete_time: { label: 'Call Taking Complete', getValue: (call, parseTimeOnly) => parseTimeOnly(call.call_taking_complete_time) },
  assigned_time_first_unit: { label: 'Assigned (First)', getValue: (call, parseTimeOnly) => parseTimeOnly(call.assigned_time_first_unit) },
  assigned_time: { label: 'Assigned (Dispatched)', getValue: (call, parseTimeOnly) => parseTimeOnly(call.assigned_time) },
  enroute_time: { label: 'Enroute Time', getValue: (call, parseTimeOnly) => parseTimeOnly(call.enroute_time) },
  staged_time: { label: 'Staged Time', getValue: (call, parseTimeOnly) => parseTimeOnly(call.staged_time) },
  arrived_at_scene_time: { label: 'Arrived Scene', getValue: (call, parseTimeOnly) => parseTimeOnly(call.arrived_at_scene_time) },
  depart_scene_time: { label: 'Depart Scene', getValue: (call, parseTimeOnly) => parseTimeOnly(call.depart_scene_time) },
  arrived_destination_time: { label: 'Arrived Dest', getValue: (call, parseTimeOnly) => parseTimeOnly(call.arrived_destination_time) },
  call_cleared_time: { label: 'Call Cleared', getValue: (call, parseTimeOnly) => parseTimeOnly(call.call_cleared_time) },

  // Response time columns
  queue_response_time: { label: 'Queue Response', getValue: (call) => call.queue_response_time || '—' },
  assigned_response_time: { label: 'Assigned Response', getValue: (call) => call.assigned_response_time || '—' },
  enroute_response_time: { label: 'Enroute Response', getValue: (call) => call.enroute_response_time || '—' },
  assigned_to_arrived_at_scene: { label: 'Assigned to Arrived', getValue: (call) => call.assigned_to_arrived_at_scene || '—' },
  call_in_queue_to_cleared_call_lag: { label: 'Queue to Cleared', getValue: (call) => call.call_in_queue_to_cleared_call_lag || '—' },
  compliance_time: { label: 'Compliance Time', getValue: (call) => call.compliance_time || '—' },

  // Exclusion status column
  exclusion_status: {
    label: 'Exclusion',
    isExclusionStatus: true,
  },
};

// Default columns: Date, Call#, Unit, Address, Received, Dispatched, Enroute, Staged, On Scene, Depart, Arrived, Available, Response, Status, Exclusion
const DEFAULT_COLUMNS = ['date', 'call_number', 'unit', 'address', 'received', 'dispatched', 'enroute', 'staged', 'on_scene', 'depart', 'arrived', 'available', 'response', 'status', 'exclusion_status'];

// Audit Log Panel Component - Shows time edits and exclusions (manual + auto)
function AuditLogPanel({ callEdits, autoExclusions, isOpen }) {
  // Merge time edits and exclusions into a single list
  const allEntries = [];

  // Add time edit entries (type: 'time_edit')
  if (callEdits && callEdits.length > 0) {
    callEdits.forEach((item) => {
      allEntries.push({ ...item, entryType: 'time_edit' });
    });
  }

  // Add exclusion entries (both manual and auto - from unified endpoint)
  if (autoExclusions && autoExclusions.length > 0) {
    autoExclusions.forEach((item) => {
      // Determine entry type based on exclusion.type
      const exclusionType =
        item.exclusion?.type === 'MANUAL' ? 'manual_exclusion' : 'auto_exclusion';
      allEntries.push({ ...item, entryType: exclusionType });
    });
  }

  if (!isOpen || allEntries.length === 0) return null;

  const formatDateTime = (isoString) => {
    if (!isoString) return '—';
    const d = new Date(isoString);
    return d.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const extractTime = (dateTimeStr) => {
    if (!dateTimeStr) return '—';
    const parts = dateTimeStr.split(' ');
    return parts.length > 1 ? parts[1] : dateTimeStr;
  };

  // Count by type for header
  const timeEditCount = callEdits?.length || 0;
  const autoExclusionCount = allEntries.filter((e) => e.entryType === 'auto_exclusion').length;
  const manualExclusionCount = allEntries.filter((e) => e.entryType === 'manual_exclusion').length;

  return (
    <div className="print:break-before-page audit-log-print">
      {/* Header */}
      <div className="audit-log-header px-4 py-2 border-b border-slate-300 bg-slate-100">
        <h2 className="text-sm font-semibold text-slate-700 text-center underline decoration-1 decoration-slate-400 underline-offset-2">
          Audit Log — {allEntries.length} item(s)
          <span className="text-slate-500 font-normal ml-2">
            (
            {timeEditCount > 0 ? `${timeEditCount} time edit${timeEditCount !== 1 ? 's' : ''}` : ''}
            {timeEditCount > 0 && (manualExclusionCount > 0 || autoExclusionCount > 0) ? ', ' : ''}
            {manualExclusionCount > 0
              ? `${manualExclusionCount} manual exclusion${manualExclusionCount !== 1 ? 's' : ''}`
              : ''}
            {manualExclusionCount > 0 && autoExclusionCount > 0 ? ', ' : ''}
            {autoExclusionCount > 0
              ? `${autoExclusionCount} auto-exclusion${autoExclusionCount !== 1 ? 's' : ''}`
              : ''}
            )
          </span>
        </h2>
      </div>

      {/* Merged Call List */}
      <div className="divide-y divide-slate-200">
        {allEntries.map((callData) => {
          const isManualExclusion = callData.entryType === 'manual_exclusion';
          const isAutoExclusion = callData.entryType === 'auto_exclusion';
          const isExclusion = isManualExclusion || isAutoExclusion;

          return (
            <div key={`${callData.entryType}-${callData.callId}`} className="bg-white">
              {/* Call Header - different styling for auto vs others */}
              <div
                className={`audit-log-call-header text-slate-900 px-3 py-1.5 flex items-center justify-between text-xs border-b border-slate-400 ${
                  isAutoExclusion ? 'bg-red-200' : 'bg-slate-300'
                }`}
              >
                <div className="flex items-center gap-4">
                  {/* Gear icon for auto-exclusions */}
                  {isAutoExclusion && (
                    <svg className="w-5 h-5 text-slate-700" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97 0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1 0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66z" />
                    </svg>
                  )}
                  <span className="font-bold">
                    {isManualExclusion
                      ? 'MANUAL EXCLUSION | '
                      : isAutoExclusion
                        ? 'AUTO-EXCLUDED | '
                        : ''}
                    Call #
                    {callData.callInfo.responseNumber?.split('-')[1] ||
                      callData.callInfo.responseNumber ||
                      callData.callId}
                  </span>
                  <span className="text-slate-600">{callData.callInfo.responseDate}</span>
                  <span className="text-slate-600">Unit: {callData.callInfo.unit || '—'}</span>
                  <span className="text-slate-600">Zone: {callData.callInfo.zone || '—'}</span>
                </div>
                <span
                  className={`audit-log-badge text-white px-2 py-0.5 rounded text-[10px] font-medium ${
                    isAutoExclusion ? 'bg-red-600' : 'bg-slate-600'
                  }`}
                >
                  {isAutoExclusion
                    ? `#${callData.windowContext?.callPosition || '?'} of ${callData.windowContext?.callsInWindow || '?'} calls`
                    : isManualExclusion
                      ? 'User Excluded'
                      : `Total Edits: ${callData.edits?.length || 0}`}
                </span>
              </div>

              {/* Content differs based on entry type */}
              {callData.entryType === 'time_edit' ? (
                /* Time Edit Details */
                <div className="text-xs">
                  {callData.edits.map((edit, idx) => (
                    <div
                      key={edit.id || idx}
                      className={`px-3 py-1.5 flex items-start gap-3 ${idx % 2 === 0 ? 'audit-log-row-even bg-slate-50' : 'audit-log-row-odd bg-white'} ${idx < callData.edits.length - 1 ? 'border-b border-slate-100' : ''}`}
                    >
                      {/* Field + Time Change */}
                      <div className="flex items-center gap-2 min-w-[200px]">
                        <span className="font-semibold text-slate-700 w-16">
                          {edit.fieldLabel}:
                        </span>
                        <span className="font-mono text-red-600">{extractTime(edit.oldValue)}</span>
                        <span className="text-slate-400">→</span>
                        <span className="font-mono text-green-600">
                          {extractTime(edit.newValue)}
                        </span>
                      </div>
                      {/* Reason */}
                      <div className="flex-1 text-slate-600 truncate" title={edit.reason}>
                        {edit.reason}
                      </div>
                      {/* Who/When */}
                      <div className="text-slate-400 text-right whitespace-nowrap">
                        {edit.editedByName || edit.editedBy?.split('@')[0]} ·{' '}
                        {formatDateTime(edit.editedAt)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : isManualExclusion ? (
                /* Manual Exclusion Details - compact single line */
                <div className="text-xs px-3 py-1.5 bg-slate-50 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-slate-700">Reason:</span>
                    <span className="text-slate-600 ml-1">{callData.exclusion?.reason || '—'}</span>
                  </div>
                  <div className="text-slate-400">
                    Excluded by: {callData.exclusion?.excludedBy || 'Unknown'} ·{' '}
                    {formatDateTime(callData.exclusion?.excludedAt)}
                  </div>
                </div>
              ) : (
                /* Auto-Exclusion Details - compact format */
                <div className="text-xs px-3 py-1.5 bg-red-50 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-slate-700">Reason:</span>
                    <span className="text-slate-600 ml-1">{callData.exclusion?.reason || 'Auto-excluded by system'}</span>
                  </div>
                  <div className="text-slate-400">
                    {formatDateTime(callData.exclusion?.excludedAt)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CallsPageContent() {
  const searchParams = useSearchParams();
  const parishId = searchParams.get('parish_id');

  const [calls, setCalls] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true); // First load only
  const [refetching, setRefetching] = useState(false); // Subsequent fetches
  const [error, setError] = useState(null);
  const [parishName, setParishName] = useState('');
  const [selectedZone, setSelectedZone] = useState('all');
  const [zones, setZones] = useState([]);
  const [exclusionModal, setExclusionModal] = useState({ open: false, callId: null });
  const [weatherModal, setWeatherModal] = useState({ open: false, callId: null });
  const [exclusionFilter, setExclusionFilter] = useState('all'); // 'all' | 'included' | 'excluded'

  // Editable response time state
  const [editingResponseTime, setEditingResponseTime] = useState(null); // { callId, minutes }
  const [responseTimeOverrides, setResponseTimeOverrides] = useState({}); // { callId: minutes }

  // Audit log state
  const [auditLogData, setAuditLogData] = useState([]);
  const [auditLogLoading, setAuditLogLoading] = useState(false);
  const [autoExclusionAuditData, setAutoExclusionAuditData] = useState([]);
  const [autoExclusionAuditLoading, setAutoExclusionAuditLoading] = useState(false);

  // Active tab state: 'calls' or 'audit'
  const [activeTab, setActiveTab] = useState('calls');

  // Parish settings
  const [parishSettings, setParishSettings] = useState(null);
  const [reportColumns, setReportColumns] = useState(DEFAULT_COLUMNS);
  const [responseStartTime, setResponseStartTime] = useState('dispatched');
  const [complianceThreshold, setComplianceThreshold] = useState(10); // Default 10 minutes (global fallback)
  const [useZones, setUseZones] = useState(true); // Default to zone-based
  const [zoneThresholds, setZoneThresholds] = useState({}); // Map of zone name → threshold in minutes

  // Date range state - initialize as empty, will be set by auto-detect
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [datesInitialized, setDatesInitialized] = useState(false);

  // Parish ID to name mapping
  const parishNames = {
    0: 'Other Areas',
    1: 'Sabine',
    2: 'Vernon',
    3: 'Beauregard',
    4: 'Rapides',
    5: 'Grant',
    6: 'Evangeline',
    7: 'Avoyelles',
    8: 'Concordia',
    20: 'Allen',
  };

  // Auto-detect date range and fetch parish settings on initial load
  useEffect(() => {
    if (!parishId) {
      setError('No parish_id specified');
      setInitialLoading(false);
      return;
    }

    setParishName(parishNames[parseInt(parishId)] || `Parish ${parishId}`);

    // Fetch parish settings
    async function fetchParishSettings() {
      try {
        const res = await fetch(`/api/parish-settings?parish_id=${parishId}`);
        if (res.ok) {
          const data = await res.json();
          setParishSettings(data);
          if (data.reportColumns && data.reportColumns.length > 0) {
            setReportColumns(data.reportColumns);
          }
          if (data.responseStartTime) {
            setResponseStartTime(data.responseStartTime);
          }
          if (data.globalResponseThresholdSeconds) {
            setComplianceThreshold(data.globalResponseThresholdSeconds / 60);
          }
          // Set useZones mode (default true if not specified)
          setUseZones(data.useZones !== false);
        }
      } catch (err) {
        console.error('Failed to fetch parish settings:', err);
      }
    }

    // Fetch zone thresholds from response_area_mappings
    async function fetchZoneThresholds() {
      try {
        const res = await fetch(`/api/response-zones?parish_id=${parishId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.zones && Array.isArray(data.zones)) {
            // Build map of zone name → threshold minutes (parsed as numbers)
            const thresholdMap = {};
            data.zones.forEach(zone => {
              if (zone.zoneName && zone.thresholdMinutes) {
                thresholdMap[zone.zoneName] = parseFloat(zone.thresholdMinutes);
              }
            });
            setZoneThresholds(thresholdMap);
          }
        }
      } catch (err) {
        console.error('Failed to fetch zone thresholds:', err);
      }
    }

    // Initialize date range - prioritize URL params from dashboard, then fallback to previous month
    function initDateRange() {
      // Check URL params first (passed from dashboard View All Calls)
      const urlStart = searchParams.get('start');
      const urlEnd = searchParams.get('end');

      if (urlStart && urlEnd) {
        // Use dates passed from dashboard
        setStartDate(urlStart);
        setEndDate(urlEnd);
        setDatesInitialized(true);
      } else {
        // Fallback to previous month
        const now = new Date();
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        setStartDate(lastMonth.toISOString().split('T')[0]);
        setEndDate(lastMonthEnd.toISOString().split('T')[0]);
        setDatesInitialized(true);
      }
    }

    // Fetch all settings and init dates
    Promise.all([fetchParishSettings(), fetchZoneThresholds()]);
    initDateRange();
  }, [parishId]);

  // Track if this is the first fetch
  const [isFirstFetch, setIsFirstFetch] = useState(true);

  // Fetch calls when dates are ready and change
  useEffect(() => {
    if (!parishId || !datesInitialized || !startDate || !endDate) return;
    fetchCalls(isFirstFetch);
    if (isFirstFetch) setIsFirstFetch(false);
  }, [parishId, startDate, endDate, datesInitialized]);

  // Fetch audit log when dates change (needed for printing even if panel is hidden)
  useEffect(() => {
    if (parishId && startDate && endDate && datesInitialized) {
      fetchAuditLog();
    }
  }, [parishId, startDate, endDate, datesInitialized]);

  async function fetchCalls(isInitial = false) {
    if (isInitial) {
      setInitialLoading(true);
    } else {
      setRefetching(true);
    }
    try {
      const params = new URLSearchParams();
      params.set('parish_id', parishId);
      params.set('limit', '1000');
      if (startDate) params.set('start', startDate);
      if (endDate) params.set('end', endDate);

      const res = await fetch(`/api/calls?${params.toString()}`);

      // Handle non-OK responses
      if (!res.ok) {
        const text = await res.text();
        let errorMsg = `Server error: ${res.status}`;
        try {
          const errData = JSON.parse(text);
          errorMsg = errData.error || errorMsg;
        } catch {
          // Response wasn't JSON
        }
        throw new Error(errorMsg);
      }

      const data = await res.json();
      const allCalls = data.rows || [];
      setCalls(allCalls);

      // Extract unique zones from calls
      const uniqueZones = [...new Set(allCalls.map(c => c.response_area).filter(Boolean))];
      setZones(uniqueZones);

      // For average-only parishes, always use 'all'
      // For zone-based parishes, default to first zone
      if (!useZones) {
        setSelectedZone('all');
      } else if (uniqueZones.length > 0 && selectedZone === 'all') {
        setSelectedZone(uniqueZones[0]);
      }
    } catch (err) {
      console.error('Failed to fetch calls:', err);
      setError(err.message);
    } finally {
      setInitialLoading(false);
      setRefetching(false);
    }
  }

  // Fetch audit log data for the current date range (time edits + all exclusions)
  async function fetchAuditLog() {
    if (!parishId || !startDate || !endDate) return;

    setAuditLogLoading(true);
    setAutoExclusionAuditLoading(true);

    try {
      const params = new URLSearchParams();
      params.set('parish_id', parishId);
      if (startDate) params.set('start', startDate);
      if (endDate) params.set('end', endDate);

      // Fetch both time edits and all exclusions (manual + auto) in parallel
      const [timeEditsRes, exclusionsRes] = await Promise.all([
        fetch(`/api/calls/time-edits?${params.toString()}`),
        fetch(`/api/calls/exclusion-audit?${params.toString()}`),
      ]);

      if (timeEditsRes.ok) {
        const data = await timeEditsRes.json();
        setAuditLogData(data.callEdits || []);
      }

      if (exclusionsRes.ok) {
        const data = await exclusionsRes.json();
        // The new endpoint returns all exclusions (manual + auto)
        setAutoExclusionAuditData(data.exclusions || []);
      }
    } catch (err) {
      console.error('Failed to fetch audit log:', err);
    } finally {
      setAuditLogLoading(false);
      setAutoExclusionAuditLoading(false);
    }
  }

  // Filter calls by zone
  const zoneFilteredCalls = selectedZone === 'all'
    ? calls
    : calls.filter(c => c.response_area === selectedZone);

  // Filter by exclusion status
  const exclusionFilteredCalls = zoneFilteredCalls.filter(c => {
    if (exclusionFilter === 'included') return !c.is_any_excluded;
    if (exclusionFilter === 'excluded') return c.is_any_excluded;
    return true; // 'all'
  });

  // =====================================================================
  // DEDUPLICATION LOGIC: Handle AirMed (AMx) and racing units
  // =====================================================================
  // 1. Filter out AirMed calls (AM1, AM2, AM3, etc.) UNLESS they are racing another unit
  // 2. When multiple units respond to same call (same date + address + call_received),
  //    keep only the one with the fastest response time

  const isAirMedUnit = (radioName) => {
    if (!radioName) return false;
    // Match AM followed by number: AM1, AM2, AM3, AM10, etc.
    return /^AM\d+$/i.test(radioName.trim());
  };

  const deduplicateCalls = (callsList) => {
    // Group calls by unique incident key: date + address + call_received_time
    const callGroups = {};

    callsList.forEach(call => {
      // Create a unique key for the incident
      const date = call.response_date || '';
      const address = (call.origin_address || '').toLowerCase().trim();
      const receivedTime = call.call_in_que_time || '';

      // Normalize key - if any are empty, treat as unique call
      if (!date || !address || !receivedTime) {
        // No grouping key available - unique call
        const uniqueKey = `unique_${call.id}`;
        callGroups[uniqueKey] = [call];
        return;
      }

      const groupKey = `${date}|${address}|${receivedTime}`;

      if (!callGroups[groupKey]) {
        callGroups[groupKey] = [];
      }
      callGroups[groupKey].push(call);
    });

    // Process each group
    const deduped = [];

    Object.values(callGroups).forEach(group => {
      if (group.length === 1) {
        // Single call in group
        const call = group[0];
        // Filter out standalone AirMed calls - they don't count as separate incidents
        if (!isAirMedUnit(call.radio_name)) {
          deduped.push(call);
        }
        // If it's a standalone AM call, it likely means AM was dispatched to a call
        // that a ground unit also responded to but we don't have that record, OR
        // AM transported from scene (which is part of another call)
        return;
      }

      // Multiple calls in group - racing units scenario
      // Pick the one with the fastest response time (first to arrive on scene)
      let bestCall = null;
      let bestResponseMinutes = Infinity;

      group.forEach(call => {
        // Calculate response time for this call
        const responseMinutes = calculateResponseTimeForCall(call);

        if (responseMinutes !== null && responseMinutes < bestResponseMinutes) {
          bestResponseMinutes = responseMinutes;
          bestCall = call;
        } else if (responseMinutes === null && !bestCall) {
          // If we can't calculate response time and have no best yet, use this as fallback
          bestCall = call;
        }
      });

      if (bestCall) {
        deduped.push(bestCall);
      } else if (group.length > 0) {
        // Fallback: just use first non-AirMed call, or first call if all are AirMed
        const nonAirMed = group.find(c => !isAirMedUnit(c.radio_name));
        deduped.push(nonAirMed || group[0]);
      }
    });

    return deduped;
  };

  // Helper to calculate response time for a call (used in deduplication)
  // Formula: On Scene Time - Call in Queue Time = Response Time
  const calculateResponseTimeForCall = (call) => {
    const startTime = parseDateTimeHelper(call.call_in_que_time);
    const onSceneTime = parseDateTimeHelper(call.arrived_at_scene_time);
    if (!startTime || !onSceneTime) return null;
    const diffMs = onSceneTime - startTime;
    return diffMs / 1000 / 60; // Minutes
  };

  // Helper parse function for deduplication
  const parseDateTimeHelper = (dateTimeStr) => {
    if (!dateTimeStr) return null;
    const parts = dateTimeStr.split(' ');
    if (parts.length < 2) return null;
    const [datePart, timePart] = parts;
    const [month, day, year] = datePart.split('/');
    const [hours, minutes, seconds] = timePart.split(':');
    const fullYear = year.length === 2 ? `20${year}` : year;
    return new Date(fullYear, parseInt(month) - 1, parseInt(day), parseInt(hours), parseInt(minutes), parseInt(seconds || 0));
  };

  // Apply deduplication
  const filteredCalls = deduplicateCalls(exclusionFilteredCalls);

  // Only count calls where we made it to the scene (have arrived_at_scene_time)
  const sceneArrivedCalls = filteredCalls.filter(c => c.arrived_at_scene_time);

  // Only Priority 1, 2, 3 count for compliance metrics
  const complianceCalls = sceneArrivedCalls.filter(c => {
    const priority = (c.priority || '').replace(/^0+/, ''); // Remove leading zeros
    return ['1', '2', '3'].includes(priority);
  });

  // Calculate stats - only using Priority 1-3 calls that arrived at scene
  const totalCalls = complianceCalls.length;
  const excludedCalls = complianceCalls.filter(c => c.is_excluded).length;
  const activeCalls = complianceCalls.filter(c => !c.is_excluded);

  // Parse datetime string like "10/31/25 21:45:51" to Date object
  const parseDateTime = (dateTimeStr) => {
    if (!dateTimeStr) return null;
    // Format: "MM/DD/YY HH:MM:SS"
    const parts = dateTimeStr.split(' ');
    if (parts.length < 2) return null;
    const [datePart, timePart] = parts;
    const [month, day, year] = datePart.split('/');
    const [hours, minutes, seconds] = timePart.split(':');
    // Assume 20xx for 2-digit years
    const fullYear = year.length === 2 ? `20${year}` : year;
    return new Date(fullYear, parseInt(month) - 1, parseInt(day), parseInt(hours), parseInt(minutes), parseInt(seconds || 0));
  };

  // Calculate response time in minutes
  // Formula: On Scene Time - Call in Queue Time = Response Time
  // Uses override if set for this call
  const calculateResponseTime = (call) => {
    // Check for override first
    if (responseTimeOverrides[call.id] !== undefined) {
      return responseTimeOverrides[call.id];
    }
    const startTime = parseDateTime(call.call_in_que_time);
    const onSceneTime = parseDateTime(call.arrived_at_scene_time);
    if (!startTime || !onSceneTime) return null;
    const diffMs = onSceneTime - startTime;
    return diffMs / 1000 / 60; // Convert to minutes
  };

  // Format response time as MM:SS
  const formatResponseTime = (minutes) => {
    if (minutes === null || minutes === undefined) return '—';
    const mins = Math.floor(minutes);
    const secs = Math.round((minutes - mins) * 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Parse MM:SS format to minutes
  const parseResponseTimeInput = (value) => {
    if (!value) return null;
    const match = value.match(/^(\d+):(\d{1,2})$/);
    if (match) {
      const mins = parseInt(match[1], 10);
      const secs = parseInt(match[2], 10);
      return mins + (secs / 60);
    }
    // Try parsing as just minutes
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
  };

  // Handle response time edit
  const handleResponseTimeEdit = (callId, currentMinutes) => {
    setEditingResponseTime({ callId, value: formatResponseTime(currentMinutes) });
  };

  // Save edited response time
  const saveResponseTime = (callId, newValue) => {
    const minutes = parseResponseTimeInput(newValue);
    if (minutes !== null) {
      setResponseTimeOverrides(prev => ({ ...prev, [callId]: minutes }));
    }
    setEditingResponseTime(null);
  };

  // Adjust response time by seconds (up/down arrows)
  const adjustResponseTime = (callId, currentMinutes, deltaSeconds) => {
    const newMinutes = Math.max(0, currentMinutes + (deltaSeconds / 60));
    setResponseTimeOverrides(prev => ({ ...prev, [callId]: newMinutes }));
  };

  // Parse time from datetime string like "10/31/25 21:45:51" to just "21:45:51"
  const parseTimeOnly = (dateTimeStr) => {
    if (!dateTimeStr) return '—';
    const parts = dateTimeStr.split(' ');
    return parts.length > 1 ? parts[1] : dateTimeStr;
  };

  // Parse call number from response number (e.g., "10312025-1977" -> "1977")
  const parseCallNumber = (responseNumber) => {
    if (!responseNumber) return '—';
    const parts = responseNumber.split('-');
    return parts.length > 1 ? parts[1] : responseNumber;
  };

  // Normalize zone name for matching (handle "5mi" vs "5min" etc.)
  const normalizeZoneName = (name) => {
    if (!name) return '';
    return name
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      // Normalize "5mi" to "5min", "8mi" to "8min" etc.
      .replace(/(\d+)\s*mi\b/gi, '$1min')
      .replace(/(\d+)\s*min\b/gi, '$1min');
  };

  // Get the compliance threshold for a call based on its zone
  const getThresholdForCall = (call) => {
    const zoneName = call.response_area;
    if (!zoneName) return complianceThreshold;

    // Try exact match first
    if (zoneThresholds[zoneName] !== undefined && zoneThresholds[zoneName] !== null) {
      return zoneThresholds[zoneName];
    }

    // Try normalized matching
    const normalizedCallZone = normalizeZoneName(zoneName);
    for (const [configuredZone, threshold] of Object.entries(zoneThresholds)) {
      if (threshold !== null && normalizeZoneName(configuredZone) === normalizedCallZone) {
        return threshold;
      }
    }

    // Fallback to global threshold
    return complianceThreshold;
  };

  // Check if a call is compliant based on its zone-specific threshold
  // Threshold of X minutes means X:59 (e.g., 8 min threshold = compliant up to 8:59)
  const isCallCompliant = (call) => {
    const mins = calculateResponseTime(call);
    if (mins === null) return null;
    const thresholdMinutes = getThresholdForCall(call);
    // Add 59 seconds (0.9833 minutes) to the threshold
    // So a 10-minute threshold means compliant up to 10:59
    const thresholdWithSeconds = thresholdMinutes + (59 / 60);
    return mins <= thresholdWithSeconds;
  };

  // Use zone-specific thresholds for compliance calculation
  const compliantCalls = activeCalls.filter(c => {
    return isCallCompliant(c) === true;
  }).length;
  const nonCompliantCalls = activeCalls.length - compliantCalls;
  const compliancePercent = activeCalls.length > 0
    ? ((compliantCalls / activeCalls.length) * 100).toFixed(1)
    : '0.0';

  // Calculate average response time (returns MM:SS format)
  const avgResponseTime = (() => {
    const validTimes = activeCalls
      .map(c => calculateResponseTime(c))
      .filter(t => t !== null);
    if (validTimes.length === 0) return '—';
    const avgMinutes = validTimes.reduce((sum, t) => sum + t, 0) / validTimes.length;
    // Format as MM:SS
    const mins = Math.floor(avgMinutes);
    const secs = Math.round((avgMinutes - mins) * 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  })();

  // Call breakdown by type
  // =====================================================================
  // BREAKDOWN LOGIC:
  // - Total Calls: Priority 1-3 calls that made it to scene
  // - Transports: Calls transported to hospital (on scene required)
  // - Refusals: Calls with "REF-Patient(s) Refuse Service" (on scene required)
  // - Other: Total - Transports - Refusals (neither transported nor refusal)
  // - Transport % = Transports / Total Calls
  // - Refusal % = Refusals / Total Calls
  // =====================================================================
  const getCallBreakdown = () => {
    const breakdown = {
      totalCalls: 0,    // Priority 1-3 calls that made it to scene
      transports: 0,    // Calls transported to hospital
      refusals: 0,      // Calls with refusal
      other: 0,         // Neither transported nor refusal
    };

    filteredCalls.forEach(call => {
      const priority = (call.priority || '').replace(/^0+/, ''); // Remove leading zeros
      const isPriority123 = ['1', '2', '3'].includes(priority);

      // Only count Priority 1-3 calls that made it on scene
      if (!isPriority123 || !call.arrived_at_scene_time) {
        return;
      }

      breakdown.totalCalls++;

      const cancelReason = (call.master_incident_cancel_reason || '').trim();
      const cancelReasonLower = cancelReason.toLowerCase();
      const isTransport = call.cad_is_transport === 'Y';

      // Check for Refusals - "REF-Patient(s) Refuse Service"
      if (cancelReason.includes('REF-Patient') || cancelReasonLower.includes('refuse service')) {
        breakdown.refusals++;
      } else if (isTransport) {
        // Transported to hospital
        breakdown.transports++;
      } else {
        // Other - neither transported nor refusal
        breakdown.other++;
      }
    });

    return breakdown;
  };

  const breakdown = getCallBreakdown();
  // Transfer % = Transports / Total Calls
  const transferPct = breakdown.totalCalls > 0
    ? ((breakdown.transports / breakdown.totalCalls) * 100).toFixed(1)
    : '0.0';
  // Refusal % = Refusals / Total Calls
  const refusalPct = breakdown.totalCalls > 0
    ? ((breakdown.refusals / breakdown.totalCalls) * 100).toFixed(1)
    : '0.0';

  // Calculate stats for each zone (used when "All Zones" is selected for zone-based parishes)
  const getZoneStats = (zoneCalls) => {
    const zoneActiveCalls = zoneCalls.filter(c => !c.exclusion_reason);
    // Use zone-specific thresholds for each call
    const zoneCompliant = zoneActiveCalls.filter(c => {
      return isCallCompliant(c) === true;
    }).length;
    const zoneNonCompliant = zoneActiveCalls.length - zoneCompliant;
    const zoneCompliancePct = zoneActiveCalls.length > 0
      ? ((zoneCompliant / zoneActiveCalls.length) * 100).toFixed(1)
      : '0.0';
    const validTimes = zoneActiveCalls
      .map(c => calculateResponseTime(c))
      .filter(t => t !== null);
    const zoneAvgTime = validTimes.length > 0
      ? (validTimes.reduce((sum, t) => sum + t, 0) / validTimes.length).toFixed(1) + ' min'
      : '—';
    const zoneExcluded = zoneCalls.filter(c => c.exclusion_reason).length;
    return {
      total: zoneActiveCalls.length,
      compliant: zoneCompliant,
      nonCompliant: zoneNonCompliant,
      compliancePct: zoneCompliancePct,
      avgTime: zoneAvgTime,
      excluded: zoneExcluded
    };
  };

  // Get all zone stats for stacked display
  const allZoneStats = zones.map(zone => {
    const zoneCalls = complianceCalls.filter(c => c.response_area === zone);
    return { zone, ...getZoneStats(zoneCalls) };
  });

  // Sort calls by zone then date for "All Zones" view
  const sortedCallsForAllZones = [...complianceCalls].sort((a, b) => {
    // First sort by zone
    const zoneA = a.response_area || '';
    const zoneB = b.response_area || '';
    if (zoneA !== zoneB) return zoneA.localeCompare(zoneB);
    // Then by date/time
    const dateA = a.response_date || '';
    const dateB = b.response_date || '';
    return dateA.localeCompare(dateB);
  });

  // Handle exclusion
  const handleExclude = async (callId, reason) => {
    try {
      const res = await fetch('/api/calls/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId, is_excluded: true, exclusion_reason: reason }),
      });
      if (res.ok) {
        setCalls(calls.map(c =>
          c.id === callId ? { ...c, is_excluded: true, exclusion_reason: reason } : c
        ));
      }
    } catch (err) {
      console.error('Failed to exclude call:', err);
    }
  };

  // Handle confirm
  const handleConfirm = async (callId) => {
    try {
      const res = await fetch('/api/calls/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId, is_confirmed: true }),
      });
      if (res.ok) {
        setCalls(calls.map(c =>
          c.id === callId ? { ...c, is_confirmed: true } : c
        ));
      }
    } catch (err) {
      console.error('Failed to confirm call:', err);
    }
  };

  const isOther = parishId === '0';
  const userName = 'Current User'; // TODO: Get from auth
  const generatedDate = new Date().toLocaleString();

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-[#004437] border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-500">Loading compliance data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="bg-red-100 border border-red-300 text-red-700 px-6 py-4 rounded-lg">
          {error}
        </div>
      </div>
    );
  }

  // Build the print title with zone if selected
  const printTitle = selectedZone !== 'all'
    ? `${isOther ? 'Other Areas' : parishName} Parish - ${formatZoneName(selectedZone)}`
    : `${isOther ? 'Other Areas' : parishName} Parish Compliance Report`;

  return (
    <div className="h-screen flex flex-col bg-slate-100 text-slate-900 overflow-hidden print:bg-white print:overflow-visible">
      {/* Print-only header - shows Acadian logo on printed reports */}
      <div className="hidden print:flex items-center gap-4 p-4 border-b border-slate-200 mb-4">
        <img
          src="/Images/Acadian_no_background.png"
          alt="Acadian Ambulance"
          className="h-20 w-auto object-contain"
        />
        <div className="h-12 w-px bg-slate-300" />
        <div>
          <h1 className="text-2xl font-bold text-[#004437]">
            {printTitle}
          </h1>
          <div className="flex gap-6 text-sm text-slate-500 mt-1">
            <span>Date Range: {startDate} to {endDate}</span>
            <span>Generated: {generatedDate}</span>
          </div>
        </div>
      </div>

      {/* Header - matches dashboard style (hidden when printing) */}
      <header className="w-full bg-white border-b border-slate-200 shadow-sm print:hidden flex-shrink-0">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          {/* Left side - Logo and Title */}
          <div className="flex items-center gap-4">
            <img
              src="/Images/Acadian_no_background.png"
              alt="Acadian Ambulance"
              className="h-16 w-auto object-contain"
            />
            <div className="h-10 w-px bg-slate-300" />
            <div className="flex flex-col">
              <span className="text-xl font-bold text-[#004437]">
                {isOther ? 'Other Areas' : parishName} Compliance Report
              </span>
              <div className="flex items-center gap-4 text-xs text-slate-500 mt-0.5">
                <span>Generated: {generatedDate}</span>
                {refetching && (
                  <span className="flex items-center gap-1 text-[#004437]">
                    <span className="animate-spin w-3 h-3 border-2 border-[#004437] border-t-transparent rounded-full" />
                    Updating...
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right side - Controls */}
          <div className="flex items-center gap-3 print:hidden">
            {/* Date Range */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent border-none text-sm text-slate-700 focus:outline-none w-28"
              />
              <span className="text-slate-400">–</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent border-none text-sm text-slate-700 focus:outline-none w-28"
              />
            </div>

            {/* Print Button */}
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#004437] text-white text-sm font-medium rounded-lg hover:bg-[#003329] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print
            </button>

            {/* Back Button */}
            <a
              href="/AcadianDashboard"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back
            </a>
          </div>
        </div>
      </header>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto print:overflow-visible">

      <div className="max-w-7xl mx-auto p-6 print:p-2">
        {/* When "All Zones" selected AND zones exist: Show stacked zone summaries */}
        {selectedZone === 'all' && allZoneStats.length > 0 ? (
          <div className="space-y-4 print:space-y-1 mb-6 print:mb-2">
            {allZoneStats.map((zs, idx) => (
              <div key={zs.zone} className={`bg-white rounded-xl p-6 print:p-2 shadow-sm border border-slate-200 ${idx === allZoneStats.length - 1 ? 'print:break-after-page' : ''}`}>
                <h2 className="text-lg print:text-sm font-semibold text-slate-700 mb-4 print:mb-1">{formatZoneName(zs.zone)}</h2>
                <div className="flex items-center gap-8 print:gap-2">
                  <div className="flex flex-col items-center gap-4 print:gap-1">
                    <ComplianceGauge percentage={zs.compliancePct} />
                    {/* Zone Dropdown under gauge - only on first zone block */}
                    {idx === 0 && !isOther && zones.length > 0 && (
                      <select
                        value={selectedZone}
                        onChange={(e) => setSelectedZone(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm text-slate-700 focus:outline-none focus:border-[#004437] w-full max-w-[200px] print:hidden"
                      >
                        <option value="all">All Response Zones</option>
                        {zones.map(zone => (
                          <option key={zone} value={zone}>{formatZoneName(zone)}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="flex-1 grid grid-cols-3 gap-4 print:gap-1 print:grid-cols-5">
                    <StatCard label="Total Calls" value={zs.total} accent />
                    <StatCard label="Compliant Calls" value={zs.compliant} accent />
                    <StatCard label="Avg Response Time" value={zs.avgTime} accent />
                    <StatCard label="Non-Compliant" value={zs.nonCompliant} />
                    <StatCard label="Exceptions Applied" value={zs.excluded} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Single Zone View (no zones exist OR specific zone selected) */
          <div className="bg-white rounded-xl p-6 mb-6 shadow-sm border border-slate-200 print:break-after-page">
            <h2 className="text-lg font-semibold text-slate-700 mb-4">
              {/* Title: Show zone name, or "Average Response Time" if no zones */}
              {zones.length > 0 ? formatZoneName(selectedZone) : 'Average Response Time'}
            </h2>
            <div className="flex items-center gap-8">
              <div className="flex flex-col items-center gap-4">
                <ComplianceGauge percentage={compliancePercent} />
                {/* Zone Dropdown under gauge - show if zones exist */}
                {!isOther && zones.length > 0 && (
                  <select
                    value={selectedZone}
                    onChange={(e) => setSelectedZone(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm text-slate-700 focus:outline-none focus:border-[#004437] w-full max-w-[200px] print:hidden"
                  >
                    <option value="all">All Response Zones</option>
                    {zones.map(zone => (
                      <option key={zone} value={zone}>{formatZoneName(zone)}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex-1 grid grid-cols-3 gap-4">
                <StatCard label="Total Calls" value={totalCalls} accent />
                <StatCard label="Compliant Calls" value={compliantCalls} accent />
                <StatCard label="Avg Response Time" value={avgResponseTime} accent />
                <StatCard label="Non-Compliant" value={nonCompliantCalls} />
                <StatCard label="Exceptions Applied" value={excludedCalls} />
              </div>
            </div>
          </div>
        )}

        {/* Call Breakdown */}
        <div className="bg-white rounded-xl p-6 mb-6 shadow-sm border border-slate-200 print:hidden">
          <h2 className="text-lg font-semibold text-slate-700 mb-5">Call Breakdown</h2>
          <div className="grid grid-cols-6 gap-3">
            <BreakdownItem label="Total Calls" value={breakdown.totalCalls} highlight />
            <BreakdownItem label="Transports" value={breakdown.transports} />
            <BreakdownItem label="Refusals" value={breakdown.refusals} />
            <BreakdownItem label="Other" value={breakdown.other} />
            <BreakdownItem label="Transport %" value={transferPct} isPercentage highlight />
            <BreakdownItem label="Refusal %" value={refusalPct} isPercentage />
          </div>
        </div>

        {/* Calls Table / Audit Log - Folder Tab Navigation */}
        <div className="print:shadow-none print:border-0">
          {/* Folder Tabs */}
          <div className="flex items-end print:hidden">
            {/* Call Details Tab */}
            <button
              onClick={() => setActiveTab('calls')}
              className={`relative px-6 py-3 font-semibold text-sm rounded-t-lg transition-all border-t-2 border-l border-r ${
                activeTab === 'calls'
                  ? 'bg-slate-50 text-slate-800 border-t-[#004437] border-l-slate-300 border-r-slate-300 z-10 -mb-px shadow-md'
                  : 'bg-slate-300 text-slate-600 hover:bg-slate-200 hover:text-slate-700 border-t-slate-400 border-l-slate-400 border-r-slate-400 -mb-px mr-[-1px]'
              }`}
              style={activeTab === 'calls' ? {} : { transform: 'translateY(3px)' }}
            >
              Call Details (Priority 1-3)
              {selectedZone === 'all' && zones.length > 0 ? ' - All Zones' : ''}
              <span
                className={`ml-2 text-xs font-normal ${activeTab === 'calls' ? 'text-slate-500' : 'text-slate-500'}`}
              >
                {complianceCalls.length}
              </span>
            </button>

            {/* Audit Log Tab */}
            <button
              onClick={() => setActiveTab('audit')}
              className={`relative px-6 py-3 font-semibold text-sm rounded-t-lg transition-all border-t-2 border-l border-r ${
                activeTab === 'audit'
                  ? 'bg-slate-50 text-slate-800 border-t-[#004437] border-l-slate-300 border-r-slate-300 z-10 -mb-px shadow-md'
                  : 'bg-slate-300 text-slate-600 hover:bg-slate-200 hover:text-slate-700 border-t-slate-400 border-l-slate-400 border-r-slate-400 -mb-px mr-[-1px]'
              }`}
              style={activeTab === 'audit' ? {} : { transform: 'translateY(3px)' }}
            >
              Audit Log
              {(auditLogData.length > 0 || autoExclusionAuditData.length > 0) && (
                <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white">
                  {auditLogData.length + autoExclusionAuditData.length}
                </span>
              )}
            </button>

            {/* Spacer to fill rest of tab bar */}
            <div className="flex-1 border-b border-slate-300 -mb-px"></div>
          </div>

          {/* Print-only header */}
          <div className="hidden print:block px-6 py-2 border-b border-slate-200 bg-white">
            <h2 className="text-base font-semibold text-slate-800">
              Call Details (Priority 1-3){selectedZone === 'all' && zones.length > 0 ? ' - All Response Zones' : ''}
            </h2>
          </div>

          {/* Call Details Tab Content */}
          <div className={`${activeTab === 'calls' ? '' : 'hidden'} print:block bg-white rounded-xl overflow-hidden shadow-sm border border-slate-200 print:shadow-none print:border-0`}>
          <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:py-2 print:hidden">
            <h2 className="text-lg font-semibold text-slate-700 print:text-base">
              Call Details (Priority 1-3){selectedZone === 'all' && zones.length > 0 ? ' - All Response Zones' : ''}
            </h2>
            <div className="flex items-center gap-3 print:hidden">
              {/* Exclusion Filter Toggle */}
              <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg">
                <button
                  onClick={() => setExclusionFilter('all')}
                  className={`px-3 py-1 text-xs rounded-md transition-all ${
                    exclusionFilter === 'all'
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setExclusionFilter('included')}
                  className={`px-3 py-1 text-xs rounded-md transition-all ${
                    exclusionFilter === 'included'
                      ? 'bg-white text-green-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  Included
                </button>
                <button
                  onClick={() => setExclusionFilter('excluded')}
                  className={`px-3 py-1 text-xs rounded-md transition-all ${
                    exclusionFilter === 'excluded'
                      ? 'bg-white text-amber-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  Excluded
                </button>
              </div>
              <span className="text-sm text-slate-500">{complianceCalls.length} calls</span>
            </div>
            <span className="text-sm text-slate-500 hidden print:block print:font-bold print:text-slate-800">{complianceCalls.length} calls</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs calls-table">
              <thead className="bg-slate-50 print:bg-slate-100">
                <tr>
                  {reportColumns.map(colId => {
                    const col = ALL_COLUMNS[colId];
                    if (!col) return null;
                    return (
                      <th key={colId} className="px-1 py-1 text-left font-semibold text-slate-700 whitespace-nowrap">
                        {col.label}
                      </th>
                    );
                  })}
                  <th className="px-1 py-1 text-left font-semibold text-slate-700 print:hidden">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(selectedZone === 'all' && zones.length > 0 ? sortedCallsForAllZones : complianceCalls).map((call) => {
                  const responseMinutes = calculateResponseTime(call);
                  // Use zone-specific threshold for compliance check
                  const callCompliant = isCallCompliant(call);
                  const isNonCompliant = callCompliant === false;
                  const isExcluded = call.is_excluded;
                  const isConfirmed = call.is_confirmed;

                  return (
                    <tr
                      key={call.id}
                      className={`
                        ${isNonCompliant ? 'bg-red-50 print:bg-red-50' : ''}
                        ${isExcluded ? 'opacity-60' : ''}
                        hover:bg-slate-50
                      `}
                    >
                      {reportColumns.map(colId => {
                        const col = ALL_COLUMNS[colId];
                        if (!col) return null;

                        // Special handling for response time column - editable
                        if (col.isResponseTime) {
                          const isEditing = editingResponseTime?.callId === call.id;
                          const hasOverride = responseTimeOverrides[call.id] !== undefined;

                          return (
                            <td key={colId} className={`px-1 py-0.5 font-semibold whitespace-nowrap ${isNonCompliant ? 'text-red-600' : 'text-green-600'} print:pointer-events-none`}>
                              {isEditing ? (
                                <div className="flex items-center gap-0.5">
                                  <input
                                    type="text"
                                    defaultValue={editingResponseTime.value}
                                    className="w-14 px-1 py-0 text-xs border border-slate-300 rounded text-center"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        saveResponseTime(call.id, e.target.value);
                                      } else if (e.key === 'Escape') {
                                        setEditingResponseTime(null);
                                      }
                                    }}
                                    onBlur={(e) => saveResponseTime(call.id, e.target.value)}
                                  />
                                </div>
                              ) : (
                                <div className="flex items-center gap-0.5 group/resp cursor-pointer print:cursor-default">
                                  <span
                                    onClick={() => handleResponseTimeEdit(call.id, responseMinutes)}
                                    className={`${hasOverride ? 'underline decoration-dotted' : ''}`}
                                    title={hasOverride ? 'Modified (click to edit)' : 'Click to edit'}
                                  >
                                    {formatResponseTime(responseMinutes)}
                                  </span>
                                  <div className="flex flex-col opacity-0 group-hover/resp:opacity-100 transition-opacity print:hidden">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); adjustResponseTime(call.id, responseMinutes, -1); }}
                                      className="text-[8px] leading-none text-slate-400 hover:text-slate-600"
                                      title="Decrease 1 second"
                                    >▲</button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); adjustResponseTime(call.id, responseMinutes, 1); }}
                                      className="text-[8px] leading-none text-slate-400 hover:text-slate-600"
                                      title="Increase 1 second"
                                    >▼</button>
                                  </div>
                                </div>
                              )}
                            </td>
                          );
                        }

                        // Special handling for status column
                        if (col.isStatus) {
                          return (
                            <td key={colId} className="px-1 py-0.5 whitespace-nowrap">
                              {isNonCompliant && (
                                <>
                                  {isExcluded ? (
                                    <span className="px-1 py-0.5 bg-slate-200 border border-slate-400 text-red-600 text-[9px] rounded font-medium">
                                      Excl
                                    </span>
                                  ) : isConfirmed ? (
                                    <span className="px-1 py-0.5 bg-yellow-100 border border-yellow-400 text-red-600 text-[9px] rounded font-medium">
                                      Conf
                                    </span>
                                  ) : null}
                                </>
                              )}
                            </td>
                          );
                        }

                        // Exclusion status column
                        if (col.isExclusionStatus) {
                          return (
                            <td key={colId} className="px-1 py-0.5 whitespace-nowrap">
                              {call.is_any_excluded ? (
                                call.is_weather_excluded ? (
                                  <button
                                    onClick={() => setWeatherModal({ open: true, callId: call.id })}
                                    className="px-2 py-0.5 text-[9px] rounded-full bg-blue-100 text-blue-800 border border-blue-300 hover:bg-blue-200 cursor-pointer"
                                    title="Click to view weather alert details"
                                  >
                                    Weather ⓘ
                                  </button>
                                ) : (
                                  <span
                                    className="px-2 py-0.5 text-[9px] rounded-full bg-amber-100 text-amber-800 border border-amber-300"
                                    title={call.exclusion_reason ?? "Excluded"}
                                  >
                                    Excluded
                                  </span>
                                )
                              ) : (
                                <span className="px-2 py-0.5 text-[9px] rounded-full bg-green-100 text-green-800 border border-green-300">
                                  Included
                                </span>
                              )}
                            </td>
                          );
                        }

                        // Regular columns
                        const value = col.getValue(call, parseTimeOnly, parseCallNumber);
                        // For address column, add title tooltip with full address
                        const titleAttr = col.title ? { title: call.origin_address || '' } : {};
                        return (
                          <td key={colId} className={`px-1 py-0.5 whitespace-nowrap ${col.className || 'text-slate-700'}`} {...titleAttr}>
                            {value}
                          </td>
                        );
                      })}
                      <td className="px-1 py-0.5 print:hidden">
                        {isNonCompliant && !isExcluded && !isConfirmed && (
                          <div className="flex gap-0.5">
                            <button
                              onClick={() => setExclusionModal({ open: true, callId: call.id })}
                              className="px-1.5 py-0.5 bg-red-600 text-white text-[9px] rounded hover:bg-red-500"
                            >
                              Excl
                            </button>
                            <button
                              onClick={() => handleConfirm(call.id)}
                              className="px-1.5 py-0.5 bg-[#004437] text-white text-[9px] rounded hover:bg-[#003329]"
                            >
                              Conf
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        </div> {/* End Call Details Tab Content */}

        {/* Audit Log Tab Content */}
        <div className={`${activeTab === 'audit' ? '' : 'hidden'} print:block`}>
          {auditLogLoading || autoExclusionAuditLoading ? (
            <div className="p-8 text-center text-slate-500">Loading audit log...</div>
          ) : auditLogData.length > 0 || autoExclusionAuditData.length > 0 ? (
            <AuditLogPanel
              callEdits={auditLogData}
              autoExclusions={autoExclusionAuditData}
              isOpen={true}
            />
          ) : (
            <div className="p-8 text-center text-slate-500">
              <svg
                className="w-12 h-12 mx-auto mb-3 text-slate-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <p className="text-sm">No audit log entries for this date range</p>
            </div>
          )}
        </div>
        </div> {/* End tab container */}
      </div>
      </div> {/* End scrollable content area */}

      {/* Exclusion Modal */}
      <ExclusionModal
        isOpen={exclusionModal.open}
        callId={exclusionModal.callId}
        onClose={() => setExclusionModal({ open: false, callId: null })}
        onExclude={handleExclude}
      />

      {/* Weather Exclusion Details Modal */}
      <WeatherExclusionModal
        isOpen={weatherModal.open}
        callId={weatherModal.callId}
        onClose={() => setWeatherModal({ open: false, callId: null })}
      />
    </div>
  );
}

export default function CallsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="animate-spin w-12 h-12 border-4 border-[#004437] border-t-transparent rounded-full" />
      </div>
    }>
      <CallsPageContent />
    </Suspense>
  );
}

