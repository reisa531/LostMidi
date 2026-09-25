import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getArticle } from "@/lib/api/articles";
import { ApiError } from "@/lib/api/client";
import { Markdown, markdownSummary } from "@/components/markdown";
import { Unavailable } from "@/components/archive";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  try {
    const article = await getArticle((await params).id);
    const description = markdownSummary(article.body_markdown, 155);
    return { title: article.title, description, alternates: { canonical: `/articles/${article.id}` },
      openGraph: { type: "article", title: article.title, description }, twitter: { card: "summary", title: article.title, description } };
  } catch { return { title: "文章", robots: { index: false, follow: false } }; }
}
export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  let article;
  try { article = await getArticle((await params).id); }
  catch (error) { if (error instanceof ApiError && (error.status === 400 || error.status === 404)) notFound(); if (error instanceof ApiError) return <Unavailable />; throw error; }
  return <article className="mx-auto max-w-3xl"><Link href="/articles" className="archive-link text-sm">← 全部文章</Link>
    <p className="eyebrow mt-10">档案文章</p><h1 className="my-5 break-words font-serif text-4xl leading-tight">{article.title}</h1>
    <p className="mb-9 text-sm text-muted">{article.author_username} · 更新于 {article.updated_at.slice(0, 10)}</p>
    <Markdown source={article.body_markdown} />
    <section className="mt-12 border-t border-line pt-7"><h2 className="mb-4 font-serif text-2xl">关联 MIDI</h2><ul className="space-y-2">{article.midis.map(midi => <li key={midi.id}><Link className="archive-link" href={`/midis/${midi.slug}`}>{midi.title}</Link></li>)}</ul></section>
    {article.people.length > 0 && <section className="mt-8 border-t border-line pt-7"><h2 className="mb-4 font-serif text-2xl">关联人物</h2><ul className="space-y-2">{article.people.map(person => <li key={person.id}><Link className="archive-link" href={`/people/${person.public_id}`}>{person.display_name}</Link></li>)}</ul></section>}
  </article>;
}
