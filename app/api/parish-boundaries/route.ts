import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

const ARCGIS_PARISH_GEOJSON_URL =
  "https://maps.dotd.la.gov/topo/rest/services/OpenData/Boundaries/FeatureServer/5/query" +
  "?where=1%3D1" +
  "&outFields=*" +
  "&outSR=4326" +
  "&f=geojson";

// Map short region codes → DB region strings
const REGION_CODE_TO_DB_REGION: Record<string, string> = {
  CENLA: "Central Louisiana",
  SWLA: "Southwest LA",
  // add more if needed
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const regionParam = searchParams.get("region") || "CENLA";
    const withFlags = searchParams.get("withFlags") === "true";

    const regionCode = regionParam.toUpperCase();
    const dbRegion =
      REGION_CODE_TO_DB_REGION[regionCode] ?? regionParam;

    // 1) ArcGIS FeatureCollection (all parishes)
    const res = await fetch(ARCGIS_PARISH_GEOJSON_URL);
    if (!res.ok) {
      console.error(
        "ArcGIS parish fetch failed:",
        res.status,
        res.statusText
      );
      return NextResponse.json(
        { error: "Failed to fetch parish boundaries from upstream" },
        { status: 502 }
      );
    }

    const data = await res.json();

    // If caller didn't ask for flags, just pass through
    if (!withFlags || !data?.features) {
      return NextResponse.json(data, {
        status: 200,
        headers: {
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    // 2) Get parishes for this region from Neon
    type ParishRow = {
      id: number;
      name: string;
      region: string;
      is_contracted: boolean;
    };

    const parishRes = await query<ParishRow>(
      `
        SELECT id, name, region, is_contracted
        FROM parishes
        WHERE region = $1;
      `,
      [dbRegion]
    );

    // Build lookups keyed by UPPERCASE name
    const nameToIdMap: Record<string, number> = {};
    const contractedNameSet = new Set<string>();

    for (const row of parishRes.rows) {
      const nameUpper = row.name.toUpperCase().trim();
      nameToIdMap[nameUpper] = row.id;
      if (row.is_contracted) {
        contractedNameSet.add(nameUpper);
      }
    }

    // 3) Enrich ArcGIS features with parishId + contracted
    const features = data.features.map((f: any) => {
      const props = f.properties || {};

      const rawName =
        props.ParishName ??
        props.PARISH_NAM ??
        props.parish_name ??
        props.NAME ??
        "";

      const nameUpper = String(rawName).toUpperCase().trim();

      const parishId = nameToIdMap[nameUpper] ?? null;
      const isContracted = contractedNameSet.has(nameUpper);

      return {
        ...f,
        properties: {
          ...props,
          ParishName: rawName, // keep original label
          parishId,
          contracted: isContracted,
        },
      };
    });

    const enriched = {
      ...data,
      features,
    };

    return NextResponse.json(enriched, {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("Error in /api/parish-boundaries:", err);
    return NextResponse.json(
      { error: "Internal error fetching parish boundaries" },
      { status: 500 }
    );
  }
}
