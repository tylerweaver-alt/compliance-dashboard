/**
 * lib/exclusions/index.ts
 * 
 * Centralized exclusion management for compliance calls.
 * Handles both manual and auto exclusions with full audit trail.
 * 
 * USAGE:
 * ```ts
 * import { recordManualExclusion, getExclusionForCall } from '@/lib/exclusions';
 * 
 * // Record a manual exclusion
 * await recordManualExclusion(callId, userId, userEmail, 'Weather Delay');
 * 
 * // Get exclusion details for a call
 * const exclusion = await getExclusionForCall(callId);
 * ```
 */

import { query } from '@/lib/db';

// ============================================================================
// TYPES
// ============================================================================

export type ExclusionType = 'AUTO' | 'MANUAL';

export interface ExclusionRecord {
  id: string;
  callId: number;
  exclusionType: ExclusionType;
  strategyKey: string | null;
  reason: string;
  createdByUserId: string | null;
  createdByEmail: string | null;
  engineMetadata: Record<string, any> | null;
  createdAt: Date;
  revertedAt: Date | null;
  revertedByEmail: string | null;
  revertReason: string | null;
}

export interface CallExclusionStatus {
  isExcluded: boolean;
  isAutoExcluded: boolean;
  exclusionType: ExclusionType | null;
  reason: string | null;
  strategyKey: string | null;
  excludedAt: Date | null;
  excludedByEmail: string | null;
  metadata: Record<string, any> | null;
}

// ============================================================================
// RECORD MANUAL EXCLUSION
// ============================================================================

/**
 * Record a manual exclusion for a call.
 * Updates the calls table and creates an audit log entry.
 * 
 * @param callId - Database ID of the call
 * @param userId - User ID making the exclusion (from session)
 * @param userEmail - User email for audit display
 * @param reason - Reason for exclusion (required for manual)
 */
export async function recordManualExclusion(
  callId: number,
  userId: string | null,
  userEmail: string | null,
  reason: string
): Promise<void> {
  if (!reason || reason.trim() === '') {
    throw new Error('Reason is required for manual exclusions');
  }

  const now = new Date();

  // 1. Update calls table with unified columns
  await query(
    `UPDATE calls SET
      is_excluded = TRUE,
      exclusion_type = 'MANUAL',
      exclusion_reason = $1,
      excluded_at = $2,
      excluded_by_user_id = $3
    WHERE id = $4`,
    [reason, now, userId, callId]
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
      'MANUAL',
      null, // No strategy for manual
      reason,
      userId,
      userEmail,
      null, // No engine metadata for manual
    ]
  );
}

// ============================================================================
// GET EXCLUSION STATUS
// ============================================================================

/**
 * Get the current exclusion status for a call.
 * Combines data from calls table and latest exclusion_log.
 */
export async function getExclusionForCall(callId: number): Promise<CallExclusionStatus> {
  // Get call's exclusion fields
  const { rows: callRows } = await query<{
    is_excluded: boolean;
    is_auto_excluded: boolean;
    exclusion_reason: string | null;
    auto_exclusion_strategy: string | null;
    auto_exclusion_reason: string | null;
    auto_exclusion_metadata: Record<string, any> | null;
    excluded_at: Date | null;
  }>(
    `SELECT is_excluded, is_auto_excluded, exclusion_reason, 
            auto_exclusion_strategy, auto_exclusion_reason, auto_exclusion_metadata,
            excluded_at
     FROM calls WHERE id = $1`,
    [callId]
  );

  if (callRows.length === 0) {
    return {
      isExcluded: false,
      isAutoExcluded: false,
      exclusionType: null,
      reason: null,
      strategyKey: null,
      excludedAt: null,
      excludedByEmail: null,
      metadata: null,
    };
  }

  const call = callRows[0];

  // Get latest exclusion log entry for user info
  const { rows: logRows } = await query<{
    exclusion_type: ExclusionType;
    created_by_email: string | null;
    engine_metadata: Record<string, any> | null;
  }>(
    `SELECT exclusion_type, created_by_email, engine_metadata
     FROM exclusion_logs 
     WHERE call_id = $1 AND reverted_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [callId]
  );

  const log = logRows[0];

  // Determine exclusion type and details
  const isAutoExcluded = call.is_auto_excluded === true;
  const isManuallyExcluded = call.is_excluded === true && !isAutoExcluded;

  return {
    isExcluded: call.is_excluded === true || isAutoExcluded,
    isAutoExcluded,
    exclusionType: isAutoExcluded ? 'AUTO' : isManuallyExcluded ? 'MANUAL' : null,
    reason: isAutoExcluded ? call.auto_exclusion_reason : call.exclusion_reason,
    strategyKey: call.auto_exclusion_strategy,
    excludedAt: call.excluded_at,
    excludedByEmail: log?.created_by_email ?? null,
    metadata: isAutoExcluded ? call.auto_exclusion_metadata : log?.engine_metadata ?? null,
  };
}

