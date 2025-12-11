// sentry.client.config.ts
// Single, clean Sentry init for the browser (NO Session Replay for now)

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  // Use env if set, fall back to the DSN you already had
  dsn:
    process.env.NEXT_PUBLIC_SENTRY_DSN ||
    "https://7179718dda7eb08c628607040a1e523f@o4510485628715008.ingest.us.sentry.io/4510485726560256",

  // PII: OK for now; you can set to false later if IT wants no default PII
  sendDefaultPii: true,

  // Integrations: keep performance tracing, REMOVE Replay
  integrations: [
    Sentry.browserTracingIntegration(),
    // ❌ DO NOT add Sentry.replayIntegration() here
  ],

  // Tracing: full in dev, lower in prod if you want
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,

  // Where to propagate tracing headers
  tracePropagationTargets: [
    "localhost",
    /^https:\/\/cadalytix\.com\//,
    /^https:\/\/.*\.cadalytix\.com\//,
  ],

  // Only log Sentry debug info in dev
  enableLogs: process.env.NODE_ENV === "development",
});

// Optional, if you're using it elsewhere
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
