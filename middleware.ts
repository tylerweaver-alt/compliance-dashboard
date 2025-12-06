/**
 * Middleware for session-aware routing and API protection.
 * Guards all routes except static assets and the auth/health API allowlist.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

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

  // Default-protect all API routes except a narrow allowlist
  const allowedApiPrefixes = ['/api/auth', '/api/health'];
  const isApiRoute = pathname.startsWith('/api/');
  const isAllowedApi = allowedApiPrefixes.some((prefix) => pathname.startsWith(prefix));

  if (isApiRoute && !isAllowedApi) {
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
