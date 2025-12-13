/**
 * 2FA Verification endpoint for Sysadmin access
 * Verifies TOTP code before allowing access to sysadmin portal
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authenticator } from 'otplib';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

// Superadmin email allowlist
const SUPERADMIN_EMAILS = new Set([
  'tyler.weaver@acadian.com',
  'jrc7192@gmail.com',
  'tylerkweaver20@gmail.com',
]);

export async function POST(request: NextRequest) {
  try {
    // 1. Check session
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const email = session.user.email.toLowerCase();

    // 2. Check if email is in superadmin allowlist
    if (!SUPERADMIN_EMAILS.has(email)) {
      console.warn(`[2FA] Denied: ${email} not in superadmin allowlist`);
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 3. Get TOTP code from request body
    const body = await request.json();
    const { code } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'Code is required' }, { status: 400 });
    }

    // 4. Get secret from environment
    const secret = process.env.SYSADMIN_TOTP_SECRET;
    if (!secret) {
      console.error('[2FA] SYSADMIN_TOTP_SECRET not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // 5. Verify TOTP code
    const isValid = authenticator.verify({ token: code.trim(), secret });

    if (!isValid) {
      console.warn(`[2FA] Invalid code attempt from ${email}`);
      return NextResponse.json({ error: 'Invalid code' }, { status: 401 });
    }

    // 6. Success
    console.log(`[2FA] Verified successfully for ${email}`);
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[2FA] Verification error:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}

