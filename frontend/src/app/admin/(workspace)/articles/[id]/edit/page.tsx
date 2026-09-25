import Link from "next/link";
import { notFound } from "next/navigation";
import { adminRequest } from "@/lib/admin/auth";
import { articleOptions } from "@/lib/admin/article-options";
import type { ArticleDetail } from "@/lib/api/articles";
import { ApiError } from "@/lib/api/client";
import { ArticleForm } from "@/components/admin/article-form";
import { AdminPageHeader, AdminUnavailable } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "编辑文章" };
export default async function EditArticlePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) notFound();
  let article: ArticleDetail, options: Awaited<ReturnType<typeof articleOptions>>;
  try { [article, options] = await Promise.all([adminRequest<ArticleDetail>(`/api/v1/admin/articles/${id}`), articleOptions()]); }
  catch (error) { if (error instanceof ApiError && error.status === 404) notFound(); if (error instanceof ApiError) return <AdminUnavailable />; throw error; }
  const saved = (await searchParams).saved === "1";
  return <><AdminPageHeader eyebrow="文章 / 编辑" title={article.title} description={`作者 ${article.author_username} · 版本 ${article.revision}`} />
    {saved && <p role="status" className="mb-6 rounded-lg bg-green-50 p-4 text-sm text-green-900">文章已保存。{article.status === "published" && <Link className="archive-link ml-2" href={`/articles/${article.id}`}>查看公开页 ↗</Link>}</p>}
    <ArticleForm key={`${article.id}-${article.revision}`} article={article} midis={options.midis} people={options.people} />
  </>;
}
