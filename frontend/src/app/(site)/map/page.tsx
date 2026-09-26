import Link from "next/link";
import { ApiError } from "@/lib/api/client";
import { CatalogQueryError, catalogHref, getCatalogEntries, getCatalogGroups, mapEntryQuery, readMapQuery, type SearchParams } from "@/lib/api/catalog";
import { Unavailable } from "@/components/archive";
import { CatalogFilters, CatalogPagination, CatalogTable, DataNote, EmptyState, InvalidQuery, PageHeader } from "@/components/catalog/ui";
import { getPersonById } from "@/lib/api/person";

export const dynamic = "force-dynamic";
export const metadata = { title: "关系图谱 · 档案分组", alternates: { canonical: "/map" } };

export default async function MapPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  let query;
  try { query = readMapQuery(await searchParams); } catch (error) {
    if (error instanceof CatalogQueryError) return <InvalidQuery path="/map" />;
    throw error;
  }
  const selected = query.group !== undefined || query.missing !== undefined;
  let data;
  try {
    data = await Promise.all([
      getCatalogGroups(query.by, query.groupPage),
      selected ? getCatalogEntries(mapEntryQuery(query)) : Promise.resolve(null),
    ]);
  } catch (error) {
    if (error instanceof ApiError) return <Unavailable />;
    throw error;
  }
  const [groups, entries] = data;
  const selectedGroup = groups.data.find(group => query.missing ? group.key === "" : group.key === query.group);
  const personName = entries?.data.flatMap(entry => entry.credits).find(credit => credit.person_id === query.group)?.display_name;
  let selectedPersonName = personName;
  if (query.by === "author" && query.group && !selectedGroup && !selectedPersonName) {
    try { selectedPersonName = (await getPersonById(query.group)).person.display_name; }
    catch { /* Retain the ID label if this person was removed between queries. */ }
  }
  const selectedLabel = query.missing ? (query.by === "author" ? "未署名" : "来源待补") : selectedGroup?.label ?? (query.by === "source" ? query.group : selectedPersonName ?? `人物 ID ${query.group}`);
  const clearSelection = { ...query, group: undefined, missing: undefined, page: undefined };
  return <>
    <PageHeader eyebrow="档案 / 关系图谱" title="关系图谱 · 档案分组" description="这是一份作品与来处的索引。按作者或历史网站归拢记录，查看各组的文件留存与下载权限情况。" />
    <nav aria-label="分组方式" className="mb-5 inline-flex max-w-full flex-wrap gap-1 rounded-lg border border-line bg-white/60 p-1">
      {(["author", "source"] as const).map(by => <Link key={by} href={catalogHref("/map", { ...query, by, group: undefined, missing: undefined, groupPage: undefined, page: undefined })} aria-current={query.by === by ? "page" : undefined} className={`rounded-md px-5 py-2.5 text-sm ${query.by === by ? "bg-accent font-medium text-white" : "text-muted hover:bg-[#e9ede2] hover:text-accent"}`}>{by === "author" ? "按作者" : "按来源"}</Link>)}
    </nav>
    <section aria-labelledby="group-summary"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 id="group-summary" className="font-serif text-xl">{query.by === "author" ? "作者与参与者" : "历史网站"}总表</h2><span className="text-xs text-muted">共 {groups.pagination.total.toLocaleString("zh-CN")} 组 · 点击分组查看作品</span></div>
      {groups.data.length ? <><ul className="space-y-3 sm:hidden">{groups.data.map(group => {
        const active = selected && (group.key === "" ? query.missing === query.by : group.key === query.group);
        const href = catalogHref("/map", { ...query, group: group.key || undefined, missing: group.key === "" ? query.by : undefined, page: undefined });
        return <li key={group.key} className={`rounded-xl border p-4 ${active ? "border-accent bg-[#e8eee2]" : "border-line bg-white/70"}`}><Link href={`${href}#group-entries`} aria-current={active ? "true" : undefined} className="font-medium text-accent underline-offset-4 hover:underline">{group.label} →</Link><p className="mt-3 text-xs text-muted">{group.entries} 部作品 · {group.with_files} 部有文件 · {group.downloadable} 部符合下载权限</p></li>;
      })}</ul><div role="region" aria-label="分组汇总表" tabIndex={0} className="hidden min-w-0 max-w-full overflow-x-auto rounded-xl border border-line bg-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:block"><table className="w-full min-w-[580px] table-fixed text-left text-sm"><caption className="sr-only">按{query.by === "author" ? "作者" : "来源"}汇总的作品数、有文件作品数及符合下载权限的作品数</caption><thead className="border-b border-line bg-[#efefe7] text-xs text-muted"><tr><th scope="col" className="w-[43%] px-5 py-3 font-medium">{query.by === "author" ? "作者 / 参与者" : "来源网站名称"}</th><th scope="col" className="w-[17%] px-4 py-3 text-right font-medium">作品</th><th scope="col" className="w-[18%] px-4 py-3 text-right font-medium">有文件</th><th scope="col" className="w-[22%] px-5 py-3 text-right font-medium">符合下载权限</th></tr></thead><tbody className="divide-y divide-line">{groups.data.map(group => {
        const active = selected && (group.key === "" ? query.missing === query.by : group.key === query.group);
        const href = catalogHref("/map", { ...query, group: group.key || undefined, missing: group.key === "" ? query.by : undefined, page: undefined });
        return <tr key={group.key} className={`transition ${active ? "bg-[#e8eee2]" : "hover:bg-[#f5f6ee]"}`}><th scope="row" className="px-5 py-3.5 font-medium [overflow-wrap:anywhere]"><Link href={`${href}#group-entries`} aria-current={active ? "true" : undefined} className="text-accent hover:underline">{group.label}<span aria-hidden="true" className="ml-3">{active ? "↓" : "→"}</span></Link>{active && <span className="ml-3 text-[10px] font-normal text-muted">已选择</span>}</th><td className="px-4 py-3.5 text-right tabular-nums">{group.entries.toLocaleString("zh-CN")}</td><td className="px-4 py-3.5 text-right text-muted tabular-nums">{group.with_files.toLocaleString("zh-CN")}</td><td className="px-5 py-3.5 text-right text-accent tabular-nums">{group.downloadable.toLocaleString("zh-CN")}</td></tr>;
      })}</tbody></table></div></> : <EmptyState title="此页暂无分组" description="分组根据已收录作品的署名和来源生成。没有署名或来源的作品会单独列为待补组；也可尝试返回第一页。" />}
      <CatalogPagination pagination={groups.pagination} path="/map" query={query} pageKey="groupPage" label="分组分页" />
      <aside className="mb-8 mt-4 rounded-xl border border-line bg-[#edf0e5] px-5 py-4 text-xs leading-6 text-muted"><p>各组内按作品去重；同一作品可能属于多个作者或来源，因此不能将各组相加作为全库作品数。总表不受下方状态筛选影响。{query.by === "author" ? "作者分组包含作曲、编曲、音序制作及其他署名。" : "网站名称仅作分组标签，不作为外部网址打开。"}</p><DataNote /></aside>
    </section>
    <section id="group-entries" aria-labelledby="group-title" className="scroll-mt-6"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><p className="eyebrow">分组 / 作品</p><h2 id="group-title" className="mt-2 font-serif text-2xl [overflow-wrap:anywhere]">{selected ? selectedLabel : "选择一个分组"}</h2></div>{selected && <Link className="archive-link text-xs" href={catalogHref("/map", clearSelection)}>取消分组选择</Link>}</div>
      {entries ? <><CatalogFilters path="/map" query={query} /><p className="mb-3 text-xs text-muted">本组匹配 {entries.pagination.total.toLocaleString("zh-CN")} 条档案</p><CatalogTable entries={entries.data} caption="所选分组的作品" /><CatalogPagination pagination={entries.pagination} path="/map" query={query} label="分组内作品分页" /></> : <EmptyState title="从总表继续探索" description="选择上方的作者或来源，即可在这里筛选与浏览该组作品。翻动分组页不会清除已选分组。" />}
    </section>
  </>;
}
