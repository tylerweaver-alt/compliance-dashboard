'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';

interface ReportData {
  ok: boolean;
  parishId: number;
  parishName: string;
  start: string;
  end: string;
  thresholdMinutes: number;
  thresholdSeconds: number;
  summary: {
    totalCalls: number;
    includedCalls: number;
    excludedCalls: number;
    onTimeCalls: number;
    lateCalls: number;
    onTimePercent: number;
    latePercent: number;
  };
  exclusionsBreakdown: Array<{
    reason: string;
    count: number;
    percentOfExcluded: number;
  }>;
  calls: Call[];
}

interface Call {
  incident_number: string;
  incident_key: string;
  call_date: string;
  call_sequence: number;
  origin_address: string;
  origin_city: string;
  start_time: string;
  at_scene_time: string;
  response_seconds: number | null;
  is_excluded: boolean;
  exclusion_reason: string | null;
}

export default function ParishReportPage() {
  const searchParams = useSearchParams();
  const parishId = searchParams.get('parish');
  const startDate = searchParams.get('start');
  const endDate = searchParams.get('end');
  
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!parishId) {
      setError('No parish specified');
      setLoading(false);
      return;
    }

    loadReportData();
  }, [parishId, startDate, endDate]);

  async function loadReportData() {
    try {
      // Use provided dates or default to current month
      const start = startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
      const end = endDate || new Date().toISOString().split('T')[0];
      
      const response = await fetch(`/api/calls/report-data?parish_id=${parishId}&start=${start}&end=${end}`);
      const data = await response.json();

      if (data.error) {
        setError('Error loading report: ' + data.error);
        return;
      }

      setReportData(data);
    } catch (error) {
      console.error('Error loading report:', error);
      setError('Error loading report data');
    } finally {
      setLoading(false);
    }
  }

  function getGaugeColor(percentage: number): string {
    if (percentage >= 90) return '#4CAF50';
    if (percentage >= 70) return '#FFC107';
    return '#f44336';
  }

  function handlePrint() {
    window.print();
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#1a1a1a', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '20px' }}>Loading report...</div>
      </div>
    );
  }

  if (error || !reportData) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#1a1a1a', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '20px', color: '#f44336' }}>{error || 'No data available'}</div>
      </div>
    );
  }

  const callsPerPage = 25;
  const totalPages = Math.ceil(reportData.calls.length / callsPerPage);
  const callPages = Array.from({ length: totalPages }, (_, i) => {
    const startIdx = i * callsPerPage;
    const endIdx = Math.min(startIdx + callsPerPage, reportData.calls.length);
    return reportData.calls.slice(startIdx, endIdx);
  });

  // Calculate compliance rate from on-time calls
  const complianceRate = reportData.summary.onTimePercent.toFixed(1);
  const circumference = 2 * Math.PI * 100;
  const offset = circumference - (parseFloat(complianceRate) / 100) * circumference;
  const gaugeColor = getGaugeColor(parseFloat(complianceRate));
  
  // Format report period
  const reportPeriod = `${reportData.start} to ${reportData.end}`;
  
  // Helper function to format seconds to MM:SS
  const formatSeconds = (seconds: number | null): string => {
    if (seconds === null) return '--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <>
      <style jsx global>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #1a1a1a;
          color: #ffffff;
          padding: 20px;
        }

        @media print {
          body {
            background-color: white;
            color: black;
            padding: 0;
          }
          
          .screen-controls {
            display: none;
          }

          .page {
            background-color: white;
            padding: 40px;
            margin: 0;
            border-radius: 0;
            box-shadow: none;
            page-break-after: always;
          }

          .calls-page {
            background-color: white;
            padding: 40px;
            margin: 0;
            border-radius: 0;
            box-shadow: none;
            page-break-before: always;
          }

          .report-title {
            color: #000;
          }

          .report-meta {
            color: #333;
          }

          .meta-label {
            color: #666;
          }

          .meta-value {
            color: #000;
          }

          .gauge-title {
            color: #666;
          }

          .gauge-bg {
            stroke: #ddd;
          }

          .gauge-text,
          .stat-value,
          .metric-value {
            color: #000;
          }

          .stat-label,
          .metric-label {
            color: #666;
          }

          .stat-card,
          .metric-item {
            background-color: #f5f5f5;
          }

          .calls-header,
          .metrics-title {
            color: #000;
          }

          .calls-table thead {
            background-color: #f0f0f0;
          }

          .calls-table th {
            color: #000;
          }

          .calls-table td {
            color: #000;
            border-bottom: 1px solid #ddd;
          }

          .calls-table tbody tr:hover {
            background-color: transparent;
          }

          .calls-table {
            font-size: 8px;
          }

          .calls-table th {
            font-size: 7px;
            padding: 6px 3px;
          }

          .calls-table td {
            padding: 5px 3px;
            font-size: 8px;
          }
        }

        @page {
          size: letter landscape;
          margin: 0.5in;
        }
      `}</style>

      <div style={{ minHeight: '100vh', backgroundColor: '#1a1a1a', color: '#ffffff', padding: '20px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          {/* Screen Controls */}
          <div className="screen-controls" style={{ marginBottom: '20px', textAlign: 'right' }}>
            <button
              onClick={handlePrint}
              style={{
                backgroundColor: '#4CAF50',
                color: 'white',
                padding: '12px 24px',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: '600'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#45a049'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#4CAF50'}
            >
              Print Report
            </button>
          </div>

          {/* PAGE 1: KPI Dashboard */}
          <div className="page" style={{
            backgroundColor: '#252525',
            padding: '40px',
            marginBottom: '20px',
            borderRadius: '8px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)'
          }}>
            <div style={{
              borderBottom: '3px solid #4CAF50',
              paddingBottom: '20px',
              paddingRight: '220px',
              marginBottom: '40px',
              position: 'relative'
            }}>
              <div style={{ position: 'absolute', top: '-20px', right: '0', height: '187px' }}>
                <Image
                  src="/Images/Acadian-logo.png"
                  alt="Acadian Ambulance"
                  width={200}
                  height={187}
                  style={{ height: '187px', width: 'auto' }}
                />
              </div>
              <h1 className="report-title" style={{
                fontSize: '32px',
                fontWeight: '700',
                marginBottom: '15px',
                color: '#4CAF50'
              }}>
                Parish Compliance Report
              </h1>
              <div className="report-meta" style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '14px',
                color: '#b0b0b0'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <span className="meta-label" style={{ fontWeight: '600', color: '#888' }}>Parish</span>
                  <span className="meta-value" style={{ color: '#fff' }}>{reportData.parishName}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <span className="meta-label" style={{ fontWeight: '600', color: '#888' }}>Report Period</span>
                  <span className="meta-value" style={{ color: '#fff' }}>{reportPeriod}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <span className="meta-label" style={{ fontWeight: '600', color: '#888' }}>Generated</span>
                  <span className="meta-value" style={{ color: '#fff' }}>{new Date().toLocaleDateString()}</span>
                </div>
              </div>
            </div>

            {/* KPI Container */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 2fr',
              gap: '40px',
              marginBottom: '40px'
            }}>
              {/* Compliance Gauge */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <div className="gauge-title" style={{
                  fontSize: '18px',
                  fontWeight: '600',
                  marginBottom: '20px',
                  color: '#b0b0b0'
                }}>
                  Overall Compliance
                </div>
                <div style={{ position: 'relative', width: '250px', height: '250px' }}>
                  <svg style={{ transform: 'rotate(-90deg)' }} width="250" height="250">
                    <circle
                      className="gauge-bg"
                      style={{ fill: 'none', stroke: '#555', strokeWidth: '20' }}
                      cx="125"
                      cy="125"
                      r="100"
                    />
                    <circle
                      className="gauge-fill"
                      style={{
                        fill: 'none',
                        stroke: gaugeColor,
                        strokeWidth: '20',
                        strokeLinecap: 'round',
                        strokeDasharray: circumference,
                        strokeDashoffset: offset,
                        transition: 'stroke-dashoffset 1s ease-in-out'
                      }}
                      cx="125"
                      cy="125"
                      r="100"
                    />
                  </svg>
                  <div className="gauge-text" style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    fontSize: '48px',
                    fontWeight: '700'
                  }}>
                    {complianceRate}%
                  </div>
                  <div className="gauge-label" style={{
                    position: 'absolute',
                    top: '65%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    fontSize: '14px',
                    color: '#888',
                    textTransform: 'uppercase',
                    letterSpacing: '1px'
                  }}>
                    Compliance Rate
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '20px'
              }}>
                <div className="stat-card" style={{
                  backgroundColor: '#1a1a1a',
                  padding: '20px',
                  borderRadius: '8px',
                  borderLeft: '4px solid #4CAF50'
                }}>
                  <div className="stat-label" style={{
                    fontSize: '13px',
                    color: '#888',
                    marginBottom: '8px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Total Calls
                  </div>
                  <div className="stat-value" style={{
                    fontSize: '32px',
                    fontWeight: '700',
                    color: '#fff'
                  }}>
                    {reportData.summary.totalCalls}
                  </div>
                </div>
                <div className="stat-card" style={{
                  backgroundColor: '#1a1a1a',
                  padding: '20px',
                  borderRadius: '8px',
                  borderLeft: '4px solid #4CAF50'
                }}>
                  <div className="stat-label" style={{
                    fontSize: '13px',
                    color: '#888',
                    marginBottom: '8px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Complete Calls
                  </div>
                  <div className="stat-value" style={{
                    fontSize: '32px',
                    fontWeight: '700',
                    color: '#fff'
                  }}>
                    {reportData.summary.onTimeCalls}
                  </div>
                </div>
                <div className="stat-card" style={{
                  backgroundColor: '#1a1a1a',
                  padding: '20px',
                  borderRadius: '8px',
                  borderLeft: '4px solid #4CAF50'
                }}>
                  <div className="stat-label" style={{
                    fontSize: '13px',
                    color: '#888',
                    marginBottom: '8px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Missing Forms
                  </div>
                  <div className="stat-value" style={{
                    fontSize: '32px',
                    fontWeight: '700',
                    color: '#fff'
                  }}>
                    {reportData.summary.lateCalls}
                  </div>
                </div>
                <div className="stat-card" style={{
                  backgroundColor: '#1a1a1a',
                  padding: '20px',
                  borderRadius: '8px',
                  borderLeft: '4px solid #4CAF50'
                }}>
                  <div className="stat-label" style={{
                    fontSize: '13px',
                    color: '#888',
                    marginBottom: '8px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Cancelled/Exception
                  </div>
                  <div className="stat-value" style={{
                    fontSize: '32px',
                    fontWeight: '700',
                    color: '#fff'
                  }}>
                    {reportData.summary.excludedCalls}
                  </div>
                </div>
              </div>
            </div>

            {/* Additional Metrics */}
            <div style={{ marginTop: '40px' }}>
              <h2 className="metrics-title" style={{
                fontSize: '20px',
                fontWeight: '600',
                marginBottom: '20px',
                color: '#4CAF50'
              }}>
                Detailed Metrics
              </h2>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '20px'
              }}>
                <div className="metric-item" style={{
                  backgroundColor: '#1a1a1a',
                  padding: '15px 20px',
                  borderRadius: '6px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span className="metric-label" style={{ fontSize: '14px', color: '#b0b0b0' }}>Included Calls</span>
                  <span className="metric-value" style={{ fontSize: '24px', fontWeight: '600', color: '#fff' }}>
                    {reportData.summary.includedCalls}
                  </span>
                </div>
                <div className="metric-item" style={{
                  backgroundColor: '#1a1a1a',
                  padding: '15px 20px',
                  borderRadius: '6px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span className="metric-label" style={{ fontSize: '14px', color: '#b0b0b0' }}>On Time %</span>
                  <span className="metric-value" style={{ fontSize: '24px', fontWeight: '600', color: '#fff' }}>
                    {reportData.summary.onTimePercent.toFixed(1)}%
                  </span>
                </div>
                <div className="metric-item" style={{
                  backgroundColor: '#1a1a1a',
                  padding: '15px 20px',
                  borderRadius: '6px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span className="metric-label" style={{ fontSize: '14px', color: '#b0b0b0' }}>Late %</span>
                  <span className="metric-value" style={{ fontSize: '24px', fontWeight: '600', color: '#fff' }}>
                    {reportData.summary.latePercent.toFixed(1)}%
                  </span>
                </div>
                <div className="metric-item" style={{
                  backgroundColor: '#1a1a1a',
                  padding: '15px 20px',
                  borderRadius: '6px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span className="metric-label" style={{ fontSize: '14px', color: '#b0b0b0' }}>Threshold</span>
                  <span className="metric-value" style={{ fontSize: '24px', fontWeight: '600', color: '#fff' }}>
                    {reportData.thresholdMinutes} min
                  </span>
                </div>
                <div className="metric-item" style={{
                  backgroundColor: '#1a1a1a',
                  padding: '15px 20px',
                  borderRadius: '6px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span className="metric-label" style={{ fontSize: '14px', color: '#b0b0b0' }}>Exclusions</span>
                  <span className="metric-value" style={{ fontSize: '24px', fontWeight: '600', color: '#fff' }}>
                    {reportData.exclusionsBreakdown.length}
                  </span>
                </div>
                <div className="metric-item" style={{
                  backgroundColor: '#1a1a1a',
                  padding: '15px 20px',
                  borderRadius: '6px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span className="metric-label" style={{ fontSize: '14px', color: '#b0b0b0' }}>Total Excluded</span>
                  <span className="metric-value" style={{ fontSize: '24px', fontWeight: '600', color: '#fff' }}>
                    {reportData.summary.excludedCalls}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* CALLS LISTING PAGES */}
          {callPages.map((pageCalls, pageIndex) => (
            <div
              key={pageIndex}
              className="calls-page"
              style={{
                backgroundColor: '#252525',
                padding: '40px',
                marginBottom: '20px',
                borderRadius: '8px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
                overflowX: 'auto'
              }}
            >
              <h2 className="calls-header" style={{
                fontSize: '24px',
                fontWeight: '700',
                marginBottom: '20px',
                color: '#4CAF50',
                borderBottom: '2px solid #4CAF50',
                paddingBottom: '10px'
              }}>
                Call Details - Page {pageIndex + 1} of {totalPages}
              </h2>
              <table className="calls-table" style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '11px',
                whiteSpace: 'nowrap'
              }}>
                <thead style={{ backgroundColor: '#1a1a1a' }}>
                  <tr>
                    <th style={{ padding: '10px 6px', textAlign: 'left', fontWeight: '600', color: '#4CAF50', borderBottom: '2px solid #4CAF50', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.5px' }}>Incident #</th>
                    <th style={{ padding: '10px 6px', textAlign: 'left', fontWeight: '600', color: '#4CAF50', borderBottom: '2px solid #4CAF50', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.5px' }}>Date</th>
                    <th style={{ padding: '10px 6px', textAlign: 'left', fontWeight: '600', color: '#4CAF50', borderBottom: '2px solid #4CAF50', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.5px' }}>Seq</th>
                    <th style={{ padding: '10px 6px', textAlign: 'left', fontWeight: '600', color: '#4CAF50', borderBottom: '2px solid #4CAF50', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.5px' }}>Address</th>
                    <th style={{ padding: '10px 6px', textAlign: 'left', fontWeight: '600', color: '#4CAF50', borderBottom: '2px solid #4CAF50', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.5px' }}>City</th>
                    <th style={{ padding: '10px 6px', textAlign: 'left', fontWeight: '600', color: '#4CAF50', borderBottom: '2px solid #4CAF50', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.5px' }}>Start Time</th>
                    <th style={{ padding: '10px 6px', textAlign: 'left', fontWeight: '600', color: '#4CAF50', borderBottom: '2px solid #4CAF50', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.5px' }}>Scene Time</th>
                    <th style={{ padding: '10px 6px', textAlign: 'left', fontWeight: '600', color: '#4CAF50', borderBottom: '2px solid #4CAF50', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.5px' }}>Response</th>
                    <th style={{ padding: '10px 6px', textAlign: 'left', fontWeight: '600', color: '#4CAF50', borderBottom: '2px solid #4CAF50', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.5px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pageCalls.map((call, callIndex) => (
                    <tr 
                      key={callIndex}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1a1a1a'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{ padding: '8px 6px', borderBottom: '1px solid #555', color: '#d0d0d0' }}>
                        {call.incident_number || 'N/A'}
                      </td>
                      <td style={{ padding: '8px 6px', borderBottom: '1px solid #555', color: '#d0d0d0' }}>
                        {call.call_date || 'N/A'}
                      </td>
                      <td style={{ padding: '8px 6px', borderBottom: '1px solid #555', color: '#d0d0d0' }}>
                        {call.call_sequence}
                      </td>
                      <td style={{ padding: '8px 6px', borderBottom: '1px solid #555', color: '#d0d0d0', fontSize: '10px' }}>
                        {call.origin_address || 'N/A'}
                      </td>
                      <td style={{ padding: '8px 6px', borderBottom: '1px solid #555', color: '#d0d0d0' }}>
                        {call.origin_city || 'N/A'}
                      </td>
                      <td style={{ padding: '8px 6px', borderBottom: '1px solid #555', color: '#d0d0d0' }}>
                        {call.start_time || '--'}
                      </td>
                      <td style={{ padding: '8px 6px', borderBottom: '1px solid #555', color: '#d0d0d0' }}>
                        {call.at_scene_time || '--'}
                      </td>
                      <td style={{ padding: '8px 6px', borderBottom: '1px solid #555', color: '#d0d0d0' }}>
                        {formatSeconds(call.response_seconds)}
                      </td>
                      <td style={{ padding: '8px 6px', borderBottom: '1px solid #555', color: '#d0d0d0' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            ...(call.is_excluded
                              ? { backgroundColor: 'rgba(255, 193, 7, 0.2)', color: '#FFC107' }
                              : call.response_seconds && call.response_seconds <= reportData.thresholdSeconds
                              ? { backgroundColor: 'rgba(76, 175, 80, 0.2)', color: '#4CAF50' }
                              : { backgroundColor: 'rgba(244, 67, 54, 0.2)', color: '#f44336' })
                          }}
                        >
                          {call.is_excluded ? 'Excluded' : call.response_seconds && call.response_seconds <= reportData.thresholdSeconds ? 'On Time' : 'Late'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
