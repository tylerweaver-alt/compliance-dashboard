// app/api/forecast/region/[regionId]/optimize-posts/route.ts

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

type RouteContext = { params: Promise<{ regionId: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  const { regionId } = await context.params;
  const regionCode = regionId.toUpperCase();
  const dbRegion = REGION_CODE_TO_DB_REGION[regionCode] ?? regionId;

  // Get query params
  const { searchParams } = new URL(req.url);
  const count = Math.min(20, Math.max(1, parseInt(searchParams.get("count") || "4")));
  const parishId = searchParams.get("parishId");

  try {
    // Build query based on whether we're filtering by parish or region
    let sqlQuery: string;
    let params: (string | number)[];

    if (parishId) {
      // Filter by specific parish
      sqlQuery = `
        SELECT
          c.origin_latitude::numeric AS lat,
          c.origin_longitude::numeric AS lng,
          p.id AS parish_id,
          p.name AS parish_name
        FROM calls c
        JOIN parishes p ON c.parish_id = p.id
        WHERE c.parish_id = $1
          AND c.origin_latitude IS NOT NULL
          AND c.origin_longitude IS NOT NULL
          AND c.origin_latitude::numeric != 0
          AND c.origin_longitude::numeric != 0
          AND to_date(c.response_date, 'MM/DD/YYYY') >= CURRENT_DATE - INTERVAL '6 months'
        LIMIT 10000
      `;
      params = [parseInt(parishId)];
    } else {
      // Get all parishes in region
      sqlQuery = `
        SELECT
          c.origin_latitude::numeric AS lat,
          c.origin_longitude::numeric AS lng,
          p.id AS parish_id,
          p.name AS parish_name
        FROM calls c
        JOIN parishes p ON c.parish_id = p.id
        WHERE p.region = $1
          AND c.origin_latitude IS NOT NULL
          AND c.origin_longitude IS NOT NULL
          AND c.origin_latitude::numeric != 0
          AND c.origin_longitude::numeric != 0
          AND to_date(c.response_date, 'MM/DD/YYYY') >= CURRENT_DATE - INTERVAL '6 months'
        LIMIT 20000
      `;
      params = [dbRegion];
    }

    const result = await query<{
      lat: string;
      lng: string;
      parish_id: number;
      parish_name: string;
    }>(sqlQuery, params);

    const rows = result.rows;

    if (rows.length === 0) {
      return NextResponse.json({
        regionId: regionCode,
        optimal_posts: []
      });
    }

    // Group calls by parish to ensure coverage across all parishes
    const parishCalls: Record<number, { name: string; calls: { lat: number; lng: number }[] }> = {};

    rows.forEach((r) => {
      const lat = parseFloat(r.lat);
      const lng = parseFloat(r.lng);
      const pid = r.parish_id;

      if (!parishCalls[pid]) {
        parishCalls[pid] = { name: r.parish_name, calls: [] };
      }
      parishCalls[pid].calls.push({ lat, lng });
    });

    const parishes = Object.entries(parishCalls);
    const totalCalls = rows.length;

    // Distribute units across parishes based on call volume
    // Each parish gets at least 1 post if there are enough units
    const parishAllocations: { parishId: number; name: string; calls: { lat: number; lng: number }[]; units: number }[] = [];

    // Calculate call weight per parish
    parishes.forEach(([pid, data]) => {
      parishAllocations.push({
        parishId: parseInt(pid),
        name: data.name,
        calls: data.calls,
        units: 0
      });
    });

    // Sort by call volume (descending)
    parishAllocations.sort((a, b) => b.calls.length - a.calls.length);

    // Distribute units: first give each parish 1, then distribute remaining by call volume
    let remainingUnits = count;

    // First pass: give each parish at least 1 unit (if we have enough units)
    for (let i = 0; i < parishAllocations.length && remainingUnits > 0; i++) {
      parishAllocations[i].units = 1;
      remainingUnits--;
    }

    // Second pass: distribute remaining units proportionally by call volume
    while (remainingUnits > 0) {
      // Give next unit to parish with highest calls-per-unit ratio
      let bestIdx = 0;
      let bestRatio = 0;

      for (let i = 0; i < parishAllocations.length; i++) {
        const ratio = parishAllocations[i].calls.length / (parishAllocations[i].units + 1);
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestIdx = i;
        }
      }

      parishAllocations[bestIdx].units++;
      remainingUnits--;
    }

    // Now calculate optimal posts for each parish based on allocated units
    const allOptimalPosts: {
      lat: number;
      lng: number;
      score: number;
      size: number;
      coverage: number;
      ooc: boolean;
      parish: string;
    }[] = [];

    for (const parish of parishAllocations) {
      if (parish.units === 0 || parish.calls.length === 0) continue;

      // Grid-based clustering within this parish
      const gridSize = 0.04; // ~4km grid cells (smaller for more precision)
      const grid: Record<string, { lat: number; lng: number; count: number }> = {};

      parish.calls.forEach((c) => {
        const key = `${Math.floor(c.lat / gridSize)}_${Math.floor(c.lng / gridSize)}`;
        if (!grid[key]) {
          grid[key] = { lat: 0, lng: 0, count: 0 };
        }
        grid[key].lat += c.lat;
        grid[key].lng += c.lng;
        grid[key].count++;
      });

      // Get centroids
      const centroids = Object.values(grid).map(cell => ({
        lat: cell.lat / cell.count,
        lng: cell.lng / cell.count,
        size: cell.count
      }));

      if (centroids.length === 0) continue;

      // Score centroids
      const scored = centroids.map((c) => {
        // Score based on cluster size (more calls = higher priority)
        let score = (c.size / parish.calls.length) * 100;

        // Calculate coverage (percentage of parish calls within 8 min drive ~10 miles)
        const coverage = centroids.reduce((acc, other) => {
          const dist = haversine(c.lat, c.lng, other.lat, other.lng);
          if (dist <= 10) {
            return acc + other.size;
          }
          return acc;
        }, 0) / parish.calls.length;

        // Boost score for better coverage
        score += coverage * 50;

        // Determine if out of compliance (if coverage < 85%)
        const ooc = coverage < 0.85;

        return {
          lat: c.lat,
          lng: c.lng,
          score,
          size: c.size,
          coverage,
          ooc,
          parish: parish.name
        };
      });

      // Select top N posts for this parish (where N = allocated units)
      // Use a greedy approach to maximize coverage
      const selected: typeof scored = [];
      const remaining = [...scored].sort((a, b) => b.score - a.score);

      while (selected.length < parish.units && remaining.length > 0) {
        // Pick the highest scored remaining centroid
        const best = remaining.shift()!;
        selected.push(best);

        // Penalize nearby centroids to encourage spread
        remaining.forEach(c => {
          const dist = haversine(best.lat, best.lng, c.lat, c.lng);
          if (dist < 8) {
            c.score *= 0.5; // Reduce score for nearby centroids
          }
        });

        // Re-sort remaining by score
        remaining.sort((a, b) => b.score - a.score);
      }

      allOptimalPosts.push(...selected);
    }

    // Sort all posts by score and return
    allOptimalPosts.sort((a, b) => b.score - a.score);

    return NextResponse.json({
      regionId: regionCode,
      parishId: parishId || null,
      unitCount: count,
      optimal_posts: allOptimalPosts
    });
  } catch (err: any) {
    console.error("OptimizePosts Error:", err);
    return NextResponse.json(
      { error: "Internal server error", details: err?.message },
      { status: 500 }
    );
  }
}

// Simple distance calculator (Haversine formula)
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}