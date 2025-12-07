/**
 * lib/autoExclusions/strategies/weather.ts
 * 
 * Weather / Natural Disaster Strategy
 * 
 * PURPOSE:
 * Automatically excludes calls from compliance calculations during severe
 * weather events that legitimately impact response times (hurricanes, floods,
 * ice storms, tornadoes, etc.).
 * 
 * CONFIGURATION:
 * - severity_threshold: Minimum severity to trigger exclusion (e.g., 'severe', 'extreme')
 * - event_types: List of weather event types to consider
 * 
 * FUTURE INTEGRATION:
 * - Could integrate with National Weather Service API for automatic detection
 * - Could use historical weather data for retroactive analysis
 * 
 * AUDIT NOTES:
 * - Metadata includes weather event details for reproducibility
 * - Reason text references specific weather conditions
 */

import type { 
  AutoExclusionStrategy, 
  AutoExclusionContext, 
  AutoExclusionStrategyResult 
} from '../types';

// Default configuration (overridden by DB config if present)
const DEFAULT_CONFIG = {
  severity_threshold: 'severe',
  event_types: ['hurricane', 'tornado', 'flood', 'ice_storm', 'blizzard'],
};

export const weatherStrategy: AutoExclusionStrategy = {
  key: 'WEATHER',
  displayName: 'Weather / Natural Disaster',
  
  async evaluate(context: AutoExclusionContext): Promise<AutoExclusionStrategyResult | null> {
    // Get strategy-specific config
    const strategyConfig = context.strategyConfigs?.get('WEATHER');
    
    // If strategy is explicitly disabled, return null (skip evaluation)
    if (strategyConfig && !strategyConfig.isEnabled) {
      return null;
    }
    
    const config = strategyConfig?.config ?? DEFAULT_CONFIG;
    const severityThreshold = config.severity_threshold ?? DEFAULT_CONFIG.severity_threshold;
    
    // PLACEHOLDER: In full implementation, this would:
    // 1. Query a weather events table for active events at the call's time/location
    // 2. OR integrate with external weather API
    // 3. OR check against manually-entered weather event windows
    
    // TODO: Implement actual weather event lookup
    // For now, we return a non-excluding result
    
    const activeWeatherEvent = null; // Placeholder - would come from DB/API
    const shouldExclude = activeWeatherEvent !== null;
    
    return {
      strategyKey: 'WEATHER',
      shouldExclude,
      reason: shouldExclude
        ? `Weather event: ${activeWeatherEvent} affecting ${context.responseArea}`
        : 'No active weather events',
      confidence: shouldExclude ? 0.95 : 0,
      metadata: {
        evaluatedAt: new Date().toISOString(),
        responseArea: context.responseArea,
        regionId: context.regionId,
        responseDateTime: context.responseDateTime.toISOString(),
        activeWeatherEvent,
        severityThreshold,
        // Future: Include weather event details
        // eventType: null,
        // eventSeverity: null,
        // eventStart: null,
        // eventEnd: null,
        // source: 'manual' | 'nws_api',
        strategyVersion: '1.0.0',
        configSource: strategyConfig ? 'database' : 'default',
      },
    };
  },
};

export default weatherStrategy;

