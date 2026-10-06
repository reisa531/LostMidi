import Link from "next/link";
import type { Metadata } from "next";
import { cache } from "react";
import { ApiError } from "@/lib/api/client";
import { getCatalogOverview } from "@/lib/api/catalog";
import type { CatalogOverview } from "@/lib/api/types";
import { installedSite } from "@/lib/install/state";
import { jsonLd, siteOrigin } from "@/lib/seo";
import { Unavailable } from "@/components/archive";
import { EntryActivity, OverviewMetrics, PageHeader, StatusSummary, secondaryLink } from "@/components/catalog/ui";

export const dynamic = "force-dynamic";

type Stats = CatalogOverview["stats"];
type OverviewState = { overview: CatalogOverview } | { unavailable: true };

// Metadata and the page body share one overview request per render.
const loadOverview = cache(async (): Promise<OverviewState> => {
  try { return { overview: await getCatalogOverview() }; }
  catch (error) { if (error instanceof ApiError) return { unavailable: true }; throw error; }
});

function homeTitle(siteName: string) { return `${siteName} · 早期网络 MIDI 数字档案`; }

function homeDescription(siteDescription: string, stats?: Stats) {
  const base = siteDescription.trim();
  if (!stats || stats.entries <= 0) return base;
  return `${base}已收录 ${stats.entries} 部作品、${stats.people} 位人物和 ${stats.sources} 个历史来源，并逐条记录归档状态、文件与下载权限。`;
}

export async function generateMetadata(): Promise<Metadata> {
  const site = await installedSite();
  let stats: Stats | undefined;
  try { const state = await loadOverview(); if ("overview" in state) stats = state.overview.stats; }
  catch { /* A metadata failure must never replace the archive homepage with an error page. */ }
  const title = homeTitle(site.name);
  const description = homeDescription(site.description, stats);
  const origin = siteOrigin();
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: "/" },
    keywords: ["早期网络 MIDI", "MIDI 档案", "网络考古", "数字档案", "MIDI 作品", "历史来源", "寻回记录"],
    openGraph: { type: "website", title, description, siteName: site.name, locale: "zh_CN", url: origin ? `${origin}/` : undefined },
    twitter: { card: "summary", title, description },
  };
}

export default async function Home() {
  const state = await loadOverview();
  if ("unavailable" in state) return <Unavailable />;
  const overview = state.overview;
  const site = await installedSite();
  const origin = siteOrigin();
  const description = homeDescription(site.description, overview.stats);
  const structuredData = origin ? {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite", "@id": `${origin}/#website`, url: `${origin}/`, name: site.name,
        alternateName: "Lost MIDI Archive", description, inLanguage: "zh-CN",
        potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${origin}/search?q={search_term_string}` }, "query-input": "required name=search_term_string" },
      },
      {
        "@type": "CollectionPage", "@id": `${origin}/#collection`, url: `${origin}/`, name: "档案总览", description,
        isPartOf: { "@id": `${origin}/#website` }, inLanguage: "zh-CN",
        about: { "@type": "Thing", name: "早期网络 MIDI 作品、人物与历史来源" },
        mainEntity: overview.recent.length ? {
          "@type": "ItemList",
          itemListElement: overview.recent.map((entry, index) => ({
            "@type": "ListItem", position: index + 1, name: entry.title, url: `${origin}/midis/${encodeURIComponent(entry.slug)}`,
          })),
        } : undefined,
      },
    ],
  } : null;
  return <>
    {structuredData && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }} />}
    <PageHeader eyebrow="档案 / 总览" title="档案总览" description="从一首作品、一位作者或一个旧网站出发，继续整理早期网络 MIDI 的来处。这里是档案此刻的真实记录。" action={<Link href="/midis" className={secondaryLink}>浏览全部 MIDI <span aria-hidden="true" className="ml-4">→</span></Link>} />
    <OverviewMetrics stats={overview.stats} />
    <section className="mb-8 mt-8"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-xl">寻回进度</h2><Link href="/recovery" className="archive-link text-xs">查看状态明细 →</Link></div><StatusSummary stats={overview.stats} /></section>
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <section className="min-w-0 rounded-xl border border-line bg-white/60"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4"><div><h2 className="font-serif text-xl">最近更新</h2><p className="mt-1 text-xs text-muted">按修改时间排列 · 最多 6 条</p></div><Link href="/midis" className="archive-link text-xs">全部档案 →</Link></header><div className="p-5"><EntryActivity entries={overview.recent} empty="还没有收录档案。第一份作品资料将从这里开始。" /></div></section>
      <section className="min-w-0 rounded-xl border border-line bg-white/60"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4"><div><h2 className="font-serif text-xl">需要关注</h2><p className="mt-1 text-xs text-muted">尚未标记为已归档 · 最多 6 条</p></div><Link href="/recovery" className="archive-link text-xs">继续寻回 →</Link></header><div className="p-5"><EntryActivity entries={overview.needs_attention} empty="目前没有未归档的记录。归档状态与文件情况独立记录。" /></div></section>
    </div>
    <aside className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-[#edf0e5] px-5 py-4"><div className="min-w-0"><h2 className="text-sm font-medium">从人物与网站，连接散落的作品</h2><p className="mt-1 text-xs leading-6 text-muted">关系图谱按作者或来源汇总档案，查看每组作品、文件和下载权限情况。</p></div><Link className="archive-link shrink-0 text-sm" href="/map">打开关系图谱 →</Link></aside>
  </>;
}
