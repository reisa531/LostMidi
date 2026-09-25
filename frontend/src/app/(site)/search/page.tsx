import Link from "next/link";
import { ApiError } from "@/lib/api/client";
import { getCatalogEntries, getCatalogPeople, type SearchParams } from "@/lib/api/catalog";
import type { CatalogEntries, CatalogPeople } from "@/lib/api/types";
import { Unavailable } from "@/components/archive";
import { EmptyState, PageHeader } from "@/components/catalog/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "搜索档案", robots: { index: false, follow: true } };

export default async function SearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = await searchParams;
  const q = raw.q;
  const pageRaw = raw.page;
  if ((q !== undefined && (typeof q !== "string" || !q.trim() || new TextEncoder().encode(q).length > 200)) ||
      (pageRaw !== undefined && (typeof pageRaw !== "string" || !/^[1-9]\d*$/.test(pageRaw) || Number(pageRaw) > 1000000)))
    return <EmptyState title="搜索条件无效" description="请使用 1 到 200 字节的关键词，并从第一页重新搜索。" action={<Link href="/search" className="archive-link">重置搜索</Link>} />;
  const page = pageRaw === undefined ? 1 : Number(pageRaw);
  let entries: CatalogEntries | undefined;
  let people: CatalogPeople | undefined;
  if (q) {
    try {
      [entries, people] = await Promise.all([
        getCatalogEntries({ page, pageSize: 10, sort: "updated", q }),
        getCatalogPeople({ page, pageSize: 10, q }),
      ]);
    } catch (error) {
      if (error instanceof ApiError) return <Unavailable />;
      throw error;
    }
  }
  const pages = Math.max(1, Math.ceil(Math.max(entries?.pagination.total ?? 0, people?.pagination.total ?? 0) / 10));
  const href = (nextPage: number) => `/search?${new URLSearchParams({ q: q ?? "", page: String(nextPage) })}`;
  return <>
    <PageHeader eyebrow="Archive / Search" title="搜索档案" description="按作品名称、slug、人物姓名、历史昵称或来源名称查找。" />
    <form action="/search" method="get" className="mb-8 flex flex-wrap gap-3 rounded-xl border border-line bg-white/70 p-4">
      <label className="min-w-0 flex-1"><span className="sr-only">搜索关键词</span><input name="q" defaultValue={q ?? ""} maxLength={200} required placeholder="作品、人物、历史昵称或来源" className="w-full rounded-lg border border-line bg-white px-4 py-3 text-sm focus:outline-2 focus:outline-offset-2 focus:outline-accent" /></label>
      <button className="rounded-lg bg-accent px-5 py-3 text-sm font-medium text-white" type="submit">搜索</button>
    </form>
    {!q ? <EmptyState title="输入关键词开始搜索" description="支持作品名称、slug、人物姓名、历史昵称和历史来源。" /> : <>
      <p className="mb-6 text-sm text-muted">“{q}”的搜索结果</p>
      <section className="mb-8"><h2 className="mb-3 font-serif text-xl">作品 <span className="font-sans text-sm text-muted">{entries?.pagination.total ?? 0}</span></h2>
        {entries?.data.length ? <ul className="divide-y divide-line rounded-xl border border-line bg-white/70 px-5">{entries.data.map(entry => <li key={entry.id} className="py-4"><Link className="font-medium hover:text-accent hover:underline" href={`/midis/${entry.public_id}`}>{entry.title}</Link><p className="mt-1 text-xs text-muted">{entry.slug} · {entry.credits.map(item => item.display_name).join("、") || "署名待补"}</p></li>)}</ul> : <EmptyState title="没有匹配的作品" />}
      </section>
      <section><h2 className="mb-3 font-serif text-xl">人物 <span className="font-sans text-sm text-muted">{people?.pagination.total ?? 0}</span></h2>
        {people?.data.length ? <ul className="divide-y divide-line rounded-xl border border-line bg-white/70 px-5">{people.data.map(person => <li key={person.id} className="py-4"><Link className="font-medium hover:text-accent hover:underline" href={`/people/${person.public_id}`}>{person.display_name}</Link><p className="mt-1 text-xs text-muted">历史昵称：{person.aliases.join(" / ") || "尚未登记"} · {person.midi_count} 部作品</p></li>)}</ul> : <EmptyState title="没有匹配的人物" />}
      </section>
      {pages > 1 && <nav aria-label="搜索结果分页" className="mt-6 flex justify-between text-sm">{page > 1 ? <Link rel="prev" className="archive-link" href={href(page - 1)}>上一页</Link> : <span />}<span className="text-muted">第 {page} / {pages} 页</span>{page < pages ? <Link rel="next" className="archive-link" href={href(page + 1)}>下一页</Link> : <span />}</nav>}
    </>}
  </>;
}
