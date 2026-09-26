import type { MetadataRoute } from "next";
import { generateSitemaps } from "./sitemap";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = process.env.ADMIN_ORIGIN?.replace(/\/$/, "") || "";
  const sitemaps = base ? await generateSitemaps() : [];
  return { rules: [{ userAgent: "*", allow: ["/", "/midis", "/people", "/recovery", "/map", "/about"], disallow: ["/admin", "/install", "/api/"] }], sitemap: sitemaps.map(({ id }) => `${base}/sitemap/${id}.xml`) };
}
