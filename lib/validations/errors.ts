/**
 * Validation error handling utilities.
 * 
 * Provides consistent error responses for Zod validation failures.
 */

import { ZodError } from 'zod';
import { NextResponse } from 'next/server';

export interface ValidationErrorResponse {
  error: 'Validation Error';
  message: string;
  details: Array<{
    field: string;
    message: string;
  }>;
}

/**
 * Format a ZodError into a user-friendly error response.
 */
export function formatZodError(error: ZodError): ValidationErrorResponse {
  const details = error.errors.map((err) => ({
    field: err.path.join('.') || 'unknown',
    message: err.message,
  }));

  return {
    error: 'Validation Error',
    message: 'Invalid request parameters',
    details,
  };
}

/**
 * Handle a validation error and return a 400 response.
 */
export function handleValidationError(error: ZodError): NextResponse<ValidationErrorResponse> {
  const formatted = formatZodError(error);
  return NextResponse.json(formatted, { status: 400 });
}

/**
 * Check if an error is a ZodError.
 */
export function isZodError(error: unknown): error is ZodError {
  return error instanceof ZodError;
}

/**
 * Wrapper to handle validation in route handlers.
 * 
 * Usage:
 * ```ts
 * const result = await withValidation(
 *   () => parseSearchParams(searchParams, getCallsSchema),
 *   (validated) => {
 *     // Use validated data
 *     return NextResponse.json({ data: validated });
 *   }
 * );
 * ```
 */
export async function withValidation<T, R>(
  parse: () => T | Promise<T>,
  handler: (data: T) => R | Promise<R>
): Promise<R | NextResponse<ValidationErrorResponse>> {
  try {
    const data = await parse();
    return await handler(data);
  } catch (error) {
    if (isZodError(error)) {
      return handleValidationError(error);
    }
    throw error;
  }
}

