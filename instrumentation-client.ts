// sentry.client.config.ts
// Single Sentry init for the browser (NO Session Replay here)

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  // Prefer env; fall back to your hardcoded DSN as a default
  dsn:
    process.env.NEXT_PUBLIC_SENTRY_DSN ||
    "https://7179718dda7eb08c628607040a1e523f@o4510485628715008.ingest.us.sentry.io/4510485726560256",

  // You’re doing a compliance/security-focused app; OK to keep PII on for now
  // If IT later wants full anonymization, flip this to false.
  sendDefaultPii: true,

  // Client-side performance tracing
  integrations: [
    Sentry.browserTracingIntegration(),
    // ❌ DO NOT add Sentry.replayIntegration() here
  ],

  // High in dev, lower in prod
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,

  // Only propagate tracing to your own domains / APIs
  tracePropagationTargets: [
    "localhost",
    /^https:\/\/cadalytix\.com\//,
    /^https:\/\/.*\.cadalytix\.com\//,
  ],

  // Only log Sentry debug info in dev
  enableLogs: process.env.NODE_ENV === "development",
});

// Optional helper if you actually use it in routing hooks somewhere
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
