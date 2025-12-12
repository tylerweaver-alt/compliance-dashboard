/**
 * lib/compliance/status.ts
 * 
 * Compliance status calculation helpers.
 * Centralizes the logic for determining compliance state (green/yellow/red)
 * based on actual vs target compliance percentages.
 * 
 * USAGE:
 * ```ts
 * import { getComplianceStatus, getComplianceStatusColor } from '@/lib/compliance/status';
 * 
 * const status = getComplianceStatus(actualPercent, targetPercent);
 * // Returns: 'green' | 'yellow' | 'red' | 'neutral'
 * 
 * const color = getComplianceStatusColor(status);
 * // Returns: CSS color class or hex value
 * ```
 */

// ============================================================================
// TYPES
// ============================================================================

export type ComplianceStatus = 'green' | 'yellow' | 'red' | 'neutral';

// ============================================================================
// THRESHOLDS
// ============================================================================
// These thresholds define the boundaries between status colors.
// They can be adjusted based on business requirements.

/**
 * Yellow threshold: How many percentage points below target before turning red.
 * If actual is between (target - threshold) and target, status is yellow.
 * If actual is below (target - threshold), status is red.
 */
const YELLOW_THRESHOLD_POINTS = 5; // 5 percentage points

// ============================================================================
// STATUS CALCULATION
// ============================================================================

/**
 * Calculate compliance status based on actual vs target percentage.
 * 
 * @param actualPercent - Current compliance percentage (0-100)
 * @param targetPercent - Target compliance percentage (0-100), or null if not set
 * @returns ComplianceStatus - 'green' | 'yellow' | 'red' | 'neutral'
 * 
 * Logic:
 * - If no target is set: neutral (no color indicator)
 * - If actual >= target: green (meeting or exceeding goal)
 * - If actual >= (target - 5): yellow (slightly below, warning)
 * - If actual < (target - 5): red (significantly below, alert)
 */
export function getComplianceStatus(
  actualPercent: number | null | undefined,
  targetPercent: number | null | undefined
): ComplianceStatus {
  // If no target is set, return neutral
  if (targetPercent === null || targetPercent === undefined) {
    return 'neutral';
  }
  
  // If actual is missing or invalid, return neutral
  if (actualPercent === null || actualPercent === undefined || isNaN(actualPercent)) {
    return 'neutral';
  }
  
  // Green: Meeting or exceeding target
  if (actualPercent >= targetPercent) {
    return 'green';
  }
  
  // Yellow: Within warning threshold (5 points below target)
  const yellowFloor = targetPercent - YELLOW_THRESHOLD_POINTS;
  if (actualPercent >= yellowFloor) {
    return 'yellow';
  }
  
  // Red: Significantly below target
  return 'red';
}

// ============================================================================
// COLOR MAPPINGS
// ============================================================================

/**
 * Get Tailwind-compatible color classes for a compliance status.
 * Returns an object with text, bg, and border color classes.
 */
export function getComplianceStatusColors(status: ComplianceStatus): {
  text: string;
  bg: string;
  border: string;
  dot: string;
} {
  switch (status) {
    case 'green':
      return {
        text: 'text-green-600',
        bg: 'bg-green-100',
        border: 'border-green-400',
        dot: 'bg-green-500',
      };
    case 'yellow':
      return {
        text: 'text-amber-600',
        bg: 'bg-amber-100',
        border: 'border-amber-400',
        dot: 'bg-amber-500',
      };
    case 'red':
      return {
        text: 'text-red-600',
        bg: 'bg-red-100',
        border: 'border-red-400',
        dot: 'bg-red-500',
      };
    case 'neutral':
    default:
      return {
        text: 'text-slate-500',
        bg: 'bg-slate-100',
        border: 'border-slate-300',
        dot: 'bg-slate-400',
      };
  }
}

/**
 * Get a simple color value for the status (for inline styling or charts).
 */
export function getComplianceStatusHex(status: ComplianceStatus): string {
  switch (status) {
    case 'green':
      return '#22c55e'; // green-500
    case 'yellow':
      return '#f59e0b'; // amber-500
    case 'red':
      return '#ef4444'; // red-500
    case 'neutral':
    default:
      return '#94a3b8'; // slate-400
  }
}

