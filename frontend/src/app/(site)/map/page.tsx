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
      {(["author", "source"] as const).map(by => <Link key={by} href={catalogHref("/map", { ...query, by, group: undefined, missing: undefined, groupPage: undefined, page: undefined })} aria-current={query.by === by ? "page" : undefined} className={`rounded-md px-5 py-2.5 text-sm ${query.by === by ? "bg-accent font-medium text-white" : "text-muted hover:bg-wash hover:text-accent"}`}>{by === "author" ? "按作者" : "按来源"}</Link>)}
    </nav>
    <div className="map-browser">
    <section className="group-index" aria-labelledby="group-summary">
      <header><h2 id="group-summary">{query.by === "author" ? "人物索引" : "来源索引"}</h2><span>{groups.pagination.total.toLocaleString("zh-CN")} 组</span></header>
      {groups.data.length ? <ul>{groups.data.map(group => {
        const active = selected && (group.key === "" ? query.missing === query.by : group.key === query.group);
        const href = catalogHref("/map", { ...query, group: group.key || undefined, missing: group.key === "" ? query.by : undefined, page: undefined });
        return <li key={group.key}><Link href={`${href}#group-entries`} aria-current={active ? "true" : undefined}>
          <strong>{group.label}</strong><span>{group.entries} 部作品 · {group.with_files} 部有文件 · {group.downloadable} 部可下载</span>
        </Link></li>;
      })}</ul> : <EmptyState title="此页暂无分组" description="分组根据已收录作品的署名和来源生成。没有署名或来源的作品单独列为待补组。" />}
      <CatalogPagination pagination={groups.pagination} path="/map" query={query} pageKey="groupPage" label="分组分页" />
      <details className="mt-4 text-xs leading-6 text-muted"><summary>统计口径</summary><p>每组内按作品去重。同一作品可属于多个作者或来源。上方分组数量独立于作品筛选。</p><DataNote /></details>
    </section>
    <section id="group-entries" aria-labelledby="group-title" className="scroll-mt-6"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><p className="eyebrow">分组 / 作品</p><h2 id="group-title" className="mt-2 font-serif text-2xl [overflow-wrap:anywhere]">{selected ? selectedLabel : "选择一个分组"}</h2></div>{selected && <Link className="archive-link text-xs" href={catalogHref("/map", clearSelection)}>取消分组选择</Link>}</div>
      {entries ? <><CatalogFilters path="/map" query={query} /><p className="mb-3 text-xs text-muted">本组匹配 {entries.pagination.total.toLocaleString("zh-CN")} 条档案</p><CatalogTable entries={entries.data} caption="所选分组的作品" /><CatalogPagination pagination={entries.pagination} path="/map" query={query} label="分组内作品分页" /></> : <EmptyState title="从总表继续探索" description="从索引中选择人物或来源，再按状态筛选该组作品。" />}
    </section>
    </div>
  </>;
}
