/**
 * CADalytix Regional Score Breakdown Page
 *
 * Displays the detailed CADalytix score breakdown for a specific region.
 * Analytics-focused UI with category cards and improvement recommendations.
 */

import Link from 'next/link';
import { getCadalytixScoreForRegion } from '@/lib/cadalytix';
import { query } from '@/lib/db';
import { CadalytixCategoryBreakdown, getTierColors, CATEGORY_LABELS } from '@/lib/cadalytix/types';

export const runtime = 'nodejs';

interface PageProps {
  params: Promise<{ regionId: string }>;
}

async function getRegionName(regionId: number): Promise<string> {
  const result = await query<{ name: string }>(`SELECT name FROM regions WHERE id = $1`, [
    regionId,
  ]);
  return result.rows[0]?.name || `Region ${regionId}`;
}

function CategoryCard({
  category,
  isWorst,
}: {
  category: CadalytixCategoryBreakdown;
  isWorst: boolean;
}) {
  const impactColors = {
    positive: 'text-emerald-400 border-emerald-500/30',
    neutral: 'text-slate-400 border-slate-600/30',
    negative: 'text-red-400 border-red-500/30',
  };

  return (
    <div
      className={`
      relative overflow-hidden rounded-xl border ${isWorst ? 'border-red-500/50' : 'border-slate-700/50'}
      bg-slate-900/80 backdrop-blur
    `}
    >
      {/* Grid background pattern */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,#1f2937_1px,transparent_0)] bg-[length:24px_24px] opacity-30" />

      <div className="relative p-5">
        {/* Header with score */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-200">{category.label}</h3>
            {isWorst && (
              <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                Needs Attention
              </span>
            )}
          </div>
          <div className="text-right">
            <span
              className={`text-3xl font-mono font-bold ${
                category.score >= 85
                  ? 'text-emerald-400'
                  : category.score >= 70
                    ? 'text-amber-400'
                    : 'text-red-400'
              }`}
            >
              {category.score}
            </span>
            <span className="text-slate-500 text-sm">/100</span>
          </div>
        </div>

        {/* Score bar */}
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-4">
          <div
            className={`h-full rounded-full transition-all ${
              category.score >= 85
                ? 'bg-emerald-500'
                : category.score >= 70
                  ? 'bg-amber-500'
                  : 'bg-red-500'
            }`}
            style={{ width: `${category.score}%` }}
          />
        </div>

        {/* Summary and details */}
        <p className={`text-sm font-medium mb-2 ${impactColors[category.impact].split(' ')[0]}`}>
          {category.summary}
        </p>
        <p className="text-sm text-slate-400 leading-relaxed">{category.details}</p>

        {/* Weight indicator */}
        <div className="mt-4 pt-3 border-t border-slate-700/50">
          <span className="text-xs text-slate-500">
            Weight: {Math.round(category.weight * 100)}% of overall score
          </span>
        </div>
      </div>
    </div>
  );
}

export default async function CadalytixScorePage({ params }: PageProps) {
  const { regionId } = await params;
  const numericRegionId = parseInt(regionId, 10);

  if (isNaN(numericRegionId)) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-red-400">Invalid region ID</p>
      </div>
    );
  }

  const regionName = await getRegionName(numericRegionId);
  const score = await getCadalytixScoreForRegion(numericRegionId, regionName);
  const tierColors = getTierColors(score.tier);
  const worstCategory = score.categories.find((c) => c.key === score.worstCategoryKey);

  return (
    <div className="cadalytix-page min-h-screen bg-slate-950">
      {/* Grid background */}
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_1px_1px,#1f2937_1px,transparent_0)] bg-[length:24px_24px] opacity-40 pointer-events-none z-0" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8 pb-16">
        {/* Header */}
        <header className="flex items-start justify-between mb-8">
          <div>
            <Link
              href="/AcadianDashboard"
              className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-200 text-sm mb-4 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold text-slate-100 mb-2">{score.regionName}</h1>
            <div className="flex items-center gap-4">
              <span className={`text-5xl font-mono font-bold ${tierColors.text}`}>
                {score.overallScore}
              </span>
              <div
                className={`px-3 py-1 rounded-full text-sm font-semibold ${tierColors.bgSolid} text-white`}
              >
                {score.tier}
              </div>
            </div>
          </div>

          {/* Info icon - links to formulas page */}
          <Link
            href={`/cadalytix/${regionId}/formulas`}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-600 transition-colors group"
            title="View CADalytix scoring formulas"
          >
            <svg
              className="w-5 h-5 text-slate-400 group-hover:text-sky-400 transition-colors"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </Link>
        </header>
        {/* Top Improvement Opportunity */}
        {worstCategory && (
          <div className="mb-8 p-4 rounded-xl bg-red-950/30 border border-red-500/30">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm text-red-300 font-medium">
                  Top Improvement Opportunity This Month
                </p>
                <p className="text-lg text-slate-100 font-semibold">
                  {CATEGORY_LABELS[worstCategory.key]}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Category Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {score.categories.map((category) => (
            <CategoryCard
              key={category.key}
              category={category}
              isWorst={category.key === score.worstCategoryKey}
            />
          ))}
        </div>

        {/* Footer */}
        <footer className="text-center text-sm text-slate-500 pt-4 border-t border-slate-800">
          <p>
            CADalytix Regional Performance Index • Last updated:{' '}
            {new Date(score.lastUpdated).toLocaleString()}
          </p>
          <p className="mt-1">
            <Link
              href={`/cadalytix/${regionId}/formulas`}
              className="text-sky-400 hover:text-sky-300 transition-colors"
            >
              View scoring methodology →
            </Link>
          </p>
        </footer>
      </div>
    </div>
  );
}
