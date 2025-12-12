import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

const GEOAPIFY_API_KEY = process.env.GEOAPIFY_API_KEY;

// Helper: turn "DeRidder" → "deridder", "St. Landry" → "st_landry"
function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function POST(req: NextRequest) {
  try {
    if (!GEOAPIFY_API_KEY) {
      return NextResponse.json(
        { error: "GEOAPIFY_API_KEY not set" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const cityName = String(body.city || "").trim();
    const regionCode = String(body.region || "CENLA").trim(); // e.g., CENLA
    const state = String(body.state || "Louisiana").trim();
    const country = String(body.country || "USA").trim();

    if (!cityName) {
      return NextResponse.json(
        { error: "Missing 'city' in request body" },
        { status: 400 }
      );
    }

    // 1) Call Geoapify Boundaries API for this city
    const url =
      "https://api.geoapify.com/v1/boundaries?" +
      new URLSearchParams({
        city: cityName,
        state,
        country,
        format: "geojson",
        apiKey: GEOAPIFY_API_KEY,
      }).toString();

    const res = await fetch(url);
    if (!res.ok) {
      console.error("Geoapify error:", res.status, res.statusText);
      return NextResponse.json(
        { error: "Failed to fetch boundaries from Geoapify" },
        { status: 502 }
      );
    }

    const data = await res.json();

    if (!data?.features?.length) {
      return NextResponse.json(
        { error: "No boundary features returned for this city" },
        { status: 404 }
      );
    }

    // Take the first feature's geometry as the city boundary
    const feature = data.features[0];
    const geometry = feature.geometry;

    if (!geometry) {
      return NextResponse.json(
        { error: "Geoapify feature had no geometry" },
        { status: 500 }
      );
    }

    const cityCode = slugify(cityName);

    // 2) Ensure a `jurisdictions` row exists for this city
    const jurisResult = await query<{
      id: number;
    }>(
      `
      INSERT INTO jurisdictions (type_id, code, name, region_code)
      VALUES (
        (SELECT id FROM jurisdiction_types WHERE code = 'city'),
        $1,
        $2,
        $3
      )
      ON CONFLICT (type_id, code) DO UPDATE
      SET name = EXCLUDED.name,
          region_code = EXCLUDED.region_code
      RETURNING id;
      `,
      [cityCode, cityName, regionCode]
    );

    const jurisdictionId = jurisResult.rows[0].id;

    // 3) Insert/update the boundary as 'external' from Geoapify
    await query(
      `
      INSERT INTO jurisdiction_boundaries
        (jurisdiction_id, source_id, boundary_role, geom)
      VALUES (
        $1,
        (SELECT id FROM boundary_sources WHERE name = 'geoapify'),
        'external',
        ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)
      )
      ON CONFLICT (jurisdiction_id, source_id, boundary_role) DO UPDATE
      SET geom = EXCLUDED.geom;
      `,
      [jurisdictionId, JSON.stringify(geometry)]
    );

    return NextResponse.json(
      {
        success: true,
        city: cityName,
        jurisdictionId,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Error in /api/admin/import-city:", err);
    return NextResponse.json(
      { error: "Internal error importing city boundary" },
      { status: 500 }
    );
  }
}
