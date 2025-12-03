// lib/compliance.ts
// Coverage vs Compliance calculation engine

import type { LevelTimeShare } from './coverage-types';

// ============================================================================
// CALL RECORD TYPE
// ============================================================================

export type CallRecord = {
  callId: string;
  startTime: Date;
  endTime: Date;         // startTime + lag
  travelTimeMin: number; // simulated or observed drive time
  location: GeoJSON.Point;

  isLate: boolean;          // travelTimeMin > threshold
  isExcludable: boolean;    // matches exclusion policy & is late
  isExcluded: boolean;      // manually approved exclusion
  exclusionReason?: string; // 'weather', 'train', etc.
};

// ============================================================================
// RAW COMPLIANCE CALCULATION
// ============================================================================

/**
 * Compute raw compliance at threshold T (no exclusions)
 * @param calls Array of CallRecords
 * @param T Threshold in minutes
 * @returns Compliance rate (0-1)
 */
export function computeRawCompliance(calls: CallRecord[], T: number): number {
  if (!calls.length) return 0;
  const onTime = calls.filter((c) => c.travelTimeMin <= T).length;
  return onTime / calls.length;
}

// ============================================================================
// CONTRACT COMPLIANCE CALCULATION
// ============================================================================

/**
 * Compute contract compliance at T (after exclusions)
 * @param calls Array of CallRecords
 * @param T Threshold in minutes
 * @returns Contract compliance rate (0-1)
 */
export function computeContractCompliance(calls: CallRecord[], T: number): number {
  const included = calls.filter((c) => !c.isExcluded);
  if (!included.length) return 0;
  const onTimeIncluded = included.filter(
    (c) => c.travelTimeMin <= T
  ).length;
  return onTimeIncluded / included.length;
}

// ============================================================================
// EXCLUSION RATE
// ============================================================================

/**
 * Compute exclusion rate
 * @param calls Array of CallRecords
 * @returns Exclusion rate (0-1)
 */
export function computeExclusionRate(calls: CallRecord[]): number {
  if (!calls.length) return 0;
  const excluded = calls.filter((c) => c.isExcluded).length;
  return excluded / calls.length;
}

// ============================================================================
// FIND TIME NEEDED FOR TARGET COMPLIANCE
// ============================================================================

/**
 * Find the smallest T where raw compliance >= target (no exclusions)
 * @param calls Array of CallRecords  
 * @param targetPct Target percentage (0-1)
 * @param maxT Maximum threshold to search (default 30 min)
 * @param step Step size for search (default 0.1 min)
 * @returns Threshold in minutes, or null if not achievable
 */
export function findTimeForRawTarget(
  calls: CallRecord[],
  targetPct: number,
  maxT: number = 30,
  step: number = 0.1
): number | null {
  if (!calls.length) return null;
  
  for (let t = 0; t <= maxT; t += step) {
    if (computeRawCompliance(calls, t) >= targetPct) {
      return Math.round(t * 10) / 10; // Round to 1 decimal
    }
  }
  return null;
}

/**
 * Find time needed for target with exclusions
 * Contract(T) = raw_compliance(T) / (1 - exclusionRate)
 * Rneeded = targetPct * (1 - exclusionRate)
 * Find smallest T where raw_compliance(T) >= Rneeded
 */
export function findTimeForContractTarget(
  calls: CallRecord[],
  targetPct: number,
  exclusionRate: number,
  maxT: number = 30,
  step: number = 0.1
): number | null {
  if (!calls.length) return null;
  if (exclusionRate >= 1) return null; // All excluded
  
  const rNeeded = targetPct * (1 - exclusionRate);
  
  for (let t = 0; t <= maxT; t += step) {
    if (computeRawCompliance(calls, t) >= rNeeded) {
      return Math.round(t * 10) / 10;
    }
  }
  return null;
}

// ============================================================================
// COMPLIANCE CURVE DATA
// ============================================================================

export type ComplianceCurvePoint = {
  minutes: number;
  compliance: number;
};

/**
 * Generate compliance curve data points
 */
export function generateComplianceCurve(
  calls: CallRecord[],
  maxMinutes: number = 30,
  step: number = 0.5,
  exclusionRate: number = 0
): ComplianceCurvePoint[] {
  const points: ComplianceCurvePoint[] = [];
  
  for (let t = 0; t <= maxMinutes; t += step) {
    const rawCompliance = computeRawCompliance(calls, t);
    const compliance = exclusionRate > 0 && exclusionRate < 1
      ? rawCompliance / (1 - exclusionRate)
      : rawCompliance;
    
    points.push({
      minutes: t,
      compliance: Math.min(compliance, 1), // Cap at 100%
    });
  }
  
  return points;
}

