import { PageHeader } from "@/components/catalog/ui";
import Link from "next/link";
import { getArticles } from "@/lib/api/articles";
import { ApiError } from "@/lib/api/client";
import { Unavailable } from "@/components/archive";

export const metadata = { title: "文章", alternates: { canonical: "/articles" } };
export const dynamic = "force-dynamic";
export default async function ArticlesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const raw = (await searchParams).page ?? "1";
  const page = /^[1-9]\d{0,5}$/.test(raw) ? Number(raw) : 1;
  let result;
  try { result = await getArticles(page); }
  catch (error) { if (error instanceof ApiError) return <Unavailable />; throw error; }
  return <div><PageHeader eyebrow="研究 / 文章" title="档案文章" description="围绕 MIDI 作品、作者和历史来源的考证与记录。" />
    {result.data.length ? <ul className="article-directory">{result.data.map(article => <li key={article.id} className="py-6">
      <Link className="font-serif text-2xl" href={`/articles/${article.id}`}>{article.title}</Link>
      <p className="mt-2 text-sm text-muted">{article.updated_at.slice(0, 10)} · {article.author_username}</p>
    </li>)}</ul> : <p className="border-t border-line py-8 text-muted">{page > 1 ? "本页没有文章。" : "暂无已发布文章。"}</p>}
    <nav className="mt-6 flex gap-6 text-sm" aria-label="文章分页">{page > 1 && <Link className="archive-link" href="/articles">第一页</Link>}{page > 1 && <Link className="archive-link" href={`/articles?page=${page - 1}`}>← 上一页</Link>}{page * result.pageSize < result.total && <Link className="archive-link" href={`/articles?page=${page + 1}`}>下一页 →</Link>}</nav>
  </div>;
}
