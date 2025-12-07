/**
 * lib/autoExclusions/strategies/peakCallLoad.ts
 * 
 * Peak Call Load Strategy
 * 
 * PURPOSE:
 * Automatically excludes calls from compliance calculations when:
 * 1. The call is OUT OF COMPLIANCE (response time > threshold)
 * 2. There are 3+ calls within a 45-minute sliding window
 * 3. All calls in the window are in the SAME PARISH (not response area)
 * 4. The call is the 3rd or later in chronological order within the window
 * 
 * CONFIGURATION:
 * - window_minutes: Sliding window size (default: 45)
 * - min_calls_threshold: Minimum calls to trigger (default: 3)
 * 
 * DECISION MATRIX:
 * - Position 1-2 in window: NO ACTION (never auto-exclude)
 * - Position 3+, out of compliance: AUTO_EXCLUDE
 * - Position 3+, in compliance: HUMAN_REVIEW (flag but don't exclude)
 * 
 * AUDIT NOTES:
 * - Metadata includes all calls in window for audit trail
 * - Reason text is suitable for display in Audit Log reports
 */

import type { 
  AutoExclusionStrategy, 
  AutoExclusionContext, 
  AutoExclusionStrategyResult,
  PeakCallLoadConfig
} from '../types';
import { query } from '@/lib/db';

// Default configuration (overridden by DB config if present)
const DEFAULT_CONFIG: PeakCallLoadConfig = {
  window_minutes: 45,
  min_calls_threshold: 3,
};

// Decision types for clarity
export type PeakCallLoadDecision = 'AUTO_EXCLUDE' | 'HUMAN_REVIEW' | 'NO_ACTION';

// Window call info for metadata
export interface WindowCallInfo {
  callId: number;
  responseNumber: string;
  queueTime: string;
  isCompliant: boolean;
  wasExcluded: boolean;
}

// Extended metadata for this strategy
export interface PeakCallLoadMetadata {
  engineVersion: string;
  evaluatedAt: string;
  strategyVersion: string;
  windowMinutes: number;
  minCallsThreshold: number;
  parishId: number | null;
  parishName: string | null;
  callsInWindow: number;
  callPosition: number;
  firstCallTime: string | null;
  lastCallTime: string | null;
  windowCalls: WindowCallInfo[];
  thisCallCompliant: boolean;
  thisCallResponseMinutes: number | null;
  thisCallThresholdMinutes: number | null;
  decision: PeakCallLoadDecision;
}

export const peakCallLoadStrategy: AutoExclusionStrategy = {
  key: 'PEAK_CALL_LOAD',
  displayName: 'Peak Call Load (Parish-Based)',
  
  async evaluate(context: AutoExclusionContext): Promise<AutoExclusionStrategyResult | null> {
    // Get strategy-specific config
    const strategyConfig = context.strategyConfigs?.get('PEAK_CALL_LOAD');
    
    // If strategy is explicitly disabled, return null (skip evaluation)
    if (strategyConfig && !strategyConfig.isEnabled) {
      return null;
    }
    
    const config = (strategyConfig?.config ?? DEFAULT_CONFIG) as PeakCallLoadConfig;
    const windowMinutes = config.window_minutes ?? DEFAULT_CONFIG.window_minutes;
    const minCallsThreshold = config.min_calls_threshold ?? DEFAULT_CONFIG.min_calls_threshold;
    
    // Require callId and parishId for this strategy
    if (!context.callId || !context.parishId) {
      return null;
    }

    // Fetch the call data including compliance info
    const callResult = await query<{
      id: number;
      response_number: string;
      call_in_que_time: string;
      compliance_time_minutes: number | null;
      threshold_minutes: number | null;
      parish_id: number;
      is_excluded: boolean;
      is_auto_excluded: boolean;
    }>(`
      SELECT id, response_number, call_in_que_time, 
             compliance_time_minutes, threshold_minutes, parish_id,
             is_excluded, is_auto_excluded
      FROM calls 
      WHERE id = $1
    `, [context.callId]);

    if (callResult.rows.length === 0) {
      return null;
    }

    const call = callResult.rows[0];
    
    // Check if call is compliant using X:59 rule
    const thresholdWithSeconds = (call.threshold_minutes ?? 0) + (59 / 60);
    const responseMinutes = call.compliance_time_minutes ?? 0;
    const isCompliant = responseMinutes <= thresholdWithSeconds;

    // Query for all calls in the same parish within the 45-minute window
    // Window is from this call's queue time to queue time + window_minutes
    const windowResult = await query<{
      id: number;
      response_number: string;
      call_in_que_time: string;
      compliance_time_minutes: number | null;
      threshold_minutes: number | null;
      is_excluded: boolean;
      is_auto_excluded: boolean;
    }>(`
      WITH this_call AS (
        SELECT TO_TIMESTAMP(call_in_que_time, 'MM/DD/YY HH24:MI:SS') as queue_ts
        FROM calls WHERE id = $1
      )
      SELECT c.id, c.response_number, c.call_in_que_time,
             c.compliance_time_minutes, c.threshold_minutes,
             c.is_excluded, c.is_auto_excluded
      FROM calls c, this_call tc
      WHERE c.parish_id = $2
        AND TO_TIMESTAMP(c.call_in_que_time, 'MM/DD/YY HH24:MI:SS') >= tc.queue_ts
        AND TO_TIMESTAMP(c.call_in_que_time, 'MM/DD/YY HH24:MI:SS') <= tc.queue_ts + interval '${windowMinutes} minutes'
      ORDER BY TO_TIMESTAMP(c.call_in_que_time, 'MM/DD/YY HH24:MI:SS') ASC
    `, [context.callId, context.parishId]);

    const windowCalls = windowResult.rows;
    const callsInWindow = windowCalls.length;

    // Find this call's position (1-based) in the window
    const callPosition = windowCalls.findIndex(c => c.id === context.callId) + 1;

    // Get parish name for metadata
    const parishResult = await query<{ name: string }>(
      'SELECT name FROM parishes WHERE id = $1',
      [context.parishId]
    );
    const parishName = parishResult.rows[0]?.name ?? null;

    // Build window call info for metadata
    const windowCallsInfo: WindowCallInfo[] = windowCalls.map(c => {
      const cThreshold = (c.threshold_minutes ?? 0) + (59 / 60);
      const cResponse = c.compliance_time_minutes ?? 0;
      return {
        callId: c.id,
        responseNumber: c.response_number,
        queueTime: c.call_in_que_time,
        isCompliant: cResponse <= cThreshold,
        wasExcluded: c.is_excluded || c.is_auto_excluded,
      };
    });

    // Determine decision based on position and compliance
    let decision: PeakCallLoadDecision = 'NO_ACTION';
    let shouldExclude = false;
    let reason: string;

    if (callsInWindow < minCallsThreshold) {
      // Not enough calls in window
      decision = 'NO_ACTION';
      reason = `Only ${callsInWindow} call(s) in ${windowMinutes}-minute window (threshold: ${minCallsThreshold})`;
    } else if (callPosition <= 2) {
      // First or second call in window - never auto-exclude
      decision = 'NO_ACTION';
      reason = `Call is position #${callPosition} in ${windowMinutes}-minute window (only positions 3+ eligible)`;
    } else if (!isCompliant) {
      // Position 3+ and out of compliance - AUTO EXCLUDE
      decision = 'AUTO_EXCLUDE';
      shouldExclude = true;
      reason = `Peak call load detected: ${callsInWindow} calls in ${parishName || 'parish'} within ${windowMinutes}-minute window. This call was #${callPosition} in the sequence and was out of compliance (${responseMinutes.toFixed(1)} min response, threshold: ${call.threshold_minutes} min).`;
    } else {
      // Position 3+ but in compliance - flag for human review
      decision = 'HUMAN_REVIEW';
      reason = `Peak call load detected: ${callsInWindow} calls in ${parishName || 'parish'} within ${windowMinutes}-minute window. This call was #${callPosition} in the sequence but was in compliance. Flagged for human review.`;
    }

    const metadata: PeakCallLoadMetadata = {
      engineVersion: '1.0.0',
      evaluatedAt: new Date().toISOString(),
      strategyVersion: '1.0.0',
      windowMinutes,
      minCallsThreshold,
      parishId: context.parishId,
      parishName,
      callsInWindow,
      callPosition,
      firstCallTime: windowCalls[0]?.call_in_que_time ?? null,
      lastCallTime: windowCalls[windowCalls.length - 1]?.call_in_que_time ?? null,
      windowCalls: windowCallsInfo,
      thisCallCompliant: isCompliant,
      thisCallResponseMinutes: responseMinutes,
      thisCallThresholdMinutes: call.threshold_minutes,
      decision,
    };

    return {
      strategyKey: 'PEAK_CALL_LOAD',
      shouldExclude,
      reason,
      confidence: shouldExclude ? 0.95 : (decision === 'HUMAN_REVIEW' ? 0.5 : 0),
      metadata,
    };
  },
};

export default peakCallLoadStrategy;

