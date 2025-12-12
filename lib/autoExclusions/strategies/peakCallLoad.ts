/**
 * lib/autoExclusions/strategies/peakCallLoad.ts
 * 
 * PEAK_CALL_LOAD Strategy
 * 
 * Auto-excludes calls when 3+ calls occur in the same parish within a 45-minute window.
 * Only the 3rd+ calls are excluded (first 2 remain in compliance calculation).
 * 
 * BUSINESS RULES:
 * - Window: 45 minutes (configurable)
 * - Threshold: 3 calls minimum (configurable)
 * - Position-based: Calls #3, #4, #5... are auto-excluded
 * - Calls #1 and #2 remain in compliance
 */

import { pool } from '@/lib/db';
import type {
  AutoExclusionStrategy,
  AutoExclusionContext,
  AutoExclusionStrategyResult,
  PeakCallLoadConfig,
} from '../types';

const DEFAULT_CONFIG: PeakCallLoadConfig = {
  window_minutes: 45,
  min_calls_threshold: 3,
};

export interface PeakCallLoadMetadata {
  evaluatedAt: string;
  parishId: number;
  parishName: string;
  callPosition: number;
  callsInWindow: number;
  windowMinutes: number;
  threshold: number;
  decision: 'AUTO_EXCLUDE' | 'HUMAN_REVIEW' | 'NO_ACTION';
  windowStart: string;
  windowEnd: string;
}

class PeakCallLoadStrategy implements AutoExclusionStrategy {
  key = 'PEAK_CALL_LOAD' as const;
  displayName = 'Peak Call Load';

  async evaluate(context: AutoExclusionContext): Promise<AutoExclusionStrategyResult | null> {
    // Must have parish and call time
    if (!context.parishId || !context.responseDateTime) {
      return null;
    }

    // Get config
    const config = await this.getConfig();
    if (!config.isEnabled) {
      return null;
    }

    const settings: PeakCallLoadConfig = {
      ...DEFAULT_CONFIG,
      ...config.config,
    };

    // Calculate window
    const callTime = context.responseDateTime;
    const windowStart = new Date(callTime.getTime() - settings.window_minutes * 60 * 1000);
    const windowEnd = callTime;

    // Query calls in the same parish within the window
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT id, response_number, response_date_time
         FROM calls
         WHERE parish_id = $1
           AND response_date_time >= $2
           AND response_date_time <= $3
         ORDER BY response_date_time ASC`,
        [context.parishId, windowStart.toISOString(), windowEnd.toISOString()]
      );

      const callsInWindow = result.rows;
      const callPosition = callsInWindow.findIndex(c => c.id === context.callId) + 1;

      // Get parish name
      const parishResult = await client.query(
        `SELECT name FROM parishes WHERE id = $1`,
        [context.parishId]
      );
      const parishName = parishResult.rows[0]?.name || `Parish ${context.parishId}`;

      const metadata: PeakCallLoadMetadata = {
        evaluatedAt: new Date().toISOString(),
        parishId: context.parishId,
        parishName,
        callPosition,
        callsInWindow: callsInWindow.length,
        windowMinutes: settings.window_minutes,
        threshold: settings.min_calls_threshold,
        decision: 'NO_ACTION',
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
      };

      // Not enough calls in window
      if (callsInWindow.length < settings.min_calls_threshold) {
        return {
          strategyKey: this.key,
          shouldExclude: false,
          reason: `Only ${callsInWindow.length} calls in ${settings.window_minutes}-min window (threshold: ${settings.min_calls_threshold})`,
          confidence: 0,
          metadata,
        };
      }

      // This is call #1 or #2 - keep in compliance
      if (callPosition <= 2) {
        metadata.decision = 'NO_ACTION';
        return {
          strategyKey: this.key,
          shouldExclude: false,
          reason: `Call #${callPosition} of ${callsInWindow.length} in peak load window - first 2 calls remain in compliance`,
          confidence: 0,
          metadata,
        };
      }

      // This is call #3+ - auto-exclude
      metadata.decision = 'AUTO_EXCLUDE';
      return {
        strategyKey: this.key,
        shouldExclude: true,
        reason: `Peak call load: Call #${callPosition} of ${callsInWindow.length} in ${parishName} within ${settings.window_minutes} minutes`,
        confidence: 0.9,
        metadata,
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
        return { isEnabled: true, config: DEFAULT_CONFIG };
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

export const peakCallLoadStrategy = new PeakCallLoadStrategy();

