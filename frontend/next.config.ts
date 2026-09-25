import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker opts into standalone output; Vercel and next start use the default build.
  output: process.env.NEXT_OUTPUT_STANDALONE === "true" ? "standalone" : undefined,
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: "2mb" }, proxyClientMaxBodySize: 21_000_000, proxyTimeout: 120_000 },
  async rewrites() {
    const base = process.env.BACKEND_API_URL;
    if (!base) return [];
    const url = new URL(base);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash)
      throw new Error("Invalid BACKEND_API_URL");
    const backend = url.href.replace(/\/$/, "");
    // External rewrites avoid routing file bodies through a size-limited Vercel Function.
    return { beforeFiles: [
      { source: "/admin/file-transfer/create", destination: `${backend}/api/v1/admin/midis` },
      { source: "/admin/file-transfer/:id([1-9][0-9]*)/files", destination: `${backend}/api/v1/admin/midis/:id/files` },
      { source: "/api/midis/:slug/files/:id/download", destination: `${backend}/api/v1/midis/:slug/files/:id/download` },
    ] };
  },
};

export default nextConfig;
