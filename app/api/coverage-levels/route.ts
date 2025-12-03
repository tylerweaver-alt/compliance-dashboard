// app/api/coverage-levels/route.ts
// API for managing coverage levels per region

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

// Initialize tables
async function initTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS coverage_levels (
      id SERIAL PRIMARY KEY,
      region_id VARCHAR(50) NOT NULL,
      level_number INTEGER NOT NULL,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      color VARCHAR(20) DEFAULT '#6b7280',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(region_id, level_number)
    )
  `);
  
  // Junction table for which posts are active at each level
  await query(`
    CREATE TABLE IF NOT EXISTS coverage_level_posts (
      id SERIAL PRIMARY KEY,
      level_id INTEGER REFERENCES coverage_levels(id) ON DELETE CASCADE,
      post_id INTEGER REFERENCES coverage_posts(id) ON DELETE CASCADE,
      UNIQUE(level_id, post_id)
    )
  `);
}

// GET /api/coverage-levels?region_id=CENLA
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const regionId = searchParams.get('region_id');

  if (!regionId) {
    return NextResponse.json({ error: 'region_id is required' }, { status: 400 });
  }

  try {
    await initTables();

    // Get levels with their assigned posts
    const levelsResult = await query(`
      SELECT cl.id, cl.region_id, cl.level_number, cl.name, cl.description, cl.color,
             COALESCE(
               json_agg(
                 json_build_object('id', cp.id, 'name', cp.name)
               ) FILTER (WHERE cp.id IS NOT NULL),
               '[]'
             ) as posts
      FROM coverage_levels cl
      LEFT JOIN coverage_level_posts clp ON clp.level_id = cl.id
      LEFT JOIN coverage_posts cp ON cp.id = clp.post_id AND cp.is_active = true
      WHERE cl.region_id = $1 AND cl.is_active = true
      GROUP BY cl.id
      ORDER BY cl.level_number DESC
    `, [regionId]);

    return NextResponse.json({
      ok: true,
      levels: levelsResult.rows.map((row: any) => ({
        id: row.id,
        regionId: row.region_id,
        levelNumber: row.level_number,
        name: row.name,
        description: row.description,
        color: row.color,
        posts: row.posts,
      })),
    });
  } catch (err: any) {
    console.error('GET /api/coverage-levels error:', err);
    return NextResponse.json({ error: 'Failed to fetch levels', details: err.message }, { status: 500 });
  }
}

// POST /api/coverage-levels - Create a new level
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { regionId, levelNumber, name, description, color, postIds } = body;

  if (!regionId || levelNumber === undefined || !name) {
    return NextResponse.json({ error: 'regionId, levelNumber, and name are required' }, { status: 400 });
  }

  try {
    await initTables();

    // Insert the level
    const result = await query(`
      INSERT INTO coverage_levels (region_id, level_number, name, description, color)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (region_id, level_number) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        color = EXCLUDED.color,
        updated_at = NOW()
      RETURNING id, region_id, level_number, name, description, color
    `, [regionId, levelNumber, name.trim(), description?.trim() || null, color || '#6b7280']);

    const levelId = result.rows[0].id;

    // Update post assignments if provided
    if (postIds && Array.isArray(postIds)) {
      // Remove existing assignments
      await query(`DELETE FROM coverage_level_posts WHERE level_id = $1`, [levelId]);
      
      // Add new assignments
      for (const postId of postIds) {
        await query(`
          INSERT INTO coverage_level_posts (level_id, post_id) VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `, [levelId, postId]);
      }
    }

    return NextResponse.json({
      ok: true,
      level: {
        id: levelId,
        regionId: result.rows[0].region_id,
        levelNumber: result.rows[0].level_number,
        name: result.rows[0].name,
        description: result.rows[0].description,
        color: result.rows[0].color,
      },
    });
  } catch (err: any) {
    console.error('POST /api/coverage-levels error:', err);
    return NextResponse.json({ error: 'Failed to create level', details: err.message }, { status: 500 });
  }
}

