import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker opts into standalone output; Vercel and next start use the default build.
  output: process.env.NEXT_OUTPUT_STANDALONE === "true" ? "standalone" : undefined,
  poweredByHeader: false,
};

export default nextConfig;
