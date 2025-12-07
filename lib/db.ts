/**
 * lib/db.ts
 *
 * Database connection pool and query helper for Neon Postgres.
 *
 * USAGE:
 * ```ts
 * import { pool, query } from '@/lib/db';
 *
 * // Using the query helper (recommended for simple queries)
 * const result = await query('SELECT * FROM calls WHERE parish_id = $1', [parishId]);
 *
 * // Using the pool directly (for transactions or complex operations)
 * const client = await pool.connect();
 * try {
 *   await client.query('BEGIN');
 *   // ... multiple queries
 *   await client.query('COMMIT');
 * } finally {
 *   client.release();
 * }
 * ```
 */

import { Pool, QueryResultRow } from 'pg';

// Centralized Neon pool for server-side queries.
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Neon uses SSL
  },
});

export { pool };

// Simple helper for one-off parameterized queries.
export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params?: any[]): Promise<{ rows: T[] }> {
  const client = await pool.connect();
  try {
    const res = await client.query<T>(text, params);
    return { rows: res.rows };
  } finally {
    client.release();
  }
}
