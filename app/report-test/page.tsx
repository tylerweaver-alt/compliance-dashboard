"use client";

import { useState } from "react";

interface CallRow {
  incident_number: string;
  incident_key: string;
  call_date: string;
  call_sequence: string | null;
  origin_address: string | null;
  origin_city: string | null;
  start_time: string | null;
  at_scene_time: string | null;
  response_seconds: number | null;
  is_excluded: boolean;
  exclusion_reason: string | null;
}

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
  calls: CallRow[];
}

export default function ReportTestPage() {
  const [parishId, setParishId] = useState<string>("1");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [thresholdMinutes, setThresholdMinutes] = useState<string>("20");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReportData | null>(null);

  async function loadReport() {
    setLoading(true);
    setError(null);
    setReport(null);

    if (!startDate || !endDate) {
      setError("Please choose a start and end date.");
      setLoading(false);
      return;
    }

    try {
      const params = new URLSearchParams({
        parish_id: parishId,
        start: startDate,
        end: endDate,
        threshold_minutes: thresholdMinutes || "20",
      });

      const res = await fetch(`/api/calls/report-data?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to load report data");
        return;
      }

      setReport(data as ReportData);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        padding: "2rem",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* Controls (not printed) */}
      <div
        style={{
          marginBottom: "1.5rem",
          padding: "0.75rem 1rem",
          borderRadius: "8px",
          backgroundColor: "#f3f4f6",
        }}
        className="no-print"
      >
        <h1 style={{ margin: 0, marginBottom: "0.75rem", fontSize: "1.5rem" }}>
          Zone Performance Report (Test)
        </h1>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem",
            alignItems: "center",
          }}
        >
          <label>
            Parish ID:
            <input
              type="number"
              value={parishId}
              onChange={(e) => setParishId(e.target.value)}
              style={{ marginLeft: "0.25rem" }}
            />
          </label>

          <label>
            Start:
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ marginLeft: "0.25rem" }}
            />
          </label>

          <label>
            End:
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ marginLeft: "0.25rem" }}
            />
          </label>

          <label>
            Threshold (min):
            <input
              type="number"
              value={thresholdMinutes}
              onChange={(e) => setThresholdMinutes(e.target.value)}
              style={{ marginLeft: "0.25rem", width: "4rem" }}
            />
          </label>

          <button
            onClick={loadReport}
            disabled={loading}
            style={{
              padding: "0.35rem 0.9rem",
              cursor: "pointer",
              borderRadius: "4px",
              border: "none",
              backgroundColor: "#111827",
              color: "white",
              fontWeight: 500,
            }}
          >
            {loading ? "Loading..." : "Generate report"}
          </button>

          {report && (
            <button
              onClick={() => window.print()}
              style={{
                padding: "0.35rem 0.9rem",
                cursor: "pointer",
                borderRadius: "4px",
                border: "1px solid #4b5563",
                backgroundColor: "white",
                color: "#111827",
                fontWeight: 500,
              }}
            >
              Print
            </button>
          )}
        </div>

        {error && (
          <div
            style={{
              marginTop: "0.75rem",
              padding: "0.5rem 0.75rem",
              borderRadius: "4px",
              backgroundColor: "#fee2e2",
              color: "#b91c1c",
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Printable report content */}
      {report && (
        <ReportContent
          report={report}
          thresholdSeconds={report.thresholdSeconds}
        />
      )}

      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  );
}

function ReportContent({
  report,
  thresholdSeconds,
}: {
  report: ReportData;
  thresholdSeconds: number;
}) {
  const {
    parishName,
    start,
    end,
    thresholdMinutes,
    calls,
  } = report;

  const stats = computeStats(report);

  return (
    <div>
      {/* PAGE 1: Summary Only */}
      <div style={{ pageBreakAfter: "always", minHeight: "100vh" }}>
        {/* Header */}
        <div style={{ marginBottom: "1.25rem" }}>
          <h2
            style={{
              margin: 0,
              fontSize: "1.75rem",
              fontWeight: 700,
            }}
          >
            {parishName} – {thresholdMinutes} min Zone (
            {formatDateLabel(start, end)})
          </h2>
          <p style={{ margin: "0.35rem 0", color: "#4b5563" }}>
            Average response &amp; compliance for this period. Exclusions are
            separated and broken down by reason.
          </p>
        </div>

        {/* Summary cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "0.75rem",
            marginBottom: "1.5rem",
          }}
        >
          <SummaryCard
            label="On-Time Percentage"
            value={`${stats.onTimePct}%`}
            emphasis
          />
          <SummaryCard
            label="Total Calls (All)"
            value={String(stats.total)}
          />
          <SummaryCard
            label="Included in Metric"
            value={String(stats.nonExcludedCount)}
          />
          <SummaryCard
            label="Excluded from Metric"
            value={String(stats.excludedCount)}
          />
          <SummaryCard
            label="Calls In Time"
            value={String(stats.onTimeCount)}
          />
          <SummaryCard
            label="Calls Late (Included)"
            value={String(stats.lateCount)}
            color="red"
          />
          <SummaryCard
            label="Calls Late (Excluded)"
            value={String(stats.lateExcludedCount)}
          />
          <SummaryCard
            label="Avg. Response (Included)"
            value={formatSeconds(stats.avgSec)}
          />
        </div>

        {/* Exclusion breakdown */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ margin: 0, marginBottom: "0.5rem", fontSize: "1.2rem" }}>
            Exclusion Breakdown
          </h3>
          {stats.excludedCount === 0 ? (
            <p style={{ fontStyle: "italic", color: "#6b7280" }}>
              No excluded calls in this period.
            </p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: "1.25rem", color: "#111827" }}>
              {stats.reasonStats.map((r) => (
                <li key={r.reason}>
                  <strong>{r.reason}</strong>: {r.count} call
                  {r.count !== 1 && "s"} ({r.pct}% of exclusions)
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* PAGE 2+: Call Details */}
      <div>
        <h3 style={{ margin: 0, marginBottom: "0.5rem", fontSize: "1.2rem" }}>
          Call Details
        </h3>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              borderCollapse: "collapse",
              width: "100%",
              fontSize: "0.9rem",
            }}
          >
            <thead>
              <tr>
                <Th>Call Date</Th>
                <Th>Call #</Th>
                <Th>Address</Th>
                <Th>Initial / Start</Th>
                <Th>On Scene</Th>
                <Th>Response Time</Th>
                <Th>Included in Metric</Th>
                <Th>Exclusion Reason</Th>
              </tr>
            </thead>
            <tbody>
              {calls.map((c, idx) => {
                const sec = c.response_seconds;
                const isLate =
                  !c.is_excluded &&
                  sec !== null &&
                  sec > thresholdSeconds;

                const callNumber = c.call_sequence
                  ? String(c.call_sequence)
                  : deriveCallNumber(c.incident_key, c.incident_number);
                const address = formatAddress(c.origin_address, c.origin_city);

                return (
                  <tr key={`${c.incident_key}-${idx}`}>
                    <Td>{formatDate(c.call_date)}</Td>
                    <Td>{callNumber || ""}</Td>
                    <Td>{address}</Td>
                    <Td>{formatTs(c.start_time)}</Td>
                    <Td>{formatTs(c.at_scene_time)}</Td>
                    <Td
                      style={{
                        padding: "0.35rem 0.5rem",
                        borderBottom: "1px solid #e5e7eb",
                        fontWeight: 600,
                        color: isLate ? "#b91c1c" : "#065f46",
                        backgroundColor: isLate ? "#fee2e2" : "#ecfdf5",
                        textAlign: "center",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {sec !== null ? formatSeconds(sec) : ""}
                    </Td>
                    <Td style={{ textAlign: "center" }}>
                      {c.is_excluded ? "☒ Excluded" : "☑ Included"}
                    </Td>
                    <Td>{c.exclusion_reason || ""}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p
          style={{
            marginTop: "0.5rem",
            fontSize: "0.8rem",
            color: "#6b7280",
          }}
        >
          Note: Cells highlighted in{" "}
          <span style={{ color: "#b91c1c" }}>red</span> are responses over{" "}
          {thresholdMinutes} minutes and counted as late unless marked as
          excluded.
        </p>
      </div>
    </div>
  );
}

/* ——— Helpers shared with the report content ——— */

function formatDate(val: string | null): string {
  if (!val) return "";
  
  // dateVal might be "2025-10-01" or "2025-10-01T18:12:57"
  const [iso] = val.split("T");
  const [yyyy, mm, dd] = iso.split("-");
  if (!yyyy || !mm || !dd) return val;

  return `${mm}-${dd}-${yyyy}`; // MM-DD-YYYY
}

// Try to derive "####" call number from incident_key / incident_number
function deriveCallNumber(incidentKey?: string | null, incidentNumber?: string | null): string | null {
  const src = incidentKey || incidentNumber;
  if (!src) return null;
  const parts = src.split("-");
  if (parts.length < 2) return null;
  return parts[1] || null;
}

// Combine address + city for display
function formatAddress(address: string | null, city: string | null): string {
  const parts = [address, city].filter(Boolean);
  return parts.join(", ");
}

function formatSeconds(sec: number | null): string {
  if (sec === null || sec === undefined) return "";
  if (sec < 0) sec = 0;

  const hours = Math.floor(sec / 3600);
  const remaining = sec % 3600;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  const hh = hours.toString().padStart(2, "0");
  const mm = minutes.toString().padStart(2, "0");
  const ss = seconds.toString().padStart(2, "0");

  return `${hh}:${mm}:${ss}`;
}

function formatTs(ts: string | null): string {
  if (!ts) return "";
  // ts is "HH:MM:SS" coming from DB -> just show HH:MM
  const parts = ts.split(":");
  if (parts.length >= 2) {
    return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
  }
  return ts;
}

function formatDateLabel(start: string, end: string): string {
  if (start === end) return start;
  return `${start} – ${end}`;
}

function computeStats(report: ReportData) {
  const { calls, thresholdSeconds } = report;

  const total = calls.length;

  const nonExcluded = calls.filter((c) => !c.is_excluded);
  const excluded = calls.filter((c) => c.is_excluded);

  const onTime = nonExcluded.filter(
    (c) =>
      c.response_seconds !== null &&
      c.response_seconds <= thresholdSeconds
  );

  const late = nonExcluded.filter(
    (c) =>
      c.response_seconds !== null &&
      c.response_seconds > thresholdSeconds
  );

  const lateExcluded = excluded.filter(
    (c) =>
      c.response_seconds !== null &&
      c.response_seconds > thresholdSeconds
  );

  const onTimePct =
    nonExcluded.length > 0
      ? Math.round((onTime.length / nonExcluded.length) * 100)
      : 0;

  const withTimes = nonExcluded.filter(
    (c) => c.response_seconds !== null
  );
  const avgSec =
    withTimes.length > 0
      ? Math.round(
          withTimes.reduce(
            (sum, c) => sum + (c.response_seconds || 0),
            0
          ) / withTimes.length
        )
      : 0;

  const reasonCounts = new Map<string, number>();
  for (const c of excluded) {
    const reason = (c.exclusion_reason || "Unspecified").trim();
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }
  const reasonStats = Array.from(reasonCounts.entries()).map(
    ([reason, count]) => ({
      reason,
      count,
      pct:
        excluded.length > 0
          ? Math.round((count / excluded.length) * 100)
          : 0,
    })
  );

  return {
    total,
    nonExcludedCount: nonExcluded.length,
    excludedCount: excluded.length,
    onTimeCount: onTime.length,
    lateCount: late.length,
    lateExcludedCount: lateExcluded.length,
    onTimePct,
    avgSec,
    reasonStats,
  };
}

/* ——— Small presentational helpers ——— */

function SummaryCard({
  label,
  value,
  emphasis,
  color,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  color?: "red";
}) {
  const bg =
    color === "red" ? "#fef2f2" : "#f9fafb";
  const border =
    color === "red" ? "#fecaca" : "#e5e7eb";
  const textColor =
    color === "red" ? "#b91c1c" : "#111827";

  return (
    <div
      style={{
        padding: "0.75rem 0.9rem",
        borderRadius: "0.75rem",
        border: `1px solid ${border}`,
        backgroundColor: bg,
      }}
    >
      <div
        style={{
          fontSize: "0.75rem",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "#6b7280",
          marginBottom: "0.25rem",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: emphasis ? "1.5rem" : "1.2rem",
          fontWeight: emphasis ? 700 : 600,
          color: textColor,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        padding: "0.4rem 0.5rem",
        borderBottom: "2px solid #111827",
        textAlign: "left",
        fontSize: "0.8rem",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: "#374151",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <td
      style={{
        padding: "0.35rem 0.5rem",
        borderBottom: "1px solid #e5e7eb",
        verticalAlign: "top",
        ...style,
      }}
    >
      {children}
    </td>
  );
}
