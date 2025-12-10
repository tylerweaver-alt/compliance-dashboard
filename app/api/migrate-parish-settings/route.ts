// app/api/migrate-parish-settings/route.ts
import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const runtime = 'nodejs';

// Default report columns
const DEFAULT_REPORT_COLUMNS = [
  'date', 'time', 'call_number', 'received', 'dispatched', 
  'enroute', 'staged', 'on_scene', 'depart', 'arrived', 
  'available', 'response', 'status'
];

export async function POST() {
  const client = await pool.connect();
  try {
    // Add new columns to parish_settings if they don't exist
    const parishSettingsColumns = [
      { name: 'report_columns', type: 'text[]' },
      { name: 'response_start_time', type: "text DEFAULT 'dispatched'" },
      { name: 'exclusion_criteria', type: 'jsonb DEFAULT \'{}\'::jsonb' },
    ];

    for (const col of parishSettingsColumns) {
      try {
        await client.query(`ALTER TABLE parish_settings ADD COLUMN ${col.name} ${col.type}`);
      } catch (e: any) {
        if (!e.message.includes('already exists')) throw e;
      }
    }

    // Add new columns to response_area_mappings if they don't exist
    const zoneMappingColumns = [
      { name: 'threshold_minutes', type: 'numeric' },
      { name: 'locations', type: 'text[] DEFAULT \'{}\'::text[]' },
    ];

    for (const col of zoneMappingColumns) {
      try {
        await client.query(`ALTER TABLE response_area_mappings ADD COLUMN ${col.name} ${col.type}`);
      } catch (e: any) {
        if (!e.message.includes('already exists')) throw e;
      }
    }

    // Set default values for existing parish_settings rows
    await client.query(`
      UPDATE parish_settings
      SET report_columns = $1
      WHERE report_columns IS NULL
    `, [DEFAULT_REPORT_COLUMNS]);

    await client.query(`
      UPDATE parish_settings
      SET response_start_time = 'dispatched'
      WHERE response_start_time IS NULL
    `);

    return NextResponse.json({
      ok: true,
      message: 'Migration completed successfully',
      defaultColumns: DEFAULT_REPORT_COLUMNS
    });
  } catch (err: any) {
    console.error('Migration error:', err);
    return NextResponse.json(
      { error: 'Migration failed', details: err.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'POST to this endpoint to run the migration' 
  });
}

