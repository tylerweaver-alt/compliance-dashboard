/**
 * CADalytix Score Fetching & Calculation
 *
 * This module provides functions to fetch and compute CADalytix scores
 * for regions. Currently uses mock data; will be wired to actual
 * scoring engine / database in production.
 */

import {
  CadalytixRegionalScore,
  CadalytixCategoryBreakdown,
  CadalytixCategoryKey,
  getTierFromScore,
} from './types';

// ============================================================================
// MOCK DATA GENERATOR
// ============================================================================

/**
 * Generate realistic mock data for a region's CADalytix score.
 * This demonstrates the UI and will be replaced with real calculations.
 */
function generateMockCategories(regionId: number): CadalytixCategoryBreakdown[] {
  // Seed-based variation per region for consistent mock data
  const seed = regionId * 7;
  const vary = (base: number, range: number) =>
    Math.min(100, Math.max(0, base + ((seed % range) - range / 2)));

  const categories: CadalytixCategoryBreakdown[] = [
    {
      key: 'compliance',
      label: 'Compliance',
      score: vary(82, 20),
      impact: 'neutral',
      weight: 0.35,
      summary: 'Overall compliance is meeting baseline expectations.',
      details:
        'This category considers your percentage of compliant calls versus the contracted target threshold. Focus on reducing response times in peak hours to improve further.',
    },
    {
      key: 'avgResponseTime',
      label: 'Average Response Time',
      score: vary(78, 25),
      impact: 'negative',
      weight: 0.25,
      summary: 'Response times are slightly above target.',
      details:
        'This category evaluates how your average response time compares to your contracted threshold. Recent data shows an uptick in rural area response times that is pulling this score down.',
    },
    {
      key: 'transportRatio',
      label: 'Transports vs Total Calls',
      score: vary(88, 15),
      impact: 'positive',
      weight: 0.15,
      summary: 'Strong transport productivity.',
      details:
        'This category measures the ratio of transports to total calls, indicating productive resource utilization. Your region is performing above average in this metric.',
    },
    {
      key: 'consistency',
      label: 'Consistency',
      score: vary(75, 30),
      impact: 'negative',
      weight: 0.15,
      summary: 'Performance varies significantly day-to-day.',
      details:
        'This category evaluates how consistent your daily performance has been. High variance suggests staffing or coverage gaps on certain days or shifts.',
    },
    {
      key: 'exclusions',
      label: 'Exclusions / Auto-Exclusions',
      score: vary(90, 12),
      impact: 'positive',
      weight: 0.1,
      summary: 'Exclusion usage is within expected norms.',
      details:
        'This category monitors the proportion of calls flagged for auto-exclusion. A balanced exclusion rate indicates proper use of weather, peak load, and CAD outage policies.',
    },
  ];

  // Determine impact based on score
  return categories.map((cat) => ({
    ...cat,
    impact: cat.score >= 85 ? 'positive' : cat.score >= 75 ? 'neutral' : 'negative',
  }));
}

// ============================================================================
// MAIN SCORE FETCHER
// ============================================================================

/**
 * Get the CADalytix score for a specific region.
 *
 * TODO: Wire to real scoring engine / DB.
 * For now, returns mock data that demonstrates the UI.
 */
export async function getCadalytixScoreForRegion(
  regionId: number,
  regionName?: string
): Promise<CadalytixRegionalScore> {
  // Simulate async DB/API call
  await new Promise((resolve) => setTimeout(resolve, 100));

  const categories = generateMockCategories(regionId);

  // Calculate weighted overall score
  const overallScore = Math.round(categories.reduce((sum, cat) => sum + cat.score * cat.weight, 0));

  // Find worst performing category
  const worstCategory = categories.reduce((worst, cat) => (cat.score < worst.score ? cat : worst));

  return {
    regionId,
    regionName: regionName || `Region ${regionId}`,
    overallScore,
    tier: getTierFromScore(overallScore),
    categories,
    worstCategoryKey: worstCategory.key,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Get CADalytix scores for all regions.
 * Used for VP+ level global view.
 *
 * TODO: Implement when global view is built.
 */
export async function getAllRegionScores(): Promise<CadalytixRegionalScore[]> {
  // Placeholder - will query all regions from DB
  throw new Error('Not implemented yet - see VP global view TODO');
}
