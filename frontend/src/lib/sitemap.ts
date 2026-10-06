import "server-only";
import { getArticles } from "@/lib/api/articles";
import { getCatalogEntries, getCatalogPeople } from "@/lib/api/catalog";
import { siteOrigin } from "@/lib/seo";

export const SITEMAP_PAGE_SIZE = 100;
/** URLs per shard file. */
export const SITEMAP_SHARD_SIZE = 10_000;
/** Above this URL count /sitemap.xml becomes an index of shards instead of one urlset. */
export const SITEMAP_INDEX_THRESHOLD = 45_000;
const PAGES_PER_SHARD = SITEMAP_SHARD_SIZE / SITEMAP_PAGE_SIZE;
const PAGES_PER_BATCH = 4;
const MAX_PAGES = 10_000;

export type SitemapUrl = { loc: string; lastModified?: string; changeFrequency: "daily" | "weekly" | "monthly"; priority: number };
type Kind = "midis" | "people" | "articles";
const KINDS: Kind[] = ["midis", "people", "articles"];
/** Public entry points; `/search` stays out of the sitemap by design. */
const STATIC_PATHS = ["/", "/midis", "/people", "/articles", "/recovery", "/map", "/about", "/sponsor", "/changelog"];

function isoDate(value: unknown): string | undefined {
  const date = new Date(typeof value === "string" ? value : "");
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function pageTotal(value: unknown): number {
  const typed = value as { total?: number; pagination?: { total?: number } } | undefined;
  const total = typeof typed?.total === "number" ? typed.total : typed?.pagination?.total;
  return typeof total === "number" && Number.isFinite(total) && total > 0 ? total : 0;
}

function pageSize(value: unknown): number {
  const data = (value as { data?: unknown } | undefined)?.data;
  return Array.isArray(data) ? data.length : 0;
}

function fetchPage(kind: Kind, page: number) {
  return kind === "midis" ? getCatalogEntries({ page, pageSize: SITEMAP_PAGE_SIZE, sort: "updated" })
    : kind === "people" ? getCatalogPeople({ page, pageSize: SITEMAP_PAGE_SIZE })
    : getArticles(page, SITEMAP_PAGE_SIZE);
}

function pageUrls(kind: Kind, base: string, result: unknown): SitemapUrl[] {
  if (kind === "midis") return (result as Awaited<ReturnType<typeof getCatalogEntries>>).data
    .map(entry => ({ loc: `${base}/midis/${encodeURIComponent(entry.slug)}`, lastModified: isoDate(entry.updated_at), changeFrequency: "monthly" as const, priority: 0.8 }));
  if (kind === "people") return (result as Awaited<ReturnType<typeof getCatalogPeople>>).data
    .map(person => ({ loc: `${base}/people/${encodeURIComponent(person.public_id)}`, lastModified: isoDate(person.updated_at), changeFrequency: "monthly" as const, priority: 0.6 }));
  return (result as Awaited<ReturnType<typeof getArticles>>).data
    .map(article => ({ loc: `${base}/articles/${article.id}`, lastModified: isoDate(article.updated_at), changeFrequency: "monthly" as const, priority: 0.6 }));
}

export function staticSitemapUrls(base: string): SitemapUrl[] {
  return STATIC_PATHS.map(path => ({ loc: `${base}${path}`, changeFrequency: path === "/" ? "daily" as const : "weekly" as const, priority: path === "/" ? 1 : 0.7 }));
}

/** Walk one kind from `firstPage`, at most four pages in flight, keeping what was fetched if the API fails. */
export async function collectSitemapUrls(kind: Kind, base: string, firstPage: number, maxUrls: number): Promise<SitemapUrl[]> {
  const urls: SitemapUrl[] = [];
  let seen = (firstPage - 1) * SITEMAP_PAGE_SIZE;
  for (let page = firstPage; page <= MAX_PAGES && urls.length < maxUrls; page += PAGES_PER_BATCH) {
    let batch: unknown[];
    try { batch = await Promise.all(Array.from({ length: PAGES_PER_BATCH }, (_, index) => fetchPage(kind, page + index))); }
    catch { break; }
    let lastBatch = false;
    for (const result of batch) {
      const size = pageSize(result);
      urls.push(...pageUrls(kind, base, result));
      seen += size;
      // A short page is the reliable end marker; the reported total is only a secondary guard.
      if (size < SITEMAP_PAGE_SIZE || seen >= pageTotal(result) && pageTotal(result) > 0) lastBatch = true;
    }
    if (lastBatch) break;
  }
  return urls.slice(0, maxUrls);
}

async function catalogCounts(): Promise<number[]> {
  const results = await Promise.allSettled([
    getCatalogEntries({ page: 1, pageSize: 1, sort: "updated" }),
    getCatalogPeople({ page: 1, pageSize: 1 }),
    getArticles(1, 1),
  ]);
  return results.map(result => result.status === "fulfilled" ? pageTotal(result.value) : 0);
}

function shardIds(counts: number[]): string[] {
  return ["static", ...KINDS.flatMap((kind, index) =>
    Array.from({ length: Math.max(1, Math.ceil(counts[index] / SITEMAP_SHARD_SIZE)) }, (_, shard) => `${kind}-${shard}`))];
}

export type SitemapDocument =
  | { kind: "urlset"; urls: SitemapUrl[] }
  | { kind: "index"; locs: string[] };

/**
 * One urlset while the archive fits in a single document, otherwise an index of shards.
 * Crawlers get a conventional /sitemap.xml either way.
 */
export async function buildSitemap(): Promise<SitemapDocument> {
  const base = siteOrigin();
  if (!base) return { kind: "urlset", urls: [] };
  const statics = staticSitemapUrls(base);
  const counts = await catalogCounts();
  const total = statics.length + counts.reduce((sum, count) => sum + count, 0);
  if (total > SITEMAP_INDEX_THRESHOLD) {
    return { kind: "index", locs: shardIds(counts).map(id => `${base}/sitemap/${id}.xml`) };
  }
  const parts = await Promise.all(KINDS.map(kind => collectSitemapUrls(kind, base, 1, SITEMAP_INDEX_THRESHOLD)));
  return { kind: "urlset", urls: [...statics, ...parts.flat()] };
}

/** `/sitemap/<id>.xml` keeps working for crawlers that already know the sharded URLs. */
export async function shardSitemapUrls(shardId: string): Promise<SitemapUrl[]> {
  const base = siteOrigin();
  if (!base) return [];
  if (shardId === "static") return staticSitemapUrls(base);
  const match = shardId.match(/^(midis|people|articles)-(\d+)$/);
  if (!match) return [];
  const shard = Number(match[2]);
  if (!Number.isSafeInteger(shard) || shard > 100_000) return [];
  const firstPage = shard * PAGES_PER_SHARD + 1;
  return collectSitemapUrls(match[1] as Kind, base, firstPage, SITEMAP_SHARD_SIZE);
}

const XML_ESCAPES: Record<string, string> = { "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" };

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, character => XML_ESCAPES[character] ?? character);
}

export function urlsetXml(urls: SitemapUrl[]): string {
  const body = urls.map(url => `<url><loc>${escapeXml(url.loc)}</loc>`
    + (url.lastModified ? `<lastmod>${escapeXml(url.lastModified)}</lastmod>` : "")
    + `<changefreq>${url.changeFrequency}</changefreq><priority>${url.priority}</priority></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function sitemapIndexXml(locs: string[]): string {
  const body = locs.map(loc => `<sitemap><loc>${escapeXml(loc)}</loc></sitemap>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}
