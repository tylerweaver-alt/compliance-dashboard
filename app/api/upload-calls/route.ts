/**
 * CSV Upload Route for Call Data
 *
 * PERFORMANCE OPTIMIZATION:
 * - Pre-fetches all zones for the parish to avoid per-row zone lookups
 * - Uses batched multi-row INSERTs (batch size: 250 rows) instead of per-row inserts
 * - This significantly reduces database round-trips and improves upload speed
 *
 * DATA INTEGRITY:
 * - Same data structure and meaning as before optimization
 * - Same JSON response shape for API consumers (with added rowsInserted/rowsSkipped counts)
 */
import { NextRequest, NextResponse } from 'next/server';
import { parse } from 'csv-parse/sync';
import { query } from '@/lib/db';

export const runtime = 'nodejs'; // important for pg

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const parishName = formData.get('parish');
    const uploadedBy = formData.get('uploadedBy') || null;

    if (!(file instanceof File) || typeof parishName !== 'string') {
      return NextResponse.json(
        { error: 'file (CSV) and parish (string) are required' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const csvText = buffer.toString('utf8');

    // Expect a header row with: call_id, parish, zone, response_minutes, is_exception?, exception_reason?
    const records: any[] = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    if (!records.length) {
      return NextResponse.json({ error: 'No rows found in CSV' }, { status: 400 });
    }

    // Look up parish_id
    const { rows: parishRows } = await query<{ id: number }>(
      'SELECT id FROM parishes WHERE name = $1',
      [parishName]
    );
    if (parishRows.length === 0) {
      return NextResponse.json({ error: `Unknown parish: ${parishName}` }, { status: 400 });
    }
    const parishId = parishRows[0].id;

    // Create upload record
    const { rows: uploadRows } = await query<{ id: number }>(
      `INSERT INTO uploads (parish_id, uploaded_by, original_filename)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [parishId, uploadedBy, (file as File).name]
    );
    const uploadId = uploadRows[0].id;

    // Pre-fetch all zones for this parish to avoid per-row queries
    const { rows: allZones } = await query<{ id: number; name: string }>(
      `SELECT id, name FROM zones WHERE parish_id = $1`,
      [parishId]
    );
    const zoneMap = new Map<string, number>();
    for (const z of allZones) {
      zoneMap.set(z.name.toLowerCase(), z.id);
    }

    // Insert calls using batched inserts for performance
    // Batch size of 250 rows provides good balance between memory usage and insert speed
    const BATCH_SIZE = 250;
    let batchValues: any[] = [];
    let batchPlaceholders: string[] = [];
    let rowsInserted = 0;
    let rowsSkipped = 0;

    // Helper function to flush the current batch
    const flushBatch = async () => {
      if (batchPlaceholders.length === 0) return;

      const insertQuery = `INSERT INTO calls
         (upload_id, parish_id, zone_id, call_id, response_minutes, is_exception, exception_reason)
         VALUES ${batchPlaceholders.join(', ')}`;
      await query(insertQuery, batchValues);
      rowsInserted += batchPlaceholders.length;

      // Reset batch
      batchValues = [];
      batchPlaceholders = [];
    };

    for (const row of records) {
      const zoneName = row.zone || row.Zone || row.ZONE;
      const respStr = row.response_minutes ?? row.response_time ?? row.ResponseMinutes;
      const responseMinutes = parseFloat(respStr);

      if (!zoneName || Number.isNaN(responseMinutes)) {
        // Skip bad rows
        rowsSkipped++;
        continue;
      }

      // Look up zone_id from pre-fetched map
      const zoneId = zoneMap.get(zoneName.toLowerCase());
      if (!zoneId) {
        // Unknown zone name for this parish – skip
        rowsSkipped++;
        continue;
      }

      const isException =
        String(row.is_exception ?? row.exception ?? '').toLowerCase() === 'true';
      const exceptionReason = row.exception_reason ?? null;

      // Calculate placeholder indices for this row (7 columns per row)
      const startIdx = batchValues.length + 1;
      const placeholders = `($${startIdx}, $${startIdx + 1}, $${startIdx + 2}, $${startIdx + 3}, $${startIdx + 4}, $${startIdx + 5}, $${startIdx + 6})`;
      batchPlaceholders.push(placeholders);
      batchValues.push(
        uploadId,
        parishId,
        zoneId,
        row.call_id ?? row.CallId ?? null,
        responseMinutes,
        isException,
        exceptionReason
      );

      // Flush batch when it reaches BATCH_SIZE
      if (batchPlaceholders.length >= BATCH_SIZE) {
        await flushBatch();
      }
    }

    // Flush any remaining rows in the final batch
    await flushBatch();

    return NextResponse.json({ ok: true, uploadId, rowsInserted, rowsSkipped });
  } catch (err: any) {
    console.error('upload-calls error', err);
    return NextResponse.json(
      { error: 'Server error uploading calls', details: err.message },
      { status: 500 }
    );
  }
}
