/**
 * lib/autoExclusions/index.ts
 * 
 * Auto-Exclusion Engine Module
 * 
 * This module provides automatic exclusion of calls from compliance calculations
 * based on configurable strategies (Peak Load, Weather, CAD Outage).
 * 
 * QUICK START:
 * ```ts
 * import { runAutoExclusionsForCall, buildAutoExclusionContext } from '@/lib/autoExclusions';
 * 
 * const context = buildAutoExclusionContext({
 *   responseNumber: 'R123456',
 *   responseDateTime: new Date(),
 *   complianceTimeSeconds: 450,
 *   responseArea: 'Zone 5',
 *   parishId: 4,
 *   regionId: 1,
 * });
 * 
 * const decision = await runAutoExclusionsForCall(context);
 * 
 * if (decision.isExcluded) {
 *   console.log(`Auto-excluded by ${decision.primaryStrategy}: ${decision.reason}`);
 * }
 * ```
 * 
 * ARCHITECTURE:
 * - engine.ts: Core evaluation logic
 * - types.ts: Type definitions
 * - strategies/: Individual strategy implementations
 * - db.ts: Database operations for exclusion records
 * 
 * AUDIT INTEGRATION:
 * All decisions include metadata for audit trail and legal defensibility.
 * The exclusion_logs table stores a complete history of all exclusion decisions.
 */

// Main engine entry points
export { 
  runAutoExclusionsForCall, 
  buildAutoExclusionContext,
} from './engine';

// Types
export type {
  AutoExclusionContext,
  AutoExclusionDecision,
  AutoExclusionStrategyResult,
  AutoExclusionStrategyKey,
  AutoExclusionStrategy,
  StrategyConfig,
  ExclusionLogInsert,
  CallAutoExclusionUpdate,
} from './types';

// Strategy registry
export { 
  strategies, 
  strategyMap, 
  getStrategy, 
  getStrategyKeys,
} from './strategies';

// Database operations
export {
  recordAutoExclusion,
  loadStrategyConfigs,
} from './db';

