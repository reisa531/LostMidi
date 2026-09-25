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
    <PageHeader eyebrow="档案 / 寻回" title="寻回进度" description="哪些作品已经归档，哪些仍在寻找？以人工记录的归档状态为线索，查看每一份档案当前的整理情况。" />
    <section aria-label="全库归档状态统计"><StatusSummary stats={overview.stats} active={query.status} query={query} /></section>
    <aside className="mb-7 mt-4 rounded-xl border border-line bg-[#edf0e5] px-5 py-4 text-xs leading-6 text-muted"><p className="mb-1 font-medium text-foreground">状态不等于文件可用性</p><p>上方为全库统计，不随下方筛选改变。归档状态由维护者手动记录，与是否有文件、是否允许下载分别管理；有文件不一定已归档，已归档也不保证可以下载。</p><DataNote /></aside>
    <section aria-labelledby="recovery-list"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 id="recovery-list" className="font-serif text-xl">状态明细</h2><span className="text-xs text-muted">{entries.pagination.total.toLocaleString("zh-CN")} 条匹配档案</span></div>
      {(query.person || query.source || query.missing) && <p className="mb-4 text-xs leading-6 text-muted [overflow-wrap:anywhere]">当前范围：{[query.person && `人物 ID ${query.person}`, query.source && `来源「${query.source}」`, query.missing === "author" && "未署名", query.missing === "source" && "来源待补"].filter(Boolean).join(" · ")}<Link href="/recovery" className="archive-link ml-3">清除所有筛选</Link></p>}
      <CatalogFilters path="/recovery" query={query} />
      <CatalogTable entries={entries.data} caption="寻回状态明细" />
      <CatalogPagination pagination={entries.pagination} path="/recovery" query={query} label="寻回状态分页" />
    </section>
  </>;
}
