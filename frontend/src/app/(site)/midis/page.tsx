import Link from "next/link";
import { ApiError } from "@/lib/api/client";
import { CatalogQueryError, getCatalogEntries, readCatalogQuery, type SearchParams } from "@/lib/api/catalog";
import { Unavailable } from "@/components/archive";
import { CatalogFilters, CatalogPagination, CatalogTable, DataNote, InvalidQuery, PageHeader } from "@/components/catalog/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "MIDI 档案" };

export default async function MidiListPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  let query;
  try { query = readCatalogQuery(await searchParams); } catch (error) {
    if (error instanceof CatalogQueryError) return <InvalidQuery path="/midis" />;
    throw error;
  }
  let result;
  try { result = await getCatalogEntries(query); } catch (error) {
    if (error instanceof ApiError) return <Unavailable />;
    throw error;
  }
  const grouped = query.person || query.source || query.missing;
  return <>
    <PageHeader eyebrow="Archive / MIDI" title="MIDI 档案" description="作品、署名与历史来源放在同一张目录中。按归档状态筛选，或从作者与来源分组继续查找。" />
    {grouped && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-[#edf0e5] p-4 text-sm"><p className="min-w-0 [overflow-wrap:anywhere]">当前范围：{[query.person && `人物 ID ${query.person}`, query.source && `来源「${query.source}」`, query.missing === "author" && "未署名", query.missing === "source" && "来源待补"].filter(Boolean).join(" · ")}</p><Link className="archive-link text-xs" href="/midis">清除所有筛选</Link></div>}
    <CatalogFilters path="/midis" query={query} />
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-sm font-medium">{grouped || query.status ? "筛选结果" : "全部作品"}</h2><p className="text-xs text-muted">{result.pagination.total.toLocaleString("zh-CN")} 条档案 · 按{query.sort === "title" ? "作品名称" : "最近更新"}排序</p></div>
    <CatalogTable entries={result.data} />
    <CatalogPagination pagination={result.pagination} path="/midis" query={query} />
    <div className="mt-5"><DataNote /></div>
  </>;
}
