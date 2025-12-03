// app/api/admin/upload-logo/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { requireAdminSession } from '../_utils';

export const runtime = 'nodejs';

// POST /api/admin/upload-logo - Upload a parish logo to Vercel Blob
export async function POST(req: NextRequest) {
  const sessionCheck = await requireAdminSession();
  if (sessionCheck.error) {
    return NextResponse.json({ error: sessionCheck.error }, { status: sessionCheck.status });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const parishName = formData.get('parishName') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: PNG, JPEG, GIF, SVG, WebP' },
        { status: 400 }
      );
    }

    // Validate file size (max 2MB)
    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 2MB' },
        { status: 400 }
      );
    }

    // Create a clean filename
    const ext = file.name.split('.').pop() || 'png';
    const cleanName = parishName
      ? parishName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')
      : `logo-${Date.now()}`;
    const filename = `parish-logos/${cleanName}.${ext}`;

    // Upload to Vercel Blob
    const blob = await put(filename, file, {
      access: 'public',
      addRandomSuffix: false, // Use exact filename (will overwrite if exists)
    });

    return NextResponse.json({
      success: true,
      url: blob.url,
      filename: blob.pathname,
    });
  } catch (err: any) {
    console.error('POST /api/admin/upload-logo error:', err);
    
    // Check for missing token error
    if (err.message?.includes('BLOB_READ_WRITE_TOKEN')) {
      return NextResponse.json(
        { error: 'Blob storage not configured. Add BLOB_READ_WRITE_TOKEN to environment variables.' },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to upload logo', details: err.message },
      { status: 500 }
    );
  }
}

