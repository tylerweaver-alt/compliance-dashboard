import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/deployment/isochrones/rebuild?region=CENLA&minutes=8
 *
 * - Fetches all active deployment_sites for a region
 * - Calls OpenRouteService isochrone API for each site
 * - Upserts the resulting polygon into deployment_isochrones
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const region = searchParams.get("region") ?? "CENLA";
    const minutesStr = searchParams.get("minutes") ?? "8";

    const minutes = parseInt(minutesStr, 10);
    if (Number.isNaN(minutes) || minutes <= 0) {
      return NextResponse.json(
        { error: "Invalid minutes parameter" },
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

    // 1) Load active deployment sites for this region
    const sitesRes = await query<{
      id: number;
      name: string;
      latitude: number;
      longitude: number;
    }>(
      `
      SELECT id, name, latitude, longitude
      FROM deployment_sites
      WHERE is_active = TRUE
        AND region = $1
      ORDER BY id;
      `,
      [region]
    );

    const sites = sitesRes.rows;

    if (sites.length === 0) {
      return NextResponse.json(
        { message: `No active deployment sites found for region ${region}.` },
        { status: 200 }
      );
    }

    const results: any[] = [];
    const errors: any[] = [];

    // 2) For each site, call OpenRouteService isochrone API
    for (const site of sites) {
      try {
        const { id: siteId, name, latitude, longitude } = site;

        const rangeSeconds = minutes * 60; // ORS expects seconds

        const orsRes = await fetch(
          "https://api.openrouteservice.org/v2/isochrones/driving-car",
          {
            method: "POST",
            headers: {
              Authorization: orsApiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              locations: [[longitude, latitude]], // [lon, lat]
              range: [rangeSeconds],
              units: "m",
              attributes: ["area"],
            }),
          }
        );

        if (!orsRes.ok) {
          const text = await orsRes.text();
          console.error("ORS error for site", siteId, name, text);
          errors.push({
            siteId,
            name,
            error: `ORS error: ${orsRes.status}`,
            details: text,
          });
          continue;
        }

        const orsData = await orsRes.json();

        if (
          !orsData ||
          !orsData.features ||
          !Array.isArray(orsData.features) ||
          orsData.features.length === 0
        ) {
          console.error("ORS response missing features for site", siteId, name);
          errors.push({
            siteId,
            name,
            error: "ORS response missing features",
          });
          continue;
        }

        const geometry = orsData.features[0].geometry;
        const geometryJson = JSON.stringify(geometry);

        // 3) Upsert into deployment_isochrones
        await query(
          `
          INSERT INTO deployment_isochrones (site_id, minutes, geom)
          VALUES (
            $1,
            $2,
            ST_SetSRID(
              ST_GeomFromGeoJSON($3),
              4326
            )
          )
          ON CONFLICT (site_id, minutes)
          DO UPDATE SET
            geom       = EXCLUDED.geom,
            created_at = NOW();
          `,
          [siteId, minutes, geometryJson]
        );

        results.push({
          siteId,
          name,
          minutes,
          status: "updated",
        });
      } catch (err: any) {
        console.error("Error processing site", site.id, site.name, err);
        errors.push({
          siteId: site.id,
          name: site.name,
          error: err?.message || "Unknown error",
        });
      }
    }

    return NextResponse.json(
      {
        region,
        minutes,
        processedSites: sites.length,
        updated: results.length,
        results,
        errors,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Isochrones rebuild route error:", err);
    return NextResponse.json(
      {
        error: "Server error rebuilding isochrones",
        details: err?.message,
      },
      { status: 500 }
    );
  }
}
