import "server-only";
import { getArticles } from "@/lib/api/articles";
import { getCatalogEntries, getCatalogPeople } from "@/lib/api/catalog";
import { siteOrigin } from "@/lib/seo";
import releases from "@/lib/changelog.json";

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
const STATIC_PATHS = ["/", "/overview", "/midis", "/people", "/articles", "/recovery", "/map", "/about", "/sponsor", "/changelog"];

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

/** ISO 时间戳按字符串即按时间排序；缺值不参与比较。 */
function newest(values: (string | undefined)[]): string | undefined {
  return values.filter((value): value is string => typeof value === "string" && value !== "").sort().at(-1);
}

/** 一次采集里某一类 URL 的最新更新时间。 */
function maxLastModified(urls: SitemapUrl[]): string | undefined {
  return newest(urls.map(url => url.lastModified));
}

/** 更新日志页的 lastmod 取最新一条正式发布记录。 */
function latestReleaseDate(): string | undefined {
  return releases[0]?.date;
}

/**
 * 静态入口的 lastmod。
 *
 * 只从可以核对的数据推导：/changelog 取发布记录，作品/人物/文章列表取各自采集结果里
 * 最新的更新时间，首页取三者与发布时间的较晚者。手写页面（/about、/sponsor）没有可
 * 核对的时间来源，宁可不给 lastmod，也不猜一个“看起来更新过”的时间。
 */
export type StaticLastModified = { entry?: string; person?: string; article?: string; release?: string };

export function staticSitemapUrls(base: string, modified: StaticLastModified = {}): SitemapUrl[] {
  const catalog = newest([modified.entry, modified.person, modified.article]);
  const byPath: Record<string, string | undefined> = {
    "/": newest([catalog, modified.release]),
    "/overview": modified.entry,
    "/midis": modified.entry,
    "/people": modified.person,
    "/articles": modified.article,
    "/recovery": modified.entry,
    "/map": modified.entry,
    "/changelog": modified.release,
    "/about": undefined,
    "/sponsor": undefined,
  };
  return STATIC_PATHS.map(path => ({
    loc: `${base}${path}`, lastModified: byPath[path],
    changeFrequency: path === "/" ? "daily" as const : "weekly" as const, priority: path === "/" ? 1 : 0.7,
  }));
}

/** 同一个 loc 只保留一条，并取更晚的 lastmod；分页并行取数时可能出现重复。 */
function mergeUrl(collected: Map<string, SitemapUrl>, url: SitemapUrl) {
  const known = collected.get(url.loc);
  const incoming = url.lastModified;
  if (!known) return void collected.set(url.loc, url);
  if (incoming && (!known.lastModified || incoming > known.lastModified)) known.lastModified = incoming;
}

/** 走完一类目录，取回全部 URL：并行取数、按 loc 去重、保持采集顺序。 */
export async function collectSitemapUrls(kind: Kind, base: string, firstPage: number, maxUrls: number): Promise<SitemapUrl[]> {
  const collected = new Map<string, SitemapUrl>();
  let urls: SitemapUrl[] = [];
  const flush = () => { urls = [...collected.values()].slice(0, maxUrls); };
  let seen = (firstPage - 1) * SITEMAP_PAGE_SIZE;
  for (let page = firstPage; page <= MAX_PAGES && urls.length < maxUrls; page += PAGES_PER_BATCH) {
    let batch: unknown[];
    try { batch = await Promise.all(Array.from({ length: PAGES_PER_BATCH }, (_, index) => fetchPage(kind, page + index))); }
    catch { break; }
    let lastBatch = false;
    for (const result of batch) {
      const size = pageSize(result);
      for (const url of pageUrls(kind, base, result)) mergeUrl(collected, url);
      seen += size;
      // A short page is the reliable end marker; the reported total is only a secondary guard.
      if (size < SITEMAP_PAGE_SIZE || seen >= pageTotal(result) && pageTotal(result) > 0) lastBatch = true;
    }
    flush();
    if (lastBatch) break;
  }
  flush();
  return urls;
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
  const counts = await catalogCounts();
  const total = STATIC_PATHS.length + counts.reduce((sum, count) => sum + count, 0);
  if (total > SITEMAP_INDEX_THRESHOLD) {
    return { kind: "index", locs: shardIds(counts).map(id => `${base}/sitemap/${id}.xml`) };
  }
  const parts = await Promise.all(KINDS.map(kind => collectSitemapUrls(kind, base, 1, SITEMAP_INDEX_THRESHOLD)));
  const modified: StaticLastModified = {
    entry: maxLastModified(parts[0]), person: maxLastModified(parts[1]), article: maxLastModified(parts[2]),
    release: latestReleaseDate(),
  };
  return { kind: "urlset", urls: [...staticSitemapUrls(base, modified), ...parts.flat()] };
}

/** `/sitemap/<id>.xml` keeps working for crawlers that already know the sharded URLs. */
export async function shardSitemapUrls(shardId: string): Promise<SitemapUrl[]> {
  const base = siteOrigin();
  if (!base) return [];
  // 分片模式只在超过 SITEMAP_INDEX_THRESHOLD 时启用；这里不给静态入口推导 lastmod，
  // 因为那需要为每个分片额外回源，而分片本身已经带各自的 lastmod。
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
