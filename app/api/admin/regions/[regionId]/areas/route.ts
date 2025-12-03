// app/api/admin/regions/[regionId]/areas/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdminSession } from '../../../_utils';
import { logAuditEvent } from '../../../_audit';
import { seedDefaultParishConfig, getConfigSummary, EvaluationMode, ZoneConfig } from '../../../_parishConfig';
import { PLACE_TYPES, DEFAULT_REPORT_COLUMNS } from '@/app/lib/constants';

export const runtime = 'nodejs';

interface AreaConfig {
  mode: EvaluationMode;
  default_threshold_minutes?: number | null;
  target_average_minutes?: number | null;
  zones?: ZoneConfig[];
  view_columns?: string[];
  response_start_time?: 'dispatched' | 'received' | 'enroute';
}

// POST /api/admin/regions/[regionId]/areas - Create a new area in a region
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ regionId: string }> }
) {
  const sessionCheck = await requireAdminSession();
  if (sessionCheck.error) {
    return NextResponse.json({ error: sessionCheck.error }, { status: sessionCheck.status });
  }

  try {
    const { regionId: regionIdParam } = await params;
    const regionId = parseInt(regionIdParam, 10);
    if (isNaN(regionId)) {
      return NextResponse.json({ error: 'Invalid region ID' }, { status: 400 });
    }

    // Look up the region by ID
    const regionResult = await query<{ id: number; name: string }>(
      `SELECT id, name FROM regions WHERE id = $1`,
      [regionId]
    );

    if (regionResult.rows.length === 0) {
      return NextResponse.json({ error: 'Region not found' }, { status: 404 });
    }

    const region = regionResult.rows[0];

    const body = await req.json();
    const { name, place_type, is_contracted = false, logo_url = null, config } = body as {
      name: string;
      place_type?: string;
      is_contracted?: boolean;
      logo_url?: string | null;
      config?: AreaConfig;
    };

    // Validate name
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ error: 'Area name is required' }, { status: 400 });
    }

    // Validate place_type
    if (place_type && !(PLACE_TYPES as readonly string[]).includes(place_type)) {
      return NextResponse.json(
        { error: `Invalid place_type. Must be one of: ${PLACE_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();

    // Check if area already exists in this region
    const existingResult = await query<{ id: number }>(
      `SELECT id FROM parishes WHERE LOWER(name) = LOWER($1) AND region = $2`,
      [trimmedName, region.name]
    );

    if (existingResult.rows.length > 0) {
      return NextResponse.json(
        { error: `Area "${trimmedName}" already exists in region "${region.name}"` },
        { status: 409 }
      );
    }

    // Insert new parish/area
    const insertResult = await query<{
      id: number;
      name: string;
      region: string;
      place_type: string | null;
      logo_url: string | null;
      is_contracted: boolean;
    }>(
      `INSERT INTO parishes (name, region, place_type, logo_url, is_contracted)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, region, place_type, logo_url, is_contracted`,
      [trimmedName, region.name, place_type || null, logo_url, is_contracted]
    );

    const newArea = insertResult.rows[0];

    // Create parish config - either from provided config or use defaults
    if (config) {
      // Use the seedDefaultParishConfig helper with provided config
      await seedDefaultParishConfig({
        parishId: newArea.id,
        mode: config.mode,
        defaultThresholdMinutes: config.default_threshold_minutes,
        targetAverageMinutes: config.target_average_minutes,
        zones: config.zones,
        viewColumns: config.view_columns,
        responseStartTime: config.response_start_time,
      });
    } else {
      // Use default config
      await query(
        `INSERT INTO parish_settings (
          parish_id,
          global_response_threshold_seconds,
          target_average_response_seconds,
          use_zones,
          report_columns,
          response_start_time,
          exception_keywords
        ) VALUES ($1, 600, 480, false, $2, 'dispatched', '{}')
        ON CONFLICT (parish_id) DO NOTHING`,
        [newArea.id, DEFAULT_REPORT_COLUMNS]
      );
    }

    // Build audit metadata
    const auditMetadata: Record<string, any> = {
      place_type: newArea.place_type,
      region: region.name,
      is_contracted: newArea.is_contracted,
    };

    // Add config summary if provided
    if (config) {
      auditMetadata.config = getConfigSummary({
        parishId: newArea.id,
        mode: config.mode,
        defaultThresholdMinutes: config.default_threshold_minutes,
        targetAverageMinutes: config.target_average_minutes,
        zones: config.zones,
        viewColumns: config.view_columns,
        responseStartTime: config.response_start_time,
      });
    }

    // Log audit event
    await logAuditEvent({
      actorUserId: sessionCheck.user?.id,
      actorEmail: sessionCheck.user?.email,
      action: 'AREA_CREATE',
      targetType: 'area',
      targetId: String(newArea.id),
      summary: `Created area "${newArea.name}" in region "${region.name}"${config ? ' with custom config' : ''}`,
      metadata: auditMetadata,
    });

    return NextResponse.json(newArea, { status: 201 });
  } catch (err: any) {
    console.error('POST /api/admin/regions/[regionId]/areas error:', err);
    return NextResponse.json(
      { error: 'Failed to create area', details: err.message },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/regions/[regionId]/areas - Update an area's is_contracted status
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ regionId: string }> }
) {
  const sessionCheck = await requireAdminSession();
  if (sessionCheck.error) {
    return NextResponse.json({ error: sessionCheck.error }, { status: sessionCheck.status });
  }

  try {
    const body = await req.json();
    const { areaId, is_contracted, logo_url } = body;

    if (!areaId || typeof areaId !== 'number') {
      return NextResponse.json({ error: 'Area ID is required' }, { status: 400 });
    }

    // At least one field must be provided
    const hasContractedUpdate = typeof is_contracted === 'boolean';
    const hasLogoUpdate = logo_url !== undefined;

    if (!hasContractedUpdate && !hasLogoUpdate) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    // Get area before update for audit log
    const areaResult = await query<{ id: number; name: string; region: string; is_contracted: boolean; logo_url: string | null }>(
      `SELECT id, name, region, is_contracted, logo_url FROM parishes WHERE id = $1`,
      [areaId]
    );

    if (areaResult.rows.length === 0) {
      return NextResponse.json({ error: 'Area not found' }, { status: 404 });
    }

    const area = areaResult.rows[0];
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (hasContractedUpdate) {
      updates.push(`is_contracted = $${paramIndex++}`);
      values.push(is_contracted);
    }

    if (hasLogoUpdate) {
      updates.push(`logo_url = $${paramIndex++}`);
      values.push(logo_url || null);
    }

    values.push(areaId);

    // Update the area
    await query(
      `UPDATE parishes SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    // Build summary and metadata for audit
    const changedFields: string[] = [];
    const metadata: Record<string, any> = {};

    if (hasContractedUpdate) {
      changedFields.push(`contracted: ${area.is_contracted} → ${is_contracted}`);
      metadata.is_contracted = { old: area.is_contracted, new: is_contracted };
    }

    if (hasLogoUpdate) {
      changedFields.push(`logo: ${area.logo_url ? 'updated' : 'set'}`);
      metadata.logo_url = { old: area.logo_url, new: logo_url || null };
    }

    // Log audit event
    await logAuditEvent({
      actorUserId: sessionCheck.user?.id,
      actorEmail: sessionCheck.user?.email,
      action: 'AREA_UPDATE',
      targetType: 'area',
      targetId: String(areaId),
      summary: `Updated area "${area.name}": ${changedFields.join(', ')}`,
      metadata,
    });

    return NextResponse.json({
      success: true,
      areaId,
      is_contracted: hasContractedUpdate ? is_contracted : area.is_contracted,
      logo_url: hasLogoUpdate ? (logo_url || null) : area.logo_url,
    });
  } catch (err: any) {
    console.error('PATCH /api/admin/regions/[regionId]/areas error:', err);
    return NextResponse.json(
      { error: 'Failed to update area', details: err.message },
      { status: 500 }
    );
  }
}

