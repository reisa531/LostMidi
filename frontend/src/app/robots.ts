import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.ADMIN_ORIGIN?.replace(/\/$/, "") || "";
  return { rules: [{ userAgent: "*", allow: ["/", "/midis", "/people", "/recovery", "/map", "/about"], disallow: ["/admin", "/install", "/api/"] }], sitemap: base ? `${base}/sitemap.xml` : undefined };
}
