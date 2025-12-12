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

import { pool } from '@/lib/db';

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
  console.log(`[recordManualExclusion] Starting: callId=${callId}, userId=${userId}, userEmail=${userEmail}, reason=${reason}`);

  if (!reason || reason.trim() === '') {
    throw new Error('Reason is required for manual exclusions');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    console.log(`[recordManualExclusion] Transaction started`);

    const now = new Date();

    // 1. Update calls table with unified columns
    await client.query(
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
    await client.query(
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

    console.log(`[recordManualExclusion] Successfully excluded call ${callId}`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Revert (remove) a manual exclusion for a call.
 * Only works for MANUAL exclusions - auto-exclusions cannot be manually reverted.
 * Updates the calls table and marks the exclusion log as reverted.
 *
 * @param callId - Database ID of the call
 * @param userEmail - User email for audit display
 * @param revertReason - Reason for removing the exclusion
 */
export async function revertManualExclusion(
  callId: number,
  userEmail: string | null,
  revertReason: string
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Check if call has a MANUAL exclusion
    const checkResult = await client.query(
      `SELECT exclusion_type FROM calls WHERE id = $1`,
      [callId]
    );

    if (checkResult.rows.length === 0) {
      throw new Error('Call not found');
    }

    const exclusionType = checkResult.rows[0].exclusion_type;

    if (exclusionType !== 'MANUAL') {
      throw new Error('Can only revert manual exclusions. Auto-exclusions cannot be manually removed.');
    }

    const now = new Date();

    // 2. Update calls table - clear exclusion fields
    await client.query(
      `UPDATE calls SET
        is_excluded = FALSE,
        exclusion_type = NULL,
        exclusion_reason = NULL,
        excluded_at = NULL,
        excluded_by_user_id = NULL
      WHERE id = $1`,
      [callId]
    );

    // 3. Mark exclusion_logs entry as reverted
    await client.query(
      `UPDATE exclusion_logs SET
        reverted_at = $1,
        reverted_by_email = $2,
        revert_reason = $3
      WHERE call_id = $4
        AND exclusion_type = 'MANUAL'
        AND reverted_at IS NULL`,
      [now, userEmail, revertReason, callId]
    );

    console.log(`[revertManualExclusion] Successfully reverted exclusion for call ${callId}`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================================
// GET EXCLUSION STATUS
// ============================================================================

/**
 * Get the current exclusion status for a call.
 * Combines data from calls table and latest exclusion_log.
 */
export async function getExclusionForCall(callId: number): Promise<CallExclusionStatus> {
  const client = await pool.connect();
  
  try {
    // Get call's exclusion fields
    const callResult = await client.query(
      `SELECT is_excluded, is_auto_excluded, exclusion_reason,
              auto_exclusion_strategy, auto_exclusion_reason, auto_exclusion_metadata,
              excluded_at, exclusion_type
       FROM calls WHERE id = $1`,
      [callId]
    );

    if (callResult.rows.length === 0) {
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

    const call = callResult.rows[0];

    // Get latest exclusion log entry for user info
    const logResult = await client.query(
      `SELECT exclusion_type, created_by_email, engine_metadata
       FROM exclusion_logs
       WHERE call_id = $1 AND reverted_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [callId]
    );

    const log = logResult.rows[0];

    return {
      isExcluded: call.is_excluded === true || call.is_auto_excluded === true,
      isAutoExcluded: call.is_auto_excluded === true,
      exclusionType: call.exclusion_type,
      reason: call.is_auto_excluded ? call.auto_exclusion_reason : call.exclusion_reason,
      strategyKey: call.auto_exclusion_strategy,
      excludedAt: call.excluded_at,
      excludedByEmail: log?.created_by_email ?? null,
      metadata: call.auto_exclusion_metadata ?? log?.engine_metadata ?? null,
    };
  } finally {
    client.release();
  }
}

