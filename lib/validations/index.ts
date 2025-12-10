/**
 * Centralized Zod validation schemas and utilities.
 * 
 * This module provides:
 * - Common reusable schemas (positiveInt, email, etc.)
 * - Per-route schemas for API validation
 * - Helper functions for parsing and error handling
 */

import { z } from 'zod';

// ============================================================================
// COMMON SCHEMAS
// ============================================================================

/** Positive integer (> 0) */
export const positiveInt = z.coerce.number().int().positive();

/** Non-negative integer (>= 0) */
export const nonNegativeInt = z.coerce.number().int().nonnegative();

/** Positive number */
export const positiveNumber = z.coerce.number().positive();

/** Non-empty trimmed string */
export const nonEmptyString = z.string().trim().min(1);

/** Email address */
export const email = z.string().email();

/** UUID */
export const uuid = z.string().uuid();

/** Date string in various formats */
export const dateString = z.string().refine(
  (val) => !isNaN(Date.parse(val)),
  { message: 'Invalid date format' }
);

/** ISO date string (YYYY-MM-DD) */
export const isoDateString = z.string().regex(
  /^\d{4}-\d{2}-\d{2}$/,
  'Date must be in YYYY-MM-DD format'
);

/** Pagination limit (1-500) */
export const paginationLimit = z.coerce.number().int().min(1).max(500).default(100);

/** Pagination offset */
export const paginationOffset = z.coerce.number().int().nonnegative().default(0);

// ============================================================================
// API ROUTE SCHEMAS
// ============================================================================

/** GET /api/calls query parameters */
export const getCallsSchema = z.object({
  parish_id: positiveInt.optional(),
  start: dateString.optional(),
  end: dateString.optional(),
  limit: paginationLimit,
  offset: paginationOffset,
  include_excluded: z.enum(['true', 'false']).transform(v => v === 'true').default('false'),
});

/** POST /api/posts body */
export const createPostSchema = z.object({
  regionId: nonEmptyString,
  name: nonEmptyString,
  address: z.string().optional(),
  intersection: z.string().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  defaultUnits: positiveInt.default(1),
  coverageLevel: positiveInt.default(4),
});

/** POST /api/admin/users body */
export const createUserSchema = z.object({
  email: email,
  full_name: nonEmptyString.optional(),
  display_name: nonEmptyString.optional(),
  role: nonEmptyString,
  is_active: z.boolean().default(true),
  is_admin: z.boolean().default(false),
  allowed_regions: z.array(z.string()).default([]),
  has_all_regions: z.boolean().default(false),
});

/** GET /api/sysadmin/audit-events query parameters */
export const auditEventsQuerySchema = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
  category: z.enum(['AUTH', 'CALLS', 'EXCLUSIONS', 'AUDIT', 'CONFIG', 'DB', 'SYSTEM']).optional(),
  actor: email.optional(),
  targetType: z.string().optional(),
  limit: paginationLimit,
  offset: paginationOffset,
});

/** POST /api/upload form data */
export const uploadSchema = z.object({
  parish_id: positiveInt,
  data_month: positiveInt.optional(),
  data_year: positiveInt.optional(),
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse URL search params using a Zod schema.
 * Returns the parsed data or throws a ZodError.
 */
export function parseSearchParams<T extends z.ZodTypeAny>(
  searchParams: URLSearchParams,
  schema: T
): z.infer<T> {
  const params: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return schema.parse(params);
}

/**
 * Parse JSON body using a Zod schema.
 * Returns the parsed data or throws a ZodError.
 */
export async function parseBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T
): Promise<z.infer<T>> {
  const body = await request.json();
  return schema.parse(body);
}

/**
 * Safe parse that returns a result object instead of throwing.
 */
export function safeParse<T extends z.ZodTypeAny>(
  data: unknown,
  schema: T
): { success: true; data: z.infer<T> } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

