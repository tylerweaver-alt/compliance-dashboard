/**
 * lib/autoExclusions/runner.ts
 * 
 * Auto-Exclusion Runner - Orchestrates the full evaluation workflow
 * 
 * PURPOSE:
 * High-level functions that take call IDs, fetch data, run the engine,
 * apply exclusions, and mark calls as evaluated.
 * 
 * USAGE:
 * - processCallsForAutoExclusion([123, 456, 789]) - Process multiple calls
 * - processSingleCall(123) - Process one call
 * - processUnevaluatedCalls() - Process all unevaluated calls (for cron)
 */

import { query } from '@/lib/db';
import { runAutoExclusionsForCall, buildAutoExclusionContext } from './engine';
import { recordAutoExclusion } from './db';
import type { AutoExclusionDecision } from './types';

// Result type for processed calls
export interface ProcessedCallResult {
  callId: number;
  responseNumber: string;
  decision: AutoExclusionDecision;
  wasExcluded: boolean;
  error?: string;
}

// Summary type for batch processing
export interface BatchProcessingResult {
  totalProcessed: number;
  excluded: number;
  notExcluded: number;
  errors: number;
  results: ProcessedCallResult[];
}

/**
 * Process a single call through the auto-exclusion engine
 * 
 * @param callId - Database ID of the call to process
 * @returns Processing result with decision details
 */
export async function processSingleCall(callId: number): Promise<ProcessedCallResult> {
  try {
    // 1. Fetch call data from database
    // Note: Only select columns that exist in the calls table
    const { rows } = await query<{
      id: number;
      response_number: string;
      response_date: string;
      call_in_que_time: string;
      compliance_time_minutes: number | null;
      response_area: string | null;
      parish_id: number | null;
      region_id: number | null;
      priority: string | null;
      origin_latitude: number | null;
      origin_longitude: number | null;
    }>(
      `SELECT id, response_number, response_date, call_in_que_time,
              compliance_time_minutes, response_area, parish_id, region_id,
              priority, origin_latitude, origin_longitude
       FROM calls WHERE id = $1`,
      [callId]
    );

    if (rows.length === 0) {
      return {
        callId,
        responseNumber: 'UNKNOWN',
        decision: { isExcluded: false, primaryStrategy: null, reason: null, strategyResults: [], metadata: null },
        wasExcluded: false,
        error: 'Call not found',
      };
    }

    const call = rows[0];

    // 2. Build context for the engine
    const responseDateTime = new Date(`${call.response_date} ${call.call_in_que_time}`);
    const complianceTimeSeconds = call.compliance_time_minutes 
      ? call.compliance_time_minutes * 60 
      : null;

    const context = buildAutoExclusionContext({
      callId: call.id,
      responseNumber: call.response_number,
      responseDateTime,
      complianceTimeSeconds,
      responseArea: call.response_area || undefined,
      parishId: call.parish_id,
      regionId: call.region_id,
      priority: call.priority,
      originLatitude: call.origin_latitude,
      originLongitude: call.origin_longitude,
    });

    // 3. Run the auto-exclusion engine
    const decision = await runAutoExclusionsForCall(context);

    // 4. Record exclusion if applicable
    // recordAutoExclusion now sets both unified (is_excluded, exclusion_type) and legacy columns
    if (decision.isExcluded) {
      await recordAutoExclusion(callId, decision);
    }

    // 5. Mark call as evaluated (regardless of outcome)
    await query(
      `UPDATE calls SET 
        auto_exclusion_evaluated = TRUE,
        auto_exclusion_evaluated_at = NOW()
       WHERE id = $1`,
      [callId]
    );

    return {
      callId,
      responseNumber: call.response_number,
      decision,
      wasExcluded: decision.isExcluded,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[AutoExclusion Runner] Error processing call ${callId}: ${errorMessage}`);
    // Log full stack for first few errors to diagnose
    if (error instanceof Error && error.stack) {
      console.error(`[AutoExclusion Runner] Stack:`, error.stack);
    }
    return {
      callId,
      responseNumber: 'UNKNOWN',
      decision: { isExcluded: false, primaryStrategy: null, reason: null, strategyResults: [], metadata: null },
      wasExcluded: false,
      error: errorMessage,
    };
  }
}

/**
 * Process multiple calls through the auto-exclusion engine
 * 
 * @param callIds - Array of call IDs to process
 * @returns Batch processing result with summary and individual results
 */
export async function processCallsForAutoExclusion(
  callIds: number[]
): Promise<BatchProcessingResult> {
  const results: ProcessedCallResult[] = [];
  
  // Process calls in parallel with concurrency limit
  const BATCH_SIZE = 10;
  for (let i = 0; i < callIds.length; i += BATCH_SIZE) {
    const batch = callIds.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(id => processSingleCall(id)));
    results.push(...batchResults);
  }

  return {
    totalProcessed: results.length,
    excluded: results.filter(r => r.wasExcluded).length,
    notExcluded: results.filter(r => !r.wasExcluded && !r.error).length,
    errors: results.filter(r => r.error).length,
    results,
  };
}

/**
 * Process all unevaluated calls (for cron job / safety net)
 *
 * Finds calls where auto_exclusion_evaluated = FALSE and processes them.
 * Limits to calls inserted more than 1 minute ago to avoid racing with inline evaluation.
 *
 * @param limit - Maximum number of calls to process (default: 500)
 * @returns Batch processing result
 */
export async function processUnevaluatedCalls(
  limit: number = 500
): Promise<BatchProcessingResult> {
  // Find unevaluated calls, ordered by ID (oldest first)
  // Note: calls table doesn't have created_at, so we use id for ordering
  const { rows } = await query<{ id: number }>(
    `SELECT id FROM calls
     WHERE auto_exclusion_evaluated = FALSE
        OR auto_exclusion_evaluated IS NULL
     ORDER BY id ASC
     LIMIT $1`,
    [limit]
  );

  if (rows.length === 0) {
    return {
      totalProcessed: 0,
      excluded: 0,
      notExcluded: 0,
      errors: 0,
      results: [],
    };
  }

  const callIds = rows.map(r => r.id);
  return processCallsForAutoExclusion(callIds);
}

/**
 * Get count of unevaluated calls
 * Useful for monitoring and dashboard display
 */
export async function getUnevaluatedCallCount(): Promise<number> {
  const { rows } = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM calls WHERE auto_exclusion_evaluated = FALSE`
  );
  return parseInt(rows[0]?.count || '0', 10);
}

