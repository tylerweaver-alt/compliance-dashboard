// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

// NOTE: Sentry client initialization has been moved to sentry.client.config.ts
// to avoid duplicate initialization issues with Session Replay.
// This file is kept for Next.js instrumentation hooks only.

import * as Sentry from "@sentry/nextjs";

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;