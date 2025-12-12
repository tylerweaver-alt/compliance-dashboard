/**
 * lib/autoExclusions/strategies/cadOutage.ts
 * 
 * CAD / System Outage Strategy
 * 
 * PURPOSE:
 * Automatically excludes calls from compliance calculations during CAD system
 * outages or other technical issues that affect dispatch accuracy and timing.
 * 
 * RATIONALE:
 * When the CAD system is down or degraded, dispatch times may be inaccurate
 * or delayed in ways that don't reflect actual ambulance response performance.
 * These calls should be excluded from compliance calculations.
 * 
 * CONFIGURATION:
 * - outage_windows: List of time windows when outages occurred
 * - affected_systems: Which systems were affected
 * 
 * AUDIT NOTES:
 * - Metadata includes outage window details for reproducibility
 * - Reason text references specific outage periods
 */

import type { 
  AutoExclusionStrategy, 
  AutoExclusionContext, 
  AutoExclusionStrategyResult 
} from '../types';

// Default configuration (overridden by DB config if present)
const DEFAULT_CONFIG = {
  description: 'CAD system outages affecting dispatch accuracy',
  // Outage windows would be configured in the database
  // Format: [{ start: ISO timestamp, end: ISO timestamp, description: string }]
};

export const cadOutageStrategy: AutoExclusionStrategy = {
  key: 'CAD_OUTAGE',
  displayName: 'CAD / System Outage',
  
  async evaluate(context: AutoExclusionContext): Promise<AutoExclusionStrategyResult | null> {
    // Get strategy-specific config
    const strategyConfig = context.strategyConfigs?.get('CAD_OUTAGE');
    
    // If strategy is explicitly disabled, return null (skip evaluation)
    if (strategyConfig && !strategyConfig.isEnabled) {
      return null;
    }
    
    const config = strategyConfig?.config ?? DEFAULT_CONFIG;
    
    // PLACEHOLDER: In full implementation, this would:
    // 1. Check a cad_outages table for outages overlapping the call's time
    // 2. OR integrate with CAD system monitoring
    // 3. OR check against manually-entered outage windows
    
    // TODO: Implement actual CAD outage lookup
    // Query would look like:
    // SELECT * FROM cad_outages 
    // WHERE outage_start <= $1 AND outage_end >= $1
    //   AND (region_id IS NULL OR region_id = $2)
    
    const activeOutage = null; // Placeholder - would come from DB
    const shouldExclude = activeOutage !== null;
    
    return {
      strategyKey: 'CAD_OUTAGE',
      shouldExclude,
      reason: shouldExclude
        ? `CAD system outage: ${activeOutage} during call time`
        : 'No CAD outages during call time',
      confidence: shouldExclude ? 1.0 : 0, // CAD outages are deterministic
      metadata: {
        evaluatedAt: new Date().toISOString(),
        regionId: context.regionId,
        responseDateTime: context.responseDateTime.toISOString(),
        activeOutage,
        // Future: Include outage details
        // outageId: null,
        // outageStart: null,
        // outageEnd: null,
        // affectedSystems: [],
        // outageDescription: null,
        strategyVersion: '1.0.0',
        configSource: strategyConfig ? 'database' : 'default',
      },
    };
  },
};

export default cadOutageStrategy;

