/**
 * Centralized audit logging for the CADalytix Compliance Dashboard.
 * 
 * All security-relevant and compliance-critical events should be logged here
 * for traceability, legal compliance, and debugging purposes.
 */

import { query } from '@/lib/db';

/**
 * Categories of audit events for filtering and analysis.
 */
export type AuditCategory =
  | 'AUTH'        // Login, logout, access denied
  | 'CALLS'       // Call data edits, exclusions
  | 'EXCLUSIONS'  // Auto/manual exclusions
  | 'AUDIT'       // Audit log access itself
  | 'CONFIG'      // Parish, region, response-zone CRUD
  | 'DB'          // Schema changes, critical DB operations
  | 'SYSTEM';     // Cron errors, rate limits, health-check failures

/**
 * Input for creating an audit event.
 */
export interface AuditEventInput {
  /** Email of the actor performing the action */
  actorEmail?: string | null;
  /** User ID of the actor (if available from DB) */
  actorUserId?: string | null;
  /** Role of the actor at time of action */
  actorRole?: string | null;
  /** Category of the event for filtering */
  category: AuditCategory;
  /** Specific action performed (e.g., 'LOGIN_SUCCESS', 'CALL_EDITED') */
  action: string;
  /** Type of target being affected (e.g., 'call', 'user', 'parish') */
  targetType?: string;
  /** ID of the target (call_id, user_id, etc.) */
  targetId?: string | number | null;
  /** Email of target user (if applicable, e.g., for user management) */
  targetEmail?: string | null;
  /** Additional details as JSON (flexible metadata) */
  details?: Record<string, unknown>;
}

/**
 * Log an audit event to the audit_logs table.
 * 
 * This function is designed to never throw - failures are logged to console
 * but don't break the main operation.
 * 
 * @param input - The audit event details
 * @returns true if logged successfully, false otherwise
 */
export async function logAuditEvent(input: AuditEventInput): Promise<boolean> {
  const {
    actorEmail,
    actorUserId,
    actorRole,
    category,
    action,
    targetType,
    targetId,
    targetEmail,
    details,
  } = input;

  try {
    await query(
      `INSERT INTO audit_logs (
        actor_email,
        actor_role,
        category,
        action,
        target_email,
        target_id,
        details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        actorEmail ?? null,
        actorRole ?? null,
        category,
        action,
        targetEmail ?? null,
        targetId != null ? String(targetId) : null,
        details ? JSON.stringify({
          ...details,
          actor_user_id: actorUserId ?? undefined,
          target_type: targetType ?? undefined,
        }) : JSON.stringify({
          actor_user_id: actorUserId ?? undefined,
          target_type: targetType ?? undefined,
        }),
      ]
    );

    // Also log to console for observability
    console.log(`[Audit] ${category}/${action}: actor=${actorEmail}, target=${targetType}:${targetId}`);
    
    return true;
  } catch (err) {
    // Never throw - audit logging failures shouldn't break main operations
    console.error('[Audit] Failed to log event:', {
      category,
      action,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Convenience function to log authentication events.
 */
export async function logAuthEvent(
  action: 'LOGIN_SUCCESS' | 'LOGIN_DENIED' | 'LOGOUT' | 'EXTERNAL_LOGIN',
  email: string,
  details?: Record<string, unknown>
): Promise<boolean> {
  return logAuditEvent({
    actorEmail: email,
    category: 'AUTH',
    action,
    targetType: 'session',
    targetEmail: email,
    details,
  });
}

/**
 * Convenience function to log system events (rate limits, errors, etc.).
 */
export async function logSystemEvent(
  action: string,
  details: Record<string, unknown>
): Promise<boolean> {
  return logAuditEvent({
    category: 'SYSTEM',
    action,
    details,
  });
}

/**
 * Convenience function to log sysadmin access denials.
 */
export async function logSysadminAccessDenied(
  email: string | null,
  ip: string,
  reason: string,
  path: string
): Promise<boolean> {
  return logAuditEvent({
    actorEmail: email,
    category: 'SYSTEM',
    action: 'SYSADMIN_ACCESS_DENIED',
    details: {
      ip,
      reason,
      path,
      timestamp: new Date().toISOString(),
    },
  });
}

