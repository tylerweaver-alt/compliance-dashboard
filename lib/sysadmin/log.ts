/**
 * Sysadmin logging helper.
 * 
 * Writes to the sysadmin_log table for long-term queryable system logs.
 * Used for health status, cron events, system events, and diagnostics.
 */

import { query } from '@/lib/db';

// ============================================================================
// TYPES
// ============================================================================

export type SysadminLogCategory =
  | 'HEALTH'
  | 'SYSTEM'
  | 'AUTH'
  | 'CONFIG'
  | 'CALLS'
  | 'EXCLUSIONS'
  | 'CRON';

export type SysadminStatus = 'UP' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';

export type SysadminLogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface SysadminLogEntry {
  category: SysadminLogCategory;
  componentId?: string;
  status?: SysadminStatus;
  statusText?: string;
  level: SysadminLogLevel;
  message: string;
  actorEmail?: string | null;
  source?: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// MAIN WRITE FUNCTION
// ============================================================================

/**
 * Write a log entry to sysadmin_log table.
 * Never throws - logs errors to console and returns false on failure.
 */
export async function writeSysadminLog(entry: SysadminLogEntry): Promise<boolean> {
  try {
    await query(
      `INSERT INTO sysadmin_log 
       (category, component_id, status, status_text, level, message, actor_email, source, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        entry.category,
        entry.componentId || null,
        entry.status || null,
        entry.statusText || null,
        entry.level,
        entry.message,
        entry.actorEmail || null,
        entry.source || null,
        entry.details ? JSON.stringify(entry.details) : null,
      ]
    );
    return true;
  } catch (error) {
    console.error('[SysadminLog] Failed to write log entry:', error);
    return false;
  }
}

// ============================================================================
// CONVENIENCE WRAPPERS
// ============================================================================

/**
 * Log a health status check result.
 */
export async function logHealthStatus(
  componentId: string,
  status: SysadminStatus,
  statusText: string,
  message: string,
  details?: Record<string, unknown>
): Promise<boolean> {
  const level: SysadminLogLevel = 
    status === 'UP' ? 'INFO' : 
    status === 'DEGRADED' ? 'WARN' : 
    status === 'DOWN' ? 'ERROR' : 'INFO';

  return writeSysadminLog({
    category: 'HEALTH',
    componentId,
    status,
    statusText,
    level,
    message,
    source: 'health_check',
    details,
  });
}

/**
 * Log a generic sysadmin event.
 */
export async function logSysadminEvent(
  message: string,
  level: SysadminLogLevel = 'INFO',
  details?: Record<string, unknown>
): Promise<boolean> {
  return writeSysadminLog({
    category: 'SYSTEM',
    level,
    message,
    source: 'sysadmin',
    details,
  });
}

/**
 * Log a cron job event.
 */
export async function logCronEvent(
  action: 'START' | 'COMPLETE' | 'FAILURE',
  cronName: string,
  details?: Record<string, unknown>
): Promise<boolean> {
  const level: SysadminLogLevel = action === 'FAILURE' ? 'ERROR' : 'INFO';
  const message = `Cron ${cronName}: ${action}`;

  return writeSysadminLog({
    category: 'CRON',
    componentId: cronName,
    level,
    message,
    source: 'cron',
    details,
  });
}

/**
 * Log an upload event.
 */
export async function logUploadEvent(
  success: boolean,
  actorEmail: string,
  filename: string,
  details?: Record<string, unknown>
): Promise<boolean> {
  return writeSysadminLog({
    category: 'CALLS',
    level: success ? 'INFO' : 'ERROR',
    message: success 
      ? `Upload succeeded: ${filename}` 
      : `Upload failed: ${filename}`,
    actorEmail,
    source: 'upload',
    details,
  });
}

