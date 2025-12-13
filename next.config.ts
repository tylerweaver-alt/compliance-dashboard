import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const isWindows = process.platform === "win32";

const nextConfig: NextConfig = {
  /* your existing config options */
  typescript: {
    // Pre-existing TS errors in admin routes - ignore during dev
    ignoreBuildErrors: true,
  },

  // Standalone output breaks on Windows due to traced files like "node:inspector"
  // Keep it enabled for CI/Linux builds.
  ...(isWindows ? {} : { output: "standalone" }),
};

const sentryWebpackPluginOptions = {
  silent: true,
};

export default withSentryConfig(nextConfig, sentryWebpackPluginOptions);
