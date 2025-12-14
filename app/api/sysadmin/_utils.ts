/**
 * Sysadmin API utilities
 * Provides session validation for superadmin-only routes and logging helpers
 */

import { getServerSession, Session } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';
import { query } from '@/lib/db';
import { randomUUID } from 'crypto';

type SuperadminSessionResult =
  | { session: Session; user: any; error?: undefined; status?: undefined }
  | { error: string; status: number; session?: undefined; user?: undefined };

/**
 * Require a valid session with superadmin privileges.
 * Returns 401 if not authenticated, 403 if not a superadmin.
 */
export async function requireSuperadminSession(): Promise<SuperadminSessionResult> {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return { error: 'UNAUTHORIZED', status: 401 };
  }

  const user: any = session.user;
  const isSuperadmin = user.is_superadmin === true;

  if (!isSuperadmin) {
    return { error: 'FORBIDDEN', status: 403 };
  }

  return { session, user };
}

// ============================================================================
// Sysadmin Service Logging
// ============================================================================

export type ServiceType = 'neon' | 'vercel' | 'sqlserver' | 'autoexclusion';
export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  run_id: string;
  service: ServiceType;
  action: string;
  step?: string;
  level: LogLevel;
  message: string;
  latency_ms?: number;
  actor_email?: string;
  metadata?: Record<string, any>;
}

/**
 * Generate a new run ID for a sysadmin action
 */
export function generateRunId(): string {
  return randomUUID();
}

/**
 * Write a log entry to sysadmin_service_logs table
 * Safe: does not log secrets, masks sensitive data
 */
export async function writeSysadminLog(entry: LogEntry): Promise<void> {
  try {
    await query(
      `INSERT INTO sysadmin_service_logs
       (run_id, service, action, step, level, message, latency_ms, actor_email, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        entry.run_id,
        entry.service,
        entry.action,
        entry.step || null,
        entry.level,
        entry.message,
        entry.latency_ms || null,
        entry.actor_email || null,
        JSON.stringify(entry.metadata || {}),
      ]
    );
  } catch (err) {
    // Don't throw - logging should not break the main operation
    console.error('[Sysadmin] Failed to write log:', err);
  }
}

/**
 * Helper to create a logger for a specific run
 */
export function createRunLogger(runId: string, service: ServiceType, actorEmail?: string) {
  return {
    start: (action: string, message: string, metadata?: Record<string, any>) =>
      writeSysadminLog({ run_id: runId, service, action, step: 'START', level: 'INFO', message, actor_email: actorEmail, metadata }),
    step: (action: string, step: string, message: string, latency_ms?: number, metadata?: Record<string, any>) =>
      writeSysadminLog({ run_id: runId, service, action, step, level: 'INFO', message, latency_ms, actor_email: actorEmail, metadata }),
    success: (action: string, message: string, latency_ms?: number, metadata?: Record<string, any>) =>
      writeSysadminLog({ run_id: runId, service, action, step: 'SUCCESS', level: 'INFO', message, latency_ms, actor_email: actorEmail, metadata }),
    error: (action: string, message: string, latency_ms?: number, metadata?: Record<string, any>) =>
      writeSysadminLog({ run_id: runId, service, action, step: 'ERROR', level: 'ERROR', message, latency_ms, actor_email: actorEmail, metadata }),
    warn: (action: string, step: string, message: string, metadata?: Record<string, any>) =>
      writeSysadminLog({ run_id: runId, service, action, step, level: 'WARN', message, actor_email: actorEmail, metadata }),
  };
}

