import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/seo";

// Read the origin per request: a prerendered robots.txt would bake whichever ADMIN_ORIGIN the build used.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const base = siteOrigin();
  return {
    rules: [{ userAgent: "*", allow: ["/", "/overview", "/midis", "/people", "/recovery", "/map", "/about"], disallow: ["/admin", "/install", "/api/"] }],
    // /sitemap.xml always answers; when the archive outgrows one document it lists the /sitemap/<id>.xml shards.
    sitemap: base ? [`${base}/sitemap.xml`] : [],
  };
}
