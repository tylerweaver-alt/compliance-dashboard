/**
 * Types for Compliance Feasibility API
 * 
 * These types define the response shape for /api/compliance/feasibility
 * which provides data for the compliance feasibility curve UI.
 */

/**
 * A single point on the feasibility curve
 */
export interface FeasibilityPoint {
  minutes: number;              // e.g., 6, 8, 10, 12, ...
  expectedCompliance: number;   // "contract / target" baseline (0-100)
  rawCompliance: number;        // includes all calls, no exclusions (0-100)
  calculatedCompliance: number; // after exclusions (0-100)
  rawCallCount: number;
  excludedCallCount: number;
  countedCallCount: number;     // raw - excluded
}

/**
 * Target intersection result
 */
export interface TargetIntersection {
  found: boolean;                        // true if target is reachable within 60 minutes
  minutes: number | null;                // 0–60, or null if not found
}

/**
 * Summary of target intersection calculations
 */
export interface FeasibilitySummary {
  targetCompliance: number;              // e.g. 90
  targetMinutesCurrent: number | null;   // e.g. 8.9 (minutes) - where current curve meets target
  targetMinutesProjected: number | null; // where projected curve meets target
  intersection: TargetIntersection;      // explicit intersection result for Target Intersect mode
}

/**
 * Top-level compliance metrics for summary text
 */
export interface ComplianceMetrics {
  expectedPercent: number;       // 0–100 (contract target)
  rawPercent: number;            // 0–100 (before exclusions)
  calculatedPercent: number;     // 0–100 (after exclusions)
  rawCallCount: number;
  excludedCallCount: number;
  countedCallCount: number;      // raw - excluded
  transportedRawCount?: number;  // optional
  transportedCountedCount?: number;
}

/**
 * Request body for the feasibility endpoint
 */
export interface FeasibilityRequest {
  regionId: string;               // e.g. "CENLA"
  parishId?: number | null;       // optional parish filter
  zoneId?: number | null;         // optional zone filter (stubbed for now)
  startDate?: string;             // YYYY-MM-DD
  endDate?: string;               // YYYY-MM-DD
  thresholds?: number[];          // optional custom thresholds, defaults to [6,8,10,12,14,16]
  targetCompliance?: number;      // optional target compliance (0-100), defaults to 90
}

/**
 * Full response from the feasibility endpoint
 */
export interface FeasibilityResponse {
  currentCurve: FeasibilityPoint[];
  projectedCurve: FeasibilityPoint[];
  summary: FeasibilitySummary;
  metrics: ComplianceMetrics;
  dateRange: {
    start: string;
    end: string;
  };
  regionId: string;
  parishId: number | null;
  error?: string;
}

