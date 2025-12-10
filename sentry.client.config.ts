// sentry.client.config.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // SECURITY: Do not send PII (emails, user details) by default
  sendDefaultPii: false,

  // Integrations: Performance (Tracing) + Session Replay
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],

  // Tracing: 10% in production, 100% in dev
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

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
