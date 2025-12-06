/**
 * NextAuth Middleware - DISABLED
 *
 * Authentication completely bypassed - all routes are accessible
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // Allow all requests - no authentication required
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all routes except static files
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};

