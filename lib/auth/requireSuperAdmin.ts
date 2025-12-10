/**
 * SuperAdmin authorization helpers.
 *
 * SuperAdmin users have elevated privileges including access to:
 * - /sysadmin dashboard
 * - System health monitoring
 * - Audit log viewing
 * - Downtime management
 *
 * SuperAdmins are determined by the `is_superadmin` column in the users table.
 * SuperAdmins must also pass IP allowlist checks for sysadmin routes.
 */

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { logSysadminAccessDenied } from '@/lib/audit/logAuditEvent';
import { getClientIP, isIPAllowed } from '@/lib/security/ip-allowlist';

/**
 * Legacy fallback email list for SuperAdmins.
 * Used only when session.user.is_superadmin is not set (migration pending).
 * Once migration is applied, this is only a fallback safety net.
 */
const SUPER_ADMIN_EMAILS_FALLBACK = [
  'tyler.weaver@acadian.com',
  'jrc7192@gmail.com',
];

export interface SuperAdminCheckResult {
  authorized: boolean;
  user?: {
    email: string;
    name?: string | null;
    role?: string;
    is_superadmin?: boolean;
  };
  reason?: string;
}

/**
 * Check if a session user is a SuperAdmin.
 * Prefers the database-driven is_superadmin flag from the session.
 * Falls back to email check if is_superadmin is not set (migration not yet run).
 */
export function isSuperAdmin(session: { user?: { email?: string | null; is_superadmin?: boolean } } | null): boolean {
  if (!session?.user?.email) return false;

  // Primary: Check the database-driven flag from session
  if (session.user.is_superadmin === true) {
    return true;
  }

  // Fallback: Check email list if is_superadmin is undefined (migration not applied)
  if (session.user.is_superadmin === undefined) {
    return SUPER_ADMIN_EMAILS_FALLBACK.includes(session.user.email.toLowerCase());
  }

  return false;
}

/**
 * Legacy function: Check if an email is a SuperAdmin (fallback only).
 * @deprecated Use isSuperAdmin(session) instead which checks the DB-driven flag.
 */
export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS_FALLBACK.includes(email.toLowerCase());
}

/**
 * Check if the current session user is a SuperAdmin.
 * Uses the database-driven is_superadmin flag from the session.
 * Does NOT check IP allowlist - use requireSuperAdminWithIP for that.
 */
export async function checkSuperAdmin(): Promise<SuperAdminCheckResult> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return {
      authorized: false,
      reason: 'Not authenticated',
    };
  }

  const email = session.user.email.toLowerCase();

  // Use the new isSuperAdmin function that checks session.user.is_superadmin
  if (!isSuperAdmin(session)) {
    return {
      authorized: false,
      user: {
        email,
        name: session.user.name,
        role: session.user.role,
        is_superadmin: session.user.is_superadmin,
      },
      reason: 'Not a SuperAdmin',
    };
  }

  return {
    authorized: true,
    user: {
      email,
      name: session.user.name,
      role: session.user.role,
      is_superadmin: session.user.is_superadmin,
    },
  };
}

/**
 * Check if the current session user is a SuperAdmin AND the request IP is allowed.
 * This is the full check required for /sysadmin routes.
 * 
 * @param request - The incoming request for IP extraction
 */
export async function requireSuperAdminWithIP(
  request: Request
): Promise<SuperAdminCheckResult> {
  const adminCheck = await checkSuperAdmin();
  
  // First check authentication and SuperAdmin status
  if (!adminCheck.authorized) {
    // Log the access denial
    const clientIP = getClientIP(request);
    await logSysadminAccessDenied(
      adminCheck.user?.email ?? null,
      clientIP ?? 'unknown',
      adminCheck.reason ?? 'Unknown',
      new URL(request.url).pathname
    );
    return adminCheck;
  }
  
  // Then check IP allowlist
  const clientIP = getClientIP(request);
  if (!isIPAllowed(clientIP)) {
    // Log the IP-based denial
    await logSysadminAccessDenied(
      adminCheck.user?.email ?? null,
      clientIP ?? 'unknown',
      'IP not in allowlist',
      new URL(request.url).pathname
    );
    
    return {
      authorized: false,
      user: adminCheck.user,
      reason: 'IP not in allowlist',
    };
  }
  
  return adminCheck;
}

/**
 * Create a 403 Forbidden response for unauthorized sysadmin access.
 */
export function createForbiddenResponse(reason: string): Response {
  return new Response(
    JSON.stringify({
      error: 'Forbidden',
      message: 'Access denied to sysadmin resources',
    }),
    {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Create a 401 Unauthorized response for unauthenticated access.
 */
export function createUnauthorizedResponse(): Response {
  return new Response(
    JSON.stringify({
      error: 'Unauthorized',
      message: 'Authentication required',
    }),
    {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

