import type { MetadataRoute } from "next";
import { getCatalogEntries, getCatalogPeople } from "@/lib/api/catalog";

const PAGE_SIZE = 100;
const PAGE_BATCH = 4;

async function getAllCatalogEntries() {
  const first = await getCatalogEntries({ page: 1, pageSize: PAGE_SIZE, sort: "updated" });
  const pages = Math.ceil(first.pagination.total / PAGE_SIZE);
  const remaining = [];
  for (let start = 2; start <= pages; start += PAGE_BATCH)
    remaining.push(...await Promise.all(Array.from({ length: Math.min(PAGE_BATCH, pages - start + 1) }, (_, index) =>
      getCatalogEntries({ page: start + index, pageSize: PAGE_SIZE, sort: "updated" })
    )));
  return [first, ...remaining].flatMap(page => page.data);
}

async function getAllCatalogPeople() {
  const first = await getCatalogPeople({ page: 1, pageSize: PAGE_SIZE });
  const pages = Math.ceil(first.pagination.total / PAGE_SIZE);
  const remaining = [];
  for (let start = 2; start <= pages; start += PAGE_BATCH)
    remaining.push(...await Promise.all(Array.from({ length: Math.min(PAGE_BATCH, pages - start + 1) }, (_, index) =>
      getCatalogPeople({ page: start + index, pageSize: PAGE_SIZE })
    )));
  return [first, ...remaining].flatMap(page => page.data);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.ADMIN_ORIGIN?.replace(/\/$/, "") || "";
  const now = new Date();
  const urls: MetadataRoute.Sitemap = ["/", "/midis", "/people", "/recovery", "/map", "/about"].map(path => ({ url: `${base}${path}`, lastModified: now, changeFrequency: path === "/" ? "daily" : "weekly", priority: path === "/" ? 1 : 0.7 }));
  try {
    const [entries, people] = await Promise.all([getAllCatalogEntries(), getAllCatalogPeople()]);
    urls.push(...entries.map(entry => ({ url: `${base}/midis/${encodeURIComponent(entry.slug)}`, lastModified: new Date(entry.updated_at), changeFrequency: "monthly" as const, priority: 0.8 })));
    urls.push(...people.map(person => ({ url: `${base}/people/${encodeURIComponent(person.id)}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.6 })));
  } catch { /* Keep static URLs available while the API is unavailable. */ }
  return urls.filter(item => item.url.startsWith("http://") || item.url.startsWith("https://"));
}
