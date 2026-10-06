import Link from "next/link";
import type { Metadata } from "next";
import { installedSite } from "@/lib/install/state";
import { loadOverview } from "@/lib/api/overview";
import type { CatalogOverview } from "@/lib/api/types";
import { jsonLd, siteOgImage, siteOrigin } from "@/lib/seo";
import { datasetId, datasetSchema, webSiteId } from "@/lib/schema";
import { Unavailable } from "@/components/archive";
import { EntryActivity, MetricGrid, StatusSummary, primaryLink, secondaryLink } from "@/components/catalog/ui";

export const dynamic = "force-dynamic";

type Stats = CatalogOverview["stats"];

const homeKeywords = ["早期网络 MIDI", "MIDI 档案", "网络考古", "数字档案", "MIDI 作品", "历史来源", "寻回记录"];

function homeTitle(siteName: string) { return `${siteName} · 早期网络 MIDI 数字档案`; }

function homeDescription(siteDescription: string, stats?: Stats) {
  const base = siteDescription.trim();
  if (!stats || stats.entries <= 0) return base;
  return `${base}已收录 ${stats.entries} 部作品、${stats.people} 位人物和 ${stats.sources} 个历史来源，并逐条记录归档状态、文件与下载权限。`;
}

const purposes = [
  { title: "作品与来历一起保存", body: "每份档案同时记录作品、署名、推测年代与发现经过。来历和文件放在一起，才看得出这份记录能用到什么程度。" },
  { title: "来源可以被核对", body: "历史来源标注类型、人工可信度与核验时间，并附上受鉴权保护的证据附件，而不是一句无法追溯的注释。" },
  { title: "开放与保护分界清楚", body: "是否允许访客下载由每份文件单独决定；未开放的文件只保存在受保护的数据库中，不进入匿名可读的对象存储。" },
];

export async function generateMetadata(): Promise<Metadata> {
  const site = await installedSite();
  let stats: Stats | undefined;
  try { const state = await loadOverview(); if ("overview" in state) stats = state.overview.stats; }
  catch { /* A metadata failure must never replace the landing page with an error page. */ }
  const title = homeTitle(site.name);
  const description = homeDescription(site.description, stats);
  const origin = siteOrigin();
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: "/" },
    keywords: homeKeywords,
    openGraph: { type: "website", title, description, siteName: site.name, locale: "zh_CN", url: origin ? `${origin}/` : undefined, images: siteOgImage(title) },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function Home() {
  const state = await loadOverview();
  if ("unavailable" in state) return <Unavailable />;
  const { stats, recent } = state.overview;
  const site = await installedSite();
  const origin = siteOrigin();
  const description = homeDescription(site.description, stats);
  // 三个节点互相引用：站点 → 数据集 → 本次渲染的最近收录列表。
  // datasetSchema 自带 @context，作为 @graph 成员重复声明同一上下文是合法 JSON-LD。
  const structuredData = origin ? {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite", "@id": webSiteId(origin), url: `${origin}/`, name: site.name,
        alternateName: "Lost MIDI Archive", description, inLanguage: "zh-CN",
        potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${origin}/search?q={search_term_string}` }, "query-input": "required name=search_term_string" },
      },
      datasetSchema({ origin, name: `${site.name} 档案数据集`, description, keywords: homeKeywords, sitemapPath: "/sitemap.xml" }),
      {
        "@type": "CollectionPage", "@id": `${origin}/#collection`, url: `${origin}/`, name: "档案总览", description,
        isPartOf: { "@id": webSiteId(origin) }, inLanguage: "zh-CN",
        about: { "@id": datasetId(origin) },
        mainEntity: recent.length ? {
          "@type": "ItemList",
          itemListElement: recent.map((entry, index) => ({
            "@type": "ListItem", position: index + 1, name: entry.title, url: `${origin}/midis/${encodeURIComponent(entry.slug)}`,
          })),
        } : undefined,
      },
    ],
  } : null;
  return <>
    {structuredData && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }} />}
    <section className="mb-10 rounded-2xl border border-line bg-[#f2f4ea] px-6 py-10 sm:px-10 sm:py-14">
      <p className="eyebrow">数字档案 · 网络考古</p>
      <h1 className="mt-4 max-w-3xl font-serif text-3xl leading-[1.25] tracking-tight sm:text-4xl lg:text-5xl">为早期网络 MIDI，留下来处</h1>
      <p className="mt-5 max-w-2xl text-sm leading-7 text-muted sm:text-base">这是一个关于早期网络 MIDI 的数字档案与网络考古项目：收录作品与它们的人物、历史来源和寻回过程，把散落在旧网站、论坛与私藏里的材料，整理成可以被引用的记录。</p>
      <p className="mt-5 text-xs leading-6 text-muted">当前收录 <strong className="font-medium text-accent tabular-nums">{stats.entries.toLocaleString("zh-CN")}</strong> 部作品 · <strong className="font-medium text-accent tabular-nums">{stats.people.toLocaleString("zh-CN")}</strong> 位人物 · <strong className="font-medium text-accent tabular-nums">{stats.sources.toLocaleString("zh-CN")}</strong> 个历史来源</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/overview" className={primaryLink}>进入档案总览 <span aria-hidden="true" className="ml-2">→</span></Link>
        <Link href="/midis" className={secondaryLink}>浏览全部 MIDI</Link>
        <Link href="/recovery" className={secondaryLink}>查看寻回进度</Link>
      </div>
    </section>

    <section aria-labelledby="landing-data" className="mb-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div><h2 id="landing-data" className="font-serif text-2xl">档案数据</h2><p className="mt-1 text-xs text-muted">统计随档案实时更新，点开数字可进入对应列表。</p></div>
        <Link href="/overview" className="archive-link text-xs">查看完整总览 →</Link>
      </div>
      <MetricGrid items={[
        { label: "收录作品", value: stats.entries, note: "已登记的作品档案", href: "/midis" },
        { label: "人物", value: stats.people, note: "作者及参与者", href: "/people" },
        { label: "文件记录", value: stats.files, note: `其中 ${stats.downloadable.toLocaleString("zh-CN")} 个允许访客下载` },
        { label: "历史来源", value: stats.sources, note: "可核对的来源记录" },
      ]} />
      <div className="mt-4 rounded-xl border border-line bg-white/60 px-5 py-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-medium">归档状态分布</h3><Link href="/recovery" className="archive-link text-xs">查看状态明细 →</Link></div>
        <StatusSummary stats={stats} />
      </div>
    </section>

    <section aria-labelledby="landing-purpose" className="mb-10">
      <h2 id="landing-purpose" className="font-serif text-2xl">这份档案想做什么</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {purposes.map(item => <article key={item.title} className="min-w-0 rounded-xl border border-line bg-white/60 p-5">
          <h3 className="text-sm font-medium">{item.title}</h3>
          <p className="mt-2 text-xs leading-6 text-muted">{item.body}</p>
        </article>)}
      </div>
    </section>

    <section aria-labelledby="landing-recent" className="mb-10 min-w-0 rounded-xl border border-line bg-white/60">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div><h2 id="landing-recent" className="font-serif text-xl">最近收录</h2><p className="mt-1 text-xs text-muted">按修改时间排列 · 最多 6 条</p></div>
        <Link href="/midis" className="archive-link text-xs">全部档案 →</Link>
      </header>
      <div className="p-5"><EntryActivity entries={recent} empty="还没有收录档案。第一份作品资料将从这里开始。" /></div>
    </section>

    <aside className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-[#edf0e5] px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-sm font-medium">继续从这里进入档案</h2>
        <p className="mt-1 text-xs leading-6 text-muted">总览页汇总指标与待办，关系图谱按作者或来源浏览作品；档案的来源、许可与联系方式写在“关于我们”。</p>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Link className="archive-link shrink-0 text-sm" href="/overview">档案总览 →</Link>
        <Link className="archive-link shrink-0 text-sm" href="/map">关系图谱 →</Link>
        <Link className="archive-link shrink-0 text-sm" href="/about">关于我们 →</Link>
      </div>
    </aside>
  </>;
}
