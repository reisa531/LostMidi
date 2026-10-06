import { buildSitemap, sitemapIndexXml, urlsetXml } from "@/lib/sitemap";

// Crawlers and Search Console default to /sitemap.xml, so this route always answers.
export const dynamic = "force-dynamic";

export async function GET() {
  const document = await buildSitemap();
  const body = document.kind === "index" ? sitemapIndexXml(document.locs) : urlsetXml(document.urls);
  return new Response(body, {
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "no-store" },
  });
}
