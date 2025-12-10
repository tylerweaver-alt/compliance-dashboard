/**
 * Sysadmin Audit Events API
 * 
 * GET /api/sysadmin/audit-events
 * 
 * Returns audit log entries for SuperAdmin users.
 * Protected by SuperAdmin + IP allowlist checks.
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSuperAdminWithIP, createForbiddenResponse, createUnauthorizedResponse } from '@/lib/auth/requireSuperAdmin';
import { logAuditEvent } from '@/lib/audit/logAuditEvent';
import { auditEventsQuerySchema, parseSearchParams } from '@/lib/validations';
import { handleValidationError, isZodError } from '@/lib/validations/errors';
import { applyRateLimit, RATE_LIMIT_CONFIGS } from '@/lib/security/rate-limiter';
import { getClientIP } from '@/lib/security/ip-allowlist';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  // Rate limiting
  const clientIP = getClientIP(request) ?? 'unknown';
  const rateLimitResponse = await applyRateLimit(
    clientIP,
    '/api/sysadmin/audit-events',
    RATE_LIMIT_CONFIGS.sysadmin
  );
  if (rateLimitResponse) return rateLimitResponse;

  // SuperAdmin + IP check
  const authCheck = await requireSuperAdminWithIP(request);
  if (!authCheck.authorized) {
    if (authCheck.reason === 'Not authenticated') {
      return createUnauthorizedResponse();
    }
    return createForbiddenResponse(authCheck.reason ?? 'Access denied');
  }

  // Parse and validate query parameters
  let params;
  try {
    params = parseSearchParams(request.nextUrl.searchParams, auditEventsQuerySchema);
  } catch (error) {
    if (isZodError(error)) {
      return handleValidationError(error);
    }
    throw error;
  }

  const { from, to, category, actor, targetType, limit, offset } = params;

  // Build query with filters
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (from) {
    conditions.push(`created_at >= $${paramIndex}::timestamptz`);
    values.push(from);
    paramIndex++;
  }

  if (to) {
    conditions.push(`created_at <= $${paramIndex}::timestamptz`);
    values.push(to);
    paramIndex++;
  }

  if (category) {
    conditions.push(`category = $${paramIndex}`);
    values.push(category);
    paramIndex++;
  }

  if (actor) {
    conditions.push(`actor_email = $${paramIndex}`);
    values.push(actor);
    paramIndex++;
  }

  if (targetType) {
    conditions.push(`details->>'target_type' = $${paramIndex}`);
    values.push(targetType);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countResult = await query(
    `SELECT COUNT(*) as total FROM audit_logs ${whereClause}`,
    values
  );
  const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

  // Get paginated results
  values.push(limit, offset);
  const dataResult = await query(
    `SELECT 
      id,
      created_at,
      actor_email,
      actor_role,
      category,
      action,
      target_email,
      target_id,
      details
    FROM audit_logs 
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    values
  );

  // Log this access to audit log
  await logAuditEvent({
    actorEmail: authCheck.user?.email,
    category: 'AUDIT',
    action: 'AUDIT_LOGS_VIEWED',
    details: {
      filters: { from, to, category, actor, targetType },
      result_count: dataResult.rows.length,
      ip: clientIP,
    },
  });

  return NextResponse.json({
    data: dataResult.rows,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + dataResult.rows.length < total,
    },
  });
}

