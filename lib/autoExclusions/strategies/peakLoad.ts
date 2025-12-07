/**
 * lib/autoExclusions/strategies/peakLoad.ts
 * 
 * Peak Load / Multiple Calls Strategy
 * 
 * PURPOSE:
 * Automatically excludes calls from compliance calculations when there are
 * multiple simultaneous calls in the same response area, indicating a surge
 * that may legitimately delay response times.
 * 
 * CONFIGURATION:
 * - call_threshold: Number of concurrent calls that triggers exclusion (default: 5)
 * - time_window_minutes: Window to check for concurrent calls (default: 10)
 * 
 * AUDIT NOTES:
 * - Metadata includes exact call counts and window details for reproducibility
 * - Reason text is suitable for display in Audit Log reports
 */

import type { 
  AutoExclusionStrategy, 
  AutoExclusionContext, 
  AutoExclusionStrategyResult 
} from '../types';

// Default configuration (overridden by DB config if present)
const DEFAULT_CONFIG = {
  call_threshold: 5,
  time_window_minutes: 10,
};

export const peakLoadStrategy: AutoExclusionStrategy = {
  key: 'PEAK_LOAD',
  displayName: 'Peak Load / Multiple Calls',
  
  async evaluate(context: AutoExclusionContext): Promise<AutoExclusionStrategyResult | null> {
    // Get strategy-specific config
    const strategyConfig = context.strategyConfigs?.get('PEAK_LOAD');
    
    // If strategy is explicitly disabled, return null (skip evaluation)
    if (strategyConfig && !strategyConfig.isEnabled) {
      return null;
    }
    
    const config = strategyConfig?.config ?? DEFAULT_CONFIG;
    const threshold = config.call_threshold ?? DEFAULT_CONFIG.call_threshold;
    const windowMinutes = config.time_window_minutes ?? DEFAULT_CONFIG.time_window_minutes;
    
    // PLACEHOLDER: In full implementation, this would query the DB for concurrent calls
    // For scaffolding, we return a non-excluding result with metadata showing the strategy works
    
    // TODO: Implement actual DB query to count calls in the same response area
    // within the time window. Query should look like:
    // SELECT COUNT(*) FROM calls 
    // WHERE response_area = $1 
    //   AND response_date_time BETWEEN $2 AND $3
    //   AND id != $4  -- Exclude the current call
    
    const callsInWindow = 0; // Placeholder - would come from DB query
    const shouldExclude = callsInWindow >= threshold;
    
    return {
      strategyKey: 'PEAK_LOAD',
      shouldExclude,
      reason: shouldExclude
        ? `Peak load detected: ${callsInWindow} calls in ${context.responseArea} within ${windowMinutes}-minute window (threshold: ${threshold})`
        : `Normal load: ${callsInWindow} concurrent calls (threshold: ${threshold})`,
      confidence: shouldExclude ? 0.9 : 0,
      metadata: {
        evaluatedAt: new Date().toISOString(),
        responseArea: context.responseArea,
        callsInWindow,
        threshold,
        windowMinutes,
        responseDateTime: context.responseDateTime.toISOString(),
        // Additional context for reproducibility
        strategyVersion: '1.0.0',
        configSource: strategyConfig ? 'database' : 'default',
      },
    };
  },
};

export default peakLoadStrategy;

