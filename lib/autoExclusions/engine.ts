/**
 * lib/autoExclusions/engine.ts
 * 
 * Auto-Exclusion Engine - Core entry point
 * 
 * PURPOSE:
 * Evaluates all registered strategies against a call and returns a decision
 * on whether the call should be auto-excluded from compliance calculations.
 * 
 * DESIGN:
 * - Runs all enabled strategies in parallel for performance
 * - Picks the highest-confidence excluding strategy as the primary reason
 * - Returns full transparency via strategyResults for audit purposes
 * 
 * USAGE:
 * ```ts
 * import { runAutoExclusionsForCall } from '@/lib/autoExclusions';
 * 
 * const decision = await runAutoExclusionsForCall({
 *   responseNumber: 'R123456',
 *   responseDateTime: new Date(),
 *   complianceTimeSeconds: 450,
 *   responseArea: 'Zone 5',
 *   parishId: 4,
 *   regionId: 1,
 * });
 * 
 * if (decision.isExcluded) {
 *   // Apply exclusion...
 * }
 * ```
 */

import type { 
  AutoExclusionContext, 
  AutoExclusionDecision, 
  AutoExclusionStrategyResult,
  AutoExclusionStrategyKey,
} from './types';
import { strategies } from './strategies';

// Engine version for audit trail
const ENGINE_VERSION = '1.0.0';

/**
 * Main entry point: Evaluate all strategies and return a decision
 * 
 * @param context - All data needed for strategy evaluation
 * @returns Decision object with exclusion status and full audit trail
 */
export async function runAutoExclusionsForCall(
  context: AutoExclusionContext
): Promise<AutoExclusionDecision> {
  const evaluatedAt = new Date().toISOString();
  const results: AutoExclusionStrategyResult[] = [];
  
  // Run all strategies in parallel
  const evaluations = await Promise.allSettled(
    strategies.map(strategy => strategy.evaluate(context))
  );
  
  // Collect successful results
  for (const evaluation of evaluations) {
    if (evaluation.status === 'fulfilled' && evaluation.value !== null) {
      results.push(evaluation.value);
    }
    // Log rejected evaluations for debugging (in production, send to monitoring)
    if (evaluation.status === 'rejected') {
      console.error('[AutoExclusion] Strategy evaluation failed:', evaluation.reason);
    }
  }
  
  // Find all excluding strategies
  const excludingResults = results.filter(r => r.shouldExclude);
  
  // If any strategy says exclude, pick the one with highest confidence
  if (excludingResults.length > 0) {
    // Sort by confidence descending
    excludingResults.sort((a, b) => b.confidence - a.confidence);
    const primaryResult = excludingResults[0];
    
    return {
      isExcluded: true,
      primaryStrategy: primaryResult.strategyKey,
      reason: primaryResult.reason,
      strategyResults: results,
      metadata: {
        engineVersion: ENGINE_VERSION,
        evaluatedAt,
        totalStrategiesEvaluated: results.length,
        strategiesExcluding: excludingResults.map(r => r.strategyKey),
      },
    };
  }
  
  // No exclusion
  return {
    isExcluded: false,
    primaryStrategy: null,
    reason: null,
    strategyResults: results,
    metadata: null,
  };
}

/**
 * Build context object from raw call data
 * Utility to convert DB row or upload data to AutoExclusionContext
 */
export function buildAutoExclusionContext(
  callData: {
    callId?: number;
    responseNumber: string;
    responseDateTime: Date | string;
    complianceTimeSeconds?: number | null;
    responseArea?: string;
    parishId?: number | null;
    regionId?: number | null;
    priority?: string | null;
    problemDescription?: string | null;
    originLatitude?: number | null;
    originLongitude?: number | null;
  }
): AutoExclusionContext {
  return {
    callId: callData.callId,
    responseNumber: callData.responseNumber,
    responseDateTime: typeof callData.responseDateTime === 'string' 
      ? new Date(callData.responseDateTime) 
      : callData.responseDateTime,
    complianceTimeSeconds: callData.complianceTimeSeconds ?? null,
    responseArea: callData.responseArea ?? '',
    parishId: callData.parishId ?? null,
    regionId: callData.regionId ?? null,
    priority: callData.priority ?? null,
    problemDescription: callData.problemDescription ?? null,
    originLatitude: callData.originLatitude ?? null,
    originLongitude: callData.originLongitude ?? null,
  };
}

// Re-export types for convenience
export type { 
  AutoExclusionContext, 
  AutoExclusionDecision, 
  AutoExclusionStrategyResult,
  AutoExclusionStrategyKey,
} from './types';

