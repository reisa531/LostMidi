import Link from "next/link";
import { adminRequest } from "@/lib/admin/auth";
import { ApiError } from "@/lib/api/client";
import type { ArticleSummary } from "@/lib/api/articles";
import { AdminPageHeader, AdminPanel, AdminUnavailable } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "文章管理" };
export default async function AdminArticlesPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string; status?: string }> }) {
  const params = await searchParams;
  const raw = params.page ?? "1";
  const page = /^[1-9]\d{0,5}$/.test(raw) ? Number(raw) : 1;
  const q = (params.q ?? "").trim().slice(0, 200);
  const status = params.status === "draft" || params.status === "published" ? params.status : "all";
  const pageHref = (next: number) => `/admin/articles?${new URLSearchParams({ page: String(next), ...(q ? { q } : {}), ...(status !== "all" ? { status } : {}) })}`;
  let result: { data: ArticleSummary[]; page: number; pageSize: number; total: number };
  try { result = await adminRequest<typeof result>(`/api/v1/admin/articles?${new URLSearchParams({ page: String(page), q, status })}`); }
  catch (error) { if (error instanceof ApiError) return <AdminUnavailable />; throw error; }
  return <><AdminPageHeader eyebrow="工作台 / 文章" title="文章管理" description="管理员可撰写 Markdown 文章，关联 MIDI 档案与人物。草稿仅在后台显示。" />
    <AdminPanel title={`文章 · ${result.total}`} action={<Link className="rounded bg-accent px-4 py-2 text-sm text-white" href="/admin/articles/new">新建文章</Link>}>
      <form method="get" className="mb-4 flex flex-wrap gap-2"><input type="search" name="q" defaultValue={q} placeholder="搜索文章标题" aria-label="搜索文章标题" className="min-w-40 flex-1 rounded border border-line px-3 py-2.5 text-sm" /><select name="status" defaultValue={status} aria-label="发布状态" className="rounded border border-line bg-white px-3 py-2.5 text-sm"><option value="all">全部状态</option><option value="draft">草稿</option><option value="published">已发布</option></select><button className="rounded bg-accent px-4 py-2.5 text-sm text-white">筛选</button>{(q || status !== "all") && <Link className="self-center text-sm underline" href="/admin/articles">清除</Link>}</form>
      {result.data.length ? <ul className="divide-y divide-line">{result.data.map(article => <li key={article.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div><Link href={`/admin/articles/${article.id}/edit`} className="archive-link font-medium">{article.title}</Link><p className="mt-1 text-xs text-muted">{article.status === "published" ? "已发布" : "草稿"} · {article.author_username} · 更新于 {article.updated_at.slice(0, 10)}</p></div>
        <div className="flex gap-4 text-sm"><Link className="archive-link" href={`/admin/articles/${article.id}/edit`}>编辑</Link>{article.status === "published" && <Link className="archive-link" href={`/articles/${article.id}`} target="_blank">公开页 ↗</Link>}</div>
      </li>)}</ul> : <p className="py-8 text-sm text-muted">{page > 1 ? "本页没有文章，请返回第一页。" : q || status !== "all" ? "没有匹配的文章，请调整筛选条件。" : "暂无文章。点击“新建文章”开始撰写。"}</p>}
    </AdminPanel>
    <nav className="mt-5 flex gap-6 text-sm" aria-label="后台文章分页">{page > 1 && <Link className="archive-link" href={pageHref(1)}>第一页</Link>}{page > 1 && <Link className="archive-link" href={pageHref(page - 1)}>← 上一页</Link>}{page * result.pageSize < result.total && <Link className="archive-link" href={pageHref(page + 1)}>下一页 →</Link>}</nav>
  </>;
}
