/**
 * Middleware for session-aware routing and API protection.
 * Guards all routes except static assets and the auth/health API allowlist.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow static assets through
  if (pathname.startsWith('/_next') || pathname.startsWith('/Images') || pathname.includes('.')) {
    return NextResponse.next();
  }

  // ALWAYS allow NextAuth API routes through without any checks
  // This prevents middleware from interfering with authentication
  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  // Allow health check API
  if (pathname.startsWith('/api/health')) {
    return NextResponse.next();
  }

  // Get the NextAuth session token (only for non-auth routes)
  let token = null;
  try {
    token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
  } catch (error) {
    console.error('[Middleware] Error getting token:', error);
    // Continue without token - will redirect to login if needed
  }

  // Protect other API routes
  if (pathname.startsWith('/api/')) {
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.next();
  }

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
