// app/api/forecast/region/[regionId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";

// Map region codes to DB region names
const REGION_CODE_TO_DB_REGION: Record<string, string> = {
  CENLA: "Central Louisiana",
  SWLA: "Southwest Louisiana",
  NOLA: "New Orleans",
  NELA: "Northeast Louisiana",
  SELA: "Southeast Louisiana",
};

// Allowed intervals (in hours)
const INTERVALS: Record<string, number> = {
  "12h": 12,
  "24h": 24,
  "1w": 24 * 7,
  "1m": 24 * 30,
  "6m": 24 * 180,
  "12m": 24 * 365
};

// How many months of history to read
const HISTORY_MONTHS = 6;

type RouteContext = { params: Promise<{ regionId: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  const { regionId } = await context.params;
  const { searchParams } = new URL(req.url);
  const interval = searchParams.get("interval") || "24h";

  if (!INTERVALS[interval]) {
    return NextResponse.json(
      { error: "Invalid interval" },
      { status: 400 }
    );
  }

  const regionCode = regionId.toUpperCase();
  const dbRegion = REGION_CODE_TO_DB_REGION[regionCode] ?? regionId;

  try {
    // Step 1 — Pull historical calls for this region with lat/lng
    const result = await query<{
      lat: string;
      lng: string;
      response_date: string;
      assigned_to_arrived_at_scene: string | null;
    }>(
      `
      SELECT
        c.origin_latitude::numeric AS lat,
        c.origin_longitude::numeric AS lng,
        c.response_date,
        c.assigned_to_arrived_at_scene
      FROM calls c
      JOIN parishes p ON c.parish_id = p.id
      WHERE p.region = $1
        AND c.origin_latitude IS NOT NULL
        AND c.origin_longitude IS NOT NULL
        AND c.origin_latitude::numeric != 0
        AND c.origin_longitude::numeric != 0
        AND to_date(c.response_date, 'MM/DD/YYYY') >= CURRENT_DATE - INTERVAL '${HISTORY_MONTHS} months'
      LIMIT 5000
      `,
      [dbRegion]
    );

    const rows = result.rows;

    if (rows.length === 0) {
      // Return empty forecast instead of error
      return NextResponse.json({
        regionId: regionCode,
        interval,
        summary: {
          expected_calls: 0,
          risk_score: 0
        },
        hotspots: []
      });
    }

    // Step 2 — Extract lat/lng as vectors
    const vectors = rows.map((r) => [parseFloat(r.lat), parseFloat(r.lng)]);

    // Step 3 — Simple clustering (k-means alternative without external dependency)
    // Group points into grid cells and find centroids
    const gridSize = 0.1; // ~10km grid cells
    const grid: Record<string, { lat: number; lng: number; count: number }> = {};

    vectors.forEach(([lat, lng]) => {
      const key = `${Math.floor(lat / gridSize)}_${Math.floor(lng / gridSize)}`;
      if (!grid[key]) {
        grid[key] = { lat: 0, lng: 0, count: 0 };
      }
      grid[key].lat += lat;
      grid[key].lng += lng;
      grid[key].count++;
    });

    // Get top 5 hotspots by count
    const hotspots = Object.values(grid)
      .map(cell => ({
        lat: cell.lat / cell.count,
        lng: cell.lng / cell.count,
        intensity: cell.count / rows.length
      }))
      .sort((a, b) => b.intensity - a.intensity)
      .slice(0, 5);

    // Step 4 — Project future calls
    const avgPerHour = rows.length / (24 * HISTORY_MONTHS * 30);
    const forecastHours = INTERVALS[interval];
    const expectedCalls = Math.round(avgPerHour * forecastHours);

    // Step 5 — Calculate OOC risk based on response times
    // Parse response time strings like "00:08:30" to seconds
    const parseTimeToSeconds = (timeStr: string | null): number | null => {
      if (!timeStr) return null;
      const parts = timeStr.split(":");
      if (parts.length !== 3) return null;
      return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
    };

    const responseTimes = rows
      .map(r => parseTimeToSeconds(r.assigned_to_arrived_at_scene))
      .filter((t): t is number => t !== null);

    const oocThreshold = 8 * 60; // 8 minutes in seconds
    const oocCount = responseTimes.filter(t => t > oocThreshold).length;
    const oocRate = responseTimes.length > 0 ? oocCount / responseTimes.length : 0;

    const riskScore = Math.min(
      1,
      (oocRate * 0.6) + (forecastHours / (24 * 30)) * 0.4
    );

    return NextResponse.json({
      regionId: regionCode,
      interval,
      summary: {
        expected_calls: expectedCalls,
        risk_score: riskScore
      },
      hotspots
    });
  } catch (err: any) {
    console.error("Forecast Error:", err);
    return NextResponse.json(
      { error: "Internal error", details: err?.message },
      { status: 500 }
    );
  }
}