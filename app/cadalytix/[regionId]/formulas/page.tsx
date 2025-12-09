/**
 * CADalytix Regional Scoring Model - Formulas Page
 *
 * Math/STEM styled page displaying proprietary CADalytix scoring formulas.
 * Uses monospace fonts and academic paper styling.
 */

import Link from 'next/link';

export const runtime = 'nodejs';

interface PageProps {
  params: Promise<{ regionId: string }>;
}

// Math-styled formula component
function Formula({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 p-4 bg-slate-900/80 border border-slate-700/50 rounded-lg overflow-x-auto">
      <code className="font-mono text-sky-300 text-lg whitespace-pre">{children}</code>
    </div>
  );
}

// Section component for formula groupings
function FormulaSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold text-slate-100 mb-4 pb-2 border-b border-slate-700">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function CadalytixFormulasPage({ params }: PageProps) {
  const { regionId } = await params;

  return (
    <div className="cadalytix-page min-h-screen bg-slate-950">
      {/* Subtle grid background */}
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_1px_1px,#1f2937_1px,transparent_0)] bg-[length:24px_24px] opacity-30 pointer-events-none z-0" />

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-10 pb-16">
        {/* Back navigation */}
        <Link
          href={`/cadalytix/${regionId}`}
          className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-200 text-sm mb-8 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          Back to Score Breakdown
        </Link>

        {/* Title */}
        <header className="mb-10">
          <h1 className="text-3xl font-bold text-slate-100 mb-4">
            CADalytix Regional Scoring Model
          </h1>
          <p className="text-slate-400 leading-relaxed text-lg">
            The CADalytix score is a proprietary performance index designed by CADalytix to measure
            regional operational readiness, compliance health, and key opportunities for
            improvement. These formulas are unique to CADalytix and form the foundational scoring
            framework used to evaluate all regions in a consistent, defensible way.
          </p>
        </header>

        {/* Formula Sections */}
        <div className="space-y-8">
          {/* 1. Parish Performance Score */}
          <FormulaSection title="1. Parish Performance Score (PPS)">
            <p className="text-slate-300 mb-4">
              Each parish receives a performance score from 0 to 100 that aggregates compliance,
              response-time performance, transport productivity, exclusion usage, and consistency
              into a single parish-level metric.
            </p>
            <Formula>PPS_p ∈ [0, 100]</Formula>
            <p className="text-slate-400 text-sm">
              Where <span className="font-mono text-sky-300">p</span> represents an individual
              parish within the region.
            </p>
          </FormulaSection>

          {/* 2. Parish Workload Weights */}
          <FormulaSection title="2. Parish Workload Weights">
            <p className="text-slate-300 mb-4">
              Each parish is weighted by its share of the region&apos;s call volume, so large
              parishes influence the regional score more than small ones.
            </p>
            <Formula>
              {`       C_p
w_p = ─────────
      Σ C_j
      j∈R`}
            </Formula>
            <p className="text-slate-400 text-sm">
              Where <span className="font-mono text-sky-300">C_p</span> is the call count for parish
              p, and the sum is over all parishes j in region R.
            </p>
          </FormulaSection>

          {/* 3. Base CRPI */}
          <FormulaSection title="3. Base CADalytix Regional Performance Index">
            <p className="text-slate-300 mb-4">
              The base regional score is a weighted average of normalized parish scores, resulting
              in a 0–1 base regional performance index.
            </p>
            <Formula>
              {`                    ⎛ PPS_p ⎞
BaseCRPI_R = Σ w_p ⋅ ⎜──────⎟
             p∈R     ⎝  100  ⎠`}
            </Formula>
          </FormulaSection>
          {/* 4. Red / Yellow Penalty */}
          <FormulaSection title="4. Red / Yellow Penalty">
            <p className="text-slate-300 mb-4">
              Underperforming parishes incur a penalty that drags down the regional score. Parishes
              are classified as Red (PPS &lt; 75) or Yellow (75 ≤ PPS &lt; 85).
            </p>

            <div className="mb-4">
              <p className="text-slate-400 text-sm mb-2 font-medium">Tier Conditions:</p>
              <Formula>
                {`Red Parish:    PPS_p < 75
Yellow Parish: 75 ≤ PPS_p < 85`}
              </Formula>
            </div>

            <div className="mb-4">
              <p className="text-slate-400 text-sm mb-2 font-medium">Weighted Fractions:</p>
              <Formula>
                {`r_red    = Σ w_p    (where PPS_p < 75)
           p∈R

r_yellow = Σ w_p    (where 75 ≤ PPS_p < 85)
           p∈R`}
              </Formula>
            </div>

            <div className="mb-4">
              <p className="text-slate-400 text-sm mb-2 font-medium">Penalty Calculation:</p>
              <Formula>{`Penalty_R = max(0.5, 1 - a⋅r_red - b⋅r_yellow)`}</Formula>
            </div>

            <p className="text-slate-400 text-sm">
              Where <span className="font-mono text-sky-300">a = 0.6</span> (red penalty constant)
              and <span className="font-mono text-sky-300">b = 0.2</span> (yellow penalty constant).
              The penalty is clamped to never drop the score below 50% of its base value.
            </p>
          </FormulaSection>

          {/* 5. Final CRPI */}
          <FormulaSection title="5. Final CADalytix Regional Score (CRPI)">
            <p className="text-slate-300 mb-4">
              The final CADalytix Regional Performance Index combines the base score with the
              penalty factor to produce a 0–100 score that is mapped into performance tiers.
            </p>
            <Formula>{`CRPI_R = 100 × BaseCRPI_R × Penalty_R`}</Formula>

            <div className="mt-6 p-4 bg-slate-900/50 rounded-lg border border-slate-700/50">
              <p className="text-slate-400 text-sm font-medium mb-2">Performance Tiers:</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600"></span>
                  <span className="text-slate-300">Platinum: CRPI ≥ 90</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                  <span className="text-slate-300">Green: 80 ≤ CRPI &lt; 90</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                  <span className="text-slate-300">Yellow: 70 ≤ CRPI &lt; 80</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-500"></span>
                  <span className="text-slate-300">Red: CRPI &lt; 70</span>
                </div>
              </div>
            </div>
          </FormulaSection>

          {/* Proprietary Notice */}
          <div className="mt-12 p-6 bg-slate-900/60 rounded-xl border border-slate-700/50">
            <p className="text-slate-400 text-sm leading-relaxed">
              <strong className="text-slate-300">Proprietary Notice:</strong> These formulas and the
              CADalytix Regional Performance Index are proprietary to CADalytix and are designed to
              provide a clear, objective view of regional performance across operations, compliance,
              and strategic improvement needs.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
