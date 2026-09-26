import Link from "next/link";
import { ApiError } from "@/lib/api/client";
import { CatalogQueryError, catalogHref, getCatalogEntries, readCatalogQuery, type SearchParams } from "@/lib/api/catalog";
import { archiveStates } from "@/lib/api/catalog";
import { requireAdmin } from "@/lib/admin/auth";
import { Status, roleName } from "@/components/archive";
import { AdminPageHeader, AdminPanel, AdminUnavailable } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "MIDI 档案" };
export default async function AdminMidis({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const raw = await searchParams;
  const { deleted } = raw;
  const filters = { ...raw }; delete filters.deleted;
  if (filters.q === "") delete filters.q;
  let query;
  try { query = readCatalogQuery(filters); } catch (error) {
    if (error instanceof CatalogQueryError) return <><AdminPageHeader eyebrow="档案 / MIDI" title="MIDI 档案" description="按标题、状态和更新时间管理作品资料。" /><p role="alert" className="rounded-lg bg-amber-50 p-4">筛选条件无效，请返回第一页重新选择。<Link className="archive-link ml-2" href="/admin/midis">重置</Link></p></>;
    throw error;
  }
  let result;
  try { result = await getCatalogEntries({ ...query, pageSize: 20 }); } catch (error) {
    const header = <AdminPageHeader eyebrow="档案 / MIDI" title="MIDI 档案" description="新增和编辑作品基础资料，维护归档状态与权利信息。" />;
    if (error instanceof ApiError) return <>{header}<AdminUnavailable /></>;
    throw error;
  }
  const pages = Math.max(1, Math.ceil(result.pagination.total / result.pagination.pageSize));
  const pageHref = (page: number) => catalogHref("/midis", { q: query.q, status: query.status, sort: query.sort, page, pageSize: 20 }).replace(/^\/midis/, "/admin/midis");
  return <><AdminPageHeader eyebrow="档案 / MIDI" title="MIDI 档案" description="新增和编辑作品基础资料，维护归档状态与权利信息。" />
    {deleted === "1" && <p role="status" className="mb-6 rounded-lg bg-green-50 p-4 text-sm text-green-900">档案已移入回收站，可随时恢复。关联记录和文件均已保留。</p>}
    <AdminPanel title={`档案 · ${result.pagination.total}`} action={<Link className="rounded-lg bg-accent px-4 py-2 text-sm text-white" href="/admin/midis/new">新增档案</Link>}>
      <form action="/admin/midis" method="get" className="mb-5 grid gap-3 rounded-lg border border-line p-4 sm:grid-cols-[minmax(12rem,1fr)_auto_auto_auto]"><input className="min-w-0 rounded-lg border border-line px-3 py-2 text-sm" name="q" defaultValue={query.q ?? ""} maxLength={200} placeholder="搜索标题、slug、人物或来源" aria-label="搜索 MIDI 档案" /><select className="rounded-lg border border-line px-3 py-2 text-sm" name="status" defaultValue={query.status ?? ""} aria-label="归档状态"><option value="">全部状态</option>{archiveStates.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select><select className="rounded-lg border border-line px-3 py-2 text-sm" name="sort" defaultValue={query.sort} aria-label="排序"><option value="updated">最近更新</option><option value="title">作品名称</option></select><button className="rounded-lg bg-accent px-4 py-2 text-sm text-white">筛选</button></form>
      {result.data.length ? <div className="space-y-3"><div aria-hidden="true" className="hidden gap-3 px-4 text-xs text-muted lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(8rem,0.7fr)_minmax(10rem,1fr)_5.5rem_minmax(14rem,1.5fr)]"><span>作品</span><span>推测时间</span><span>署名与更新</span><span>状态</span><span>操作</span></div>{result.data.map(entry => <article key={entry.id} className="grid min-w-0 gap-3 rounded-lg border border-line p-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(8rem,0.7fr)_minmax(10rem,1fr)_5.5rem_minmax(14rem,1.5fr)] lg:items-start"><div className="min-w-0"><Link className="break-words font-medium text-accent hover:underline" href={`/admin/midis/${entry.id}/edit`}>{entry.title}</Link><p className="mt-1 break-all font-mono text-xs text-muted">{entry.slug}</p></div><div className="text-sm lg:pt-0.5"><span className="mr-2 text-xs text-muted lg:hidden">推测时间</span>{entry.estimated_date ? `约 ${entry.estimated_date}` : entry.estimated_year ? `约 ${entry.estimated_year} 年` : "时间不详"}</div><div className="min-w-0 text-xs text-muted">{entry.credits.length ? entry.credits.map(c => <p key={`${c.person_id}-${c.role}`}>{c.display_name} · {roleName(c.role)}</p>) : "署名待考"}<p>{entry.file_count} 个文件 · 更新 {entry.updated_at.slice(0, 10)}</p></div><div className="lg:pt-0.5"><Status status={entry.archive_status} /></div><div className="flex flex-wrap items-start gap-x-3 gap-y-2 text-xs"><Link className="archive-link text-xs" href={`/midis/${entry.slug}`} target="_blank" rel="noopener noreferrer">公开页 ↗</Link><Link className="archive-link text-xs" href={`/admin/midis/${entry.id}/edit`}>编辑</Link><Link className="archive-link text-xs" href={`/admin/midis/${entry.id}/credits`}>署名</Link><Link className="archive-link text-xs" href={`/admin/midis/${entry.id}/history`}>来源</Link><Link className="archive-link text-xs" href={`/admin/midis/${entry.id}/files`}>文件</Link></div></article>)}</div> : <p className="py-10 text-center text-sm text-muted">{query.q || query.status ? "没有符合筛选条件的档案。" : "尚无档案。"} <Link className="archive-link ml-2" href="/admin/midis">重置筛选</Link></p>}
      <nav aria-label="后台档案分页" className="mt-6 flex justify-between border-t border-line pt-5 text-sm"><span>第 {query.page} / {pages} 页</span><div className="flex gap-5">{query.page > 1 && <Link className="archive-link" href={pageHref(query.page - 1)}>上一页</Link>}{query.page < pages && <Link className="archive-link" href={pageHref(query.page + 1)}>下一页</Link>}</div></nav>
    </AdminPanel></>;
}
