import Link from "next/link";
import { Credits, Status, dateLabel } from "@/components/archive";
import { archiveStates, catalogHref, type CatalogPath, type UrlQuery } from "@/lib/api/catalog";
import type { ArchiveStatus, CatalogEntry, CatalogPagination as PaginationData, CatalogOverview } from "@/lib/api/types";

export const primaryLink = "inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-foreground";
export const secondaryLink = "inline-flex items-center justify-center rounded-lg border border-line bg-white/70 px-4 py-2.5 text-sm font-medium text-accent transition hover:bg-white";
const statusColors: Record<ArchiveStatus, string> = {
  archived: "bg-[#e6eee4]",
  partially_recovered: "bg-[#faf0d9]",
  lost: "bg-[#f7e6df]",
  uncertain: "bg-[#edece6]",
};
export function CatalogStatus({ status }: { status: ArchiveStatus }) {
  return <span className={`inline-block rounded-full [&>span]:rounded-full [&>span]:border-transparent ${statusColors[status]}`}><Status status={status} /></span>;
}
export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <header className="mb-7 flex flex-wrap items-end justify-between gap-5"><div className="min-w-0 max-w-2xl"><p className="eyebrow">{eyebrow}</p><h1 className="mb-3 mt-3 font-serif text-3xl tracking-tight sm:text-4xl">{title}</h1><p className="text-sm leading-7 text-muted">{description}</p></div>{action}</header>;
}
export function MetricGrid({ items }: { items: { label: string; value: number; note: string; href?: string }[] }) {
  return <dl className={`grid grid-cols-2 gap-3 ${items.length > 4 ? "lg:grid-cols-6 sm:grid-cols-3" : "lg:grid-cols-4"}`}>
    {items.map(item => <div key={item.label} className="min-w-0 rounded-xl border border-line bg-white/70 px-4 py-4 sm:px-5"><dt className="text-xs text-muted">{item.label}</dt><dd className="my-2 text-3xl font-semibold tracking-tight text-accent tabular-nums [overflow-wrap:anywhere]">{item.href ? <Link href={item.href} className="hover:underline" aria-label={`${item.label} ${item.value}，查看详情`}>{item.value.toLocaleString("zh-CN")}</Link> : item.value.toLocaleString("zh-CN")}</dd><dd className="text-[11px] leading-5 text-muted">{item.note}</dd></div>)}
  </dl>;
}
export function OverviewMetrics({ stats }: { stats: CatalogOverview["stats"] }) {
  return <MetricGrid items={[
    { label: "MIDI 档案", value: stats.entries, note: "已收录的作品", href: "/midis" },
    { label: "人物", value: stats.people, note: "作者及参与者", href: "/people" },
    { label: "文件记录", value: stats.files, note: "所有关联文件" },
    { label: "有文件的作品", value: stats.with_files, note: "按作品去重" },
    { label: "可下载的作品", value: stats.downloadable, note: "按分发权限判定" },
    { label: "历史来源", value: stats.sources, note: "不同的网站名称", href: "/map?by=source" },
  ]} />;
}
export function DataNote() {
  return <p className="text-xs leading-6 text-muted">有文件与可下载均按作品计数；可下载表示符合分发权限，不代表已验证存储或链接可用。</p>;
}
export function EmptyState({ title = "暂无档案", description = "目前还没有符合条件的记录。", action }: { title?: string; description?: string; action?: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line bg-white/40 px-5 py-10 text-center"><p className="font-medium">{title}</p><p className="mx-auto mt-2 max-w-lg text-sm leading-7 text-muted">{description}</p>{action && <div className="mt-4 text-sm">{action}</div>}</div>;
}
export function InvalidQuery({ path }: { path: CatalogPath }) {
  return <div role="alert"><EmptyState title="筛选参数无效" description="页码、筛选值或重复参数无法识别。请从默认列表重新选择，尚未执行查询。" action={<Link className="archive-link" href={path}>重置筛选</Link>} /></div>;
}
export function CatalogFilters({ path, query }: { path: CatalogPath; query: UrlQuery }) {
  const preserved = Object.entries(query).filter(([key, value]) => value !== undefined && !["page", "status", "sort"].includes(key));
  const reset = { ...query, page: undefined, status: undefined, sort: undefined };
  const controlClass = "w-full min-w-0 rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-foreground focus:outline-2 focus:outline-offset-2 focus:outline-accent sm:w-auto";
  return <form key={`${query.status ?? "all"}-${query.sort}`} action={path} method="get" aria-label="筛选档案" className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-white/50 p-4">
    {preserved.map(([key, value]) => <input key={key} type="hidden" name={key} value={String(value)} />)}
    <label className="min-w-0 flex-1 space-y-2 sm:flex-none"><span className="block text-xs text-muted">归档状态</span><select name="status" defaultValue={query.status ?? ""} className={controlClass}><option value="">全部状态</option>{archiveStates.map(state => <option key={state.value} value={state.value}>{state.label}</option>)}</select></label>
    <label className="min-w-0 flex-1 space-y-2 sm:flex-none"><span className="block text-xs text-muted">排序方式</span><select name="sort" defaultValue={query.sort ?? "updated"} className={controlClass}><option value="updated">最近更新</option><option value="title">作品名称</option></select></label>
    <button type="submit" className={primaryLink}>应用筛选</button><Link href={catalogHref(path, reset)} className="px-2 py-2.5 text-xs text-muted hover:text-accent hover:underline">重置状态与排序</Link>
  </form>;
}
export function CatalogTable({ entries, caption = "MIDI 档案列表" }: { entries: CatalogEntry[]; caption?: string }) {
  if (!entries.length) return <EmptyState description="此页暂无符合条件的档案。可以调整筛选条件或返回第一页。" />;
  return <div role="region" aria-label={`${caption}，窄屏可横向滚动`} tabIndex={0} className="min-w-0 max-w-full overflow-x-auto rounded-xl border border-line bg-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
    <table className="w-full min-w-[760px] table-fixed text-left text-sm"><caption className="sr-only">{caption}：作品、署名、历史来源、归档状态及文件</caption>
      <thead className="border-b border-line bg-[#efefe7] text-xs text-muted"><tr><th scope="col" className="w-[28%] px-5 py-3 font-medium">作品 / 更新日期</th><th scope="col" className="w-[20%] px-4 py-3 font-medium">署名</th><th scope="col" className="w-[20%] px-4 py-3 font-medium">历史来源</th><th scope="col" className="w-[15%] px-4 py-3 font-medium">归档状态</th><th scope="col" className="w-[17%] px-4 py-3 font-medium">文件 / 下载资格</th></tr></thead>
      <tbody className="divide-y divide-line">{entries.map(entry => <tr key={entry.id} className="align-top transition hover:bg-[#f5f6ee]">
        <th scope="row" className="px-5 py-4 text-left font-normal [overflow-wrap:anywhere]"><Link href={`/midis/${entry.public_id}`} className="font-medium text-foreground hover:text-accent hover:underline">{entry.title}</Link><p className="mt-2 text-xs leading-5 text-muted">{entry.estimated_date ? `约 ${entry.estimated_date}` : entry.estimated_year === null ? "时间不详" : `约 ${entry.estimated_year} 年`}<br />更新于 {dateLabel(entry.updated_at)}</p></th>
        <td className="px-4 py-4 text-xs leading-5 [overflow-wrap:anywhere]"><Credits credits={entry.credits} /></td>
        <td className="px-4 py-4 text-xs leading-6 [overflow-wrap:anywhere]">{entry.sources.length ? <ul className="space-y-1">{entry.sources.map(source => <li key={source}><Link className="text-muted underline decoration-line underline-offset-4 hover:text-accent" href={catalogHref("/map", { by: "source", group: source })}>{source}</Link></li>)}</ul> : <span className="text-muted">来源待补</span>}</td>
        <td className="px-4 py-4"><CatalogStatus status={entry.archive_status} /></td>
        <td className="px-4 py-4 text-xs leading-6 tabular-nums"><p className={entry.file_count ? "text-foreground" : "text-muted"}>{entry.file_count ? `${entry.file_count} 个文件` : "暂无文件"}</p><p className={entry.downloadable_file_count ? "text-accent" : "text-muted"}>{entry.downloadable_file_count ? `${entry.downloadable_file_count} 个符合下载权限` : "暂无可下载文件"}</p></td>
      </tr>)}</tbody>
    </table>
  </div>;
}
export function CatalogPagination({ pagination, path, query, pageKey = "page", label = "档案分页" }: { pagination: PaginationData; path: CatalogPath; query: UrlQuery; pageKey?: "page" | "groupPage"; label?: string }) {
  const pages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize));
  const page = pagination.page;
  return <nav aria-label={label} className="mt-5 flex flex-wrap items-center justify-between gap-4 text-xs"><p className="text-muted">共 {pagination.total.toLocaleString("zh-CN")} 条 · 第 {page} 页 / 共 {pages} 页</p><div className="flex flex-wrap gap-4">
    {page > 1 && <Link className="archive-link" href={catalogHref(path, { ...query, [pageKey]: 1 })}>第一页</Link>}
    {page > 1 && <Link rel="prev" className="archive-link" href={catalogHref(path, { ...query, [pageKey]: page - 1 })}>上一页</Link>}
    {page < pages && <Link rel="next" className="archive-link" href={catalogHref(path, { ...query, [pageKey]: page + 1 })}>下一页</Link>}
  </div></nav>;
}
export function EntryActivity({ entries, admin = false, empty }: { entries: CatalogEntry[]; admin?: boolean; empty: string }) {
  if (!entries.length) return <p className="py-6 text-sm leading-7 text-muted">{empty}</p>;
  return <ul className="divide-y divide-line">{entries.map(entry => <li key={entry.id} className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-0 last:pb-0"><div className="min-w-0 flex-1 basis-44 [overflow-wrap:anywhere]"><Link href={admin ? `/admin/midis/${entry.id}/edit` : `/midis/${entry.public_id}`} className="text-sm font-medium hover:text-accent hover:underline">{entry.title}</Link><p className="mt-2 text-xs leading-5 text-muted">{dateLabel(entry.updated_at)} 更新<span className="px-2" aria-hidden="true">·</span>{entry.file_count ? `${entry.file_count} 个文件` : "暂无文件"}</p></div><CatalogStatus status={entry.archive_status} /></li>)}</ul>;
}
export function StatusSummary({ stats, active, query = {} }: { stats: CatalogOverview["stats"]; active?: ArchiveStatus; query?: UrlQuery }) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{archiveStates.map(state => <Link key={state.value} href={catalogHref("/recovery", { ...query, status: state.value, page: undefined })} aria-current={active === state.value ? "true" : undefined} className={`min-w-0 rounded-xl border p-4 transition hover:border-accent sm:p-5 ${active === state.value ? "border-accent bg-[#e8eee2]" : "border-line bg-white/70"}`}><CatalogStatus status={state.value} /><p className="mb-1 mt-3 text-3xl font-semibold text-accent tabular-nums [overflow-wrap:anywhere]">{stats.statuses[state.value].toLocaleString("zh-CN")}</p><p className="text-xs leading-6 text-muted">{state.description}</p></Link>)}</div>;
}
