// app/api/isochrone/route.ts
// Generates isochrone polygons using OpenRouteService API

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/isochrone?lat=31.2&lng=-92.4&minutes=8
 * 
 * Returns a GeoJSON polygon representing the area reachable within the specified time.
 * Uses OpenRouteService API for isochrone generation.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const latParam = searchParams.get("lat");
    const lngParam = searchParams.get("lng");
    const minutesParam = searchParams.get("minutes") || "8";

    if (!latParam || !lngParam) {
      return NextResponse.json(
        { error: "lat and lng parameters are required" },
        { status: 400 }
      );
    }

    const lat = parseFloat(latParam);
    const lng = parseFloat(lngParam);
    const minutes = parseInt(minutesParam, 10);

    if (isNaN(lat) || isNaN(lng)) {
      return NextResponse.json(
        { error: "Invalid lat/lng values" },
        { status: 400 }
      );
    }

    if (isNaN(minutes) || minutes <= 0 || minutes > 60) {
      return NextResponse.json(
        { error: "minutes must be between 1 and 60" },
        { status: 400 }
      );
    }

    const orsApiKey = process.env.ORS_API_KEY;
    if (!orsApiKey) {
      return NextResponse.json(
        { error: "ORS_API_KEY is not configured on the server" },
        { status: 500 }
      );
    }

    const rangeSeconds = minutes * 60;

    // Call OpenRouteService isochrone API
    const orsRes = await fetch(
      "https://api.openrouteservice.org/v2/isochrones/driving-car",
      {
        method: "POST",
        headers: {
          Authorization: orsApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          locations: [[lng, lat]], // ORS uses [lon, lat] order
          range: [rangeSeconds],
          units: "m",
          attributes: ["area"],
        }),
      }
    );

    if (!orsRes.ok) {
      const text = await orsRes.text();
      console.error("ORS API error:", orsRes.status, text);
      return NextResponse.json(
        { error: `ORS API error: ${orsRes.status}`, details: text },
        { status: 502 }
      );
    }

    const orsData = await orsRes.json();

    if (!orsData?.features?.length) {
      return NextResponse.json(
        { error: "No isochrone data returned from ORS" },
        { status: 404 }
      );
    }

    const feature = orsData.features[0];

    return NextResponse.json({
      lat,
      lng,
      minutes,
      feature: {
        type: "Feature",
        properties: {
          center: [lat, lng],
          minutes,
          area_sqm: feature.properties?.area || null,
        },
        geometry: feature.geometry,
      },
    });
  } catch (err: any) {
    console.error("Isochrone API error:", err);
    return NextResponse.json(
      { error: "Failed to generate isochrone", details: err?.message },
      { status: 500 }
    );
  }
}

