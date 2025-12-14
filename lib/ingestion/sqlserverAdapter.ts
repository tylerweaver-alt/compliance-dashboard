/**
 * SQL Server Adapter for CAD/Visinet Ingestion
 * Reads encrypted credentials from DB (ingestion_source_secrets table)
 * Falls back to environment variables if DB credentials not available
 *
 * DB credentials take precedence over env vars.
 * Env vars (fallback only):
 *   SQLSERVER_HOST, SQLSERVER_PORT, SQLSERVER_DATABASE, SQLSERVER_USER, SQLSERVER_PASSWORD
 */

import { query as pgQuery } from '@/lib/db';
import { decryptSecret, isEncryptionConfigured } from '@/lib/crypto';

// Types for the SQL Server rows we expect
export interface SqlServerCallRow {
  id: number | bigint;
  updated_at: Date;
  // Add additional fields as needed from CAD/Visinet schema
  response_number?: string;
  incident_number?: string;
  response_date?: string;
  call_date?: string;
  [key: string]: any;
}

export interface FetchResult {
  rows: SqlServerCallRow[];
  error?: string;
}

export interface TestConnectionResult {
  ok: boolean;
  message: string;
  error?: string;
}

export interface SqlServerCredentials {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  encrypt_connection: boolean;
  trust_server_cert: boolean;
  source_id: number;
}

/**
 * Get credentials from DB (preferred) or env vars (fallback)
 * Returns null if not configured
 */
export async function getCredentials(): Promise<SqlServerCredentials | null> {
  try {
    // Try DB first
    const { rows } = await pgQuery<any>(`
      SELECT
        s.id as source_id,
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

    if (rows.length > 0 && rows[0].host && rows[0].password_encrypted) {
      const row = rows[0];
      if (!isEncryptionConfigured()) {
        console.error('[SqlServerAdapter] APP_MASTER_KEY not configured');
        return null;
      }

      const password = decryptSecret(row.password_encrypted);
      return {
        host: row.host,
        port: row.port || 1433,
        database: row.database,
        username: row.username,
        password,
        encrypt_connection: row.encrypt_connection ?? true,
        trust_server_cert: row.trust_server_cert ?? false,
        source_id: row.source_id,
      };
    }
  } catch (err) {
    console.error('[SqlServerAdapter] Failed to get DB credentials:', err);
  }

  // Fallback to env vars
  const host = process.env.SQLSERVER_HOST;
  const database = process.env.SQLSERVER_DATABASE;
  const username = process.env.SQLSERVER_USER;
  const password = process.env.SQLSERVER_PASSWORD;

  if (host && database && username && password) {
    return {
      host,
      port: parseInt(process.env.SQLSERVER_PORT || '1433', 10),
      database,
      username,
      password,
      encrypt_connection: true,
      trust_server_cert: true,
      source_id: 1, // Default source ID for env var config
    };
  }

  return null;
}

/**
 * Get masked connection info for display (no secrets)
 */
export async function getMaskedConnectionInfo(): Promise<{ host: string; database: string; configured: boolean }> {
  const creds = await getCredentials();

  if (!creds) {
    return {
      host: '(not configured)',
      database: '(not configured)',
      configured: false,
    };
  }

  return {
    host: creds.host.length > 4 ? `${creds.host.substring(0, 4)}****` : creds.host,
    database: creds.database,
    configured: true,
  };
}

/**
 * Test SQL Server connection using DB credentials
 */
export async function testSqlServerConnection(): Promise<TestConnectionResult> {
  const creds = await getCredentials();

  if (!creds) {
    return {
      ok: false,
      message: 'SQL Server connection not configured',
      error: 'No credentials found in database or environment variables',
    };
  }

  try {
    const sql = await import('mssql');

    const config: any = {
      server: creds.host,
      port: creds.port,
      database: creds.database,
      user: creds.username,
      password: creds.password,
      options: {
        encrypt: creds.encrypt_connection,
        trustServerCertificate: creds.trust_server_cert,
      },
      connectionTimeout: 10000,
      requestTimeout: 10000,
    };

    const pool = await sql.default.connect(config);
    await pool.request().query('SELECT 1 AS test');
    await pool.close();

    return { ok: true, message: 'SQL Server connection successful' };
  } catch (err: any) {
    return { ok: false, message: 'SQL Server connection failed', error: err.message };
  }
}

/**
 * Fetch rows newer than watermark in stable order
 */
export async function fetchRowsNewerThanWatermark(params: {
  watermark_ts: Date | null;
  watermark_id: number | bigint | null;
  batch_size: number;
}): Promise<FetchResult> {
  const creds = await getCredentials();

  if (!creds) {
    return { rows: [], error: 'SQL Server not configured' };
  }

  try {
    const sql = await import('mssql');

    const config: any = {
      server: creds.host,
      port: creds.port,
      database: creds.database,
      user: creds.username,
      password: creds.password,
      options: {
        encrypt: creds.encrypt_connection,
        trustServerCertificate: creds.trust_server_cert,
      },
      connectionTimeout: 15000,
      requestTimeout: 30000,
    };

    const pool = await sql.default.connect(config);
    const tableName = process.env.SQLSERVER_TABLE || 'dbo.CADCalls';

    let queryStr = `
      SELECT TOP (@batchSize) *
      FROM ${tableName}
      WHERE 1=1
    `;

    const request = pool.request();
    request.input('batchSize', sql.default.Int, params.batch_size);

    if (params.watermark_ts) {
      queryStr += ` AND (updated_at > @watermarkTs OR (updated_at = @watermarkTs AND id > @watermarkId))`;
      request.input('watermarkTs', sql.default.DateTime, params.watermark_ts);
      request.input('watermarkId', sql.default.BigInt, params.watermark_id || 0);
    }

    queryStr += ` ORDER BY updated_at ASC, id ASC`;

    const result = await request.query(queryStr);
    await pool.close();

    return { rows: result.recordset as SqlServerCallRow[] };
  } catch (err: any) {
    return { rows: [], error: err.message };
  }
}

