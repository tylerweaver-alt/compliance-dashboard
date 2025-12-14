/**
 * GET /api/sysadmin/sql-ingest/status
 * Returns SQL Server ingestion status with derived fields for UI
 * 
 * Derived fields:
 * - worker_alive: heartbeat within last 30 seconds
 * - credentials_configured: all required fields present
 * - effective_state: NOT_CONFIGURED | DISABLED | IDLE | CONNECTING | RUNNING | ERROR
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSuperadminSession } from '../../_utils';
import { isEncryptionConfigured } from '@/lib/crypto';

const HEARTBEAT_TIMEOUT_SECONDS = 30;

export async function GET() {
  const sessionCheck = await requireSuperadminSession();
  if (sessionCheck.error) {
    return NextResponse.json({ error: sessionCheck.error }, { status: sessionCheck.status });
  }

  try {
    // Get source, secrets, and worker status in one query
    const { rows } = await query<any>(`
      SELECT 
        s.id as source_id,
        s.type,
        s.enabled,
        s.watermark_ts,
        s.watermark_id,
        s.batch_size,
        s.poll_interval_ms,
        s.created_at as source_created_at,
        s.updated_at as source_updated_at,
        sec.host,
        sec.port,
        sec.database,
        sec.username,
        sec.password_encrypted IS NOT NULL as has_password,
        sec.encrypt_connection,
        sec.trust_server_cert,
        sec.updated_at as secrets_updated_at,
        sec.updated_by,
        ws.state,
        ws.last_heartbeat_at,
        ws.last_success_at,
        ws.last_error_at,
        ws.last_error_message,
        ws.last_ingested_call_id,
        ws.last_ingested_ts,
        ws.rows_ingested_total,
        ws.rows_ingested_last_60s,
        ws.avg_rows_per_sec_60s,
        ws.current_lag_seconds,
        ws.uptime_seconds,
        ws.downtime_seconds
      FROM ingestion_sources s
      LEFT JOIN ingestion_source_secrets sec ON sec.source_id = s.id
      LEFT JOIN ingestion_worker_status ws ON ws.source_id = s.id
      WHERE s.type = 'sqlserver'
      LIMIT 1
    `);

    if (rows.length === 0) {
      return NextResponse.json({
        source: null,
        worker: null,
        credentials_configured: false,
        encryption_configured: isEncryptionConfigured(),
        worker_alive: false,
        effective_state: 'NOT_CONFIGURED',
        message: 'No sqlserver ingestion source configured'
      });
    }

    const row = rows[0];

    // Derive credentials_configured
    const credentials_configured = Boolean(
      row.host && row.database && row.username && row.has_password
    );

    // Derive worker_alive (heartbeat within last 30 seconds)
    let worker_alive = false;
    if (row.last_heartbeat_at) {
      const heartbeatAge = (Date.now() - new Date(row.last_heartbeat_at).getTime()) / 1000;
      worker_alive = heartbeatAge < HEARTBEAT_TIMEOUT_SECONDS;
    }

    // Derive effective_state
    let effective_state = row.state || 'NOT_CONFIGURED';
    if (!credentials_configured) {
      effective_state = 'NOT_CONFIGURED';
    } else if (!row.enabled) {
      effective_state = 'DISABLED';
    } else if (!worker_alive && row.state !== 'ERROR') {
      // Worker should be running but hasn't heartbeated
      effective_state = row.state || 'IDLE';
    }

    return NextResponse.json({
      source: {
        id: row.source_id,
        type: row.type,
        enabled: row.enabled,
        watermark_ts: row.watermark_ts,
        watermark_id: row.watermark_id,
        batch_size: row.batch_size,
        poll_interval_ms: row.poll_interval_ms,
        created_at: row.source_created_at,
        updated_at: row.source_updated_at,
      },
      secrets: {
        host: row.host || null,
        port: row.port || 1433,
        database: row.database || null,
        username: row.username || null,
        has_password: row.has_password,
        encrypt_connection: row.encrypt_connection ?? true,
        trust_server_cert: row.trust_server_cert ?? false,
        updated_at: row.secrets_updated_at,
        updated_by: row.updated_by,
      },
      worker: {
        state: row.state,
        last_heartbeat_at: row.last_heartbeat_at,
        last_success_at: row.last_success_at,
        last_error_at: row.last_error_at,
        last_error_message: row.last_error_message,
        last_ingested_call_id: row.last_ingested_call_id,
        last_ingested_ts: row.last_ingested_ts,
        rows_ingested_total: row.rows_ingested_total || 0,
        rows_ingested_last_60s: row.rows_ingested_last_60s || 0,
        avg_rows_per_sec_60s: row.avg_rows_per_sec_60s || 0,
        current_lag_seconds: row.current_lag_seconds,
        uptime_seconds: row.uptime_seconds || 0,
        downtime_seconds: row.downtime_seconds || 0,
      },
      credentials_configured,
      encryption_configured: isEncryptionConfigured(),
      worker_alive,
      effective_state,
    });
  } catch (err: any) {
    console.error('[Sysadmin] SQL ingest status failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

