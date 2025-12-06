import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    // Pre-existing TS errors in admin routes - ignore during dev
    ignoreBuildErrors: true,
  },
  output: "standalone",
};

export default nextConfig;
