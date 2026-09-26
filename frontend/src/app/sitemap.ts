import type { MetadataRoute } from "next";
import { getCatalogEntries, getCatalogPeople } from "@/lib/api/catalog";
import { getArticles } from "@/lib/api/articles";

const PAGE_SIZE = 100;
const SITEMAP_SIZE = 10_000;
const PAGES_PER_SITEMAP = SITEMAP_SIZE / PAGE_SIZE;
type Kind = "midis" | "people" | "articles";

export async function generateSitemaps() {
  const counts = await Promise.allSettled([
    getCatalogEntries({ page: 1, pageSize: 1, sort: "updated" }),
    getCatalogPeople({ page: 1, pageSize: 1 }),
    getArticles(1, 1),
  ]);
  const kinds: Kind[] = ["midis", "people", "articles"];
  return [{ id: "static" }, ...kinds.flatMap((kind, index) => {
    const result = counts[index];
    const value = result.status === "fulfilled" ? result.value as { total?: number; pagination?: { total?: number } } | undefined : undefined;
    const total = typeof value?.total === "number" ? value.total : value?.pagination?.total ?? 0;
    return Array.from({ length: Math.max(1, Math.ceil(total / SITEMAP_SIZE)) }, (_, shard) => ({ id: `${kind}-${shard}` }));
  })];
}

export default async function sitemap({ id }: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const shardId = await id;
  const base = process.env.ADMIN_ORIGIN?.replace(/\/$/, "") || "";
  if (!/^https?:\/\//.test(base)) return [];
  if (shardId === "static") return ["/", "/midis", "/people", "/articles", "/recovery", "/map", "/about", "/sponsor", "/changelog"]
    .map(path => ({ url: `${base}${path}`, changeFrequency: path === "/" ? "daily" as const : "weekly" as const, priority: path === "/" ? 1 : 0.7 }));
  const match = shardId.match(/^(midis|people|articles)-(\d+)$/);
  if (!match) return [];
  const kind = match[1] as Kind;
  const shard = Number(match[2]);
  if (!Number.isSafeInteger(shard) || shard > 100_000) return [];
  const firstPage = shard * PAGES_PER_SITEMAP + 1;
  const urls: MetadataRoute.Sitemap = [];
  try {
    for (let offset = 0; offset < PAGES_PER_SITEMAP; offset += 4) {
      const pages = await Promise.all(Array.from({ length: Math.min(4, PAGES_PER_SITEMAP - offset) }, (_, index) => {
        const page = firstPage + offset + index;
        return kind === "midis" ? getCatalogEntries({ page, pageSize: PAGE_SIZE, sort: "updated" })
          : kind === "people" ? getCatalogPeople({ page, pageSize: PAGE_SIZE }) : getArticles(page, PAGE_SIZE);
      }));
      for (const result of pages) {
        if (kind === "midis") {
          const page = result as Awaited<ReturnType<typeof getCatalogEntries>>;
          urls.push(...page.data.map(entry => ({ url: `${base}/midis/${encodeURIComponent(entry.slug)}`, lastModified: new Date(entry.updated_at), changeFrequency: "monthly" as const, priority: 0.8 })));
        } else if (kind === "people") {
          const page = result as Awaited<ReturnType<typeof getCatalogPeople>>;
          urls.push(...page.data.map(person => ({ url: `${base}/people/${encodeURIComponent(person.public_id)}`, lastModified: new Date(person.updated_at), changeFrequency: "monthly" as const, priority: 0.6 })));
        } else {
          const page = result as Awaited<ReturnType<typeof getArticles>>;
          urls.push(...page.data.map(article => ({ url: `${base}/articles/${article.id}`, lastModified: new Date(article.updated_at), changeFrequency: "monthly" as const, priority: 0.6 })));
        }
      }
      const last = pages.at(-1)!;
      const total = kind === "articles" ? (last as Awaited<ReturnType<typeof getArticles>>).total : (last as Awaited<ReturnType<typeof getCatalogEntries>>).pagination.total;
      if ((firstPage + offset + pages.length - 1) * PAGE_SIZE >= total) break;
    }
  } catch { /* Return already fetched URLs if one section of the API is unavailable. */ }
  return urls;
}
