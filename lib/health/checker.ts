/**
 * Health check implementations.
 * 
 * Provides actual health checks for each monitored component.
 * All checks are designed to be safe and non-blocking.
 */

import { pool } from '@/lib/db';
import {
  HealthComponentId,
  HealthStatus,
  HealthCheckResult,
} from './components';

// ============================================================================
// INDIVIDUAL HEALTH CHECKS
// ============================================================================

/**
 * Check Neon database connectivity.
 */
async function checkNeonDb(): Promise<HealthCheckResult> {
  const checkedAt = new Date().toISOString();
  const start = Date.now();

  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      const latencyMs = Date.now() - start;

      return {
        id: 'NEON_DB',
        status: latencyMs > 2000 ? 'DEGRADED' : 'UP',
        checkedAt,
        message: latencyMs > 2000 ? 'High latency detected' : 'Connected',
        latencyMs,
      };
    } finally {
      client.release();
    }
  } catch (error) {
    return {
      id: 'NEON_DB',
      status: 'DOWN',
      checkedAt,
      message: error instanceof Error ? error.message : 'Connection failed',
      latencyMs: Date.now() - start,
    };
  }
}

/**
 * Check call ingestion status by looking at recent calls.
 */
async function checkCallIngest(): Promise<HealthCheckResult> {
  const checkedAt = new Date().toISOString();

  try {
    const client = await pool.connect();
    try {
      const result = await client.query<{ latest: Date | null; count: string }>(
        `SELECT MAX(created_at) as latest, COUNT(*) as count 
         FROM calls 
         WHERE created_at > NOW() - INTERVAL '24 hours'`
      );
      
      const row = result.rows[0];
      const count = parseInt(row?.count || '0', 10);
      
      if (count === 0) {
        return {
          id: 'CALL_INGEST',
          status: 'DOWN',
          checkedAt,
          message: 'No calls in last 24 hours',
          details: { callCount24h: 0 },
        };
      }

      const latest = row?.latest;
      if (!latest) {
        return {
          id: 'CALL_INGEST',
          status: 'UNKNOWN',
          checkedAt,
          message: 'Unable to determine latest call timestamp',
        };
      }

      const lagMinutes = (Date.now() - new Date(latest).getTime()) / 60000;

      if (lagMinutes <= 5) {
        return {
          id: 'CALL_INGEST',
          status: 'UP',
          checkedAt,
          message: `Active - ${count} calls in 24h`,
          details: { callCount24h: count, lagMinutes: Math.round(lagMinutes) },
        };
      } else if (lagMinutes <= 30) {
        return {
          id: 'CALL_INGEST',
          status: 'DEGRADED',
          checkedAt,
          message: `Delayed - last call ${Math.round(lagMinutes)}m ago`,
          details: { callCount24h: count, lagMinutes: Math.round(lagMinutes) },
        };
      } else {
        return {
          id: 'CALL_INGEST',
          status: 'DOWN',
          checkedAt,
          message: `Stale - last call ${Math.round(lagMinutes)}m ago`,
          details: { callCount24h: count, lagMinutes: Math.round(lagMinutes) },
        };
      }
    } finally {
      client.release();
    }
  } catch (error) {
    return {
      id: 'CALL_INGEST',
      status: 'UNKNOWN',
      checkedAt,
      message: error instanceof Error ? error.message : 'Check failed',
    };
  }
}

/**
 * Check auth configuration.
 */
async function checkAuth(): Promise<HealthCheckResult> {
  const checkedAt = new Date().toISOString();

  const hasGoogleClientId = !!process.env.GOOGLE_CLIENT_ID;
  const hasGoogleClientSecret = !!process.env.GOOGLE_CLIENT_SECRET;
  const hasNextAuthSecret = !!process.env.NEXTAUTH_SECRET;

  if (hasGoogleClientId && hasGoogleClientSecret && hasNextAuthSecret) {
    return {
      id: 'AUTH',
      status: 'UP',
      checkedAt,
      message: 'Configured',
    };
  }

  const missing: string[] = [];
  if (!hasGoogleClientId) missing.push('GOOGLE_CLIENT_ID');
  if (!hasGoogleClientSecret) missing.push('GOOGLE_CLIENT_SECRET');
  if (!hasNextAuthSecret) missing.push('NEXTAUTH_SECRET');

  return {
    id: 'AUTH',
    status: 'DOWN',
    checkedAt,
    message: `Missing: ${missing.join(', ')}`,
    details: { missing },
  };
}

/**
 * Check internet connectivity.
 */
async function checkInternet(): Promise<HealthCheckResult> {
  const checkedAt = new Date().toISOString();
  const start = Date.now();

  try {
    // Use a simple, fast endpoint
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch('https://www.google.com/generate_204', {
        method: 'HEAD',
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const latencyMs = Date.now() - start;

      if (response.ok || response.status === 204) {
        return {
          id: 'INTERNET',
          status: latencyMs > 3000 ? 'DEGRADED' : 'UP',
          checkedAt,
          message: latencyMs > 3000 ? 'High latency' : 'Connected',
          latencyMs,
        };
      }

      return {
        id: 'INTERNET',
        status: 'DEGRADED',
        checkedAt,
        message: `Unexpected status: ${response.status}`,
        latencyMs,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return {
      id: 'INTERNET',
      status: 'DOWN',
      checkedAt,
      message: error instanceof Error ? error.message : 'Connection failed',
      latencyMs: Date.now() - start,
    };
  }
}

/**
 * Check Vercel status (external API).
 */
async function checkVercel(): Promise<HealthCheckResult> {
  const checkedAt = new Date().toISOString();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch('https://www.vercel-status.com/api/v2/status.json', {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return {
          id: 'VERCEL',
          status: 'UNKNOWN',
          checkedAt,
          message: `Status API returned ${response.status}`,
        };
      }

      const data = await response.json();
      const indicator = data?.status?.indicator;

      if (indicator === 'none') {
        return { id: 'VERCEL', status: 'UP', checkedAt, message: 'All systems operational' };
      } else if (indicator === 'minor') {
        return { id: 'VERCEL', status: 'DEGRADED', checkedAt, message: 'Minor issues reported' };
      } else if (indicator === 'major' || indicator === 'critical') {
        return { id: 'VERCEL', status: 'DOWN', checkedAt, message: 'Major issues reported' };
      }

      return { id: 'VERCEL', status: 'UNKNOWN', checkedAt, message: `Status: ${indicator}` };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return {
      id: 'VERCEL',
      status: 'UNKNOWN',
      checkedAt,
      message: 'Unable to fetch status',
    };
  }
}

/**
 * Check GitHub status (external API).
 */
async function checkGitHub(): Promise<HealthCheckResult> {
  const checkedAt = new Date().toISOString();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch('https://www.githubstatus.com/api/v2/status.json', {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return {
          id: 'GITHUB',
          status: 'UNKNOWN',
          checkedAt,
          message: `Status API returned ${response.status}`,
        };
      }

      const data = await response.json();
      const indicator = data?.status?.indicator;

      if (indicator === 'none') {
        return { id: 'GITHUB', status: 'UP', checkedAt, message: 'All systems operational' };
      } else if (indicator === 'minor') {
        return { id: 'GITHUB', status: 'DEGRADED', checkedAt, message: 'Minor issues reported' };
      } else if (indicator === 'major' || indicator === 'critical') {
        return { id: 'GITHUB', status: 'DOWN', checkedAt, message: 'Major issues reported' };
      }

      return { id: 'GITHUB', status: 'UNKNOWN', checkedAt, message: `Status: ${indicator}` };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return {
      id: 'GITHUB',
      status: 'UNKNOWN',
      checkedAt,
      message: 'Unable to fetch status',
    };
  }
}

/**
 * CAD SQL check - placeholder for future implementation.
 */
async function checkCadSql(): Promise<HealthCheckResult> {
  return {
    id: 'CAD_SQL',
    status: 'UNKNOWN',
    checkedAt: new Date().toISOString(),
    message: 'Not yet implemented',
  };
}

/**
 * CAD App check - placeholder for future implementation.
 */
async function checkCadApp(): Promise<HealthCheckResult> {
  return {
    id: 'CAD_APP',
    status: 'UNKNOWN',
    checkedAt: new Date().toISOString(),
    message: 'Not yet implemented',
  };
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * Run all health checks in parallel.
 */
export async function runAllHealthChecks(): Promise<HealthCheckResult[]> {
  const results = await Promise.all([
    checkNeonDb(),
    checkAuth(),
    checkCallIngest(),
    checkCadSql(),
    checkCadApp(),
    checkVercel(),
    checkGitHub(),
    checkInternet(),
  ]);

  return results;
}

/**
 * Run a single health check by component ID.
 */
export async function runHealthCheck(componentId: HealthComponentId): Promise<HealthCheckResult> {
  switch (componentId) {
    case 'NEON_DB':
      return checkNeonDb();
    case 'AUTH':
      return checkAuth();
    case 'CALL_INGEST':
      return checkCallIngest();
    case 'CAD_SQL':
      return checkCadSql();
    case 'CAD_APP':
      return checkCadApp();
    case 'VERCEL':
      return checkVercel();
    case 'GITHUB':
      return checkGitHub();
    case 'INTERNET':
      return checkInternet();
    default:
      return {
        id: componentId,
        status: 'UNKNOWN',
        checkedAt: new Date().toISOString(),
        message: 'Unknown component',
      };
  }
}

