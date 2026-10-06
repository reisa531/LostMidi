import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getArticle } from "@/lib/api/articles";
import { ApiError } from "@/lib/api/client";
import { Markdown, markdownSummary } from "@/components/markdown";
import { Unavailable } from "@/components/archive";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { absoluteUrl, jsonLd, siteOrigin } from "@/lib/seo";
import { articleSchema, type Crumb } from "@/lib/schema";
import { installedSite } from "@/lib/install/state";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  try {
    const article = await getArticle((await params).id);
    const description = markdownSummary(article.body_markdown, 155);
    const path = `/articles/${article.id}`;
    return { title: article.title, description, alternates: { canonical: path },
      openGraph: { type: "article", title: article.title, description, url: absoluteUrl(path) ?? undefined,
        publishedTime: article.created_at, modifiedTime: article.updated_at, authors: [article.author_username] },
      twitter: { card: "summary_large_image", title: article.title, description } };
  } catch { return { title: "文章", robots: { index: false, follow: false } }; }
}
export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  let article;
  try { article = await getArticle((await params).id); }
  catch (error) { if (error instanceof ApiError && (error.status === 400 || error.status === 404)) notFound(); if (error instanceof ApiError) return <Unavailable />; throw error; }
  const description = markdownSummary(article.body_markdown, 155);
  const site = await installedSite();
  const structuredData = articleSchema({
    origin: siteOrigin() ?? undefined, path: `/articles/${article.id}`, title: article.title,
    description, siteName: site.name, authorUsername: article.author_username,
    published: article.created_at, modified: article.updated_at,
    about: [
      ...article.midis.map(midi => ({ name: midi.title, path: `/midis/${midi.slug}` })),
      ...article.people.map(person => ({ name: person.display_name, path: `/people/${person.public_id}` })),
    ],
  });
  const crumbs: Crumb[] = [
    { name: "首页", path: "/" },
    { name: "文章", path: "/articles" },
    { name: article.title, path: `/articles/${article.id}` },
  ];
  return <article className="mx-auto max-w-3xl">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }} />
    <Breadcrumbs items={crumbs} />
    <p className="eyebrow">档案文章</p><h1 className="my-5 break-words font-serif text-4xl leading-tight">{article.title}</h1>
    <p className="mb-9 text-sm text-muted">{article.author_username} · 更新于 {article.updated_at.slice(0, 10)}</p>
    <Markdown source={article.body_markdown} />
    <section className="mt-12 border-t border-line pt-7"><h2 className="mb-4 font-serif text-2xl">关联 MIDI</h2><ul className="space-y-2">{article.midis.map(midi => <li key={midi.id}><Link className="archive-link" href={`/midis/${midi.slug}`}>{midi.title}</Link></li>)}</ul></section>
    {article.people.length > 0 && <section className="mt-8 border-t border-line pt-7"><h2 className="mb-4 font-serif text-2xl">关联人物</h2><ul className="space-y-2">{article.people.map(person => <li key={person.id}><Link className="archive-link" href={`/people/${person.public_id}`}>{person.display_name}</Link></li>)}</ul></section>}
  </article>;
}
