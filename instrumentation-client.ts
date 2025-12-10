// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const isProduction = process.env.NODE_ENV === 'production';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Add optional integrations for additional features
  integrations: [
    Sentry.replayIntegration(),
    Sentry.browserTracingIntegration(),
  ],

  // SECURITY: Never send PII (emails, user details) to Sentry
  sendDefaultPii: false,

  // Performance: Reduce sampling in production (10% in prod, 100% in dev)
  tracesSampleRate: isProduction ? 0.1 : 1.0,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Define how likely Replay events are sampled.
  replaysSessionSampleRate: isProduction ? 0.1 : 0.5,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  // Scrub sensitive data from events before sending
  beforeSend(event) {
    // Scrub email addresses from event data
    if (event.user?.email) {
      event.user.email = undefined;
    }
    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;