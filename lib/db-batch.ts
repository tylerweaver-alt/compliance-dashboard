/**
 * Batch insert utilities for efficient database operations.
 * 
 * Provides helpers for inserting large numbers of rows efficiently
 * using multi-row INSERT statements instead of row-by-row inserts.
 */

import { PoolClient } from 'pg';

/**
 * Configuration for batch insert operations.
 */
export interface BatchInsertConfig {
  /** Table name to insert into */
  table: string;
  /** Column names in order */
  columns: string[];
  /** Maximum rows per INSERT statement (default: 500) */
  batchSize?: number;
  /** Conflict handling clause (e.g., 'ON CONFLICT DO NOTHING') */
  onConflict?: string;
}

/**
 * Build a multi-row INSERT statement.
 * 
 * @param config - Batch insert configuration
 * @param rows - Array of row data (each row is an array of values in column order)
 * @returns Object with SQL query and flattened values array
 */
export function buildBatchInsertSQL(
  config: BatchInsertConfig,
  rows: unknown[][]
): { sql: string; values: unknown[] } {
  const { table, columns, onConflict } = config;
  
  if (rows.length === 0) {
    throw new Error('Cannot build batch insert with empty rows');
  }
  
  const columnList = columns.join(', ');
  const values: unknown[] = [];
  const valuePlaceholders: string[] = [];
  
  let paramIndex = 1;
  for (const row of rows) {
    if (row.length !== columns.length) {
      throw new Error(
        `Row has ${row.length} values but expected ${columns.length} columns`
      );
    }
    
    const rowPlaceholders: string[] = [];
    for (const value of row) {
      rowPlaceholders.push(`$${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
    valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
  }
  
  let sql = `INSERT INTO ${table} (${columnList}) VALUES ${valuePlaceholders.join(', ')}`;
  
  if (onConflict) {
    sql += ` ${onConflict}`;
  }
  
  return { sql, values };
}

/**
 * Execute a batch insert operation.
 * 
 * Splits large datasets into multiple INSERT statements based on batchSize.
 * 
 * @param client - Database client (from pool.connect())
 * @param config - Batch insert configuration
 * @param rows - Array of row data
 * @returns Total number of rows inserted
 */
export async function batchInsert(
  client: PoolClient,
  config: BatchInsertConfig,
  rows: unknown[][]
): Promise<number> {
  const batchSize = config.batchSize ?? 500;
  
  if (rows.length === 0) {
    return 0;
  }
  
  let totalInserted = 0;
  
  // Process in batches
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { sql, values } = buildBatchInsertSQL(config, batch);
    
    const result = await client.query(sql, values);
    totalInserted += result.rowCount ?? batch.length;
  }
  
  return totalInserted;
}

/**
 * Helper to create row arrays from objects.
 * 
 * @param columns - Column names in order
 * @param objects - Array of objects with column names as keys
 * @returns Array of row arrays
 */
export function objectsToRows<T extends Record<string, unknown>>(
  columns: string[],
  objects: T[]
): unknown[][] {
  return objects.map((obj) =>
    columns.map((col) => {
      // Handle snake_case column names with camelCase object keys
      const camelKey = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      return obj[col] ?? obj[camelKey] ?? null;
    })
  );
}

/**
 * Batch insert with automatic object-to-row conversion.
 * 
 * @param client - Database client
 * @param config - Batch insert configuration
 * @param objects - Array of objects to insert
 * @returns Total number of rows inserted
 */
export async function batchInsertObjects<T extends Record<string, unknown>>(
  client: PoolClient,
  config: BatchInsertConfig,
  objects: T[]
): Promise<number> {
  const rows = objectsToRows(config.columns, objects);
  return batchInsert(client, config, rows);
}

