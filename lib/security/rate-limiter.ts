/**
 * Simple in-memory rate limiter for API protection.
 * 
 * Uses a sliding window approach to limit requests per IP.
 * Note: This is reset on server restart and is per-instance.
 * For production with multiple instances, consider Redis-based limiting.
 */

import { logSystemEvent } from '@/lib/audit/logAuditEvent';

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

// In-memory store for rate limiting
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup interval (every 5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;

// Start cleanup timer
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      // Remove entries older than 10 minutes
      if (now - entry.windowStart > 10 * 60 * 1000) {
        rateLimitStore.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);
}

export interface RateLimitConfig {
  /** Maximum requests per window */
  maxRequests: number;
  /** Window size in milliseconds */
  windowMs: number;
  /** Identifier for logging */
  name: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Default rate limit configurations for different endpoint types.
 */
export const RATE_LIMIT_CONFIGS = {
  /** Auth endpoints (login, callback) - strict */
  auth: {
    maxRequests: 10,
    windowMs: 60 * 1000, // 1 minute
    name: 'auth',
  } as RateLimitConfig,
  
  /** Upload endpoints - moderate */
  upload: {
    maxRequests: 20,
    windowMs: 60 * 1000,
    name: 'upload',
  } as RateLimitConfig,
  
  /** Sysadmin endpoints - very strict */
  sysadmin: {
    maxRequests: 30,
    windowMs: 60 * 1000,
    name: 'sysadmin',
  } as RateLimitConfig,
  
  /** General API - relaxed */
  api: {
    maxRequests: 100,
    windowMs: 60 * 1000,
    name: 'api',
  } as RateLimitConfig,
};

/**
 * Check if a request should be rate limited.
 * 
 * @param identifier - Unique identifier (usually IP address)
 * @param config - Rate limit configuration
 * @returns Rate limit result with allowed status and remaining requests
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const key = `${config.name}:${identifier}`;
  const now = Date.now();
  
  const entry = rateLimitStore.get(key);
  
  // No entry or window expired - start new window
  if (!entry || now - entry.windowStart >= config.windowMs) {
    rateLimitStore.set(key, { count: 1, windowStart: now });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: now + config.windowMs,
    };
  }
  
  // Within window - check limit
  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.windowStart + config.windowMs,
    };
  }
  
  // Increment counter
  entry.count++;
  rateLimitStore.set(key, entry);
  
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.windowStart + config.windowMs,
  };
}

/**
 * Apply rate limiting and log if limit exceeded.
 * 
 * @param ip - Client IP address
 * @param path - Request path
 * @param config - Rate limit configuration
 * @returns null if allowed, Response if rate limited
 */
export async function applyRateLimit(
  ip: string,
  path: string,
  config: RateLimitConfig
): Promise<Response | null> {
  const result = checkRateLimit(ip, config);
  
  if (!result.allowed) {
    // Log the rate limit hit
    await logSystemEvent('RATE_LIMIT_HIT', {
      ip,
      path,
      config_name: config.name,
      reset_at: new Date(result.resetAt).toISOString(),
    });
    
    return new Response(
      JSON.stringify({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        retry_after: Math.ceil((result.resetAt - Date.now()) / 1000),
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil((result.resetAt - Date.now()) / 1000)),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.floor(result.resetAt / 1000)),
        },
      }
    );
  }
  
  return null;
}

