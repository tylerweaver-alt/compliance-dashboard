/**
 * SQL Server Ingestion Worker
 * 
 * Standalone process that runs independently of Next.js API routes.
 * Polls the database for configuration and processes SQL Server data.
 * 
 * State Machine:
 *   NOT_CONFIGURED → (credentials saved) → DISABLED
 *   DISABLED → (enabled=true) → IDLE
 *   IDLE → (tick starts) → CONNECTING → RUNNING → IDLE
 *   Any → (error) → ERROR → (retry) → CONNECTING
 * 
 * Run with: npx ts-node --project tsconfig.worker.json worker/ingestion-worker.ts
 * Or with PM2: pm2 start worker/ingestion-worker.ts --interpreter ts-node
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { query } from '../lib/db';
import { fetchRowsNewerThanWatermark, getCredentials } from '../lib/ingestion/sqlserverAdapter';
import { 
  mapSqlServerRowToNormalizedCall, 
  validateNormalizedCall, 
  upsertNormalizedCall 
} from '../lib/ingestion/sharedPipeline';
import { writeIngestionLog } from '../lib/ingestion/pipeline';

// ============================================================================
// Configuration
// ============================================================================

const HEARTBEAT_INTERVAL_MS = 5000; // 5 seconds
const ERROR_RETRY_DELAY_MS = 30000; // 30 seconds
const DEFAULT_POLL_INTERVAL_MS = 10000; // 10 seconds
const DEFAULT_REGION_ID = 1; // Default region for ingested calls

// ============================================================================
// Types
// ============================================================================

interface IngestionSource {
  id: number;
  type: string;
  enabled: boolean;
  watermark_ts: Date | null;
  watermark_id: number | null;
  batch_size: number;
  poll_interval_ms: number;
}

type WorkerState = 'NOT_CONFIGURED' | 'DISABLED' | 'IDLE' | 'CONNECTING' | 'RUNNING' | 'ERROR';

// ============================================================================
// Worker State
// ============================================================================

let currentState: WorkerState = 'NOT_CONFIGURED';
let lastError: string | null = null;
let isShuttingDown = false;
let heartbeatTimer: NodeJS.Timeout | null = null;
let pollTimer: NodeJS.Timeout | null = null;

// ============================================================================
// Logging
// ============================================================================

function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: Record<string, any>) {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${timestamp}] [${level}] [Worker] ${message}${metaStr}`);
}

// ============================================================================
// State Management
// ============================================================================

async function updateWorkerState(
  sourceId: number, 
  state: WorkerState, 
  errorMessage?: string
): Promise<void> {
  currentState = state;
  
  const updates = ['state = $1', 'last_heartbeat_at = now()'];
  const values: any[] = [state];
  
  if (errorMessage) {
    updates.push('last_error_at = now()', 'last_error_message = $2');
    values.push(errorMessage);
    lastError = errorMessage;
  }
  
  values.push(sourceId);
  
  await query(`
    UPDATE ingestion_worker_status
    SET ${updates.join(', ')}
    WHERE source_id = $${values.length}
  `, values);
}

async function heartbeat(sourceId: number): Promise<void> {
  try {
    await query(`
      UPDATE ingestion_worker_status
      SET last_heartbeat_at = now()
      WHERE source_id = $1
    `, [sourceId]);
  } catch (err) {
    log('WARN', 'Heartbeat failed', { error: (err as Error).message });
  }
}

// ============================================================================
// Main Tick Function
// ============================================================================

async function runTick(source: IngestionSource): Promise<void> {
  const startTime = Date.now();
  
  try {
    // Update state to CONNECTING
    await updateWorkerState(source.id, 'CONNECTING');
    await writeIngestionLog(source.id, 'INFO', 'TICK_START', 'Starting ingestion tick');
    
    // Fetch rows from SQL Server
    const fetchResult = await fetchRowsNewerThanWatermark({
      watermark_ts: source.watermark_ts,
      watermark_id: source.watermark_id,
      batch_size: source.batch_size,
    });
    
    if (fetchResult.error) {
      await updateWorkerState(source.id, 'ERROR', fetchResult.error);
      await writeIngestionLog(source.id, 'ERROR', 'FETCH_ERROR', fetchResult.error);
      return;
    }
    
    // Update state to RUNNING
    await updateWorkerState(source.id, 'RUNNING');
    
    const rows = fetchResult.rows;
    let created = 0, updated = 0, skipped = 0, errored = 0;
    let lastRow: any = null;
    
    // Process each row using shared pipeline
    for (const row of rows) {
      const normalized = mapSqlServerRowToNormalizedCall(row, source.id);
      const validation = validateNormalizedCall(normalized);
      
      if (!validation.ok) {
        errored++;
        log('WARN', 'Validation failed', { errors: validation.errors });
        continue;
      }
      
      const result = await upsertNormalizedCall(normalized, DEFAULT_REGION_ID);
      if (result.status === 'created') created++;
      else if (result.status === 'updated') updated++;
      else skipped++;
      if (result.error) errored++;
      
      lastRow = row;
    }
    
    // Advance watermark if we processed rows successfully
    if (lastRow && errored === 0) {
      await query(`
        UPDATE ingestion_sources
        SET watermark_ts = $1, watermark_id = $2, updated_at = now()
        WHERE id = $3
      `, [lastRow.updated_at, lastRow.id, source.id]);
    }

    // Update metrics
    const duration_ms = Date.now() - startTime;
    await query(`
      UPDATE ingestion_worker_status
      SET
        state = 'IDLE',
        last_success_at = now(),
        rows_ingested_total = rows_ingested_total + $1
      WHERE source_id = $2
    `, [created + updated, source.id]);

    await writeIngestionLog(source.id, 'INFO', 'TICK_END',
      `Tick complete: ${rows.length} fetched, ${created} created, ${updated} updated, ${skipped} skipped, ${errored} errors`,
      { fetched: rows.length, created, updated, skipped, errored, duration_ms }
    );

    log('INFO', `Tick complete`, { fetched: rows.length, created, updated, skipped, errored, duration_ms });

    // Update state to IDLE
    await updateWorkerState(source.id, 'IDLE');

  } catch (err: any) {
    const duration_ms = Date.now() - startTime;
    await updateWorkerState(source.id, 'ERROR', err.message);
    await writeIngestionLog(source.id, 'ERROR', 'TICK_ERROR', err.message, { duration_ms });
    log('ERROR', 'Tick failed', { error: err.message, duration_ms });
  }
}

// ============================================================================
// Main Loop
// ============================================================================

async function getSource(): Promise<IngestionSource | null> {
  const { rows } = await query<IngestionSource>(`
    SELECT id, type, enabled, watermark_ts, watermark_id, batch_size, poll_interval_ms
    FROM ingestion_sources
    WHERE type = 'sqlserver'
    LIMIT 1
  `);
  return rows[0] || null;
}

async function mainLoop(): Promise<void> {
  if (isShuttingDown) return;

  try {
    // Get source configuration
    const source = await getSource();

    if (!source) {
      log('WARN', 'No sqlserver ingestion source found');
      scheduleNextPoll(DEFAULT_POLL_INTERVAL_MS);
      return;
    }

    // Check if credentials are configured
    const creds = await getCredentials();
    if (!creds) {
      if (currentState !== 'NOT_CONFIGURED') {
        await updateWorkerState(source.id, 'NOT_CONFIGURED');
        log('INFO', 'Credentials not configured');
      }
      scheduleNextPoll(DEFAULT_POLL_INTERVAL_MS);
      return;
    }

    // Check if enabled
    if (!source.enabled) {
      if (currentState !== 'DISABLED') {
        await updateWorkerState(source.id, 'DISABLED');
        log('INFO', 'Ingestion disabled');
      }
      scheduleNextPoll(DEFAULT_POLL_INTERVAL_MS);
      return;
    }

    // Run a tick
    await runTick(source);

    // Schedule next poll
    const pollInterval = source.poll_interval_ms || DEFAULT_POLL_INTERVAL_MS;
    scheduleNextPoll(pollInterval);

  } catch (err: any) {
    log('ERROR', 'Main loop error', { error: err.message });
    scheduleNextPoll(ERROR_RETRY_DELAY_MS);
  }
}

function scheduleNextPoll(delayMs: number): void {
  if (isShuttingDown) return;
  pollTimer = setTimeout(mainLoop, delayMs);
}

// ============================================================================
// Startup and Shutdown
// ============================================================================

async function startup(): Promise<void> {
  log('INFO', '=== SQL Server Ingestion Worker Starting ===');

  // Get initial source
  const source = await getSource();
  if (source) {
    // Start heartbeat
    heartbeatTimer = setInterval(() => heartbeat(source.id), HEARTBEAT_INTERVAL_MS);
    log('INFO', 'Heartbeat started', { interval_ms: HEARTBEAT_INTERVAL_MS });
  }

  // Start main loop
  await mainLoop();
}

async function shutdown(): Promise<void> {
  log('INFO', '=== SQL Server Ingestion Worker Shutting Down ===');
  isShuttingDown = true;

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }

  // Update state to DISABLED
  const source = await getSource();
  if (source) {
    await updateWorkerState(source.id, 'DISABLED');
    await writeIngestionLog(source.id, 'INFO', 'WORKER_SHUTDOWN', 'Worker shutting down');
  }

  log('INFO', 'Shutdown complete');
  process.exit(0);
}

// Handle signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', (err) => {
  log('ERROR', 'Uncaught exception', { error: err.message, stack: err.stack });
  shutdown();
});
process.on('unhandledRejection', (reason) => {
  log('ERROR', 'Unhandled rejection', { reason: String(reason) });
});

// Start the worker
startup().catch((err) => {
  log('ERROR', 'Startup failed', { error: err.message });
  process.exit(1);
});

