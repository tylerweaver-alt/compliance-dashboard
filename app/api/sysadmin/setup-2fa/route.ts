/**
 * 2FA Setup endpoint - generates QR code data for authenticator app
 * Only accessible by superadmin emails
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

export async function GET(request: NextRequest) {
  try {
    // 1. Check session
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const email = session.user.email.toLowerCase();

    // 2. Check if email is in superadmin allowlist
    if (!SUPERADMIN_EMAILS.has(email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 3. Get secret from environment
    const secret = process.env.SYSADMIN_TOTP_SECRET;
    if (!secret) {
      console.error('[2FA Setup] SYSADMIN_TOTP_SECRET not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // 4. Generate otpauth URL for QR code
    const serviceName = 'AcadianCompliance-Sysadmin';
    const otpauthUrl = authenticator.keyuri(email, serviceName, secret);

    // 5. Return the URL (frontend will generate QR code)
    return NextResponse.json({
      otpauthUrl,
      secret, // Also return secret for manual entry
      serviceName,
    });

  } catch (error) {
    console.error('[2FA Setup] Error:', error);
    return NextResponse.json({ error: 'Setup failed' }, { status: 500 });
  }
}

