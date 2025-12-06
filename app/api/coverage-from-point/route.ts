// app/api/coverage-from-point/route.ts
// Returns GeoJSON isochrone polygons showing reachable area by time from a point
// Uses OpenRouteService API for real road-based routing

import { NextRequest, NextResponse } from 'next/server';
import { TIME_BAND_COLORS, type TimeBand } from '@/lib/coverage-types';

export const runtime = 'nodejs';

const ORS_API_KEY = process.env.ORS_API_KEY;

/**
 * GET /api/coverage-from-point?lat=31.3&lng=-92.4&maxMinutes=30
 *
 * Returns GeoJSON FeatureCollection of isochrone polygons showing
 * areas reachable within different time bands from a point.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const latParam = searchParams.get('lat');
    const lngParam = searchParams.get('lng');
    const maxMinutesParam = searchParams.get('maxMinutes') || '30';

    if (!latParam || !lngParam) {
      return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 });
    }

    const lat = parseFloat(latParam);
    const lng = parseFloat(lngParam);
    const maxMinutes = parseInt(maxMinutesParam, 10);

    if (isNaN(lat) || isNaN(lng)) {
      return NextResponse.json({ error: 'Invalid lat/lng values' }, { status: 400 });
    }

    if (!ORS_API_KEY) {
      console.warn('ORS_API_KEY not set, returning empty coverage');
      return NextResponse.json({
        type: 'FeatureCollection',
        features: [],
        meta: { error: 'Routing API not configured' },
      });
    }

    // Time ranges in seconds for each band (working outward)
    // We request multiple ranges and ORS returns nested polygons
    const timeRangesSeconds = [
      8 * 60,   // 8 min
      12 * 60,  // 12 min
      20 * 60,  // 20 min
      25 * 60,  // 25 min
      30 * 60,  // 30 min
    ].filter(t => t <= maxMinutes * 60);

    if (timeRangesSeconds.length === 0) {
      timeRangesSeconds.push(maxMinutes * 60);
    }

    // Call OpenRouteService Isochrones API
    const orsResponse = await fetch('https://api.openrouteservice.org/v2/isochrones/driving-car', {
      method: 'POST',
      headers: {
        'Authorization': ORS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        locations: [[lng, lat]],
        range: timeRangesSeconds,
        range_type: 'time',
        units: 'm',
        attributes: ['total_pop'], // Optional
      }),
    });

    if (!orsResponse.ok) {
      const errorText = await orsResponse.text();
      console.error('ORS API error:', orsResponse.status, errorText);
      return NextResponse.json({
        type: 'FeatureCollection',
        features: [],
        meta: { error: 'Routing API error', status: orsResponse.status },
      });
    }

    const orsData = await orsResponse.json();

    // Transform ORS response to our format with time bands and colors
    const features: GeoJSON.Feature[] = [];

    if (orsData.features && Array.isArray(orsData.features)) {
      // ORS returns features from largest to smallest, we want smallest first for proper layering
      const sortedFeatures = [...orsData.features].sort((a, b) => {
        const aValue = a.properties?.value || 0;
        const bValue = b.properties?.value || 0;
        return aValue - bValue;
      });

      sortedFeatures.forEach((feature: any) => {
        const valueSeconds = feature.properties?.value || 0;
        const valueMinutes = valueSeconds / 60;

        // Determine which time band this belongs to
        let timeBand: TimeBand;
        if (valueMinutes <= 8) timeBand = '0-8';
        else if (valueMinutes <= 12) timeBand = '8-12';
        else if (valueMinutes <= 20) timeBand = '12-20';
        else if (valueMinutes <= 25) timeBand = '20-25';
        else timeBand = '25-30';

        features.push({
          type: 'Feature',
          properties: {
            time_min: valueMinutes,
            time_band: timeBand,
            color: TIME_BAND_COLORS[timeBand],
            from_hypothetical: true,
            value_seconds: valueSeconds,
          },
          geometry: feature.geometry,
        });
      });
    }

    return NextResponse.json({
      type: 'FeatureCollection',
      features,
      meta: {
        origin: { lat, lng },
        maxMinutes,
        featureCount: features.length,
        hypothetical: true,
        source: 'openrouteservice',
      },
    });
  } catch (err: any) {
    console.error('Error in /api/coverage-from-point:', err);
    return NextResponse.json(
      { error: 'Failed to generate coverage data', details: err?.message },
      { status: 500 }
    );
  }
}

