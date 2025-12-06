import { NextRequest, NextResponse } from "next/server";

// TEMP: simple in-memory GeoJSON by parishId
// Replace later with DB/PostGIS lookup.
const mockParishFeatures: Record<number, any> = {
  6: {
    type: "Feature",
    properties: { parishId: 6, name: "Evangeline Parish" },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-92.5, 30.8],
          [-92.2, 30.8],
          [-92.2, 30.6],
          [-92.5, 30.6],
          [-92.5, 30.8],
        ],
      ],
    },
  },
  // add others as needed
};

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parishIdStr = searchParams.get("parishId");

  if (!parishIdStr) {
    return NextResponse.json(
      { error: "parishId is required" },
      { status: 400 }
    );
  }

  const parishId = Number(parishIdStr);
  const feature = mockParishFeatures[parishId];

  if (!feature) {
    return NextResponse.json(
      { error: "Parish boundary not found for this parishId" },
      { status: 404 }
    );
  }

  return NextResponse.json({ feature }, { status: 200 });
}
