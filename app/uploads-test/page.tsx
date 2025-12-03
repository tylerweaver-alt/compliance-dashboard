"use client";

import { useState } from "react";

interface UploadRow {
  id: string;
  parish_id: number;
  filename: string;
  file_size_bytes: number;
  file_mime_type: string | null;
  uploaded_by_username: string;
  uploaded_at: string;
  status: string;
  rows_imported: number | null;
  data_month: number | null;
  data_year: number | null;
}

export default function UploadsTestPage() {
  const [parishId, setParishId] = useState<string>("1");
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  async function loadUploads() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/uploads?parish_id=${parishId}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load uploads");
        setUploads([]);
        return;
      }
      setUploads(data.uploads || []);
    } catch (err: any) {
      setError(String(err?.message || err));
      setUploads([]);
    } finally {
      setLoading(false);
    }
  }

  function formatBytes(bytes: number): string {
    if (!bytes && bytes !== 0) return "";
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    let value = bytes;
    while (value >= 1024 && i < units.length - 1) {
      value /= 1024;
      i++;
    }
    return `${value.toFixed(1)} ${units[i]}`;
  }

  function downloadCallsCsv() {
    if (!startDate || !endDate) {
      alert("Please select start and end dates.");
      return;
    }
    const url = `/api/calls/export?parish_id=${parishId}&start=${startDate}&end=${endDate}`;
    window.location.href = url;
  }

  return (
    <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "1.75rem", marginBottom: "1rem" }}>
        Uploads Test – Compliance Dashboard
      </h1>

      {/* Parish selector */}
      <div style={{ marginBottom: "1.5rem" }}>
        <label style={{ marginRight: "0.5rem" }}>
          Parish ID:
          <input
            type="number"
            value={parishId}
            onChange={(e) => setParishId(e.target.value)}
            style={{ marginLeft: "0.5rem", padding: "0.25rem 0.5rem" }}
          />
        </label>
        <button
          onClick={loadUploads}
          disabled={loading}
          style={{
            padding: "0.4rem 0.9rem",
            marginLeft: "0.5rem",
            cursor: "pointer",
          }}
        >
          {loading ? "Loading..." : "Load uploads"}
        </button>
      </div>

      {error && (
        <div
          style={{
            marginBottom: "1rem",
            padding: "0.5rem 0.75rem",
            backgroundColor: "#fee2e2",
            color: "#991b1b",
            borderRadius: "4px",
          }}
        >
          {error}
        </div>
      )}

      {/* Uploads table */}
      <h2 style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>
        Upload history
      </h2>

      {uploads.length === 0 && !loading && (
        <p style={{ fontStyle: "italic" }}>No uploads found for this parish.</p>
      )}

      {uploads.length > 0 && (
        <div style={{ overflowX: "auto", marginBottom: "2rem" }}>
          <table
            style={{
              borderCollapse: "collapse",
              width: "100%",
              minWidth: "800px",
              fontSize: "0.9rem",
            }}
          >
            <thead>
              <tr>
                <th style={{ borderBottom: "1px solid #ddd", padding: "0.5rem", textAlign: "left" }}>Uploaded at</th>
                <th style={{ borderBottom: "1px solid #ddd", padding: "0.5rem", textAlign: "left" }}>File</th>
                <th style={{ borderBottom: "1px solid #ddd", padding: "0.5rem", textAlign: "right" }}>Size</th>
                <th style={{ borderBottom: "1px solid #ddd", padding: "0.5rem", textAlign: "left" }}>Status</th>
                <th style={{ borderBottom: "1px solid #ddd", padding: "0.5rem", textAlign: "right" }}>Rows</th>
                <th style={{ borderBottom: "1px solid #ddd", padding: "0.5rem", textAlign: "left" }}>Data period</th>
                <th style={{ borderBottom: "1px solid #ddd", padding: "0.5rem", textAlign: "left" }}>Uploaded by</th>
                <th style={{ borderBottom: "1px solid #ddd", padding: "0.5rem", textAlign: "left" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {uploads.map((u) => (
                <tr key={u.id}>
                  <td style={{ borderBottom: "1px solid #eee", padding: "0.5rem" }}>
                    {new Date(u.uploaded_at).toLocaleString()}
                  </td>
                  <td style={{ borderBottom: "1px solid #eee", padding: "0.5rem" }}>
                    {u.filename}
                  </td>
                  <td style={{ borderBottom: "1px solid #eee", padding: "0.5rem", textAlign: "right" }}>
                    {formatBytes(u.file_size_bytes)}
                  </td>
                  <td style={{ borderBottom: "1px solid #eee", padding: "0.5rem" }}>
                    {u.status}
                  </td>
                  <td style={{ borderBottom: "1px solid #eee", padding: "0.5rem", textAlign: "right" }}>
                    {u.rows_imported ?? "-"}
                  </td>
                  <td style={{ borderBottom: "1px solid #eee", padding: "0.5rem" }}>
                    {u.data_month && u.data_year
                      ? `${u.data_month}/${u.data_year}`
                      : "-"}
                  </td>
                  <td style={{ borderBottom: "1px solid #eee", padding: "0.5rem" }}>
                    {u.uploaded_by_username}
                  </td>
                  <td style={{ borderBottom: "1px solid #eee", padding: "0.5rem" }}>
                    <a
                      href={`/api/uploads/${u.id}/download`}
                      style={{ textDecoration: "underline", fontSize: "0.85rem" }}
                    >
                      Download file
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Calls export section */}
      <h2 style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>
        Export calls (CSV)
      </h2>
      <p style={{ marginBottom: "0.5rem", fontSize: "0.9rem" }}>
        Choose a date range (e.g., last 1 / 3 / 6 months) and download a
        unified CSV of calls for this parish.
      </p>

      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginBottom: "0.75rem" }}>
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
        <button
          onClick={downloadCallsCsv}
          style={{
            padding: "0.4rem 0.9rem",
            cursor: "pointer",
          }}
        >
          Download CSV
        </button>
      </div>

      <p style={{ fontSize: "0.8rem", color: "#555" }}>
        Later we can wire quick buttons for "Last 1 month / 3 months / 6 months"
        that auto-fill the dates above.
      </p>
    </div>
  );
}
