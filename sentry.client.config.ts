// sentry.client.config.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // PII: you can switch this to false later if IT wants no default PII
  sendDefaultPii: true,

  // Integrations: Performance (Tracing) + Session Replay
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],

  // Tracing
  tracesSampleRate: 1.0, // 100% in dev; lower this (e.g. 0.1) in prod

  // Where to propagate tracing headers
  tracePropagationTargets: [
    "localhost",
    // TODO: replace with your real API / domain later
    /^https:\/\/yourserver\.io\/api/,
  ],

  // Session Replay
  replaysSessionSampleRate: 0.1, // 10% of all sessions
  replaysOnErrorSampleRate: 1.0, // 100% when there was an error

  // Send console logs to Sentry
  enableLogs: true,
});
