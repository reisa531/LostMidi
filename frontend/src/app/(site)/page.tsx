import { randomInt } from "node:crypto";
import Link from "next/link";
import type { Metadata } from "next";
import { installedSite } from "@/lib/install/state";
import { loadOverview } from "@/lib/api/overview";
import type { CatalogOverview } from "@/lib/api/types";
import { jsonLd, siteOgImage, siteOrigin } from "@/lib/seo";
import { datasetId, datasetSchema, webSiteId } from "@/lib/schema";
import type { FrontDesk } from "@/lib/front-desk";
import { Suspense } from "react";
import { ArchiveSearch } from "@/components/archive-search";

import { getArticles } from "@/lib/api/articles";
import { ApiError, apiRead } from "@/lib/api/client";
import { EntryActivity } from "@/components/catalog/ui";

export const dynamic = "force-dynamic";

type Stats = CatalogOverview["stats"];

const homeKeywords = ["早期网络 MIDI", "MIDI 档案", "网络考古", "数字档案", "MIDI 作品", "来源", "寻回记录"];

function homeTitle(siteName: string) { return `${siteName} · 早期网络 MIDI 数字档案`; }

function homeDescription(siteDescription: string, stats?: Stats) {
  const base = siteDescription.trim();
  if (!stats || stats.entries <= 0) return base;
  return `${base}已收录 ${stats.entries} 部作品、${stats.people} 位人物与 ${stats.sources} 个来源，逐条记录归档状态、文件留存与下载权限。`;
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

function Saying({ value }: { value: string }) {
  const parts = value.split(" | ");
  const sourced = parts.length === 3 && /^BV[0-9A-Za-z]{10}$/.test(parts[2]);
  return <aside className="saying"><span>一言</span> {sourced ? <>{parts[0]} <a className="archive-link ml-2 inline-block text-xs" href={`https://www.bilibili.com/video/${parts[2]}/`} target="_blank" rel="noopener noreferrer">{parts[1]} ↗</a></> : value}</aside>;
}

export default async function Home() {
  const [state, desk] = await Promise.all([loadOverview(), apiRead<FrontDesk>("/api/v1/front-desk").catch(() => null)]);
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
    <section className="front-mast" aria-labelledby="archive-title">
      <div><h1 id="archive-title">寻回音乐档案</h1>
        <p>旧网站、同人游戏和私人收藏里留下的 MIDI。</p></div>
      <ArchiveSearch />
    </section>
    {desk?.sayings.length ? <Saying value={desk.sayings[randomInt(desk.sayings.length)]} /> : null}
    <div className="edition-grid">
      <section aria-labelledby="recent-heading"><div className="section-heading"><h2 id="recent-heading">近期修订</h2><Link href="/midis">翻阅目录 →</Link></div>
        {overview ? <EntryActivity entries={recent} empty="暂未收录作品。" /> : <p role="status">馆藏数据暂时无法读取，请稍后刷新。</p>}
      </section>
      <aside className="edition-margin">
        <section><h2>公告栏</h2>
          {desk ? desk.announcements.length ? desk.announcements.map((n,i) => <details key={n.id} open={i===0}>
            <summary>{n.title}</summary><p className="whitespace-pre-wrap">{n.body}</p><small>{n.author} · {n.published_at.slice(0,10)}</small>
          </details>) : <p>眼下还没有新公告。站内有变动时，会在这里通知。</p> : <p>公告暂时无法读取。</p>}
        </section>
        {stats && <p className="edition-ledger">{stats.entries} 部作品 · {stats.people} 位人物<br/><Link className="archive-link" href="/overview">馆藏总览 ↗</Link></p>}
      </aside>
    </div>
    {overview && <>
      <Suspense fallback={null}><RecentArticles /></Suspense>
    </>}
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
