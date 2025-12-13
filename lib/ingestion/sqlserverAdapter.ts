/**
 * SQL Server Adapter for CAD/Visinet Ingestion
 * Connects using environment variables only (no credentials in DB)
 * 
 * Required env vars:
 *   SQLSERVER_HOST - SQL Server hostname
 *   SQLSERVER_PORT - SQL Server port (default 1433)
 *   SQLSERVER_DATABASE - Database name
 *   SQLSERVER_USER - Username
 *   SQLSERVER_PASSWORD - Password
 *   SQLSERVER_TABLE - Table name to query (e.g., 'dbo.CADCalls')
 */

// Types for the SQL Server rows we expect
export interface SqlServerCallRow {
  id: number | bigint;
  updated_at: Date;
  // Add additional fields as needed from CAD/Visinet schema
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

/**
 * Get masked connection info for display (no secrets)
 */
export function getMaskedConnectionInfo(): { host: string; database: string; configured: boolean } {
  const host = process.env.SQLSERVER_HOST || '';
  const database = process.env.SQLSERVER_DATABASE || '';
  const configured = Boolean(host && database && process.env.SQLSERVER_USER && process.env.SQLSERVER_PASSWORD);
  
  return {
    host: host ? `${host.substring(0, 4)}****` : '(not configured)',
    database: database || '(not configured)',
    configured,
  };
}

/**
 * Test SQL Server connection
 */
export async function testSqlServerConnection(): Promise<TestConnectionResult> {
  const info = getMaskedConnectionInfo();
  
  if (!info.configured) {
    return {
      ok: false,
      message: 'SQL Server connection not configured',
      error: 'Missing required environment variables: SQLSERVER_HOST, SQLSERVER_DATABASE, SQLSERVER_USER, SQLSERVER_PASSWORD',
    };
  }

  // For now, return placeholder - actual mssql connection would require the mssql package
  // which may not be installed. When ready, uncomment and add mssql dependency.
  /*
  try {
    const sql = require('mssql');
    const config = {
      server: process.env.SQLSERVER_HOST,
      port: parseInt(process.env.SQLSERVER_PORT || '1433', 10),
      database: process.env.SQLSERVER_DATABASE,
      user: process.env.SQLSERVER_USER,
      password: process.env.SQLSERVER_PASSWORD,
      options: {
        encrypt: true,
        trustServerCertificate: true,
      },
      connectionTimeout: 10000,
    };
    
    const pool = await sql.connect(config);
    await pool.request().query('SELECT 1 AS test');
    await pool.close();
    
    return { ok: true, message: 'SQL Server connection successful' };
  } catch (err: any) {
    return { ok: false, message: 'SQL Server connection failed', error: err.message };
  }
  */

  return {
    ok: false,
    message: 'SQL Server adapter not yet implemented',
    error: 'The mssql package integration is pending. Configure env vars and add mssql dependency.',
  };
}

/**
 * Fetch rows newer than watermark in stable order
 */
export async function fetchRowsNewerThanWatermark(params: {
  watermark_ts: Date | null;
  watermark_id: number | bigint | null;
  batch_size: number;
}): Promise<FetchResult> {
  const info = getMaskedConnectionInfo();
  
  if (!info.configured) {
    return { rows: [], error: 'SQL Server not configured' };
  }

  // Placeholder - actual implementation would use mssql package
  /*
  try {
    const sql = require('mssql');
    const config = { ... }; // same as above
    const pool = await sql.connect(config);
    const tableName = process.env.SQLSERVER_TABLE || 'dbo.CADCalls';
    
    let query = `
      SELECT TOP (@batchSize) *
      FROM ${tableName}
      WHERE 1=1
    `;
    
    const request = pool.request();
    request.input('batchSize', sql.Int, params.batch_size);
    
    if (params.watermark_ts) {
      query += ` AND (updated_at > @watermarkTs OR (updated_at = @watermarkTs AND id > @watermarkId))`;
      request.input('watermarkTs', sql.DateTime, params.watermark_ts);
      request.input('watermarkId', sql.BigInt, params.watermark_id || 0);
    }
    
    query += ` ORDER BY updated_at ASC, id ASC`;
    
    const result = await request.query(query);
    await pool.close();
    
    return { rows: result.recordset };
  } catch (err: any) {
    return { rows: [], error: err.message };
  }
  */

  return { rows: [], error: 'SQL Server adapter not yet implemented' };
}

