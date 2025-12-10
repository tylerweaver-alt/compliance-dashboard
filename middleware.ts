/**
 * Middleware for session-aware routing and API protection.
 * Guards all routes except static assets and the auth/health API allowlist.
 *
 * Special handling for /sysadmin routes:
 * - Requires authentication
 * - Requires is_superadmin flag from session
 * - Enforces IP allowlist when SYSADMIN_IP_ALLOWLIST is set
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

/**
 * Get client IP from request headers.
 * Checks x-forwarded-for first (for proxied requests), then x-real-ip.
 * Detects localhost from Host header.
 */
function getClientIPFromRequest(request: NextRequest): string | null {
  // Check if running locally via Host header
  const host = request.headers.get('host') || '';
  if (host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]')) {
    return '127.0.0.1';
  }

  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const firstIP = xff.split(',')[0]?.trim();
    if (firstIP) return firstIP;
  }

  const realIP = request.headers.get('x-real-ip');
  if (realIP) return realIP.trim();

  return null;
}

/**
 * Check if IP is in the sysadmin allowlist.
 */
function isIPInAllowlist(ip: string | null): boolean {
  const allowlist = process.env.SYSADMIN_IP_ALLOWLIST;

  // If no allowlist configured, allow all (for development)
  if (!allowlist || allowlist.trim() === '') {
    return true;
  }

  if (!ip) return false;

  const allowedIPs = allowlist.split(',').map((s) => s.trim()).filter(Boolean);

  // Normalize localhost variants
  const normalizedIP = ip === '::1' || ip === '::ffff:127.0.0.1' ? '127.0.0.1' : ip;

  return allowedIPs.some((allowed) => {
    const normalizedAllowed = allowed === '::1' || allowed === '::ffff:127.0.0.1' ? '127.0.0.1' : allowed;
    return normalizedIP === normalizedAllowed;
  });
}

/**
 * Check if a path requires SuperAdmin access.
 */
function isSysadminRoute(pathname: string): boolean {
  return pathname.startsWith('/sysadmin') || pathname.startsWith('/api/sysadmin');
}

export async function middleware(request: NextRequest) {
  // Get the NextAuth session token
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  const { pathname } = request.nextUrl;

  // Allow static assets through
  if (pathname.startsWith('/_next') || pathname.startsWith('/Images') || pathname.includes('.')) {
    return NextResponse.next();
  }

  // =========================================================================
  // SYSADMIN ROUTE PROTECTION
  // Requires: authenticated + is_superadmin + IP allowlist (if configured)
  // =========================================================================
  if (isSysadminRoute(pathname)) {
    // 1. Must be authenticated
    if (!token) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'Unauthorized', message: 'Authentication required' },
          { status: 401 }
        );
      }
      const loginUrl = new URL('/AcadianDashboard', request.url);
      return NextResponse.redirect(loginUrl);
    }

    // 2. Must have is_superadmin flag
    // Check token.is_superadmin (from NextAuth JWT callback)
    const isSuperAdmin = token.is_superadmin === true;
    if (!isSuperAdmin) {
      console.warn(`[Middleware] Sysadmin access denied: ${token.email} is not a SuperAdmin`);
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'Forbidden', message: 'Access denied to sysadmin resources' },
          { status: 403 }
        );
      }
      // Redirect non-SuperAdmins to dashboard
      const dashboardUrl = new URL('/AcadianDashboard', request.url);
      return NextResponse.redirect(dashboardUrl);
    }

    // 3. Check IP allowlist (only if configured)
    const clientIP = getClientIPFromRequest(request);
    if (!isIPInAllowlist(clientIP)) {
      console.warn(`[Middleware] Sysadmin access denied: IP ${clientIP} not in allowlist for ${token.email}`);
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'Forbidden', message: 'Access denied - IP not allowed' },
          { status: 403 }
        );
      }
      const dashboardUrl = new URL('/AcadianDashboard', request.url);
      return NextResponse.redirect(dashboardUrl);
    }

    // SuperAdmin + IP check passed, allow through
    return NextResponse.next();
  }

  // =========================================================================
  // STANDARD API ROUTE PROTECTION
  // =========================================================================
  // NOTE: /api/cron is allowed through because it uses its own CRON_SECRET auth
  const allowedApiPrefixes = ['/api/auth', '/api/health', '/api/cron'];
  const isApiRoute = pathname.startsWith('/api/');
  const isAllowedApi = allowedApiPrefixes.some((prefix) => pathname.startsWith(prefix));

  if (isApiRoute) {
    if (isAllowedApi) {
      // Allowed APIs handle their own auth (e.g., /api/cron uses CRON_SECRET)
      return NextResponse.next();
    }
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.next();
  }

  // =========================================================================
  // PAGE ROUTE PROTECTION
  // =========================================================================
  // If no token and trying to access protected routes, redirect to login
  // Note: /AcadianDashboard is the login page, so we allow it
  // The page component itself handles showing login vs dashboard
  if (!token && pathname !== '/AcadianDashboard') {
    const loginUrl = new URL('/AcadianDashboard', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all routes except static files
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
