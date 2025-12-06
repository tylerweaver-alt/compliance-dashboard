/**
 * lib/complianceEngine.ts
 *
 * Pure TypeScript compliance calculation engine.
 * Contains all math and graph logic for compliance analysis.
 * No React dependencies - just pure functions.
 */

// ============================================================================
// CORE TYPES
// ============================================================================

export type CallRecord = {
  callId: string;
  parishId: string;
  zoneId?: string;

  startTime: Date;
  endTime: Date;          // start + lag
  travelTimeMin: number;  // observed/simulated travel

  isExcludable: boolean;
  isExcluded: boolean;
  exclusionReason?: string;
};

export type CompliancePoint = {
  T: number;   // time threshold in minutes
  pct: number; // fraction 0..1
};

export type ThresholdResult = {
  targetPct: number;              // 0.7, 0.85, 0.9, 0.95
  timeRaw: number | null;
  timeContractHist: number | null;
  timeContractCustom?: number | null;
};

export type LevelTimeShare = {
  levelIndex: number;
  label: string;
  fractionOfTime: number; // 0..1, sums ~1
};

export type PerLevelCurves = Record<number, CompliancePoint[]>;

// ============================================================================
// BASIC COMPLIANCE HELPERS
// ============================================================================

/**
 * Compute raw compliance at threshold T (no exclusions applied)
 * @param calls Array of CallRecords
 * @param T Threshold in minutes
 * @returns Compliance rate as fraction (0-1)
 */
export function computeRawCompliance(calls: CallRecord[], T: number): number {
  if (!calls.length) return 0;
  const onTime = calls.filter((c) => c.travelTimeMin <= T).length;
  return onTime / calls.length;
}

/**
 * Compute contract compliance at threshold T (with exclusions removed from denominator)
 * @param calls Array of CallRecords
 * @param T Threshold in minutes
 * @returns Contract compliance rate as fraction (0-1)
 */
export function computeContractCompliance(calls: CallRecord[], T: number): number {
  const included = calls.filter((c) => !c.isExcluded);
  if (!included.length) return 0;
  const onTimeIncluded = included.filter((c) => c.travelTimeMin <= T).length;
  return onTimeIncluded / included.length;
}

/**
 * Compute the exclusion rate from call data
 * @param calls Array of CallRecords
 * @returns Exclusion rate as fraction (0-1)
 */
export function computeExclusionRate(calls: CallRecord[]): number {
  if (!calls.length) return 0;
  const excluded = calls.filter((c) => c.isExcluded).length;
  return excluded / calls.length;
}

/**
 * Compute the excludable rate (calls that COULD be excluded)
 * @param calls Array of CallRecords
 * @returns Excludable rate as fraction (0-1)
 */
export function computeExcludableRate(calls: CallRecord[]): number {
  if (!calls.length) return 0;
  const excludable = calls.filter((c) => c.isExcludable).length;
  return excludable / calls.length;
}

// ============================================================================
// RAW COMPLIANCE CURVE vs TIME
// ============================================================================

/**
 * Build raw compliance curve data points for graphing
 * @param calls Array of CallRecords
 * @param maxT Maximum threshold to calculate (minutes)
 * @param step Step size in minutes (default 0.5)
 * @returns Array of CompliancePoints for the curve
 */
export function buildRawComplianceCurve(
  calls: CallRecord[],
  maxT: number,
  step: number = 0.5
): CompliancePoint[] {
  const points: CompliancePoint[] = [];
  for (let T = 0; T <= maxT; T += step) {
    const pct = computeRawCompliance(calls, T);
    points.push({ T: Number(T.toFixed(2)), pct });
  }
  return points;
}

// ============================================================================
// CONTRACT COMPLIANCE CURVES (with exclusions)
// ============================================================================

/**
 * Build contract compliance curve from raw curve using exclusion rate
 *
 * Formula: Contract(T) ≈ Raw(T) / (1 − E)
 * Where E is the exclusion rate
 *
 * @param rawCurve The raw compliance curve points
 * @param exclusionRate Exclusion rate as fraction (0-1)
 * @returns Contract compliance curve points
 */
export function buildContractComplianceCurve(
  rawCurve: CompliancePoint[],
  exclusionRate: number
): CompliancePoint[] {
  return rawCurve.map((p) => {
    const denom = 1 - exclusionRate;
    const pct = denom <= 0 ? 1 : Math.min(1, p.pct / denom);
    return { T: p.T, pct };
  });
}

/**
 * Build all three compliance curves at once
 * @param calls Array of CallRecords
 * @param maxT Maximum threshold (minutes)
 * @param histExclusionRate Historical exclusion rate
 * @param customExclusionRate Optional custom exclusion rate
 * @param step Step size (default 0.5)
 */
export function buildAllComplianceCurves(
  calls: CallRecord[],
  maxT: number,
  histExclusionRate: number,
  customExclusionRate?: number,
  step: number = 0.5
): {
  rawCurve: CompliancePoint[];
  histContractCurve: CompliancePoint[];
  customContractCurve?: CompliancePoint[];
} {
  const rawCurve = buildRawComplianceCurve(calls, maxT, step);
  const histContractCurve = buildContractComplianceCurve(rawCurve, histExclusionRate);
  const customContractCurve = customExclusionRate !== undefined
    ? buildContractComplianceCurve(rawCurve, customExclusionRate)
    : undefined;

  return { rawCurve, histContractCurve, customContractCurve };
}

// ============================================================================
// REQUIRED TIME TO HIT TARGET PERCENTAGES
// ============================================================================

/**
 * Find the minimum T where compliance >= target
 * @param curve Compliance curve points
 * @param targetPct Target percentage as fraction (0-1)
 * @returns Time in minutes, or null if target not achievable
 */
export function findTimeForTarget(
  curve: CompliancePoint[],
  targetPct: number
): number | null {
  for (const p of curve) {
    if (p.pct >= targetPct) return p.T;
  }
  return null;
}

/**
 * Compute required times for standard target percentages
 * @param rawCurve Raw compliance curve
 * @param histContractCurve Historical contract curve
 * @param customContractCurve Optional custom contract curve
 * @returns Array of ThresholdResults for each target
 */
export function computeRequiredTimes(
  rawCurve: CompliancePoint[],
  histContractCurve: CompliancePoint[],
  customContractCurve?: CompliancePoint[]
): ThresholdResult[] {
  const targets = [0.7, 0.85, 0.9, 0.95];

  return targets.map((target) => {
    const timeRaw = findTimeForTarget(rawCurve, target);
    const timeHist = findTimeForTarget(histContractCurve, target);
    const timeCustom = customContractCurve
      ? findTimeForTarget(customContractCurve, target)
      : null;

    return {
      targetPct: target,
      timeRaw,
      timeContractHist: timeHist,
      timeContractCustom: timeCustom ?? null,
    };
  });
}

/**
 * Get compliance at a specific threshold for all curve types
 */
export function getComplianceAtThreshold(
  rawCurve: CompliancePoint[],
  histContractCurve: CompliancePoint[],
  T: number,
  customContractCurve?: CompliancePoint[]
): {
  raw: number;
  histContract: number;
  customContract?: number;
} {
  const findClosest = (curve: CompliancePoint[], target: number): number => {
    let closest = curve[0];
    for (const p of curve) {
      if (Math.abs(p.T - target) < Math.abs(closest.T - target)) {
        closest = p;
      }
    }
    return closest?.pct ?? 0;
  };

  return {
    raw: findClosest(rawCurve, T),
    histContract: findClosest(histContractCurve, T),
    customContract: customContractCurve ? findClosest(customContractCurve, T) : undefined,
  };
}

// ============================================================================
// EXPECTED COMPLIANCE ACROSS COVERAGE LEVELS
// ============================================================================

/**
 * Build expected raw compliance curve weighted by time spent at each coverage level
 *
 * This allows analysis like:
 * "If we spend 30% of time at Level 2 and 70% at Level 3, what's expected compliance?"
 *
 * @param perLevelCurves Compliance curves for each coverage level
 * @param levelShares Time share fractions for each level
 * @param maxT Maximum threshold (minutes)
 * @param step Step size (default 0.5)
 * @returns Weighted expected compliance curve
 */
export function buildExpectedRawComplianceCurve(
  perLevelCurves: PerLevelCurves,
  levelShares: LevelTimeShare[],
  maxT: number,
  step: number = 0.5
): CompliancePoint[] {
  const points: CompliancePoint[] = [];

  for (let T = 0; T <= maxT; T += step) {
    let expected = 0;

    for (const share of levelShares) {
      const curve = perLevelCurves[share.levelIndex];
      if (!curve || !curve.length) continue;

      // Find closest point in this level's curve
      let closest = curve[0];
      for (const p of curve) {
        if (Math.abs(p.T - T) < Math.abs(closest.T - T)) {
          closest = p;
        }
      }

      expected += share.fractionOfTime * closest.pct;
    }

    points.push({ T: Number(T.toFixed(2)), pct: Math.min(1, expected) });
  }

  return points;
}

// ============================================================================
// PLAIN-ENGLISH SUMMARY GENERATORS
// ============================================================================

/**
 * Generate plain-English compliance summary for non-technical users
 */
export function generateComplianceSummary(
  rawCurve: CompliancePoint[],
  histContractCurve: CompliancePoint[],
  histExclusionRate: number,
  juryThresholdMin: number,
  juryTargetPct: number,
  customExclusionRate?: number,
  customContractCurve?: CompliancePoint[]
): string[] {
  const summaries: string[] = [];

  // Get compliance at jury threshold
  const atThreshold = getComplianceAtThreshold(
    rawCurve,
    histContractCurve,
    juryThresholdMin,
    customContractCurve
  );

  // Raw compliance at threshold
  summaries.push(
    `At ${juryThresholdMin} minutes, raw compliance is ${(atThreshold.raw * 100).toFixed(0)}%.`
  );

  // Historical contract compliance
  if (histExclusionRate > 0) {
    summaries.push(
      `With a historical exclusion rate of ${(histExclusionRate * 100).toFixed(0)}%, ` +
      `contract compliance at ${juryThresholdMin} minutes is about ${(atThreshold.histContract * 100).toFixed(0)}%.`
    );
  }

  // Time needed for target without exclusions
  const timeForTargetRaw = findTimeForTarget(rawCurve, juryTargetPct);
  if (timeForTargetRaw !== null) {
    summaries.push(
      `To hit ${(juryTargetPct * 100).toFixed(0)}% without exclusions, ` +
      `the zone would need a time standard of about ${timeForTargetRaw.toFixed(1)} minutes.`
    );
  } else {
    summaries.push(
      `${(juryTargetPct * 100).toFixed(0)}% compliance is not achievable without exclusions within the analyzed time range.`
    );
  }

  // Time needed with historical exclusions
  const timeForTargetHist = findTimeForTarget(histContractCurve, juryTargetPct);
  if (timeForTargetHist !== null && histExclusionRate > 0) {
    summaries.push(
      `With historical exclusions (${(histExclusionRate * 100).toFixed(0)}%), ` +
      `${(juryTargetPct * 100).toFixed(0)}% contract compliance requires about ${timeForTargetHist.toFixed(1)} minutes.`
    );
  }

  // Custom exclusion rate analysis
  if (customExclusionRate !== undefined && customContractCurve) {
    const timeForTargetCustom = findTimeForTarget(customContractCurve, juryTargetPct);
    if (timeForTargetCustom !== null) {
      summaries.push(
        `With a custom exclusion rate of ${(customExclusionRate * 100).toFixed(0)}%, ` +
        `we would need about ${timeForTargetCustom.toFixed(1)} minutes to reach ${(juryTargetPct * 100).toFixed(0)}%.`
      );
    }
  }

  return summaries;
}

// ============================================================================
// FEASIBILITY ANALYSIS
// ============================================================================

export type FeasibilityResult = {
  targetPct: number;
  targetTime: number;
  status: 'achievable' | 'challenging' | 'not_achievable';
  currentCompliance: number;
  gapPct: number;
  recommendation: string;
};

/**
 * Analyze feasibility of meeting a specific target
 */
export function analyzeFeasibility(
  rawCurve: CompliancePoint[],
  histContractCurve: CompliancePoint[],
  targetPct: number,
  targetTime: number,
  histExclusionRate: number
): FeasibilityResult {
  const atThreshold = getComplianceAtThreshold(rawCurve, histContractCurve, targetTime);
  const currentCompliance = atThreshold.histContract;
  const gapPct = targetPct - currentCompliance;

  let status: FeasibilityResult['status'];
  let recommendation: string;

  if (currentCompliance >= targetPct) {
    status = 'achievable';
    recommendation = `Current configuration meets the ${(targetPct * 100).toFixed(0)}% target at ${targetTime} minutes.`;
  } else if (gapPct <= 0.1) {
    status = 'challenging';
    const timeNeeded = findTimeForTarget(histContractCurve, targetPct);
    recommendation = timeNeeded
      ? `Close to target. Consider extending threshold to ${timeNeeded.toFixed(1)} min or improving exclusion approval.`
      : `Gap of ${(gapPct * 100).toFixed(0)}%. May need operational improvements.`;
  } else {
    status = 'not_achievable';
    const additionalExclusionNeeded = 1 - (atThreshold.raw / targetPct);
    recommendation = `Significant gap of ${(gapPct * 100).toFixed(0)}%. Would need ~${(additionalExclusionNeeded * 100).toFixed(0)}% total exclusion rate or major operational changes.`;
  }

  return {
    targetPct,
    targetTime,
    status,
    currentCompliance,
    gapPct,
    recommendation,
  };
}

