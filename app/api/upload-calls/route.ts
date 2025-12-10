/**
 * DEPRECATED: CSV Upload Route for Call Data (/api/upload-calls)
 *
 * This endpoint was originally designed for an older data model that no longer matches
 * the current Neon schema. It:
 *   - Writes to a legacy `uploads` table (now superseded by `parish_uploads`)
 *   - Depends on a legacy `zones` table (being archived)
 *   - Attempts to INSERT into `calls` with columns that no longer exist:
 *       upload_id, zone_id, response_minutes, is_exception, exception_reason
 *
 * The current, supported upload flow is:
 *   - POST /api/upload     (uses `parish_uploads` and the current `calls` schema)
 *
 * This route is intentionally disabled to prevent silently corrupt or failing writes.
 * Any callers must be updated to use /api/upload instead.
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs'; // kept for consistency, though this route does no DB work

export async function POST(_req: NextRequest) {
  return NextResponse.json(
    {
      error:
        'This endpoint (/api/upload-calls) has been deprecated and is no longer supported. ' +
        'Please use /api/upload instead, which is compatible with the current data model.',
      status: 410,
    },
    { status: 410 }
  );
}
