import type { MetadataRoute } from "next";
import { getCatalogEntries, getCatalogPeople } from "@/lib/api/catalog";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.ADMIN_ORIGIN?.replace(/\/$/, "") || "";
  const now = new Date();
  const urls: MetadataRoute.Sitemap = ["/", "/midis", "/people", "/recovery", "/map", "/about"].map(path => ({ url: `${base}${path}`, lastModified: now, changeFrequency: path === "/" ? "daily" : "weekly", priority: path === "/" ? 1 : 0.7 }));
  try {
    const [entries, people] = await Promise.all([getCatalogEntries({ page: 1, pageSize: 100, sort: "updated" }), getCatalogPeople({ page: 1, pageSize: 100 })]);
    urls.push(...entries.data.map(entry => ({ url: `${base}/midis/${encodeURIComponent(entry.slug)}`, lastModified: new Date(entry.updated_at), changeFrequency: "monthly" as const, priority: 0.8 })));
    urls.push(...people.data.map(person => ({ url: `${base}/people/${encodeURIComponent(person.id)}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.6 })));
  } catch { /* Keep static URLs available while the API is unavailable. */ }
  return urls.filter(item => item.url.startsWith("http://") || item.url.startsWith("https://"));
}
