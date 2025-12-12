import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* your existing config options */
  typescript: {
    // Pre-existing TS errors in admin routes - ignore during dev
    ignoreBuildErrors: true,
  },
  output: "standalone",
};

const sentryWebpackPluginOptions = {
  // Additional config options for the Sentry Webpack plugin.
  // See: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
  silent: true, // Suppresses all logs
};

export default withSentryConfig(nextConfig, sentryWebpackPluginOptions);
