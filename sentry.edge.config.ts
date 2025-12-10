// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const isProduction = process.env.NODE_ENV === 'production';

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,

  // SECURITY: Never send PII (emails, user details) to Sentry
  sendDefaultPii: false,

  // Performance: Reduce sampling in production
  // Dev: 100%, Preview: 50%, Production: 10%
  tracesSampleRate: isProduction ? 0.1 : 1.0,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Scrub sensitive data from events before sending
  beforeSend(event) {
    // Scrub email addresses from event data
    if (event.user?.email) {
      // Hash email for correlation without exposing PII
      event.user.email = undefined;
    }
    return event;
  },
});
