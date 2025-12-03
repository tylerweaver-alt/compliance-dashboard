// app/api/posts/[id]/route.ts
// API for managing individual coverage posts

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/posts/[id] - Get a single post
export async function GET(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const postId = parseInt(id, 10);

  if (isNaN(postId)) {
    return NextResponse.json({ error: 'Invalid post ID' }, { status: 400 });
  }

  try {
    const result = await query(
      `SELECT id, region_id, name, address, intersection, lat, lng,
              default_units, is_active, coverage_level
       FROM coverage_posts WHERE id = $1`,
      [postId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

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
        isActive: row.is_active,
        coverageLevel: row.coverage_level,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to fetch post', details: err.message }, { status: 500 });
  }
}

// PUT /api/posts/[id] - Update a post
export async function PUT(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const postId = parseInt(id, 10);

  if (isNaN(postId)) {
    return NextResponse.json({ error: 'Invalid post ID' }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, address, intersection, lat, lng, defaultUnits, coverageLevel, isActive } = body;

  try {
    const result = await query(
      `UPDATE coverage_posts
       SET name = COALESCE($1, name),
           address = COALESCE($2, address),
           intersection = COALESCE($3, intersection),
           lat = COALESCE($4, lat),
           lng = COALESCE($5, lng),
           default_units = COALESCE($6, default_units),
           coverage_level = COALESCE($7, coverage_level),
           is_active = COALESCE($8, is_active),
           updated_at = NOW()
       WHERE id = $9
       RETURNING id, region_id, name, address, intersection, lat, lng, default_units, coverage_level, is_active`,
      [
        name?.trim() || null,
        address?.trim() || null,
        intersection?.trim() || null,
        lat,
        lng,
        defaultUnits,
        coverageLevel,
        isActive,
        postId,
      ]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

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
        isActive: row.is_active,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to update post', details: err.message }, { status: 500 });
  }
}

// DELETE /api/posts/[id] - Soft delete a post
export async function DELETE(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const postId = parseInt(id, 10);

  if (isNaN(postId)) {
    return NextResponse.json({ error: 'Invalid post ID' }, { status: 400 });
  }

  try {
    await query(`UPDATE coverage_posts SET is_active = false WHERE id = $1`, [postId]);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to delete post', details: err.message }, { status: 500 });
  }
}

