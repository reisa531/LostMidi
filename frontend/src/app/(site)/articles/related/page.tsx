import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { getMidiArticles, getPersonArticles } from "@/lib/api/articles";
import { EmptyState, PageHeader } from "@/components/catalog/ui";

export const metadata = { title: "相关文章", robots: { index: false, follow: true } };
export default async function RelatedArticleDirectory({ searchParams }: { searchParams: Promise<{ kind?: string; id?: string; page?: string }> }) {
  const { kind, id, page: rawPage } = await searchParams;
  if ((kind !== "midi" && kind !== "person") || !id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) notFound();
  const page = rawPage && /^[1-9]\d{0,5}$/.test(rawPage) ? Number(rawPage) : 1;
  const href = (next: number) => `/articles/related?kind=${kind}&id=${id}&page=${next}`;
  let result;
  try { result = kind === "midi" ? await getMidiArticles(id, page) : await getPersonArticles(id, page); }
  catch (error) { if (error instanceof ApiError) return <EmptyState title="相关文章暂时不可用" description="请稍后重试。" action={<Link href="/articles" className="archive-link">浏览文章目录</Link>} />; throw error; }
  return <><PageHeader eyebrow="文章 / 关联" title="相关文章" description={`共 ${result.total} 篇与此${kind === "midi" ? " MIDI" : "人物"}关联的文章。`} />
    {result.data.length ? <ul className="space-y-3">{result.data.map(article => <li key={article.id} className="rounded-lg border border-line bg-white/70 p-4"><Link href={`/articles/${article.id}`} className="archive-link font-medium">{article.title}</Link><p className="mt-2 text-xs text-muted">{article.updated_at.slice(0, 10)} · {article.author_username}</p></li>)}</ul>
      : <EmptyState title={page > 1 ? "页码超出范围" : "暂无相关文章"} action={<Link href={page > 1 ? href(1) : "/articles"} className="archive-link">{page > 1 ? "返回第一页" : "浏览文章目录"}</Link>} />}
    <nav aria-label="相关文章分页" className="mt-5 flex gap-5 text-sm">{page > 1 && <Link href={href(page - 1)} className="archive-link">上一页</Link>}{page * result.pageSize < result.total && <Link href={href(page + 1)} className="archive-link">下一页</Link>}</nav>
  </>;
}
