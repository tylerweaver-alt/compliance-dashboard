/**
 * Date Range Persistence Helpers
 *
 * This module provides utilities for persisting date range selections
 * across navigation and page refreshes using sessionStorage.
 *
 * PERSISTENCE RULES:
 * 1. Default on page load: previous month (1st to last day)
 * 2. Once user changes date, it persists across all navigation
 * 3. Date only resets on logout (sessionStorage clears on tab close)
 */

// ============================================================================
// CONSTANTS
// ============================================================================

export const SESSION_STORAGE_DATE_RANGE_KEY = 'acadian_date_range';

// ============================================================================
// INTERFACES
// ============================================================================

export interface DateRange {
  startDate: string; // ISO date string (YYYY-MM-DD)
  endDate: string; // ISO date string (YYYY-MM-DD)
}

export interface DateRangeWithSource extends DateRange {
  source: 'user' | 'default';
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the default date range (previous month)
 * Returns the 1st and last day of the previous month
 */
export function getDefaultDateRange(): DateRange {
  const now = new Date();
  const firstOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0); // Day 0 = last day of prev month

  return {
    startDate: firstOfPrevMonth.toISOString().split('T')[0],
    endDate: lastOfPrevMonth.toISOString().split('T')[0],
  };
}

/**
 * Get the display name for a date range (e.g., "November 2024")
 */
export function getDateRangeDisplayName(startDate: string): string {
  const date = new Date(startDate + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Validate that a date string is in valid ISO format (YYYY-MM-DD)
 */
export function isValidDateString(dateStr: string): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

/**
 * Validate a date range object
 */
export function isValidDateRange(range: unknown): range is DateRange {
  if (!range || typeof range !== 'object') return false;
  const r = range as Record<string, unknown>;
  return (
    typeof r.startDate === 'string' &&
    typeof r.endDate === 'string' &&
    isValidDateString(r.startDate) &&
    isValidDateString(r.endDate)
  );
}

// ============================================================================
// STORAGE FUNCTIONS (Client-side only)
// ============================================================================

/**
 * Save date range to sessionStorage
 * Only works in browser environment
 */
export function saveDateRange(range: DateRange): void {
  if (typeof window === 'undefined') return;

  try {
    const data = JSON.stringify({
      startDate: range.startDate,
      endDate: range.endDate,
      savedAt: new Date().toISOString(),
    });
    sessionStorage.setItem(SESSION_STORAGE_DATE_RANGE_KEY, data);
  } catch (error) {
    console.warn('Failed to save date range to sessionStorage:', error);
  }
}

/**
 * Load date range from sessionStorage
 * Returns the stored range with source='user', or default range with source='default'
 */
export function loadDateRange(): DateRangeWithSource {
  if (typeof window === 'undefined') {
    // Server-side: return default
    return { ...getDefaultDateRange(), source: 'default' };
  }

  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_DATE_RANGE_KEY);
    if (!stored) {
      return { ...getDefaultDateRange(), source: 'default' };
    }

    const parsed = JSON.parse(stored);
    if (isValidDateRange(parsed)) {
      return {
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        source: 'user',
      };
    }
  } catch (error) {
    console.warn('Failed to load date range from sessionStorage:', error);
  }

  return { ...getDefaultDateRange(), source: 'default' };
}

/**
 * Clear date range from sessionStorage
 * Call this on logout to reset to default
 */
export function clearDateRange(): void {
  if (typeof window === 'undefined') return;

  try {
    sessionStorage.removeItem(SESSION_STORAGE_DATE_RANGE_KEY);
  } catch (error) {
    console.warn('Failed to clear date range from sessionStorage:', error);
  }
}

/**
 * Format date for display (e.g., "Nov 1, 2024")
 */
export function formatDateForDisplay(isoDate: string): string {
  const date = new Date(isoDate + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
