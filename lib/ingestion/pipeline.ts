/**
 * Ingestion Pipeline for SQL Server CAD/Visinet data
 * Implements the single-batch "tick" pattern (serverless-safe)
 */

import { query } from '@/lib/db';
import { fetchRowsNewerThanWatermark, SqlServerCallRow } from './sqlserverAdapter';

// ============================================================================
// Types
// ============================================================================

export interface IngestionSource {
  id: number;
  type: string;
  enabled: boolean;
  watermark_ts: Date | null;
  watermark_id: number | bigint | null;
  batch_size: number;
}

export interface NormalizedCall {
  source_id: string;
  response_number: string;
  response_date: string;
  // Add additional normalized fields as needed
  raw_row: any;
}

export interface UpsertResult {
  status: 'created' | 'updated' | 'skipped';
  call_id?: string;
  error?: string;
}

export interface TickResult {
  ok: boolean;
  state: string;
  rows_fetched: number;
  rows_created: number;
  rows_updated: number;
  rows_skipped: number;
  rows_errored: number;
  new_watermark_ts: Date | null;
  new_watermark_id: number | bigint | null;
  duration_ms: number;
  error?: string;
}

// ============================================================================
// Logging - writes to SQL-only ingestion logs table
// ============================================================================

export async function writeIngestionLog(
  sourceId: number,
  level: 'INFO' | 'WARN' | 'ERROR',
  eventType: string,
  message: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    await query(
      `INSERT INTO ingestion_sqlserver_logs (source_id, level, event_type, message, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [sourceId, level, eventType, message, metadata ? JSON.stringify(metadata) : null]
    );
  } catch (err) {
    console.error('[Ingestion] Failed to write log:', err);
  }
}

// ============================================================================
// Pipeline Functions
// ============================================================================

/**
 * Map a SQL Server row to a normalized call structure
 */
export function mapRowToCall(row: SqlServerCallRow): NormalizedCall {
  // This mapping should be customized based on the actual CAD/Visinet schema
  return {
    source_id: String(row.id),
    response_number: row.response_number || row.incident_number || '',
    response_date: row.response_date || row.call_date || '',
    raw_row: row,
  };
}

/**
 * Validate a normalized call
 */
export function validateCall(call: NormalizedCall): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!call.source_id) errors.push('Missing source_id');
  if (!call.response_number) errors.push('Missing response_number');
  
  return { ok: errors.length === 0, errors };
}

/**
 * Upsert a call into the database (idempotent)
 */
export async function upsertCall(call: NormalizedCall): Promise<UpsertResult> {
  // This is a placeholder - actual implementation depends on your calls table schema
  // and the unique constraint used for deduplication
  try {
    // Check if call already exists by source identifier
    const { rows: existing } = await query(
      `SELECT id FROM calls WHERE response_number = $1 LIMIT 1`,
      [call.response_number]
    );

    if (existing.length > 0) {
      // Could update here if needed
      return { status: 'skipped', call_id: existing[0].id };
    }

    // Insert new call - customize columns based on your schema
    // This is a minimal placeholder
    return { status: 'skipped', error: 'Call upsert not yet implemented - customize based on schema' };
  } catch (err: any) {
    return { status: 'skipped', error: err.message };
  }
}

// ============================================================================
// Main Tick Function
// ============================================================================

/**
 * Run one batch "tick" of the ingestion pipeline
 * Serverless-safe: no infinite loops, processes one batch and returns
 */
export async function runIngestionTick(source: IngestionSource): Promise<TickResult> {
  const startTime = Date.now();

  // Update heartbeat
  await query(
    `UPDATE ingestion_worker_status SET last_heartbeat_at = now() WHERE source_id = $1`,
    [source.id]
  );

  // Check if disabled
  if (!source.enabled) {
    await query(
      `UPDATE ingestion_worker_status SET state = 'DISABLED' WHERE source_id = $1`,
      [source.id]
    );
    return {
      ok: true,
      state: 'DISABLED',
      rows_fetched: 0,
      rows_created: 0,
      rows_updated: 0,
      rows_skipped: 0,
      rows_errored: 0,
      new_watermark_ts: source.watermark_ts,
      new_watermark_id: source.watermark_id,
      duration_ms: Date.now() - startTime,
    };
  }

  // Set state to CONNECTING
  await query(
    `UPDATE ingestion_worker_status SET state = 'CONNECTING' WHERE source_id = $1`,
    [source.id]
  );
  await writeIngestionLog(source.id, 'INFO', 'RUN_START', 'Starting ingestion tick');

  try {
    // Fetch rows from SQL Server
    const fetchResult = await fetchRowsNewerThanWatermark({
      watermark_ts: source.watermark_ts,
      watermark_id: source.watermark_id as number | null,
      batch_size: source.batch_size,
    });

    if (fetchResult.error) {
      await query(
        `UPDATE ingestion_worker_status
         SET state = 'ERROR', last_error_at = now(), last_error_message = $1
         WHERE source_id = $2`,
        [fetchResult.error, source.id]
      );
      await writeIngestionLog(source.id, 'ERROR', 'FETCH_ERROR', fetchResult.error);
      return {
        ok: false,
        state: 'ERROR',
        rows_fetched: 0,
        rows_created: 0,
        rows_updated: 0,
        rows_skipped: 0,
        rows_errored: 0,
        new_watermark_ts: source.watermark_ts,
        new_watermark_id: source.watermark_id,
        duration_ms: Date.now() - startTime,
        error: fetchResult.error,
      };
    }

    // Set state to RUNNING
    await query(
      `UPDATE ingestion_worker_status SET state = 'RUNNING' WHERE source_id = $1`,
      [source.id]
    );

    const rows = fetchResult.rows;
    let created = 0, updated = 0, skipped = 0, errored = 0;
    let lastRow: SqlServerCallRow | null = null;

    // Process each row
    for (const row of rows) {
      const normalized = mapRowToCall(row);
      const validation = validateCall(normalized);

      if (!validation.ok) {
        errored++;
        continue;
      }

      const result = await upsertCall(normalized);
      if (result.status === 'created') created++;
      else if (result.status === 'updated') updated++;
      else if (result.status === 'skipped') skipped++;
      if (result.error) errored++;

      lastRow = row;
    }

    // Advance watermark if we processed rows successfully
    let newWatermarkTs = source.watermark_ts;
    let newWatermarkId = source.watermark_id;

    if (lastRow && errored === 0) {
      newWatermarkTs = lastRow.updated_at;
      newWatermarkId = lastRow.id as number;

      await query(
        `UPDATE ingestion_sources
         SET watermark_ts = $1, watermark_id = $2, updated_at = now()
         WHERE id = $3`,
        [newWatermarkTs, newWatermarkId, source.id]
      );
      await writeIngestionLog(source.id, 'INFO', 'WATERMARK_ADVANCE',
        `Advanced watermark to ${newWatermarkTs?.toISOString()}`,
        { watermark_ts: newWatermarkTs, watermark_id: newWatermarkId }
      );
    }

    // Update worker status
    await query(
      `UPDATE ingestion_worker_status
       SET state = 'IDLE',
           last_success_at = now(),
           last_ingested_call_id = $1,
           last_ingested_ts = $2,
           rows_ingested_total = rows_ingested_total + $3
       WHERE source_id = $4`,
      [lastRow ? String(lastRow.id) : null, newWatermarkTs, created + updated, source.id]
    );

    await writeIngestionLog(source.id, 'INFO', 'RUN_END',
      `Tick complete: ${rows.length} fetched, ${created} created, ${updated} updated, ${skipped} skipped, ${errored} errors`,
      { fetched: rows.length, created, updated, skipped, errored }
    );

    return {
      ok: true,
      state: 'IDLE',
      rows_fetched: rows.length,
      rows_created: created,
      rows_updated: updated,
      rows_skipped: skipped,
      rows_errored: errored,
      new_watermark_ts: newWatermarkTs,
      new_watermark_id: newWatermarkId,
      duration_ms: Date.now() - startTime,
    };
  } catch (err: any) {
    await query(
      `UPDATE ingestion_worker_status
       SET state = 'ERROR', last_error_at = now(), last_error_message = $1
       WHERE source_id = $2`,
      [err.message, source.id]
    );
    await writeIngestionLog(source.id, 'ERROR', 'ERROR', err.message);

    return {
      ok: false,
      state: 'ERROR',
      rows_fetched: 0,
      rows_created: 0,
      rows_updated: 0,
      rows_skipped: 0,
      rows_errored: 0,
      new_watermark_ts: source.watermark_ts,
      new_watermark_id: source.watermark_id,
      duration_ms: Date.now() - startTime,
      error: err.message,
    };
  }
}

