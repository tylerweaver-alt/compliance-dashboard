/**
 * app/api/cron/auto-exclusion-engine/route.ts
 * 
 * Cron Job Endpoint - Auto-Exclusion Safety Net
 * 
 * PURPOSE:
 * This endpoint is called by Vercel's cron system to process any calls
 * that haven't been evaluated yet. It's a safety net to catch anything
 * that slipped through the inline async evaluation.
 * 
 * SCHEDULE (Enterprise-Tier):
 * Runs once daily at midnight UTC. Configure in vercel.json.
 * 
 * SECURITY:
 * Protected by CRON_SECRET - only Vercel system can call this.
 */

import { NextResponse } from 'next/server';
import { processUnevaluatedCalls, getUnevaluatedCallCount } from '@/lib/autoExclusions';
import { logCronEvent } from '@/lib/sysadmin/log';

// Maximum calls to process per cron run (to avoid timeouts)
const MAX_CALLS_PER_RUN = 500;

export async function GET(request: Request) {
  try {
    // Verify the request is from Vercel Cron
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';

    // SECURITY: CRON_SECRET is required in production - no exceptions
    if (isProduction && !cronSecret) {
      console.error('[Cron] CRON_SECRET not set in production - rejecting request');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.error('[Cron] Unauthorized request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[Cron] Auto-exclusion engine starting...');
    await logCronEvent('START', 'AUTO_EXCLUSION_ENGINE');

    // Get count of unevaluated calls before processing
    const unevaluatedCount = await getUnevaluatedCallCount();
    console.log(`[Cron] Found ${unevaluatedCount} unevaluated calls`);

    if (unevaluatedCount === 0) {
      return NextResponse.json({
        success: true,
        message: 'No unevaluated calls to process',
        stats: {
          unevaluatedBefore: 0,
          processed: 0,
          excluded: 0,
          errors: 0,
        }
      });
    }

    // Process unevaluated calls
    const result = await processUnevaluatedCalls(MAX_CALLS_PER_RUN);

    console.log(`[Cron] Processing complete:`, {
      processed: result.totalProcessed,
      excluded: result.excluded,
      notExcluded: result.notExcluded,
      errors: result.errors,
    });

    // Check if there are still more calls to process
    const remainingCount = await getUnevaluatedCallCount();

    // Log completion
    await logCronEvent('COMPLETE', 'AUTO_EXCLUSION_ENGINE', {
      unevaluatedBefore: unevaluatedCount,
      processed: result.totalProcessed,
      excluded: result.excluded,
      notExcluded: result.notExcluded,
      errors: result.errors,
      remaining: remainingCount,
    });

    return NextResponse.json({
      success: true,
      message: result.totalProcessed > 0 
        ? `Processed ${result.totalProcessed} calls` 
        : 'No calls processed',
      stats: {
        unevaluatedBefore: unevaluatedCount,
        processed: result.totalProcessed,
        excluded: result.excluded,
        notExcluded: result.notExcluded,
        errors: result.errors,
        remaining: remainingCount,
      }
    });

  } catch (error) {
    console.error('[Cron] Auto-exclusion engine failed:', error);

    // Log failure
    await logCronEvent('FAILURE', 'AUTO_EXCLUSION_ENGINE', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Vercel cron jobs use GET requests, but also support POST for manual testing
export async function POST(request: Request) {
  return GET(request);
}

