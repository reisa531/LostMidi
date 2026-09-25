import Link from "next/link";
import { adminRequest } from "@/lib/admin/auth";
import { ApiError } from "@/lib/api/client";
import type { ArticleSummary } from "@/lib/api/articles";
import { AdminPageHeader, AdminPanel, AdminUnavailable } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "文章管理" };
export default async function AdminArticlesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const raw = (await searchParams).page ?? "1";
  const page = /^[1-9]\d{0,5}$/.test(raw) ? Number(raw) : 1;
  let articles: ArticleSummary[];
  try { articles = (await adminRequest<{ data: ArticleSummary[] }>(`/api/v1/admin/articles?page=${page}`)).data; }
  catch (error) { if (error instanceof ApiError) return <AdminUnavailable />; throw error; }
  return <><AdminPageHeader eyebrow="工作台 / 文章" title="文章管理" description="管理员可撰写 Markdown 文章，关联 MIDI 档案与人物。草稿仅在后台显示。" />
    <AdminPanel title={`文章 · ${articles.length}`} action={<Link className="rounded bg-accent px-4 py-2 text-sm text-white" href="/admin/articles/new">新建文章</Link>}>
      {articles.length ? <ul className="divide-y divide-line">{articles.map(article => <li key={article.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div><Link href={`/admin/articles/${article.id}/edit`} className="archive-link font-medium">{article.title}</Link><p className="mt-1 text-xs text-muted">{article.status === "published" ? "已发布" : "草稿"} · {article.author_username} · 更新于 {article.updated_at.slice(0, 10)}</p></div>
        <div className="flex gap-4 text-sm"><Link className="archive-link" href={`/admin/articles/${article.id}/edit`}>编辑</Link>{article.status === "published" && <Link className="archive-link" href={`/articles/${article.id}`} target="_blank">公开页 ↗</Link>}</div>
      </li>)}</ul> : <p className="py-8 text-sm text-muted">暂无文章。点击“新建文章”开始撰写。</p>}
    </AdminPanel>
    <nav className="mt-5 flex gap-6 text-sm">{page > 1 && <Link className="archive-link" href={`/admin/articles?page=${page - 1}`}>← 上一页</Link>}{articles.length === 50 && <Link className="archive-link" href={`/admin/articles?page=${page + 1}`}>下一页 →</Link>}</nav>
  </>;
}
