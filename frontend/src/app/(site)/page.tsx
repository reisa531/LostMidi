import Link from "next/link";
import type { Metadata } from "next";
import { installedSite } from "@/lib/install/state";
import { loadOverview } from "@/lib/api/overview";
import type { CatalogOverview } from "@/lib/api/types";
import { jsonLd, siteOgImage, siteOrigin } from "@/lib/seo";
import { datasetId, datasetSchema, webSiteId } from "@/lib/schema";
import Image from "next/image";
import { Suspense } from "react";
import { ArchiveSearch } from "@/components/archive-search";
import { archiveStates } from "@/lib/api/catalog";
import { getArticles } from "@/lib/api/articles";
import { ApiError } from "@/lib/api/client";
import { EntryActivity, CatalogStatus } from "@/components/catalog/ui";

export const dynamic = "force-dynamic";

type Stats = CatalogOverview["stats"];

const homeKeywords = ["早期网络 MIDI", "MIDI 档案", "网络考古", "数字档案", "MIDI 作品", "历史来源", "寻回记录"];

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
  const overview = "overview" in state ? state.overview : undefined;
  const stats = overview?.stats;
  const recent = overview?.recent ?? [];
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
    <section className="landing-hero" aria-labelledby="archive-title">
      <div className="hero-photo">
        <Image src="/images/archive-floppies.webp" alt="叠放在方格纸上的旧软盘" fill sizes="(min-width: 1200px) 520px, (min-width: 700px) 42vw, 100vw" preload />
      </div>
      <div className="hero-copy">
        <h1 id="archive-title">早期网络<br /><span lang="en">MIDI</span> 档案馆</h1>
        <p>追溯散落在旧网站、论坛和个人收藏中的 MIDI 作品，查找它们的作者、历史来源与寻回记录。</p>
        <ArchiveSearch />
        <nav className="hero-links" aria-label="按类别浏览">
          <Link href="/midis">作品目录 ↗</Link><Link href="/people">人物索引 ↗</Link><Link href="/map?by=source">历史来源 ↗</Link>
        </nav>
      </div>
    </section>
    {stats ? <>
      <dl className="collection-strip" aria-label="馆藏统计">
        {[
          { value: stats.entries, label: "收录作品", href: "/midis" },
          { value: stats.people, label: "档案人物", href: "/people" },
          { value: stats.sources, label: "历史来源", href: "/map?by=source" },
          { value: stats.files, label: "文件记录", href: "/overview" },
        ].map(item => <div key={item.label}><dt><Link href={item.href}>{item.label}</Link></dt><dd>{item.value.toLocaleString("zh-CN")}</dd></div>)}
      </dl>
      <div className="landing-columns">
        <section aria-labelledby="recent-heading" className="min-w-0">
          <div className="section-heading"><h2 id="recent-heading">最近更新</h2><Link href="/midis">全部作品 →</Link></div>
          <EntryActivity entries={recent} empty="还没有收录作品。" />
        </section>
        <section aria-labelledby="recovery-heading" className="recovery-index">
          <div className="section-heading"><h2 id="recovery-heading">寻回进度</h2><Link href="/recovery">查看全部 →</Link></div>
          <ul>{archiveStates.map(state => <li key={state.value}><Link href={`/recovery?status=${state.value}`}>
            <CatalogStatus status={state.value} /><span className="recovery-count">{stats.statuses[state.value].toLocaleString("zh-CN")} <span aria-hidden="true">↗</span></span>
          </Link></li>)}</ul>
        </section>
      </div>
      <Suspense fallback={null}><RecentArticles /></Suspense>
    </> : <section className="service-notice" role="status"><h2>馆藏数据暂时无法读取</h2><p>请稍后刷新，或先阅读<Link className="archive-link" href="/about">档案馆介绍</Link>。</p></section>}
  </>;
}

async function RecentArticles() {
  let articles;
  try { articles = await getArticles(1, 2); }
  catch (error) { if (error instanceof ApiError) return null; throw error; }
  if (!articles.data.length) return null;
  return <section className="landing-articles" aria-labelledby="article-heading">
    <div className="section-heading"><h2 id="article-heading">档案文章</h2><Link href="/articles">全部文章 →</Link></div>
    <ul>{articles.data.map(article => <li key={article.id}>
      <Link href={`/articles/${article.id}`}>{article.title}</Link>
      <p>{article.author_username} · <time dateTime={article.updated_at}>{article.updated_at.slice(0, 10)}</time></p>
    </li>)}</ul>
  </section>;
}
