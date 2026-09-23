import Link from "next/link";
import { ApiError } from "@/lib/api/client";
import { CatalogQueryError, catalogHref, getCatalogPeople, readPeopleQuery, type SearchParams } from "@/lib/api/catalog";
import { Unavailable } from "@/components/archive";
import { CatalogPagination, EmptyState, InvalidQuery, PageHeader } from "@/components/catalog/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "作者" };

export default async function PeoplePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  let query;
  try { query = readPeopleQuery(await searchParams); } catch (error) {
    if (error instanceof CatalogQueryError) return <InvalidQuery path="/people" />;
    throw error;
  }
  let result;
  try { result = await getCatalogPeople(query); } catch (error) {
    if (error instanceof ApiError) return <Unavailable />;
    throw error;
  }
  return <>
    <PageHeader eyebrow="Archive / People" title="作者与参与者" description="从历史昵称找到作品背后的人。这里收录作曲者、编曲者、音序制作者及其他贡献者；相关作品数按作品去重。" />
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-medium">人物索引</h2><span className="text-xs text-muted">共 {result.pagination.total.toLocaleString("zh-CN")} 位</span></div>
    {result.data.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{result.data.map(person => <article key={person.id} className="flex min-w-0 flex-col rounded-xl border border-line bg-white/70 p-5 [overflow-wrap:anywhere]">
      <div className="mb-4 flex items-center justify-between gap-3"><span className="text-[10px] tracking-wider text-muted">人物档案 / {person.id}</span><span className="shrink-0 rounded-full bg-[#e8eee2] px-2.5 py-1 text-xs text-accent tabular-nums">{person.midi_count} 部作品</span></div>
      <h3 className="font-serif text-xl"><Link href={`/people/${person.id}`} className="hover:text-accent hover:underline">{person.display_name}</Link></h3>
      <p className="mt-2 text-xs leading-6 text-muted">历史昵称：{person.aliases.length ? person.aliases.join(" / ") : "尚未登记"}</p>
      <p className="mb-5 mt-3 line-clamp-3 text-sm leading-7 text-muted">{person.biography || "人物资料尚待补充。已知署名与相关作品保留在人物档案中。"}</p>
      <div className="mt-auto flex flex-wrap justify-between gap-3 border-t border-line pt-4 text-xs"><Link href={`/people/${person.id}`} className="archive-link" aria-label={`查看 ${person.display_name} 的人物档案`}>人物详情 →</Link><Link href={catalogHref("/map", { group: person.id })} className="text-muted hover:text-accent hover:underline" aria-label={`按 ${person.display_name} 查看作品分组`}>查看作品分组</Link></div>
    </article>)}</div> : <EmptyState title="此页暂无人物" description="人物资料录入后，会在这里展示历史昵称与相关作品。也可以尝试返回第一页。" />}
    <CatalogPagination pagination={result.pagination} path="/people" query={query} label="人物分页" />
  </>;
}
