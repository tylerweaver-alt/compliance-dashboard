'use client';

import { useEffect, useState } from 'react';

// Complete list of all available report columns from CSV upload
const ALL_REPORT_COLUMNS = [
  // Core identifiers
  { id: 'response_number', label: 'Response Number', category: 'Core' },
  { id: 'response_date', label: 'Response Date', category: 'Core' },
  { id: 'response_date_time', label: 'Response Date/Time', category: 'Core' },
  { id: 'radio_name', label: 'Radio Name', category: 'Core' },
  { id: 'response_area', label: 'Response Area', category: 'Core' },
  { id: 'priority', label: 'Priority', category: 'Core' },

  // Origin information
  { id: 'origin_description', label: 'Origin Description', category: 'Origin' },
  { id: 'origin_address', label: 'Origin Address', category: 'Origin' },
  { id: 'origin_location_city', label: 'Origin City', category: 'Origin' },
  { id: 'origin_zip', label: 'Origin Zip', category: 'Origin' },
  { id: 'origin_latitude', label: 'Origin Latitude', category: 'Origin' },
  { id: 'origin_longitude', label: 'Origin Longitude', category: 'Origin' },

  // Destination information
  { id: 'destination_description', label: 'Destination Description', category: 'Destination' },
  { id: 'destination_address', label: 'Destination Address', category: 'Destination' },
  { id: 'destination_location_city', label: 'Destination City', category: 'Destination' },
  { id: 'destination_zip', label: 'Destination Zip', category: 'Destination' },

  // Call details
  { id: 'caller_type', label: 'Caller Type', category: 'Call Details' },
  { id: 'problem_description', label: 'Problem Description', category: 'Call Details' },
  { id: 'transport_mode', label: 'Transport Mode', category: 'Call Details' },
  { id: 'cad_is_transport', label: 'Is Transport', category: 'Call Details' },
  { id: 'master_incident_cancel_reason', label: 'Cancel Reason', category: 'Call Details' },
  { id: 'master_incident_delay_reason_description', label: 'Delay Reason', category: 'Call Details' },
  { id: 'vehicle_assigned_delay_reason', label: 'Vehicle Delay Reason', category: 'Call Details' },

  // Timestamps
  { id: 'call_in_que_time', label: 'Call In Queue Time', category: 'Timestamps' },
  { id: 'call_taking_complete_time', label: 'Call Taking Complete', category: 'Timestamps' },
  { id: 'assigned_time_first_unit', label: 'Assigned Time (First Unit)', category: 'Timestamps' },
  { id: 'assigned_time', label: 'Assigned Time (Dispatched)', category: 'Timestamps' },
  { id: 'enroute_time', label: 'Enroute Time', category: 'Timestamps' },
  { id: 'staged_time', label: 'Staged Time', category: 'Timestamps' },
  { id: 'arrived_at_scene_time', label: 'Arrived at Scene Time', category: 'Timestamps' },
  { id: 'depart_scene_time', label: 'Depart Scene Time', category: 'Timestamps' },
  { id: 'arrived_destination_time', label: 'Arrived Destination Time', category: 'Timestamps' },
  { id: 'call_cleared_time', label: 'Call Cleared Time', category: 'Timestamps' },

  // Calculated response times
  { id: 'queue_response_time', label: 'Queue Response Time', category: 'Response Times' },
  { id: 'assigned_response_time', label: 'Assigned Response Time', category: 'Response Times' },
  { id: 'enroute_response_time', label: 'Enroute Response Time', category: 'Response Times' },
  { id: 'assigned_to_arrived_at_scene', label: 'Assigned to Arrived', category: 'Response Times' },
  { id: 'call_in_queue_to_cleared_call_lag', label: 'Queue to Cleared Lag', category: 'Response Times' },
  { id: 'compliance_time', label: 'Compliance Time', category: 'Response Times' },

  // Custom/calculated
  { id: 'response', label: 'Response Time (Calculated)', category: 'Custom' },
  { id: 'status', label: 'Compliance Status', category: 'Custom' },
];

// Response start time options
const RESPONSE_START_OPTIONS = [
  { id: 'dispatched', label: 'Dispatched (assigned_time)' },
  { id: 'received', label: 'Received (call_in_que_time)' },
  { id: 'enroute', label: 'Enroute (enroute_time)' },
];

interface ResponseZone {
  id: number;
  parishId: number;
  zoneName: string;
  thresholdMinutes: number | null;
  locations: string[];
}

interface ParishSettings {
  parishId: number;
  globalResponseThresholdSeconds: number | null;
  targetAverageResponseSeconds: number | null;
  useZones: boolean;
  exceptionKeywords: string[];
  reportColumns: string[];
  responseStartTime: string;
}

interface ParishSettingsModalProps {
  parishId: number | null;
  parishName: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (settings: ParishSettings) => void;
  embedded?: boolean; // When true, renders without modal wrapper (for use in ParishSettingsManager)
}

type TabType = 'general' | 'columns' | 'exclusions' | 'zones';

const ParishSettingsModal = ({
  parishId,
  parishName,
  isOpen,
  onClose,
  onSaved,
  embedded = false,
}: ParishSettingsModalProps) => {
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // General settings
  const [thresholdMinutes, setThresholdMinutes] = useState<string>('');
  const [targetAvgMinutes, setTargetAvgMinutes] = useState<string>('');
  const [useZones, setUseZones] = useState<boolean>(false);
  const [responseStartTime, setResponseStartTime] = useState<string>('dispatched');

  // Report columns
  const [reportColumns, setReportColumns] = useState<string[]>([]);

  // Exclusion criteria
  const [exceptionKeywords, setExceptionKeywords] = useState<string[]>([]);
  const [newExceptionInput, setNewExceptionInput] = useState<string>('');

  // Response zones
  const [zones, setZones] = useState<ResponseZone[]>([]);
  const [editingZone, setEditingZone] = useState<ResponseZone | null>(null);
  const [newZoneName, setNewZoneName] = useState<string>('');
  const [newZoneThreshold, setNewZoneThreshold] = useState<string>('');
  const [newLocationInput, setNewLocationInput] = useState<string>('');
  const [unassignedLocations, setUnassignedLocations] = useState<string[]>([]);
  const [assigningLocation, setAssigningLocation] = useState<string | null>(null);

  // Load settings and zones
  useEffect(() => {
    if (!isOpen || !parishId) return;

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    // Fetch parish settings
    const fetchSettings = fetch(`/api/parish-settings?parish_id=${parishId}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load settings');

        setThresholdMinutes(
          data.globalResponseThresholdSeconds != null
            ? Math.round(data.globalResponseThresholdSeconds / 60).toString()
            : ''
        );
        setTargetAvgMinutes(
          data.targetAverageResponseSeconds != null
            ? Math.round(data.targetAverageResponseSeconds / 60).toString()
            : ''
        );
        setUseZones(!!data.useZones);
        setExceptionKeywords(data.exceptionKeywords || []);
        setReportColumns(data.reportColumns || []);
        setResponseStartTime(data.responseStartTime || 'dispatched');
      });

    // Fetch response zones (includes unassigned locations)
    const fetchZones = fetch(`/api/response-zones?parish_id=${parishId}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load zones');
        setZones(data.zones || []);
        setUnassignedLocations(data.unassignedLocations || []);
      });

    Promise.all([fetchSettings, fetchZones])
      .catch((err) => {
        console.error('Error loading parish settings:', err);
        setError(err.message || 'Error loading parish settings');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, parishId]);

  if (!isOpen || !parishId) return null;

  // Column management
  function toggleColumn(columnId: string) {
    setReportColumns(prev =>
      prev.includes(columnId)
        ? prev.filter(c => c !== columnId)
        : [...prev, columnId]
    );
  }

  function moveColumnUp(index: number) {
    if (index === 0) return;
    setReportColumns(prev => {
      const newCols = [...prev];
      [newCols[index - 1], newCols[index]] = [newCols[index], newCols[index - 1]];
      return newCols;
    });
  }

  function moveColumnDown(index: number) {
    if (index >= reportColumns.length - 1) return;
    setReportColumns(prev => {
      const newCols = [...prev];
      [newCols[index], newCols[index + 1]] = [newCols[index + 1], newCols[index]];
      return newCols;
    });
  }

  // Exception keywords
  function handleAddExceptionKeyword() {
    const trimmed = newExceptionInput.trim();
    if (!trimmed) return;
    if (exceptionKeywords.includes(trimmed)) {
      setNewExceptionInput('');
      return;
    }
    setExceptionKeywords((prev) => [...prev, trimmed]);
    setNewExceptionInput('');
  }

  function handleRemoveExceptionKeyword(keyword: string) {
    setExceptionKeywords((prev) => prev.filter((k) => k !== keyword));
  }

  // Zone management
  async function handleAddZone() {
    if (!newZoneName.trim()) return;
    try {
      const res = await fetch('/api/response-zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parishId,
          zoneName: newZoneName.trim(),
          thresholdMinutes: newZoneThreshold ? parseFloat(newZoneThreshold) : null,
          locations: [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setZones(prev => [...prev, data.zone]);
      setNewZoneName('');
      setNewZoneThreshold('');
      setSuccessMessage('Zone added successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleUpdateZone(zone: ResponseZone) {
    try {
      const res = await fetch(`/api/response-zones/${zone.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zoneName: zone.zoneName,
          thresholdMinutes: zone.thresholdMinutes,
          locations: zone.locations,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setZones(prev => prev.map(z => z.id === zone.id ? data.zone : z));
      setEditingZone(null);
      setSuccessMessage('Zone updated successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleDeleteZone(zoneId: number) {
    if (!confirm('Are you sure you want to delete this zone?')) return;
    try {
      const res = await fetch(`/api/response-zones/${zoneId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setZones(prev => prev.filter(z => z.id !== zoneId));
      setSuccessMessage('Zone deleted successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  }

  function handleAddLocationToZone(zone: ResponseZone, location: string) {
    if (!location.trim()) return;
    const updatedZone = {
      ...zone,
      locations: [...zone.locations, location.trim()],
    };
    setEditingZone(updatedZone);
  }

  function handleRemoveLocationFromZone(zone: ResponseZone, location: string) {
    const updatedZone = {
      ...zone,
      locations: zone.locations.filter(l => l !== location),
    };
    setEditingZone(updatedZone);
  }

  // Assign an unassigned location to an existing zone
  async function handleAssignToExistingZone(location: string, zoneId: number) {
    const zone = zones.find(z => z.id === zoneId);
    if (!zone) return;

    try {
      const updatedLocations = [...zone.locations, location];
      const res = await fetch(`/api/response-zones/${zoneId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zoneName: zone.zoneName,
          thresholdMinutes: zone.thresholdMinutes,
          locations: updatedLocations,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setZones(prev => prev.map(z => z.id === zoneId ? data.zone : z));
      setUnassignedLocations(prev => prev.filter(l => l !== location));
      setAssigningLocation(null);
      setSuccessMessage(`"${location}" added to "${zone.zoneName}"`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  }

  // Create a new zone from an unassigned location
  async function handleCreateZoneFromLocation(location: string) {
    try {
      const res = await fetch('/api/response-zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parishId,
          zoneName: location,
          thresholdMinutes: null,
          locations: [location],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setZones(prev => [...prev, data.zone]);
      setUnassignedLocations(prev => prev.filter(l => l !== location));
      setAssigningLocation(null);
      setSuccessMessage(`Created new zone "${location}"`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleSave() {
    if (!parishId) return;

    setSaving(true);
    setError(null);

    const thresholdSeconds =
      thresholdMinutes.trim() === ''
        ? null
        : Number(thresholdMinutes) * 60;

    const targetAvgSeconds =
      targetAvgMinutes.trim() === ''
        ? null
        : Number(targetAvgMinutes) * 60;

    try {
      const res = await fetch('/api/parish-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parishId,
          globalResponseThresholdSeconds: thresholdSeconds,
          targetAverageResponseSeconds: targetAvgSeconds,
          useZones,
          exceptionKeywords,
          reportColumns,
          responseStartTime,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save settings');
      }

      if (onSaved) onSaved(data);
      setSuccessMessage('Settings saved successfully');
      setTimeout(() => {
        setSuccessMessage(null);
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Error saving parish settings:', err);
      setError(err.message || 'Error saving parish settings');
    } finally {
      setSaving(false);
    }
  }

  const tabs: { id: TabType; label: string }[] = [
    { id: 'general', label: 'Response Expectations' },
    { id: 'columns', label: 'Report Columns' },
    { id: 'exclusions', label: 'Exclusions' },
    { id: 'zones', label: 'Response Zones' },
  ];

  // Adaptive styles based on embedded mode
  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: '4px',
    border: embedded ? '1px solid #cbd5e1' : '1px solid #444',
    backgroundColor: embedded ? '#fff' : '#1a1a1a',
    color: embedded ? '#1e293b' : '#fff',
    fontSize: '14px',
  };

  const labelStyle = {
    display: 'block' as const,
    fontSize: '13px',
    color: embedded ? '#64748b' : '#b0b0b0',
    marginBottom: '4px',
  };

  const buttonPrimary = {
    padding: '8px 16px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: '#004437',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
  };

  const buttonSecondary = {
    padding: '8px 14px',
    borderRadius: '4px',
    border: embedded ? '1px solid #cbd5e1' : '1px solid #555',
    backgroundColor: embedded ? '#fff' : '#1a1a1a',
    color: embedded ? '#64748b' : '#ddd',
    cursor: 'pointer',
    fontSize: '14px',
  };

  // Border colors for embedded mode
  const borderColor = embedded ? '#e2e8f0' : '#333';
  const tabActiveColor = embedded ? '#004437' : '#4CAF50';

  // Additional adaptive colors
  const cardBgColor = embedded ? '#ffffff' : '#1a1a1a';
  const mutedTextColor = embedded ? '#64748b' : '#888';
  const tagBgColor = embedded ? '#e2e8f0' : '#252525';
  const tagBorderColor = embedded ? '#cbd5e1' : '#555';

  // Content that's shared between modal and embedded modes
  const content = (
    <div
      style={{
        backgroundColor: embedded ? '#f8fafc' : '#252525',
        color: embedded ? '#1e293b' : '#ffffff',
        borderRadius: embedded ? '0' : '8px',
        width: '100%',
        maxWidth: embedded ? 'none' : '700px',
        maxHeight: embedded ? '100%' : '85vh',
        height: embedded ? '100%' : 'auto',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: embedded ? 'none' : '0 10px 25px rgba(0,0,0,0.6)',
      }}
    >
      {/* Header - only show in non-embedded mode */}
      {!embedded && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '20px 24px',
            borderBottom: '1px solid #333',
          }}
        >
          <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#4CAF50', margin: 0 }}>
            {parishName} – Settings
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#aaa', fontSize: '24px', cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
      )}

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>Loading settings…</div>
        ) : (
          <>
            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${borderColor}`, padding: '0 24px' }}>
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: '12px 20px',
                    border: 'none',
                    background: 'transparent',
                    color: activeTab === tab.id ? tabActiveColor : (embedded ? '#64748b' : '#888'),
                    fontSize: '14px',
                    fontWeight: activeTab === tab.id ? 600 : 400,
                    cursor: 'pointer',
                    borderBottom: activeTab === tab.id ? `2px solid ${tabActiveColor}` : '2px solid transparent',
                    marginBottom: '-1px',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Messages */}
            {error && (
              <div style={{ margin: '16px 24px 0', padding: '10px 12px', backgroundColor: 'rgba(244,67,54,0.15)', color: '#f44336', borderRadius: '4px', fontSize: '13px' }}>
                {error}
              </div>
            )}
            {successMessage && (
              <div style={{ margin: '16px 24px 0', padding: '10px 12px', backgroundColor: embedded ? 'rgba(0,68,55,0.1)' : 'rgba(76,175,80,0.15)', color: tabActiveColor, borderRadius: '4px', fontSize: '13px' }}>
                {successMessage}
              </div>
            )}

            {/* Tab Content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
              {/* RESPONSE EXPECTATIONS TAB */}
              {activeTab === 'general' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                  {/* Evaluation Mode Selection */}
                  <div style={{
                    padding: '16px',
                    backgroundColor: cardBgColor,
                    borderRadius: '8px',
                    border: `1px solid ${borderColor}`
                  }}>
                    <label style={{ ...labelStyle, marginBottom: '12px', display: 'block' }}>
                      Response Evaluation Mode
                    </label>

                    {/* Parish-Wide Average Option */}
                    <div
                      onClick={() => setUseZones(false)}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px',
                        padding: '12px',
                        marginBottom: '8px',
                        backgroundColor: !useZones ? (embedded ? 'rgba(34, 94, 57, 0.1)' : 'rgba(34, 94, 57, 0.2)') : 'transparent',
                        border: !useZones ? `2px solid ${tabActiveColor}` : `1px solid ${borderColor}`,
                        borderRadius: '6px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      <input
                        type="radio"
                        id="modeAverage"
                        name="evaluationMode"
                        checked={!useZones}
                        onChange={() => setUseZones(false)}
                        style={{ marginTop: '2px' }}
                      />
                      <div style={{ flex: 1 }}>
                        <label htmlFor="modeAverage" style={{ fontSize: '14px', fontWeight: 600, color: embedded ? '#1e293b' : '#fff', cursor: 'pointer' }}>
                          Parish-Wide Average Target
                        </label>
                        <p style={{ fontSize: '12px', color: mutedTextColor, marginTop: '4px', marginBottom: 0 }}>
                          Track overall average response time across all calls. No per-call compliance evaluation — just monitor the average over time.
                        </p>
                      </div>
                    </div>

                    {/* Zone-Based Compliance Option */}
                    <div
                      onClick={() => setUseZones(true)}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px',
                        padding: '12px',
                        backgroundColor: useZones ? (embedded ? 'rgba(34, 94, 57, 0.1)' : 'rgba(34, 94, 57, 0.2)') : 'transparent',
                        border: useZones ? `2px solid ${tabActiveColor}` : `1px solid ${borderColor}`,
                        borderRadius: '6px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      <input
                        type="radio"
                        id="modeZones"
                        name="evaluationMode"
                        checked={useZones}
                        onChange={() => setUseZones(true)}
                        style={{ marginTop: '2px' }}
                      />
                      <div style={{ flex: 1 }}>
                        <label htmlFor="modeZones" style={{ fontSize: '14px', fontWeight: 600, color: embedded ? '#1e293b' : '#fff', cursor: 'pointer' }}>
                          Zone-Based Compliance
                        </label>
                        <p style={{ fontSize: '12px', color: mutedTextColor, marginTop: '4px', marginBottom: 0 }}>
                          Each call is evaluated against its zone's specific threshold. Configure zones in the "Response Zones" tab.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Conditional Settings based on mode */}
                  {!useZones ? (
                    /* Average-Only Mode Settings */
                    <div style={{
                      padding: '16px',
                      backgroundColor: cardBgColor,
                      borderRadius: '8px',
                      border: `1px solid ${borderColor}`
                    }}>
                      <label style={labelStyle}>Target Average Response Time (minutes)</label>
                      <input
                        type="number"
                        min={0}
                        value={targetAvgMinutes}
                        onChange={(e) => setTargetAvgMinutes(e.target.value)}
                        placeholder="e.g., 8"
                        style={inputStyle}
                      />
                      <small style={{ color: mutedTextColor, fontSize: '11px', marginTop: '6px', display: 'block' }}>
                        The police jury's target for average response time across all calls in a reporting period.
                      </small>
                    </div>
                  ) : (
                    /* Zone-Based Mode Settings */
                    <div style={{
                      padding: '16px',
                      backgroundColor: cardBgColor,
                      borderRadius: '8px',
                      border: `1px solid ${borderColor}`
                    }}>
                      <label style={labelStyle}>Fallback Threshold — Outside Zones (minutes)</label>
                      <input
                        type="number"
                        min={0}
                        value={thresholdMinutes}
                        onChange={(e) => setThresholdMinutes(e.target.value)}
                        placeholder="e.g., 10"
                        style={inputStyle}
                      />
                      <small style={{ color: mutedTextColor, fontSize: '11px', marginTop: '6px', display: 'block' }}>
                        Compliance threshold for calls that occur outside of any declared response zone (parish-wide default).
                      </small>
                    </div>
                  )}

                  {/* Response Time Calculation - Always shown */}
                  <div style={{
                    padding: '16px',
                    backgroundColor: cardBgColor,
                    borderRadius: '8px',
                    border: `1px solid ${borderColor}`
                  }}>
                    <label style={labelStyle}>Response Time Calculation</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '13px', color: mutedTextColor }}>Start:</span>
                      <select
                        value={responseStartTime}
                        onChange={(e) => setResponseStartTime(e.target.value)}
                        style={{ ...inputStyle, flex: 1 }}
                      >
                        {RESPONSE_START_OPTIONS.map(opt => (
                          <option key={opt.id} value={opt.id}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '13px', color: mutedTextColor }}>End:</span>
                      <div style={{
                        ...inputStyle,
                        flex: 1,
                        backgroundColor: embedded ? '#f1f5f9' : '#2a2a2a',
                        color: mutedTextColor
                      }}>
                        On Scene (arrived_at_scene_time)
                      </div>
                    </div>
                    <small style={{ color: mutedTextColor, fontSize: '11px', marginTop: '8px', display: 'block' }}>
                      Response time = On Scene Time − Start Time
                    </small>
                  </div>
                </div>
              )}

              {/* REPORT COLUMNS TAB */}
              {activeTab === 'columns' && (
                <div>
                  <p style={{ color: '#888', fontSize: '13px', marginBottom: '16px' }}>
                    Select and order the columns that appear in the call report for this parish.
                  </p>

                  <div style={{ display: 'flex', gap: '24px' }}>
                    {/* Available columns */}
                    <div style={{ flex: 1 }}>
                      <h4 style={{ color: '#4CAF50', fontSize: '14px', marginBottom: '12px' }}>Available Columns</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {ALL_REPORT_COLUMNS.filter(col => !reportColumns.includes(col.id)).map(col => (
                          <button
                            key={col.id}
                            onClick={() => toggleColumn(col.id)}
                            style={{
                              ...buttonSecondary,
                              padding: '8px 12px',
                              textAlign: 'left',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            {col.label}
                            <span style={{ color: '#4CAF50' }}>+</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Selected columns */}
                    <div style={{ flex: 1 }}>
                      <h4 style={{ color: '#4CAF50', fontSize: '14px', marginBottom: '12px' }}>Selected Columns (in order)</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {reportColumns.map((colId, index) => {
                          const col = ALL_REPORT_COLUMNS.find(c => c.id === colId);
                          return (
                            <div
                              key={colId}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px 12px',
                                backgroundColor: '#1a1a1a',
                                border: '1px solid #4CAF50',
                                borderRadius: '4px',
                              }}
                            >
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <button
                                  onClick={() => moveColumnUp(index)}
                                  disabled={index === 0}
                                  style={{ background: 'none', border: 'none', color: index === 0 ? '#444' : '#888', cursor: index === 0 ? 'default' : 'pointer', fontSize: '10px' }}
                                >
                                  ▲
                                </button>
                                <button
                                  onClick={() => moveColumnDown(index)}
                                  disabled={index === reportColumns.length - 1}
                                  style={{ background: 'none', border: 'none', color: index === reportColumns.length - 1 ? '#444' : '#888', cursor: index === reportColumns.length - 1 ? 'default' : 'pointer', fontSize: '10px' }}
                                >
                                  ▼
                                </button>
                              </div>
                              <span style={{ flex: 1, fontSize: '13px' }}>{col?.label || colId}</span>
                              <button
                                onClick={() => toggleColumn(colId)}
                                style={{ background: 'none', border: 'none', color: '#f44336', cursor: 'pointer', fontSize: '16px' }}
                              >
                                ×
                              </button>
                            </div>
                          );
                        })}
                        {reportColumns.length === 0 && (
                          <div style={{ color: '#666', fontSize: '13px', padding: '12px' }}>
                            No columns selected. Click columns on the left to add them.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* EXCLUSIONS TAB */}
              {activeTab === 'exclusions' && (
                <div>
                  <p style={{ color: '#888', fontSize: '13px', marginBottom: '16px' }}>
                    Add keywords or phrases that will exclude a call from compliance calculations.
                    Calls with cancel reasons containing these phrases will be excluded.
                  </p>

                  <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                    <input
                      type="text"
                      value={newExceptionInput}
                      onChange={(e) => setNewExceptionInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddExceptionKeyword();
                        }
                      }}
                      placeholder="e.g., Cancelled by police jury"
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button onClick={handleAddExceptionKeyword} style={buttonPrimary}>
                      Add
                    </button>
                  </div>

                  {exceptionKeywords.length === 0 ? (
                    <div style={{ color: '#666', fontSize: '13px', padding: '20px', textAlign: 'center', backgroundColor: '#1a1a1a', borderRadius: '4px' }}>
                      No exclusion keywords configured. Add phrases above.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {exceptionKeywords.map((keyword) => (
                        <span
                          key={keyword}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '6px 12px',
                            borderRadius: '999px',
                            backgroundColor: '#1a1a1a',
                            border: '1px solid #4CAF50',
                            fontSize: '12px',
                          }}
                        >
                          {keyword}
                          <button
                            onClick={() => handleRemoveExceptionKeyword(keyword)}
                            style={{ background: 'none', border: 'none', color: '#f44336', cursor: 'pointer', fontSize: '14px' }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* RESPONSE ZONES TAB */}
              {activeTab === 'zones' && (
                <div>
                  {/* Info banner when in Average-Only mode */}
                  {!useZones && (
                    <div style={{
                      marginBottom: '16px',
                      padding: '14px 16px',
                      backgroundColor: embedded ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.15)',
                      border: `1px solid ${embedded ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.4)'}`,
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px'
                    }}>
                      <span style={{ fontSize: '18px' }}>ℹ️</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '13px', color: embedded ? '#1e40af' : '#93c5fd', marginBottom: '4px' }}>
                          Average-Only Mode Active
                        </div>
                        <p style={{ fontSize: '12px', color: embedded ? '#3b82f6' : '#93c5fd', margin: 0, lineHeight: 1.5 }}>
                          This parish is configured for parish-wide average tracking. Response zones below are <strong>saved but not currently used</strong> for compliance evaluation.
                          Switch to "Zone-Based Compliance" in the Response Expectations tab to activate them.
                        </p>
                      </div>
                    </div>
                  )}

                  <p style={{ color: mutedTextColor, fontSize: '13px', marginBottom: '16px' }}>
                    {useZones
                      ? 'Manage response zones and their thresholds. Each zone evaluates calls against its specific threshold.'
                      : 'Pre-configure response zones here. They will become active when you switch to Zone-Based Compliance mode.'
                    }
                  </p>

                  {/* Current zones summary */}
                  <div style={{
                    marginBottom: '20px',
                    padding: '16px',
                    backgroundColor: cardBgColor,
                    borderRadius: '6px',
                    border: `1px solid ${borderColor}`
                  }}>
                    <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: embedded ? '#1e293b' : '#fff' }}>
                      Current Response Zones ({zones.length})
                    </h4>
                    {zones.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {zones.map(zone => (
                          <span
                            key={zone.id}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: tagBgColor,
                              border: `1px solid ${tagBorderColor}`,
                              borderRadius: '20px',
                              fontSize: '12px',
                              color: embedded ? '#334155' : '#ddd',
                            }}
                          >
                            {zone.zoneName} ({zone.locations.length} locations, {zone.thresholdMinutes || 'global'} min)
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p style={{ color: mutedTextColor, fontSize: '13px' }}>No zones configured yet</p>
                    )}
                  </div>

                  {/* Add new zone */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', padding: '16px', backgroundColor: cardBgColor, borderRadius: '6px', border: `1px solid ${borderColor}` }}>
                    <input
                      type="text"
                      value={newZoneName}
                      onChange={(e) => setNewZoneName(e.target.value)}
                      placeholder="Zone name"
                      style={{ ...inputStyle, flex: 2 }}
                    />
                    <input
                      type="number"
                      value={newZoneThreshold}
                      onChange={(e) => setNewZoneThreshold(e.target.value)}
                      placeholder="Threshold (min)"
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button onClick={handleAddZone} style={buttonPrimary}>
                      Add Zone
                    </button>
                  </div>

                  {/* Zone list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {zones.length === 0 ? (
                      <div style={{ color: mutedTextColor, fontSize: '13px', padding: '20px', textAlign: 'center', backgroundColor: cardBgColor, borderRadius: '4px', border: `1px solid ${borderColor}` }}>
                        No response zones configured. Add a zone above.
                      </div>
                    ) : (
                      zones.map(zone => (
                        <div
                          key={zone.id}
                          style={{
                            padding: '16px',
                            backgroundColor: cardBgColor,
                            borderRadius: '6px',
                            border: editingZone?.id === zone.id ? `1px solid ${tabActiveColor}` : `1px solid ${borderColor}`,
                          }}
                        >
                          {editingZone?.id === zone.id ? (
                            // Editing mode
                            <div>
                              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                                <input
                                  type="text"
                                  value={editingZone.zoneName}
                                  onChange={(e) => setEditingZone({ ...editingZone, zoneName: e.target.value })}
                                  style={{ ...inputStyle, flex: 2 }}
                                />
                                <input
                                  type="number"
                                  value={editingZone.thresholdMinutes || ''}
                                  onChange={(e) => setEditingZone({ ...editingZone, thresholdMinutes: e.target.value ? parseFloat(e.target.value) : null })}
                                  placeholder="Threshold"
                                  style={{ ...inputStyle, flex: 1 }}
                                />
                              </div>

                              <div style={{ marginBottom: '12px' }}>
                                <label style={{ ...labelStyle, marginBottom: '8px' }}>Locations in this zone:</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                                  {editingZone.locations.map(loc => (
                                    <span
                                      key={loc}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '4px 10px',
                                        backgroundColor: tagBgColor,
                                        border: `1px solid ${tagBorderColor}`,
                                        borderRadius: '4px',
                                        fontSize: '12px',
                                        color: embedded ? '#334155' : '#ddd',
                                      }}
                                    >
                                      {loc}
                                      <button
                                        onClick={() => handleRemoveLocationFromZone(editingZone, loc)}
                                        style={{ background: 'none', border: 'none', color: '#f44336', cursor: 'pointer', fontSize: '12px' }}
                                      >
                                        ×
                                      </button>
                                    </span>
                                  ))}
                                  {editingZone.locations.length === 0 && (
                                    <span style={{ color: mutedTextColor, fontSize: '12px' }}>No locations added</span>
                                  )}
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <input
                                    type="text"
                                    value={newLocationInput}
                                    onChange={(e) => setNewLocationInput(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleAddLocationToZone(editingZone, newLocationInput);
                                        setNewLocationInput('');
                                      }
                                    }}
                                    placeholder="Add city/location"
                                    style={{ ...inputStyle, flex: 1 }}
                                  />
                                  <button
                                    onClick={() => {
                                      handleAddLocationToZone(editingZone, newLocationInput);
                                      setNewLocationInput('');
                                    }}
                                    style={{ ...buttonSecondary, padding: '8px 12px' }}
                                  >
                                    Add
                                  </button>
                                </div>
                              </div>

                              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button onClick={() => setEditingZone(null)} style={buttonSecondary}>
                                  Cancel
                                </button>
                                <button onClick={() => handleUpdateZone(editingZone)} style={buttonPrimary}>
                                  Save Zone
                                </button>
                              </div>
                            </div>
                          ) : (
                            // View mode
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div>
                                <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px', color: embedded ? '#1e293b' : '#fff' }}>{zone.zoneName}</div>
                                <div style={{ color: mutedTextColor, fontSize: '12px' }}>
                                  Threshold: {zone.thresholdMinutes ? `${zone.thresholdMinutes} min` : 'Using global'}
                                </div>
                                {zone.locations.length > 0 && (
                                  <div style={{ marginTop: '8px' }}>
                                    <div style={{ color: mutedTextColor, fontSize: '11px', marginBottom: '4px' }}>
                                      Locations ({zone.locations.length}):
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                      {zone.locations.map(loc => (
                                        <span
                                          key={loc}
                                          style={{
                                            padding: '2px 8px',
                                            backgroundColor: tagBgColor,
                                            border: `1px solid ${tagBorderColor}`,
                                            borderRadius: '12px',
                                            fontSize: '11px',
                                            color: embedded ? '#475569' : '#ccc',
                                          }}
                                        >
                                          {loc}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                  onClick={() => setEditingZone(zone)}
                                  style={{ ...buttonSecondary, padding: '6px 12px', fontSize: '12px' }}
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteZone(zone.id)}
                                  style={{ ...buttonSecondary, padding: '6px 12px', fontSize: '12px', color: '#f44336', borderColor: '#f44336' }}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  {/* Unassigned Locations - Parish-wide contributions */}
                  {unassignedLocations.length > 0 && (
                    <div style={{
                      marginTop: '20px',
                      padding: '16px',
                      backgroundColor: embedded ? '#fef3c7' : '#3d3515',
                      borderRadius: '6px',
                      border: `1px solid ${embedded ? '#f59e0b' : '#d97706'}`,
                    }}>
                      <h4 style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        marginBottom: '8px',
                        color: embedded ? '#92400e' : '#fbbf24',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}>
                        <span style={{ fontSize: '16px' }}>⚠️</span>
                        Unassigned Locations ({unassignedLocations.length})
                      </h4>
                      <p style={{ color: embedded ? '#b45309' : '#fcd34d', fontSize: '12px', marginBottom: '12px' }}>
                        Click a location to assign it to a zone or create a new zone.
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {unassignedLocations.map(loc => (
                          <div key={loc} style={{ position: 'relative' }}>
                            <button
                              onClick={() => setAssigningLocation(assigningLocation === loc ? null : loc)}
                              style={{
                                padding: '4px 10px',
                                backgroundColor: assigningLocation === loc
                                  ? (embedded ? '#fbbf24' : '#d97706')
                                  : (embedded ? '#fde68a' : '#4a3c12'),
                                border: `1px solid ${embedded ? '#f59e0b' : '#d97706'}`,
                                borderRadius: '14px',
                                fontSize: '11px',
                                color: embedded ? '#78350f' : '#fcd34d',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              {loc}
                              <span style={{ fontSize: '10px' }}>▾</span>
                            </button>

                            {/* Dropdown menu */}
                            {assigningLocation === loc && (
                              <div style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                marginTop: '4px',
                                backgroundColor: embedded ? '#ffffff' : '#2a2a2a',
                                border: `1px solid ${embedded ? '#e2e8f0' : '#444'}`,
                                borderRadius: '6px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                zIndex: 100,
                                minWidth: '200px',
                                overflow: 'hidden',
                              }}>
                                <div style={{
                                  padding: '8px 12px',
                                  backgroundColor: embedded ? '#f8fafc' : '#333',
                                  borderBottom: `1px solid ${embedded ? '#e2e8f0' : '#444'}`,
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  color: embedded ? '#475569' : '#aaa',
                                }}>
                                  Assign "{loc}" to:
                                </div>

                                {/* Create new zone option */}
                                <button
                                  onClick={() => handleCreateZoneFromLocation(loc)}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    width: '100%',
                                    padding: '10px 12px',
                                    backgroundColor: 'transparent',
                                    border: 'none',
                                    borderBottom: `1px solid ${embedded ? '#e2e8f0' : '#444'}`,
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    fontSize: '12px',
                                    color: embedded ? '#059669' : '#34d399',
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = embedded ? '#f1f5f9' : '#3a3a3a'}
                                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                  <span style={{ fontSize: '14px' }}>➕</span>
                                  Create new zone "{loc}"
                                </button>

                                {/* Existing zones */}
                                {zones.length > 0 && (
                                  <div style={{
                                    padding: '4px 0',
                                    maxHeight: '200px',
                                    overflowY: 'auto',
                                  }}>
                                    {zones.map(zone => (
                                      <button
                                        key={zone.id}
                                        onClick={() => handleAssignToExistingZone(loc, zone.id)}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '8px',
                                          width: '100%',
                                          padding: '8px 12px',
                                          backgroundColor: 'transparent',
                                          border: 'none',
                                          cursor: 'pointer',
                                          textAlign: 'left',
                                          fontSize: '12px',
                                          color: embedded ? '#334155' : '#ddd',
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = embedded ? '#f1f5f9' : '#3a3a3a'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                      >
                                        <span style={{ fontSize: '12px', color: embedded ? '#94a3b8' : '#666' }}>📍</span>
                                        {zone.zoneName}
                                        <span style={{ marginLeft: 'auto', fontSize: '10px', color: embedded ? '#94a3b8' : '#666' }}>
                                          ({zone.locations.length} locations)
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '8px',
              padding: '16px 24px',
              borderTop: embedded ? '1px solid #e2e8f0' : '1px solid #333'
            }}>
              {!embedded && (
                <button onClick={onClose} disabled={saving} style={buttonSecondary}>
                  Cancel
                </button>
              )}
              <button onClick={handleSave} disabled={saving} style={buttonPrimary}>
                {saving ? 'Saving…' : 'Save Settings'}
              </button>
            </div>
          </>
        )}
      </div>
  );

  // When embedded, just return the content without modal wrapper
  if (embedded) {
    return content;
  }

  // Otherwise, wrap in modal overlay
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      {content}
    </div>
  );
};

export default ParishSettingsModal;
