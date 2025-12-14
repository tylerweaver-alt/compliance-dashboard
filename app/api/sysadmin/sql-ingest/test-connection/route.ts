/**
 * POST /api/sysadmin/sql-ingest/test-connection
 * Test SQL Server connectivity using saved DB credentials
 * Does NOT use env vars - reads encrypted credentials from DB
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSuperadminSession, generateRunId, createRunLogger } from '../../_utils';
import { decryptSecret, isEncryptionConfigured } from '@/lib/crypto';
import { writeIngestionLog } from '@/lib/ingestion/pipeline';

export async function POST() {
  const sessionCheck = await requireSuperadminSession();
  if (sessionCheck.error) {
    return NextResponse.json({ error: sessionCheck.error }, { status: sessionCheck.status });
  }

  const runId = generateRunId();
  const log = createRunLogger(runId, 'sqlserver', sessionCheck.user?.email);
  const startTime = Date.now();

  try {
    await log.start('TEST_CONNECTION', 'Testing SQL Server connection');

    // Get credentials from DB
    const { rows: secretRows } = await query<any>(`
      SELECT 
        sec.source_id,
        sec.host,
        sec.port,
        sec.database,
        sec.username,
        sec.password_encrypted,
        sec.encrypt_connection,
        sec.trust_server_cert
      FROM ingestion_sources s
      JOIN ingestion_source_secrets sec ON sec.source_id = s.id
      WHERE s.type = 'sqlserver'
      LIMIT 1
    `);

    if (secretRows.length === 0) {
      await log.error('TEST_CONNECTION', 'No sqlserver ingestion source found');
      return NextResponse.json({ 
        ok: false, 
        error: 'No sqlserver ingestion source found', 
        run_id: runId 
      }, { status: 404 });
    }

    const secrets = secretRows[0];

    // Validate required fields
    if (!secrets.host || !secrets.database || !secrets.username || !secrets.password_encrypted) {
      const missing: string[] = [];
      if (!secrets.host) missing.push('host');
      if (!secrets.database) missing.push('database');
      if (!secrets.username) missing.push('username');
      if (!secrets.password_encrypted) missing.push('password');

      await log.error('TEST_CONNECTION', `Missing credentials: ${missing.join(', ')}`);
      return NextResponse.json({
        ok: false,
        error: `Missing required credentials: ${missing.join(', ')}`,
        run_id: runId
      });
    }

    // Check encryption is configured
    if (!isEncryptionConfigured()) {
      await log.error('TEST_CONNECTION', 'APP_MASTER_KEY not configured');
      return NextResponse.json({
        ok: false,
        error: 'APP_MASTER_KEY not configured - cannot decrypt password',
        run_id: runId
      });
    }

    // Decrypt password
    let password: string;
    try {
      password = decryptSecret(secrets.password_encrypted);
    } catch (decryptErr: any) {
      await log.error('TEST_CONNECTION', `Failed to decrypt password: ${decryptErr.message}`);
      return NextResponse.json({
        ok: false,
        error: 'Failed to decrypt password - check APP_MASTER_KEY',
        run_id: runId
      });
    }

    // Test connection using mssql
    await log.step('TEST_CONNECTION', 'CONNECT', 'Attempting SQL Server connection');

    try {
      const sql = await import('mssql');
      
      const config: any = {
        server: secrets.host,
        port: secrets.port || 1433,
        database: secrets.database,
        user: secrets.username,
        password: password,
        options: {
          encrypt: secrets.encrypt_connection ?? true,
          trustServerCertificate: secrets.trust_server_cert ?? false,
        },
        connectionTimeout: 10000,
        requestTimeout: 10000,
      };

      const pool = await sql.default.connect(config);
      await pool.request().query('SELECT 1 AS test');
      await pool.close();

      const latency_ms = Date.now() - startTime;

      await writeIngestionLog(secrets.source_id, 'INFO', 'TEST_CONNECTION',
        `Connection test successful (${latency_ms}ms)`,
        { actor: sessionCheck.user.email, latency_ms }
      );

      await log.success('TEST_CONNECTION', 'SQL Server connection successful', latency_ms);

      return NextResponse.json({
        ok: true,
        message: 'SQL Server connection successful',
        latency_ms,
        run_id: runId
      });
    } catch (sqlErr: any) {
      const latency_ms = Date.now() - startTime;

      await writeIngestionLog(secrets.source_id, 'ERROR', 'TEST_CONNECTION',
        `Connection test failed: ${sqlErr.message}`,
        { actor: sessionCheck.user.email, latency_ms, error: sqlErr.message }
      );

      await log.error('TEST_CONNECTION', `SQL Server connection failed: ${sqlErr.message}`, latency_ms);

      return NextResponse.json({
        ok: false,
        error: sqlErr.message,
        latency_ms,
        run_id: runId
      });
    }
  } catch (err: any) {
    const latency_ms = Date.now() - startTime;
    console.error('[Sysadmin] Test connection failed:', err);
    await log.error('TEST_CONNECTION', `Failed: ${err.message}`, latency_ms);
    return NextResponse.json({ ok: false, error: err.message, latency_ms, run_id: runId }, { status: 500 });
  }
}

