import Link from "next/link";
import { ApiError } from "@/lib/api/client";
import { getCatalogEntries, getCatalogPeople, type SearchParams } from "@/lib/api/catalog";
import { getPersonById } from "@/lib/api/person";
import type { CatalogEntries, CatalogPeople } from "@/lib/api/types";
import { Unavailable } from "@/components/archive";
import { EmptyState, PageHeader } from "@/components/catalog/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "搜索档案", robots: { index: false, follow: true } };

export default async function SearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = await searchParams;
  const rawQ = raw.q;
  const q = rawQ === "" ? undefined : rawQ;
  const pageRaw = raw.page;
  const midiPageRaw = raw.midiPage ?? pageRaw;
  const peoplePageRaw = raw.peoplePage ?? pageRaw;
  const personId = raw.person;
  if ((q !== undefined && (typeof q !== "string" || !q.trim() || new TextEncoder().encode(q).length > 200)) ||
      (personId !== undefined && (typeof personId !== "string" || !/^[1-9]\d{0,18}$/.test(personId) || BigInt(personId) > BigInt("9223372036854775807"))) ||
      ([pageRaw, midiPageRaw, peoplePageRaw].some(value => value !== undefined && (typeof value !== "string" || !/^[1-9]\d*$/.test(value) || Number(value) > 1000000))))
    return <EmptyState title="搜索条件无效" description="请使用 1 到 200 字节的关键词，并从第一页重新搜索。" action={<Link href="/search" className="archive-link">重置搜索</Link>} />;
  const midiPage = midiPageRaw === undefined ? 1 : Number(midiPageRaw);
  const peoplePage = peoplePageRaw === undefined ? 1 : Number(peoplePageRaw);
  let entries: CatalogEntries | undefined;
  let people: CatalogPeople | undefined;
  let selectedPerson: Awaited<ReturnType<typeof getPersonById>> | undefined;
  if (q || personId) {
    try {
      if (personId) {
        [entries, selectedPerson] = await Promise.all([
          getCatalogEntries({ page: midiPage, pageSize: 10, sort: "updated", person: personId, q }), getPersonById(personId),
        ]);
      } else [entries, people] = await Promise.all([
        getCatalogEntries({ page: midiPage, pageSize: 10, sort: "updated", q }), getCatalogPeople({ page: peoplePage, pageSize: 10, q }),
      ]);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return <EmptyState title="人物不存在" description="该人物档案可能已删除或链接有误。" action={<Link href="/people" className="archive-link">浏览人物</Link>} />;
      if (error instanceof ApiError) return <Unavailable />;
      throw error;
    }
  }
  const midiPages = Math.max(1, Math.ceil((entries?.pagination.total ?? 0) / 10));
  const peoplePages = Math.max(1, Math.ceil((people?.pagination.total ?? 0) / 10));
  const href = (kind: "midiPage" | "peoplePage", nextPage: number) => `/search?${new URLSearchParams({ ...(q ? { q } : {}), ...(personId ? { person: personId } : {}), midiPage: String(kind === "midiPage" ? nextPage : midiPage), ...(!personId ? { peoplePage: String(kind === "peoplePage" ? nextPage : peoplePage) } : {}) })}`;
  return <>
    <PageHeader eyebrow="档案 / 搜索" title="搜索档案" description="按作品名称、slug、人物姓名、历史昵称或来源名称查找。" />
    <form action="/search" method="get" className="mb-8 flex flex-wrap gap-3 rounded-xl border border-line bg-white/70 p-4">
      <label className="min-w-0 flex-1"><span className="sr-only">搜索关键词</span><input name="q" defaultValue={q ?? ""} maxLength={200} placeholder="作品、人物、历史昵称或来源" className="w-full rounded-lg border border-line bg-white px-4 py-3 text-sm focus:outline-2 focus:outline-offset-2 focus:outline-accent" /></label>
      {personId && <input type="hidden" name="person" value={personId} />}<button className="rounded-lg bg-accent px-5 py-3 text-sm font-medium text-white" type="submit">搜索</button>
    </form>
    {!q && !personId ? <EmptyState title="输入关键词开始搜索" description="支持作品名称、slug、人物姓名、历史昵称和历史来源。" /> : <>
      {personId && selectedPerson && <p className="mb-4 rounded-lg border border-line bg-white/70 p-3 text-sm">人物：{selectedPerson.person.display_name} {q && `· 关键词：“${q}”`} <Link className="archive-link ml-3" href="/search">清除人物筛选</Link></p>}
      {!personId && q && <p className="mb-6 text-sm text-muted">“{q}”的搜索结果</p>}
      <section className="mb-8"><h2 className="mb-3 font-serif text-xl">作品 <span className="font-sans text-sm text-muted">{entries?.pagination.total ?? 0}</span></h2>
        {entries?.data.length ? <ul className="divide-y divide-line rounded-xl border border-line bg-white/70 px-5">{entries.data.map(entry => <li key={entry.id} className="py-4"><Link className="font-medium hover:text-accent hover:underline" href={`/midis/${entry.slug}`}>{entry.title}</Link><p className="mt-1 text-xs text-muted">{entry.slug} · {entry.credits.map(item => item.display_name).join("、") || "署名待补"}</p></li>)}</ul> : <EmptyState title="没有匹配的作品" />}
        {midiPages > 1 && <nav aria-label="作品搜索结果分页" className="mt-4 flex justify-between text-sm">{midiPage > 1 ? <Link rel="prev" className="archive-link" href={href("midiPage", midiPage - 1)}>上一页</Link> : <span />}<span className="text-muted">第 {midiPage} / {midiPages} 页</span>{midiPage < midiPages ? <Link rel="next" className="archive-link" href={href("midiPage", midiPage + 1)}>下一页</Link> : <span />}</nav>}
      </section>
      {!personId && <section><h2 className="mb-3 font-serif text-xl">人物 <span className="font-sans text-sm text-muted">{people?.pagination.total ?? 0}</span></h2>
        {people?.data.length ? <ul className="divide-y divide-line rounded-xl border border-line bg-white/70 px-5">{people.data.map(person => <li key={person.id} className="py-4"><Link className="font-medium hover:text-accent hover:underline" href={`/people/${person.public_id}`}>{person.display_name}</Link><p className="mt-1 text-xs text-muted">历史昵称：{person.aliases.join(" / ") || "尚未登记"} · {person.midi_count} 部作品</p></li>)}</ul> : <EmptyState title="没有匹配的人物" />}
        {peoplePages > 1 && <nav aria-label="人物搜索结果分页" className="mt-4 flex justify-between text-sm">{peoplePage > 1 ? <Link rel="prev" className="archive-link" href={href("peoplePage", peoplePage - 1)}>上一页</Link> : <span />}<span className="text-muted">第 {peoplePage} / {peoplePages} 页</span>{peoplePage < peoplePages ? <Link rel="next" className="archive-link" href={href("peoplePage", peoplePage + 1)}>下一页</Link> : <span />}</nav>}
      </section>}
    </>}
  </>;
}
