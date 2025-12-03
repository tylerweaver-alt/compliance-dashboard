'use client';

import { useEffect, useState } from 'react';
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

interface ParishReportContentProps {
  parishId: string | null;
  startDate: string | null;
  endDate: string | null;
}

export default function ParishReportContent({
  parishId,
  startDate,
  endDate,
}: ParishReportContentProps) {

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parishId, startDate, endDate]);

  async function loadReportData() {
    try {
      // Use provided dates or default to current month
      const start =
        startDate ||
        new Date(new Date().getFullYear(), new Date().getMonth(), 1)
          .toISOString()
          .split('T')[0];
      const end = endDate || new Date().toISOString().split('T')[0];

      const response = await fetch(
        `/api/calls/report-data?parish_id=${parishId}&start=${start}&end=${end}`
      );
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
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#1a1a1a',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ fontSize: '20px' }}>Loading report...</div>
      </div>
    );
  }

  if (error || !reportData) {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#1a1a1a',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ fontSize: '20px', color: '#f44336' }}>
          {error || 'No data available'}
        </div>
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
  const offset =
    circumference - (parseFloat(complianceRate) / 100) * circumference;
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

      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#1a1a1a',
          color: '#ffffff',
          padding: '20px',
        }}
      >
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          {/* Screen Controls */}
          <div
            className="screen-controls"
            style={{ marginBottom: '20px', textAlign: 'right' }}
          >
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
                fontWeight: '600',
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = '#45a049')
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = '#4CAF50')
              }
            >
              Print Report
            </button>
          </div>

          {/* PAGE 1: KPI Dashboard */}
          {/* ...keep all your existing JSX for the KPI dashboard + calls pages here... */}
          {/* I’m not changing any markup so your report looks exactly the same. */}

          {/* KPI / metrics / calls pages – everything from your original return stays here */}
        </div>
      </div>
    </>
  );
}
