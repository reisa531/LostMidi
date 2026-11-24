import Link from "next/link";
import { ApiError } from "@/lib/api/client";
import { CatalogQueryError, getCatalogEntries, getCatalogOverview, readCatalogQuery, type SearchParams } from "@/lib/api/catalog";
import { Unavailable } from "@/components/archive";
import { CatalogFilters, CatalogPagination, CatalogTable, DataNote, InvalidQuery, PageHeader, StatusSummary } from "@/components/catalog/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "寻回进度", alternates: { canonical: "/recovery" } };

export default async function RecoveryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  let query;
  try { query = readCatalogQuery(await searchParams); } catch (error) {
    if (error instanceof CatalogQueryError) return <InvalidQuery path="/recovery" />;
    throw error;
  }
  let data;
  try { data = await Promise.all([getCatalogOverview(), getCatalogEntries(query)]); } catch (error) {
    if (error instanceof ApiError) return <Unavailable />;
    throw error;
  }
  const [overview, entries] = data;
  return <>
    <PageHeader title="寻回进度" description={"按人工记录的归档状态，查看每份档案当前的寻回与整理情况。"} />
    <section aria-label="全库归档状态统计"><StatusSummary stats={overview.stats} active={query.status} query={query} /></section>
    <aside className="mb-7 mt-4 rounded-xl border border-line bg-wash px-5 py-4 text-xs leading-6 text-muted"><p className="mb-1 font-medium text-foreground">状态不等于文件可用性</p><p>上方为全库统计，不随筛选变化。归档状态由维护者手动记录，与文件留存、访客下载权限各自独立：有文件未必已归档，已归档也不代表可下载。</p><DataNote /></aside>
    <section aria-labelledby="recovery-list"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 id="recovery-list" className="font-serif text-xl">状态明细</h2><span className="text-xs text-muted">{entries.pagination.total.toLocaleString("zh-CN")} 条匹配档案</span></div>
      {(query.person || query.source || query.missing) && <p className="mb-4 text-xs leading-6 text-muted [overflow-wrap:anywhere]">当前范围：{[query.person && `人物 ID ${query.person}`, query.source && `来源「${query.source}」`, query.missing === "author" && "未署名", query.missing === "source" && "来源待补"].filter(Boolean).join(" · ")}<Link href="/recovery" className="archive-link ml-3">清除所有筛选</Link></p>}
      <CatalogFilters path="/recovery" query={query} />
      <CatalogTable entries={entries.data} caption="寻回状态明细" />
      <CatalogPagination pagination={entries.pagination} path="/recovery" query={query} label="寻回状态分页" />
    </section>
  </>;
}
