/**
 * lib/autoExclusions/async.ts
 * 
 * Async Evaluation Helper - Fire-and-forget auto-exclusion processing
 * 
 * PURPOSE:
 * Triggers auto-exclusion evaluation without blocking API responses.
 * Uses Vercel's waitUntil pattern to run processing in the background.
 * 
 * USAGE:
 * ```ts
 * import { triggerAsyncEvaluation } from '@/lib/autoExclusions/async';
 * 
 * // In your API route after inserting a call:
 * export async function POST(request: Request) {
 *   const callId = await insertCall(data);
 *   
 *   // Fire and forget - doesn't block the response
 *   triggerAsyncEvaluation(callId);
 *   
 *   return NextResponse.json({ ok: true, callId });
 * }
 * ```
 */

import { processSingleCall, processCallsForAutoExclusion } from './runner';
import type { ProcessedCallResult, BatchProcessingResult } from './runner';

// Store for pending evaluations (used when waitUntil is not available)
let pendingEvaluations: Promise<any>[] = [];

/**
 * Trigger async evaluation for a single call
 * 
 * This function returns immediately. The evaluation runs in the background.
 * 
 * @param callId - Database ID of the call to evaluate
 * @param waitUntilFn - Optional waitUntil function from Vercel (pass from API route context)
 */
export function triggerAsyncEvaluation(
  callId: number,
  waitUntilFn?: (promise: Promise<any>) => void
): void {
  const evaluationPromise = processSingleCall(callId)
    .then((result) => {
      if (result.error) {
        console.error(`[AsyncEval] Error evaluating call ${callId}:`, result.error);
      } else if (result.wasExcluded) {
        console.log(`[AsyncEval] Call ${callId} auto-excluded: ${result.decision.reason}`);
      } else {
        console.log(`[AsyncEval] Call ${callId} evaluated - no exclusion`);
      }
      return result;
    })
    .catch((error) => {
      console.error(`[AsyncEval] Failed to evaluate call ${callId}:`, error);
    });

  // If waitUntil is provided (Vercel runtime), use it to keep function alive
  if (waitUntilFn) {
    waitUntilFn(evaluationPromise);
  } else {
    // Fallback: track promise but don't await it
    pendingEvaluations.push(evaluationPromise);
    
    // Clean up completed promises periodically
    if (pendingEvaluations.length > 100) {
      pendingEvaluations = pendingEvaluations.filter(p => {
        // Check if promise is still pending (hacky but works)
        let isPending = true;
        p.then(() => { isPending = false; }).catch(() => { isPending = false; });
        return isPending;
      });
    }
  }
}

/**
 * Trigger async evaluation for multiple calls
 * 
 * @param callIds - Array of call IDs to evaluate
 * @param waitUntilFn - Optional waitUntil function from Vercel
 */
export function triggerBatchAsyncEvaluation(
  callIds: number[],
  waitUntilFn?: (promise: Promise<any>) => void
): void {
  if (callIds.length === 0) return;

  const evaluationPromise = processCallsForAutoExclusion(callIds)
    .then((result) => {
      console.log(`[AsyncEval] Batch complete: ${result.totalProcessed} processed, ${result.excluded} excluded, ${result.errors} errors`);
      return result;
    })
    .catch((error) => {
      console.error(`[AsyncEval] Batch evaluation failed:`, error);
    });

  if (waitUntilFn) {
    waitUntilFn(evaluationPromise);
  } else {
    pendingEvaluations.push(evaluationPromise);
  }
}

/**
 * Helper to get waitUntil from Next.js API route context
 * 
 * In Next.js 14 App Router, you can access waitUntil like this:
 * ```ts
 * import { waitUntil } from '@vercel/functions';
 * 
 * export async function POST(request: Request) {
 *   // ... your logic
 *   triggerAsyncEvaluation(callId, waitUntil);
 * }
 * ```
 * 
 * Or if using the after() API in Next.js 15+:
 * ```ts
 * import { after } from 'next/server';
 * 
 * export async function POST(request: Request) {
 *   after(() => processSingleCall(callId));
 * }
 * ```
 */

// Re-export types for convenience
export type { ProcessedCallResult, BatchProcessingResult };

