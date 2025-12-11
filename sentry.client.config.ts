// sentry.client.config.ts
// Client-side Sentry init for Next.js (no Replay for now)

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN,

  // Adjust this for prod vs dev as you like
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,

  // Only log debug info locally
  debug: process.env.NODE_ENV === "development",

.
});
