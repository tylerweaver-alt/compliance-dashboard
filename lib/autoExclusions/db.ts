/**
 * lib/autoExclusions/db.ts
 * 
 * Database operations for Auto-Exclusion Engine
 * 
 * RESPONSIBILITIES:
 * - Recording auto-exclusion decisions to exclusion_logs table
 * - Updating calls table with auto-exclusion fields
 * - Loading strategy configurations from DB
 * 
 * AUDIT TRAIL:
 * Every auto-exclusion decision is recorded in exclusion_logs for:
 * - Audit Log page display
 * - Print reports with plain-English explanations
 * - Legal defensibility and reproducibility
 */

import { query } from '@/lib/db';
import type { 
  AutoExclusionDecision, 
  AutoExclusionStrategyKey, 
  StrategyConfig,
  ExclusionLogInsert,
  CallAutoExclusionUpdate,
} from './types';

/**
 * Record an auto-exclusion decision to the database
 * 
 * This function:
 * 1. Updates the calls table with auto-exclusion fields
 * 2. Inserts a record into exclusion_logs for audit trail
 * 
 * @param callId - Database ID of the call
 * @param decision - The auto-exclusion decision from the engine
 */
export async function recordAutoExclusion(
  callId: number,
  decision: AutoExclusionDecision
): Promise<void> {
  if (!decision.isExcluded) {
    return; // Nothing to record
  }
  
  const now = new Date();
  
  // 1. Update calls table with auto-exclusion fields
  await query(
    `UPDATE calls SET
      is_auto_excluded = $1,
      auto_exclusion_strategy = $2,
      auto_exclusion_reason = $3,
      auto_excluded_at = $4,
      auto_exclusion_metadata = $5
    WHERE id = $6`,
    [
      true,
      decision.primaryStrategy,
      decision.reason,
      now,
      JSON.stringify(decision.metadata),
      callId,
    ]
  );
  
  // 2. Insert into exclusion_logs for audit trail
  await query(
    `INSERT INTO exclusion_logs (
      call_id,
      exclusion_type,
      strategy_key,
      reason,
      created_by_user_id,
      created_by_email,
      engine_metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      callId,
      'AUTO',
      decision.primaryStrategy,
      decision.reason,
      null, // No user - system-driven
      null,
      JSON.stringify({
        ...decision.metadata,
        strategyResults: decision.strategyResults,
      }),
    ]
  );
}

/**
 * Load strategy configurations from the database
 * 
 * @param regionId - Region ID to load configs for (NULL = global defaults)
 * @returns Map of strategy key to config
 */
export async function loadStrategyConfigs(
  regionId: number | null
): Promise<Map<AutoExclusionStrategyKey, StrategyConfig>> {
  // Load configs for this region + global defaults (region_id IS NULL)
  const { rows } = await query<{
    strategy_key: AutoExclusionStrategyKey;
    is_enabled: boolean;
    config: Record<string, any>;
    region_id: number | null;
  }>(
    `SELECT strategy_key, is_enabled, config, region_id
     FROM auto_exclusion_configs
     WHERE region_id IS NULL OR region_id = $1
     ORDER BY region_id NULLS FIRST`, // Global first, then region-specific overrides
    [regionId]
  );
  
  const configMap = new Map<AutoExclusionStrategyKey, StrategyConfig>();
  
  for (const row of rows) {
    // Region-specific configs override global defaults (processed second due to ORDER BY)
    configMap.set(row.strategy_key, {
      strategyKey: row.strategy_key,
      isEnabled: row.is_enabled,
      config: row.config,
    });
  }
  
  return configMap;
}

/**
 * Check if auto-exclusion is enabled for a region
 * Returns true if any strategy is enabled
 */
export async function isAutoExclusionEnabled(regionId: number | null): Promise<boolean> {
  const configs = await loadStrategyConfigs(regionId);
  return Array.from(configs.values()).some(c => c.isEnabled);
}

/**
 * Get exclusion log for a specific call
 * Used by Call Details page to show exclusion history
 */
export async function getExclusionLogsForCall(callId: number): Promise<any[]> {
  const { rows } = await query(
    `SELECT * FROM exclusion_logs 
     WHERE call_id = $1 
     ORDER BY created_at DESC`,
    [callId]
  );
  return rows;
}

