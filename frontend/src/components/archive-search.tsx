import { SearchMark } from "./archive-brand";

export function ArchiveSearch({ query = "", person }: { query?: string; person?: string }) {
  return <form action="/search" method="get" role="search" className="archive-search">
    <SearchMark />
    <label className="sr-only" htmlFor="archive-query">搜索作品、人物或来源</label>
    <input data-archive-search id="archive-query" type="search" name="q" defaultValue={query} maxLength={200} placeholder="搜索作品、人物或来源" />
    {person && <input type="hidden" name="person" value={person} />}
    <button type="submit">搜索<span aria-hidden="true"> ↗</span></button>
  </form>;
}
