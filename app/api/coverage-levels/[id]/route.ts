// app/api/coverage-levels/[id]/route.ts
// API for managing individual coverage levels

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

// Helper to update a level (shared between PUT and PATCH)
async function updateLevel(levelId: number, body: any) {
  const { name, description, color, postIds } = body;

  const result = await query(`
    UPDATE coverage_levels
    SET name = COALESCE($1, name),
        description = COALESCE($2, description),
        color = COALESCE($3, color),
        updated_at = NOW()
    WHERE id = $4
    RETURNING id, region_id, level_number, name, description, color
  `, [name?.trim() || null, description?.trim() || null, color, levelId]);

  if (result.rows.length === 0) {
    return null;
  }

  // Update post assignments if provided
  if (postIds !== undefined && Array.isArray(postIds)) {
    await query(`DELETE FROM coverage_level_posts WHERE level_id = $1`, [levelId]);

    for (const postId of postIds) {
      await query(`
        INSERT INTO coverage_level_posts (level_id, post_id) VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `, [levelId, postId]);
    }
  }

  // Fetch updated posts for this level
  const postsResult = await query(`
    SELECT cp.id, cp.name
    FROM coverage_level_posts clp
    JOIN coverage_posts cp ON cp.id = clp.post_id AND cp.is_active = true
    WHERE clp.level_id = $1
  `, [levelId]);

  return {
    id: result.rows[0].id,
    regionId: result.rows[0].region_id,
    levelNumber: result.rows[0].level_number,
    name: result.rows[0].name,
    description: result.rows[0].description,
    color: result.rows[0].color,
    posts: postsResult.rows.map((p: any) => ({ id: p.id, name: p.name })),
  };
}

// PUT /api/coverage-levels/[id] - Update a level (full update)
export async function PUT(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const levelId = parseInt(id, 10);

  if (isNaN(levelId)) {
    return NextResponse.json({ error: 'Invalid level ID' }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const level = await updateLevel(levelId, body);
    if (!level) {
      return NextResponse.json({ error: 'Level not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, level });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to update level', details: err.message }, { status: 500 });
  }
}

// PATCH /api/coverage-levels/[id] - Partial update a level
export async function PATCH(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const levelId = parseInt(id, 10);

  if (isNaN(levelId)) {
    return NextResponse.json({ error: 'Invalid level ID' }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const level = await updateLevel(levelId, body);
    if (!level) {
      return NextResponse.json({ error: 'Level not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, level });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to update level', details: err.message }, { status: 500 });
  }
}

// DELETE /api/coverage-levels/[id] - Delete a level
export async function DELETE(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const levelId = parseInt(id, 10);
  
  if (isNaN(levelId)) {
    return NextResponse.json({ error: 'Invalid level ID' }, { status: 400 });
  }

  try {
    await query(`UPDATE coverage_levels SET is_active = false WHERE id = $1`, [levelId]);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to delete level', details: err.message }, { status: 500 });
  }
}

