import Link from "next/link";
import { getArticles } from "@/lib/api/articles";
import { ApiError } from "@/lib/api/client";
import { Unavailable } from "@/components/archive";

export const metadata = { title: "文章" };
export const dynamic = "force-dynamic";
export default async function ArticlesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const raw = (await searchParams).page ?? "1";
  const page = /^[1-9]\d{0,5}$/.test(raw) ? Number(raw) : 1;
  let result;
  try { result = await getArticles(page); }
  catch (error) { if (error instanceof ApiError) return <Unavailable />; throw error; }
  return <div className="mx-auto max-w-3xl"><p className="eyebrow">档案文章</p><h1 className="my-5 font-serif text-4xl">文章</h1>
    <p className="mb-8 text-muted">围绕 MIDI 作品和人物的考证与记录。</p>
    {result.data.length ? <ul className="divide-y divide-line border-t border-line">{result.data.map(article => <li key={article.id} className="py-6">
      <Link className="archive-link font-serif text-2xl" href={`/articles/${article.id}`}>{article.title}</Link>
      <p className="mt-2 text-sm text-muted">{article.updated_at.slice(0, 10)} · {article.author_username}</p>
    </li>)}</ul> : <p className="border-t border-line py-8 text-muted">暂无已发布文章。</p>}
    <nav className="mt-6 flex gap-6 text-sm">{page > 1 && <Link className="archive-link" href={`/articles?page=${page - 1}`}>← 上一页</Link>}{result.data.length === 20 && <Link className="archive-link" href={`/articles?page=${page + 1}`}>下一页 →</Link>}</nav>
  </div>;
}
