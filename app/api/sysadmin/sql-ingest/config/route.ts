/**
 * GET/PUT /api/sysadmin/sql-ingest/config
 * Get or update SQL Server ingestion configuration
 * 
 * GET: Returns config (password masked)
 * PUT: Updates config (encrypts password if provided)
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSuperadminSession, generateRunId, createRunLogger } from '../../_utils';
import { encryptSecret, isEncryptionConfigured } from '@/lib/crypto';
import { writeIngestionLog } from '@/lib/ingestion/pipeline';

interface ConfigResponse {
  source_id: number;
  host: string | null;
  port: number;
  database: string | null;
  username: string | null;
  has_password: boolean;
  encrypt_connection: boolean;
  trust_server_cert: boolean;
  batch_size: number;
  poll_interval_ms: number;
  enabled: boolean;
  encryption_configured: boolean;
}

export async function GET() {
  const sessionCheck = await requireSuperadminSession();
  if (sessionCheck.error) {
    return NextResponse.json({ error: sessionCheck.error }, { status: sessionCheck.status });
  }

  try {
    const { rows } = await query<any>(`
      SELECT 
        s.id as source_id,
        s.enabled,
        s.batch_size,
        s.poll_interval_ms,
        sec.host,
        sec.port,
        sec.database,
        sec.username,
        sec.password_encrypted IS NOT NULL as has_password,
        sec.encrypt_connection,
        sec.trust_server_cert
      FROM ingestion_sources s
      LEFT JOIN ingestion_source_secrets sec ON sec.source_id = s.id
      WHERE s.type = 'sqlserver'
      LIMIT 1
    `);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No sqlserver ingestion source found' }, { status: 404 });
    }

    const row = rows[0];
    const config: ConfigResponse = {
      source_id: row.source_id,
      host: row.host || null,
      port: row.port || 1433,
      database: row.database || null,
      username: row.username || null,
      has_password: Boolean(row.has_password),
      encrypt_connection: row.encrypt_connection ?? true,
      trust_server_cert: row.trust_server_cert ?? false,
      batch_size: row.batch_size,
      poll_interval_ms: row.poll_interval_ms,
      enabled: row.enabled,
      encryption_configured: isEncryptionConfigured(),
    };

    return NextResponse.json(config);
  } catch (err: any) {
    console.error('[Sysadmin] Get SQL ingest config failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const sessionCheck = await requireSuperadminSession();
  if (sessionCheck.error) {
    return NextResponse.json({ error: sessionCheck.error }, { status: sessionCheck.status });
  }

  const runId = generateRunId();
  const log = createRunLogger(runId, 'sqlserver', sessionCheck.user?.email);

  try {
    const body = await req.json();
    await log.start('CONFIG_UPDATE', 'Updating SQL Server configuration');

    // Get source ID
    const { rows: sourceRows } = await query<any>(`
      SELECT id FROM ingestion_sources WHERE type = 'sqlserver' LIMIT 1
    `);

    if (sourceRows.length === 0) {
      await log.error('CONFIG_UPDATE', 'No sqlserver ingestion source found');
      return NextResponse.json({ error: 'No sqlserver ingestion source found', run_id: runId }, { status: 404 });
    }

    const sourceId = sourceRows[0].id;

    // Build secrets update
    const secretUpdates: string[] = [];
    const secretValues: any[] = [];
    let paramIndex = 1;

    if (body.host !== undefined) {
      secretUpdates.push(`host = $${paramIndex++}`);
      secretValues.push(body.host || null);
    }
    if (body.port !== undefined) {
      secretUpdates.push(`port = $${paramIndex++}`);
      secretValues.push(body.port || 1433);
    }
    if (body.database !== undefined) {
      secretUpdates.push(`database = $${paramIndex++}`);
      secretValues.push(body.database || null);
    }
    if (body.username !== undefined) {
      secretUpdates.push(`username = $${paramIndex++}`);
      secretValues.push(body.username || null);
    }
    if (body.password !== undefined && body.password !== '') {
      if (!isEncryptionConfigured()) {
        await log.error('CONFIG_UPDATE', 'APP_MASTER_KEY not configured');
        return NextResponse.json({ error: 'APP_MASTER_KEY not configured', run_id: runId }, { status: 500 });
      }
      const encrypted = encryptSecret(body.password);
      secretUpdates.push(`password_encrypted = $${paramIndex++}`);
      secretValues.push(encrypted);
    }
    if (body.encrypt_connection !== undefined) {
      secretUpdates.push(`encrypt_connection = $${paramIndex++}`);
      secretValues.push(Boolean(body.encrypt_connection));
    }
    if (body.trust_server_cert !== undefined) {
      secretUpdates.push(`trust_server_cert = $${paramIndex++}`);
      secretValues.push(Boolean(body.trust_server_cert));
    }

    if (secretUpdates.length > 0) {
      secretUpdates.push(`updated_at = now()`);
      secretUpdates.push(`updated_by = $${paramIndex++}`);
      secretValues.push(sessionCheck.user.email);
      secretValues.push(sourceId);

      await query(`
        UPDATE ingestion_source_secrets
        SET ${secretUpdates.join(', ')}
        WHERE source_id = $${paramIndex}
      `, secretValues);
    }

    // Build source update (batch_size, poll_interval_ms)
    const sourceUpdates: string[] = [];
    const sourceValues: any[] = [];
    let srcParamIndex = 1;

    if (typeof body.batch_size === 'number' && body.batch_size > 0 && body.batch_size <= 10000) {
      sourceUpdates.push(`batch_size = $${srcParamIndex++}`);
      sourceValues.push(body.batch_size);
    }
    if (typeof body.poll_interval_ms === 'number' && body.poll_interval_ms >= 1000) {
      sourceUpdates.push(`poll_interval_ms = $${srcParamIndex++}`);
      sourceValues.push(body.poll_interval_ms);
    }

    if (sourceUpdates.length > 0) {
      sourceUpdates.push('updated_at = now()');
      sourceValues.push(sourceId);
      await query(`
        UPDATE ingestion_sources SET ${sourceUpdates.join(', ')} WHERE id = $${srcParamIndex}
      `, sourceValues);
    }

    await writeIngestionLog(sourceId, 'INFO', 'CONFIG_UPDATE',
      `Configuration updated by ${sessionCheck.user.email}`,
      { actor: sessionCheck.user.email, fields_updated: [...secretUpdates, ...sourceUpdates].length }
    );

    await log.success('CONFIG_UPDATE', 'Configuration updated successfully');
    return NextResponse.json({ ok: true, run_id: runId });
  } catch (err: any) {
    console.error('[Sysadmin] Update SQL ingest config failed:', err);
    await log.error('CONFIG_UPDATE', `Failed: ${err.message}`);
    return NextResponse.json({ error: err.message, run_id: runId }, { status: 500 });
  }
}

