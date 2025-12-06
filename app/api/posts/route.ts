// app/api/posts/route.ts
// API for managing coverage posts (staging locations for units)

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

// GET /api/posts?region_id=CENLA - Get all posts for a region
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const regionId = searchParams.get('region_id');

  try {
    // Check if posts table exists, create if not
    await query(`
      CREATE TABLE IF NOT EXISTS coverage_posts (
        id SERIAL PRIMARY KEY,
        region_id VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        address TEXT,
        intersection TEXT,
        lat DECIMAL(10, 6),
        lng DECIMAL(10, 6),
        default_units INTEGER DEFAULT 1,
        is_active BOOLEAN DEFAULT true,
        coverage_level INTEGER DEFAULT 4,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    let sql = `
      SELECT id, region_id, name, address, intersection, lat, lng,
             default_units, is_active, coverage_level
      FROM coverage_posts
      WHERE is_active = true
    `;
    const params: any[] = [];

    if (regionId) {
      sql += ` AND region_id = $1`;
      params.push(regionId);
    }

    sql += ` ORDER BY coverage_level DESC, name`;

    const result = await query(sql, params);

    return NextResponse.json({
      ok: true,
      posts: result.rows.map((row: any) => ({
        id: row.id,
        regionId: row.region_id,
        name: row.name,
        address: row.address,
        intersection: row.intersection,
        lat: row.lat ? parseFloat(row.lat) : null,
        lng: row.lng ? parseFloat(row.lng) : null,
        defaultUnits: row.default_units,
        isActive: row.is_active,
        coverageLevel: row.coverage_level,
      })),
    });
  } catch (err: any) {
    console.error('GET /api/posts error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch posts', details: err.message },
      { status: 500 }
    );
  }
}

// POST /api/posts - Create a new post
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { regionId, name, address, intersection, lat, lng, defaultUnits, coverageLevel } = body;

  if (!regionId || !name) {
    return NextResponse.json({ error: 'regionId and name are required' }, { status: 400 });
  }

  try {
    const result = await query(
      `INSERT INTO coverage_posts
       (region_id, name, address, intersection, lat, lng, default_units, coverage_level)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, region_id, name, address, intersection, lat, lng, default_units, coverage_level`,
      [
        regionId,
        name.trim(),
        address?.trim() || null,
        intersection?.trim() || null,
        lat || null,
        lng || null,
        defaultUnits || 1,
        coverageLevel || 4,
      ]
    );

    const row = result.rows[0] as any;
    return NextResponse.json({
      ok: true,
      post: {
        id: row.id,
        regionId: row.region_id,
        name: row.name,
        address: row.address,
        intersection: row.intersection,
        lat: row.lat ? parseFloat(row.lat) : null,
        lng: row.lng ? parseFloat(row.lng) : null,
        defaultUnits: row.default_units,
        coverageLevel: row.coverage_level,
      },
    });
  } catch (err: any) {
    console.error('POST /api/posts error:', err);
    return NextResponse.json(
      { error: 'Failed to create post', details: err.message },
      { status: 500 }
    );
  }
}

