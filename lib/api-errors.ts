/**
 * Centralized API error handling.
 * 
 * Provides consistent error responses and logging across all API routes.
 */

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import * as Sentry from '@sentry/nextjs';
import { formatZodError } from '@/lib/validations/errors';

/**
 * Custom application error with status code.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Common error types for convenience.
 */
export const Errors = {
  notFound: (resource: string) =>
    new AppError(`${resource} not found`, 404, 'NOT_FOUND'),
  
  unauthorized: (message = 'Authentication required') =>
    new AppError(message, 401, 'UNAUTHORIZED'),
  
  forbidden: (message = 'Access denied') =>
    new AppError(message, 403, 'FORBIDDEN'),
  
  badRequest: (message: string, details?: Record<string, unknown>) =>
    new AppError(message, 400, 'BAD_REQUEST', details),
  
  conflict: (message: string) =>
    new AppError(message, 409, 'CONFLICT'),
  
  tooManyRequests: (retryAfter?: number) =>
    new AppError('Too many requests', 429, 'RATE_LIMITED', { retry_after: retryAfter }),
  
  internal: (message = 'Internal server error') =>
    new AppError(message, 500, 'INTERNAL_ERROR'),
};

export interface ErrorResponse {
  error: string;
  message: string;
  code?: string;
  details?: unknown;
}

/**
 * Handle any error and return an appropriate NextResponse.
 * 
 * - ZodError -> 400 with validation details
 * - AppError -> appropriate status code
 * - Unknown errors -> 500 with generic message (logged to Sentry)
 */
export function handleApiError(
  error: unknown,
  context?: { path?: string; method?: string }
): NextResponse<ErrorResponse> {
  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const formatted = formatZodError(error);
    return NextResponse.json(
      {
        error: 'Validation Error',
        message: formatted.message,
        details: formatted.details,
      },
      { status: 400 }
    );
  }

  // Handle known application errors
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        error: error.name,
        message: error.message,
        code: error.code,
        details: error.details,
      },
      { status: error.statusCode }
    );
  }

  // Handle unknown errors - log to Sentry and return generic message
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  console.error('[API Error]', {
    path: context?.path,
    method: context?.method,
    error: errorMessage,
    stack: error instanceof Error ? error.stack : undefined,
  });

  // Report to Sentry
  Sentry.captureException(error, {
    extra: {
      path: context?.path,
      method: context?.method,
    },
  });

  // Return generic error to client (don't leak internal details)
  return NextResponse.json(
    {
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    },
    { status: 500 }
  );
}

/**
 * Wrapper for route handlers with automatic error handling.
 * 
 * Usage:
 * ```ts
 * export const GET = withErrorHandler(async (req) => {
 *   // Your handler code
 *   return NextResponse.json({ data });
 * });
 * ```
 */
export function withErrorHandler<T extends Request>(
  handler: (req: T) => Promise<NextResponse>
): (req: T) => Promise<NextResponse> {
  return async (req: T) => {
    try {
      return await handler(req);
    } catch (error) {
      return handleApiError(error, {
        path: new URL(req.url).pathname,
        method: req.method,
      });
    }
  };
}

