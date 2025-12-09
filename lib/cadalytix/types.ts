/**
 * CADalytix Regional Scoring System
 *
 * Proprietary performance index designed by CADalytix to measure regional
 * operational readiness, compliance health, and key opportunities for improvement.
 */

// ============================================================================
// CATEGORY TYPES
// ============================================================================

export type CadalytixCategoryKey =
  | 'compliance'
  | 'avgResponseTime'
  | 'transportRatio'
  | 'consistency'
  | 'exclusions';

export interface CadalytixCategoryBreakdown {
  key: CadalytixCategoryKey;
  label: string;
  score: number; // 0–100 for this category
  impact: 'positive' | 'neutral' | 'negative';
  weight: number; // relative importance (e.g., 0.4 for compliance)
  summary: string; // human explanation, no raw math
  details: string; // slightly more detail, still no formulas here
}

// ============================================================================
// TIER DEFINITIONS
// ============================================================================

export type CadalytixTier = 'Platinum' | 'Green' | 'Yellow' | 'Red';

export const TIER_THRESHOLDS = {
  Platinum: 90, // 90+ = Platinum
  Green: 80, // 80-89 = Green
  Yellow: 70, // 70-79 = Yellow
  Red: 0, // Below 70 = Red
} as const;

export const TIER_COLORS = {
  Platinum: {
    bg: 'bg-gradient-to-r from-cyan-500 to-blue-600',
    text: 'text-cyan-400',
    border: 'border-cyan-500',
    bgSolid: 'bg-cyan-600',
  },
  Green: {
    bg: 'bg-emerald-600',
    text: 'text-emerald-400',
    border: 'border-emerald-500',
    bgSolid: 'bg-emerald-600',
  },
  Yellow: {
    bg: 'bg-amber-500',
    text: 'text-amber-400',
    border: 'border-amber-500',
    bgSolid: 'bg-amber-500',
  },
  Red: {
    bg: 'bg-red-600',
    text: 'text-red-400',
    border: 'border-red-500',
    bgSolid: 'bg-red-600',
  },
} as const;

// ============================================================================
// REGIONAL SCORE
// ============================================================================

export interface CadalytixRegionalScore {
  regionId: number;
  regionName: string;
  overallScore: number; // 0–100
  tier: CadalytixTier;
  categories: CadalytixCategoryBreakdown[];
  worstCategoryKey: CadalytixCategoryKey;
  lastUpdated: string; // ISO timestamp
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getTierFromScore(score: number): CadalytixTier {
  if (score >= TIER_THRESHOLDS.Platinum) return 'Platinum';
  if (score >= TIER_THRESHOLDS.Green) return 'Green';
  if (score >= TIER_THRESHOLDS.Yellow) return 'Yellow';
  return 'Red';
}

export function getTierColors(tier: CadalytixTier) {
  return TIER_COLORS[tier];
}

// ============================================================================
// CATEGORY LABELS (for display)
// ============================================================================

export const CATEGORY_LABELS: Record<CadalytixCategoryKey, string> = {
  compliance: 'Compliance',
  avgResponseTime: 'Average Response Time',
  transportRatio: 'Transports vs Total Calls',
  consistency: 'Consistency',
  exclusions: 'Exclusions / Auto-Exclusions',
};
