// sentry.client.config.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || "https://7179718dda7eb08c628607040a1e523f@o4510485628715008.ingest.us.sentry.io/4510485726560256",

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
    /^https:\/\/acadian\.cadalytix\.com/,
  ],

  // Session Replay
  replaysSessionSampleRate: 0.1, // 10% of all sessions
  replaysOnErrorSampleRate: 1.0, // 100% when there was an error

  // Send console logs to Sentry
  enableLogs: true,
});
