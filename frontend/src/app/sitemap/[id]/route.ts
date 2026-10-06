import { shardSitemapUrls, urlsetXml } from "@/lib/sitemap";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Accept both `/sitemap/static` and the earlier `/sitemap/static.xml` shape so published URLs keep working.
  const shardId = id.endsWith(".xml") ? id.slice(0, -4) : id;
  const urls = await shardSitemapUrls(shardId);
  return new Response(urlsetXml(urls), {
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "no-store" },
  });
}
