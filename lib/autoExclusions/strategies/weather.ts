/**
 * lib/autoExclusions/strategies/weather.ts
 * 
 * WEATHER Strategy
 * 
 * Auto-excludes calls that overlap with severe weather events.
 * Uses the existing weather exclusion logic from the database.
 */

import { pool } from '@/lib/db';
import type {
  AutoExclusionStrategy,
  AutoExclusionContext,
  AutoExclusionStrategyResult,
} from '../types';

class WeatherStrategy implements AutoExclusionStrategy {
  key = 'WEATHER' as const;
  displayName = 'Weather Events';

  async evaluate(context: AutoExclusionContext): Promise<AutoExclusionStrategyResult | null> {
    // Must have call ID to check weather matches
    if (!context.callId) {
      return null;
    }

    // Get config
    const config = await this.getConfig();
    if (!config.isEnabled) {
      return null;
    }

    const client = await pool.connect();
    try {
      // Check if this call has weather matches in the audit table
      const result = await client.query(
        `SELECT 
          weather_event_id,
          weather_event_type,
          weather_severity,
          weather_area_desc,
          overlap_start,
          overlap_end
         FROM call_weather_exclusion_audit
         WHERE call_id = $1
         LIMIT 1`,
        [context.callId]
      );

      if (result.rows.length === 0) {
        return {
          strategyKey: this.key,
          shouldExclude: false,
          reason: 'No weather events found for this call',
          confidence: 0,
          metadata: {
            evaluatedAt: new Date().toISOString(),
          },
        };
      }

      const weather = result.rows[0];

      // Format reason similar to peak call load: "Severe Weather Alert: {type}"
      const eventType = weather.weather_event_type || 'Unknown';
      const severity = weather.weather_severity || '';
      const formattedReason = `Severe Weather Alert: ${eventType}${severity ? ` (${severity})` : ''}`;

      return {
        strategyKey: this.key,
        shouldExclude: true,
        reason: formattedReason,
        confidence: 0.95,
        metadata: {
          evaluatedAt: new Date().toISOString(),
          weatherEventId: weather.weather_event_id,
          eventType: weather.weather_event_type,
          severity: weather.weather_severity,
          areaDesc: weather.weather_area_desc,
          overlapStart: weather.overlap_start,
          overlapEnd: weather.overlap_end,
        },
      };
    } finally {
      client.release();
    }
  }

  private async getConfig(): Promise<{ isEnabled: boolean; config: any }> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT is_enabled, config FROM auto_exclusion_config WHERE strategy_key = $1`,
        [this.key]
      );
      
      if (result.rows.length === 0) {
        return { isEnabled: true, config: {} };
      }

      return {
        isEnabled: result.rows[0].is_enabled,
        config: result.rows[0].config,
      };
    } finally {
      client.release();
    }
  }
}

export const weatherStrategy = new WeatherStrategy();

