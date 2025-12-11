import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  typescript: {
    // SECURITY: Never ignore TS errors in production builds
    ignoreBuildErrors: false,
  },

  output: "standalone",

  // Security headers for all routes
  async headers() {
    return [
      {
        // Apply to all routes
        source: "/:path*",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            // CSP: Allow self, Vercel, Google (for OAuth), Sentry, Leaflet tiles
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live https://*.sentry.io",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://unpkg.com",
              "connect-src 'self' https://*.sentry.io https://accounts.google.com https://api.openrouteservice.org https://api.geoapify.com https://vercel.live wss://vercel.live",
              "frame-src 'self' https://accounts.google.com",
              "frame-ancestors 'none'",
              "form-action 'self'",
              "base-uri 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

const sentryWebpackPluginOptions = {
  // Additional config options for the Sentry Webpack plugin.
  // See: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
  silent: true, // Suppresses all logs
};

export default withSentryConfig(nextConfig, sentryWebpackPluginOptions);
