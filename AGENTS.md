1. Purpose of This Document

This file tells AI agents and coding assistants (Cursor, Cody, etc.) exactly:

What this project is

What we are trying to achieve

What standards are non-negotiable

How you should and should not operate in this codebase

You must treat this project as a live, mission-critical EMS operations & compliance platform. Any change you propose must respect that.

2. High-Level Project Overview

This codebase powers an EMS (Emergency Medical Services) operational analytics and compliance platform. It is designed to support:

Live and historical call data from a real dispatch communication center.

Compliance analytics (e.g., response time compliance, exclusions, coverage).

Operational dashboards (regions, parishes, units, zones, etc.).

Audit-proof reporting suitable for legal, contractual, and regulatory review.

The system must be ready to plug into one or more upstream data sources:

Live CAD / Dispatch SQL Server in the comm center

SQL Server accessed or mirrored via MicroStrategy

Intermediate ingestion approaches:

CSV/flat file uploads exported from MicroStrategy/other BI tools

ETL jobs that write into our Neon/Postgres database

Future streaming/live event feeds

You must design and refactor code so that the method of ingestion is abstracted behind clean interfaces, and the rest of the system can remain stable even if the upstream source changes.

3. Core Objectives

All agents working in this codebase must optimize for:

Reliability & Correctness

No regressions.

No silent failures.

No best-guess math: calculations must be precise, consistent, and auditable.

Performance & Scalability

Efficient queries, proper indexing, and minimized over-fetching.

Code structured for future growth without exponential complexity.

Auditability & Traceability

Every transformation of call/compliance data should be explainable.

Logging and data lineage should be clear enough to withstand legal/contractual audit.

Security & Data Protection

Secure handling of credentials, secrets, and PHI-adjacent data.

Hardened against common web, auth, and SQL vulnerabilities.

UI/UX Quality

Smooth, predictable flows.

No jarring state changes, broken navigation, or incomplete loading states.

Dashboards and reports must be intuitively understandable to non-technical users.

Maintainability & Cleanliness

Well-structured, readable, documented code.

Minimal duplication, clear abstractions, and consistent patterns.

4. Tech Context & Architecture Assumptions

You should assume:

Frontend: Next.js 14 (App Router) or similar modern React stack

Backend / API: Next.js API routes or server actions

Database (current): Postgres (NeonDB) with potential PostGIS usage

Future Integration: Direct SQL Server connections (dispatch CAD / MicroStrategy)

Deployment Target: Production on Vercel, with strict requirements:

No obvious errors during build.

No critical or medium security warnings if reasonably avoidable.

Predictable cold start behavior and consistent performance.

When interacting with the DB:

Use parameterized queries (no string interpolation that risks SQL injection).

Prefer well-typed helpers and central DB access utilities over ad-hoc queries.

Keep schema changes migrated and versioned, not ad hoc.

5. Non-Negotiable Quality Standards
5.1 Code Quality

Prefer TypeScript with strict typing where possible.

No unused imports, no dead code left behind without a clear reason.

Follow existing code style & patterns already present in the repo:

Do not introduce an entirely new style unless explicitly requested.

Avoid large, purely stylistic diffs that obscure functional changes.

When refactoring or adding functionality:

Small, focused, incremental changes > massive changes.

Each change should have:

A clear purpose.

A clear explanation.

A clear, reviewable diff.

5.2 Math, Statistics, & Compliance Logic

This project is about EMS performance and contract compliance. That means:

Time calculations (response times, thresholds, compliance %) must be:

Correct (no off-by-one, no timezone drift, no naive rounding).

Consistent (same formula everywhere).

Transparent (easy to trace where each value comes from).

When modifying or adding calculations:

Explicitly document:

Input fields used (e.g., dispatch time, enroute time, on-scene time).

Exact formulas.

Rounding/aggregation rules.

Centralize math logic in well-named utilities or domain modules, not scattered.

Never “simplify” a compliance rule without explicit instruction; these rules often map to legal/contract terms.

6. Security Requirements

Agents must treat security as first-class, not as an afterthought:

Never hard-code secrets (API keys, DB strings, etc.).

Always use environment variables and secure configuration patterns.

Ensure parameterized queries for all DB access.

Minimize exposed API surface area:

Authn/authz checks should be obvious and centralized when possible.

Be cautious with logging:

Do not log sensitive data.

Keep logs meaningful but sanitised.

Consider RBAC and least privilege:

When adding new features or admin tools, respect role boundaries where defined.

If you see obvious security risks, call them out in your explanation before coding and propose a mitigation plan.

7. Performance & Reliability Expectations

Queries must be optimized:

Avoid N+1 patterns.

Add or leverage indexes when beneficial (and safe).

Use filters and pagination for large datasets.

Frontend should:

Avoid unnecessary re-renders.

Use Suspense/loading states where appropriate.

Handle error states gracefully (with visible user feedback and logging).

Never introduce complexity that might cause:

Random timeouts.

Excessive CPU/memory usage.

Unbounded data loading into the browser.

8. Data Ingestion & Integration Guidance

The system must anticipate multiple ingestion modes:

Live ingestion from a dispatch CAD SQL Server

Ingestion from a SQL Server used by MicroStrategy

CSV/flat file uploads or batching into Postgres

Agents should:

Introduce or maintain clear interfaces between:

Ingestion layer (how raw data is fetched/received).

Transformation layer (cleaning, normalization, auto-exclusions, enrichment).

Storage & analytics layer (Postgres/Neon, metrics, dashboards).

Do not tightly couple UI components directly to raw ingestion sources.

Where you create new modules or refactors:

Prefer patterns like:

lib/ingestion/...

lib/compliance/...

lib/stats/...

lib/db/...

Provide configuration hooks to switch data sources without rewriting everything.

9. Agent Operating Rules
9.1 Before Making Changes

For any non-trivial request, you must:

Index & Understand

Scan relevant directories (app/, lib/, types/, db/, etc.).

Identify how the feature currently works (or if it exists).

Build a mental model of:

Core domain entities (calls, parishes, regions, zones, assets, etc.).

Existing helpers for stats/compliance/DB.

Summarize Your Understanding

In your response, briefly explain:

What pieces of the codebase relate to the request.

How they currently work.

Any assumptions you are making.

Propose a Plan FIRST

Explain the steps you intend to take.

Specify which files you will touch.

Justify why this approach is safe and aligned with project goals.

Only after this explanation and plan should you start suggesting diffs/edits.

9.2 While Making Changes

Work in small, reviewable chunks.

For each chunk:

Show before/after or a clear diff.

Explain:

What changed.

Why it changed.

How it improves correctness/performance/clarity.

Keep the codebase buildable and deployable at each logical step whenever possible:

No half-wired refactors that leave types or imports broken.

No untested migrations.

9.3 After Making Changes

For every substantial change:

Describe how to verify it locally (tests, pages, routes).

Call out any follow-up work that should be done later.

If you introduced new configuration/env requirements, specify them clearly.

10. Things Agents Must NOT Do

Do NOT overhaul the entire codebase in a single pass.

No “mass refactor everything” unless explicitly requested and carefully scoped.

Do NOT:

Change external interfaces (APIs, DB schemas) silently.

Remove or rename tables/columns without an explicit migration strategy.

Introduce experimental technologies or massive dependency changes casually.

Do NOT:

Introduce breaking changes to critical paths (ingestion, reporting, dashboard) without:

A clear migration/rollback story.

Strong justification.

If a large refactor would be beneficial, propose it as a multi-phase plan and take only the first safe step unless specifically asked for full execution.

11. Documentation Expectations

Whenever you introduce or significantly modify functionality:

Update or create relevant docs:

Inline code comments for complex logic (especially math/compliance).

Docstrings or utility descriptions for shared helpers.

High-level docs (README, docs/, etc.) when behavior or flows change.

Explain how the new or changed piece fits into:

The ingestion → transformation → analytics pipeline.

The overall EMS compliance & operations story.

12. Example Agent Workflow for a New Task

When the user asks:

“Implement a new auto-exclusion strategy for peak call load and wire it into the compliance dashboards.”

You should:

Scan & Understand

Find existing auto-exclusion strategies (e.g., lib/autoExclusions/...).

Identify:

Data sources (calls table, exclusion logs).

Current strategy patterns (WEATHER, CAD_OUTAGE, etc.).

How exclusions are surfaced to the UI.

Summarize Current State

Briefly describe:

Where auto-exclusions live.

How they’re invoked.

How they’re stored and displayed.

Propose a Plan

Define:

New strategy name & module.

Inputs (call timestamps, geography, concurrency thresholds).

Outputs (flags, explanations, logs).

Specify files to change and why.

Implement in Small Steps

Add a new strategy module.

Wire it into the strategy registry.

Update DB or logging usage if needed.

Extend tests or add new tests.

Update UI to show this exclusion clearly.

Explain Verification

Detail how to:

Run any tests.

Manually verify via the UI or a specific route.

Confirm DB entries/logs.

13. Final Guiding Principle

Treat this project as if it will be:

Handed to an enterprise IT security team

Deployed to a production EMS environment

Used to defend performance in front of contract auditors

Every change should move us toward:

Cleaner architecture

Stronger reliability

Better security

Faster and clearer insight for dispatch and operations teams

If a proposed change does not clearly support these goals, do not make it without explicit instruction.