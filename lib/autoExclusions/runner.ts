/**
 * lib/autoExclusions/runner.ts
 * 
 * Core Auto-Exclusion Engine Runner
 * Evaluates calls against all enabled strategies and applies exclusions
 */

import { pool } from '@/lib/db';
import type {
  AutoExclusionContext,
  AutoExclusionDecision,
  AutoExclusionStrategyResult,
  StrategyConfig,
} from './types';

// Import strategies
import { peakCallLoadStrategy } from './strategies/peakCallLoad';
import { weatherStrategy } from './strategies/weather';

const ENGINE_VERSION = '1.0.0';

export interface ProcessedCallResult {
  callId: number;
  wasExcluded: boolean;
  decision: AutoExclusionDecision;
  error?: string;
}

export interface BatchProcessingResult {
  totalProcessed: number;
  excluded: number;
  errors: number;
  results: ProcessedCallResult[];
}

/**
 * Process a single call for auto-exclusion
 */
export async function processSingleCall(callId: number): Promise<ProcessedCallResult> {
  const client = await pool.connect();
  
  try {
    // Get call data
    const callResult = await client.query(`
      SELECT 
        id, response_number, response_date_time, compliance_time_minutes,
        response_area, parish_id, region_id, priority, problem_description,
        is_excluded, is_auto_excluded
      FROM calls
      WHERE id = $1
    `, [callId]);

    if (callResult.rows.length === 0) {
      return {
        callId,
        wasExcluded: false,
        decision: createEmptyDecision(),
        error: 'Call not found',
      };
    }

    const call = callResult.rows[0];

    // Skip if already excluded
    if (call.is_excluded || call.is_auto_excluded) {
      return {
        callId,
        wasExcluded: false,
        decision: createEmptyDecision(),
        error: 'Call already excluded',
      };
    }

    // Build context
    const context: AutoExclusionContext = {
      callId: call.id,
      responseNumber: call.response_number,
      responseDateTime: new Date(call.response_date_time || Date.now()),
      complianceTimeSeconds: (call.compliance_time_minutes ?? 0) * 60,
      responseArea: call.response_area || '',
      parishId: call.parish_id,
      regionId: call.region_id,
      priority: call.priority,
      problemDescription: call.problem_description,
    };

    // Run evaluation (strategies will be added later)
    const decision = await runAutoExclusionsForCall(context);

    // Apply exclusion if needed
    if (decision.isExcluded && decision.primaryStrategy) {
      await applyAutoExclusion(client, callId, decision);
    }

    return {
      callId,
      wasExcluded: decision.isExcluded,
      decision,
    };
  } catch (error: any) {
    return {
      callId,
      wasExcluded: false,
      decision: createEmptyDecision(),
      error: error.message,
    };
  } finally {
    client.release();
  }
}

/**
 * Process multiple calls for auto-exclusion
 */
export async function processCallsForAutoExclusion(callIds: number[]): Promise<BatchProcessingResult> {
  const results: ProcessedCallResult[] = [];
  let excluded = 0;
  let errors = 0;

  for (const callId of callIds) {
    const result = await processSingleCall(callId);
    results.push(result);
    
    if (result.wasExcluded) excluded++;
    if (result.error) errors++;
  }

  return {
    totalProcessed: callIds.length,
    excluded,
    errors,
    results,
  };
}

/**
 * Run all enabled strategies against a call
 */
async function runAutoExclusionsForCall(context: AutoExclusionContext): Promise<AutoExclusionDecision> {
  const strategyResults: AutoExclusionStrategyResult[] = [];

  // Run all strategies
  const peakResult = await peakCallLoadStrategy.evaluate(context);
  if (peakResult) strategyResults.push(peakResult);

  const weatherResult = await weatherStrategy.evaluate(context);
  if (weatherResult) strategyResults.push(weatherResult);

  // Determine if any strategy wants to exclude
  const excludingResults = strategyResults.filter(r => r.shouldExclude);

  if (excludingResults.length === 0) {
    return createEmptyDecision();
  }

  // Use highest confidence strategy
  const primary = excludingResults.sort((a, b) => b.confidence - a.confidence)[0];

  return {
    isExcluded: true,
    primaryStrategy: primary.strategyKey,
    reason: primary.reason,
    strategyResults,
    metadata: {
      engineVersion: ENGINE_VERSION,
      evaluatedAt: new Date().toISOString(),
      totalStrategiesEvaluated: strategyResults.length,
      strategiesExcluding: excludingResults.map(r => r.strategyKey),
    },
  };
}

function createEmptyDecision(): AutoExclusionDecision {
  return {
    isExcluded: false,
    primaryStrategy: null,
    reason: null,
    strategyResults: [],
    metadata: null,
  };
}

async function applyAutoExclusion(client: any, callId: number, decision: AutoExclusionDecision) {
  if (!decision.primaryStrategy || !decision.reason) return;

  await client.query('BEGIN');

  try {
    // Update calls table
    await client.query(
      `UPDATE calls SET
        is_excluded = TRUE,
        is_auto_excluded = TRUE,
        exclusion_type = 'AUTO',
        auto_exclusion_strategy = $1,
        auto_exclusion_reason = $2,
        auto_excluded_at = NOW(),
        auto_exclusion_metadata = $3
      WHERE id = $4`,
      [
        decision.primaryStrategy,
        decision.reason,
        JSON.stringify(decision.metadata),
        callId,
      ]
    );

    // Insert into exclusion_logs
    await client.query(
      `INSERT INTO exclusion_logs (
        call_id, exclusion_type, strategy_key, reason, engine_metadata
      ) VALUES ($1, 'AUTO', $2, $3, $4)`,
      [callId, decision.primaryStrategy, decision.reason, JSON.stringify(decision.metadata)]
    );

    // Insert into audit_logs
    await client.query(
      `INSERT INTO audit_logs (
        action, target_type, target_id, summary, metadata
      ) VALUES ('AUTO_EXCLUSION', 'call', $1::text, $2, $3)`,
      [callId, `Auto-excluded via ${decision.primaryStrategy}`, JSON.stringify(decision.metadata)]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

