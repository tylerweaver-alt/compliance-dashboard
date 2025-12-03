// app/api/coverage-level/route.ts
// Returns GeoJSON isochrone polygons for coverage visualization

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import type { TimeBand } from '@/lib/coverage-types';

export const runtime = 'nodejs';

const TIME_BAND_COLORS: Record<TimeBand | 'beyond', string> = {
  '0-8': '#22c55e',
  '8-12': '#84cc16',
  '12-20': '#eab308',
  '20-25': '#f97316',
  '25-30': '#ef4444',
  'beyond': '#6b7280',
};

interface DbPost {
  id: number;
  name: string;
  lat: number;
  lng: number;
  defaultUnits: number;
  coverageLevel: number;
}

/**
 * GET /api/coverage-level?level=3&region_id=CENLA
 *
 * Returns GeoJSON FeatureCollection of isochrone polygons for each post
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const levelParam = searchParams.get('level');
    const regionId = searchParams.get('region_id') || 'CENLA';

    const level = parseInt(levelParam || '3', 10);

    // Fetch posts from database for this region and level
    let posts: DbPost[] = [];

    const result = await query(
      `SELECT id, name, lat, lng, default_units, coverage_level
       FROM coverage_posts
       WHERE region_id = $1 AND is_active = true AND coverage_level <= $2 AND lat IS NOT NULL AND lng IS NOT NULL
       ORDER BY coverage_level DESC, name`,
      [regionId, level]
    );

    posts = result.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      lat: parseFloat(row.lat),
      lng: parseFloat(row.lng),
      defaultUnits: row.default_units,
      coverageLevel: row.coverage_level,
    }));

    // If no posts in database, return empty
    if (posts.length === 0) {
      return NextResponse.json({
        type: 'FeatureCollection',
        features: [],
        meta: {
          level,
          postCount: 0,
          featureCount: 0,
          hasRealIsochrones: false,
          message: 'No posts configured. Add posts via Region Settings.',
        },
      });
    }
    const features: GeoJSON.Feature[] = [];

    // Check for ORS API key
    const orsApiKey = process.env.ORS_API_KEY;

    if (orsApiKey) {
      // Use real OpenRouteService isochrones
      const timeRanges = [8, 12, 20]; // minutes

      for (const post of posts) {
        try {
          const orsRes = await fetch(
            "https://api.openrouteservice.org/v2/isochrones/driving-car",
            {
              method: "POST",
              headers: {
                Authorization: orsApiKey,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                locations: [[post.lng, post.lat]],
                range: timeRanges.map(m => m * 60), // Convert to seconds
                units: "m",
              }),
            }
          );

          if (orsRes.ok) {
            const orsData = await orsRes.json();
            // ORS returns features in reverse order (largest first)
            if (orsData?.features) {
              orsData.features.forEach((feature: any, idx: number) => {
                const minutes = timeRanges[timeRanges.length - 1 - idx];
                const band = minutes <= 8 ? '0-8' : minutes <= 12 ? '8-12' : '12-20';
                features.push({
                  type: 'Feature',
                  properties: {
                    time_band: band as TimeBand,
                    time_min: minutes,
                    post_id: post.id,
                    post_name: post.name,
                    color: TIME_BAND_COLORS[band as TimeBand],
                    isIsochrone: true,
                  },
                  geometry: feature.geometry,
                });
              });
            }
          }
        } catch (err) {
          console.error(`Error fetching isochrone for ${post.name}:`, err);
        }
      }
    }

    // Fallback or addition: Generate approximate circular coverage areas
    if (features.length === 0) {
      const timeBands: { band: TimeBand; minutes: number; radiusKm: number }[] = [
        { band: '0-8', minutes: 8, radiusKm: 12 },
        { band: '8-12', minutes: 12, radiusKm: 18 },
        { band: '12-20', minutes: 20, radiusKm: 28 },
      ];

      for (const post of posts) {
        // Create circles from largest to smallest (for proper layering)
        for (let t = timeBands.length - 1; t >= 0; t--) {
          const { band, minutes, radiusKm } = timeBands[t];
          const numPoints = 64;
          const coordinates: [number, number][] = [];

          for (let i = 0; i <= numPoints; i++) {
            const angle = (i / numPoints) * 2 * Math.PI;
            const latOffset = (radiusKm / 111) * Math.cos(angle);
            const lngOffset = (radiusKm / (111 * Math.cos(post.lat * Math.PI / 180))) * Math.sin(angle);
            coordinates.push([post.lng + lngOffset, post.lat + latOffset]);
          }

          features.push({
            type: 'Feature',
            properties: {
              time_band: band,
              time_min: minutes,
              post_id: post.id,
              post_name: post.name,
              color: TIME_BAND_COLORS[band],
              isIsochrone: true,
              approximate: true,
            },
            geometry: {
              type: 'Polygon',
              coordinates: [coordinates],
            },
          });
        }
      }
    }

    // Add post location markers
    posts.forEach(post => {
      features.push({
        type: 'Feature',
        properties: {
          type: 'post_marker',
          post_id: post.id,
          post_name: post.name,
          default_units: post.defaultUnits,
        },
        geometry: {
          type: 'Point',
          coordinates: [post.lng, post.lat],
        },
      });
    });

    return NextResponse.json({
      type: 'FeatureCollection',
      features,
      meta: {
        level,
        levelLabel: `Level ${level}`,
        postCount: posts.length,
        featureCount: features.length,
        hasRealIsochrones: !!orsApiKey && features.some(f => f.properties?.isIsochrone && !f.properties?.approximate),
      },
    });
  } catch (err: any) {
    console.error('Error in /api/coverage-level:', err);
    return NextResponse.json(
      { error: 'Failed to generate coverage data', details: err?.message },
      { status: 500 }
    );
  }
}

