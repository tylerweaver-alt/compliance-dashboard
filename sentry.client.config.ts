// sentry.client.config.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN || "",

  // Only enable Sentry when DSN is configured
  enabled: !!process.env.SENTRY_DSN,

  // Client-side performance tracing
  tracesSampleRate: 0.1,

  // DO NOT configure Replay here to avoid multiple instances.
  // If you want Replay, put replayIntegration() in ONE place only
  // (recommended: instrumentation-client.ts) and keep it out of here.

  sendDefaultPii: false,

  environment:
    process.env.SENTRY_ENVIRONMENT ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV ||
    "development",
});
