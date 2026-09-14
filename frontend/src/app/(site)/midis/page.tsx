import Link from "next/link";
import { getMidis } from "@/lib/api/midi";
import { Credits, Status, Unavailable } from "@/components/archive";
import { ApiError } from "@/lib/api/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "MIDI 档案" };

export default async function MidiListPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const { page: raw = "1" } = await searchParams;
  if (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw) || Number(raw) > 1000000) {
    return <p>页码无效。<Link className="archive-link" href="/midis">返回档案第一页</Link></p>;
  }
  const page = Number(raw);
  let result;
  try { result = await getMidis(page); } catch (error) {
    if (error instanceof ApiError) return <Unavailable />;
    throw error;
  }
  const { data, pagination } = result;
  const pages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize));
  return <>
    <p className="eyebrow">The collection</p><h1 className="mb-5 mt-4 font-serif text-4xl">MIDI 档案</h1>
    <p className="mb-10 max-w-2xl leading-7 text-muted">每一条记录都保留作品的来处、人物与寻回线索。未知的信息，也是一段有待继续的历史。</p>
    <p className="mb-3 text-xs text-muted">共 {pagination.total} 条档案</p>
    <div className="border-t border-line">{data.length ? data.map(entry => <article key={entry.id} className="grid gap-4 border-b border-line py-7 sm:grid-cols-[1fr_12rem]">
      <div><p className="mb-2 text-xs text-muted">约 {entry.estimated_year ?? "年代不详"}</p>
        <h2 className="mb-3 font-serif text-2xl"><Link className="hover:text-accent hover:underline" href={`/midis/${entry.slug}`}>{entry.title}</Link></h2>
        <div className="text-sm"><Credits credits={entry.credits} /></div></div>
      <div className="sm:text-right"><Status status={entry.archive_status} /></div>
    </article>) : <p className="py-10 text-muted">本页暂无档案。{page > 1 && <Link className="archive-link" href="/midis">返回第一页</Link>}</p>}</div>
    <nav aria-label="档案分页" className="mt-8 flex flex-wrap items-center justify-between gap-4 text-sm">
      <span className="text-muted">第 {page} 页 · 共 {pages} 页</span><div className="flex gap-6">
        {page > 1 && <Link className="archive-link" href={`/midis?page=${page - 1}`}>上一页</Link>}
        {page < pages && <Link className="archive-link" href={`/midis?page=${page + 1}`}>下一页</Link>}
      </div>
    </nav>
  </>;
}
