import Link from "next/link";
import { catalogHref, getCatalogEntries, type CatalogQuery, type UrlQuery } from "@/lib/api/catalog";
import { ApiError } from "@/lib/api/client";
import { Status } from "@/components/archive";
import type { CatalogEntry } from "@/lib/api/types";

type Group = { title: string; moreHref: string; entries: CatalogEntry[] };

/** 分组键来自档案数据，长度或格式异常时退回图谱首页，不让链接构造失败影响整页渲染。 */
function mapHref(query: UrlQuery) {
  try { return catalogHref("/map", query); } catch { return "/map"; }
}

async function load(query: CatalogQuery, excludeSlug: string): Promise<CatalogEntry[]> {
  try {
    const result = await getCatalogEntries({ ...query, pageSize: 6 });
    return result.data.filter(entry => entry.slug !== excludeSlug).slice(0, 5);
  } catch (error) {
    if (error instanceof ApiError) return [];
    throw error;
  }
}

/**
 * 把详情页接回目录：按历史来源与作者取相邻档案。
 * 关系图谱与目录页是这两个筛选条件的完整入口，这里只展示最近更新的几条。
 */
export async function RelatedEntries({ sources, person, excludeSlug }: {
  sources: string[]; person?: { id: string; name: string }; excludeSlug: string;
}) {
  const requests: { title: string; moreHref: string; query: CatalogQuery }[] = [];
  if (sources.length) requests.push({
    title: `同一来源 · ${sources[0]}`,
    moreHref: mapHref({ by: "source", group: sources[0] }),
    query: { page: 1, pageSize: 6, sort: "updated", source: sources[0] },
  });
  if (person) requests.push({
    title: `同一作者 · ${person.name}`,
    moreHref: mapHref({ by: "author", group: person.id }),
    query: { page: 1, pageSize: 6, sort: "updated", person: person.id },
  });
  if (!requests.length) return null;
  const groups: Group[] = (await Promise.all(requests.map(async request => ({
    title: request.title, moreHref: request.moreHref, entries: await load(request.query, excludeSlug),
  })))).filter(group => group.entries.length);
  if (!groups.length) return null;
  return <section className="border-t border-line py-8">
    <h2 className="mb-5 font-serif text-2xl">相关档案</h2>
    <div className="grid gap-6 sm:grid-cols-2">
      {groups.map(group => <div key={group.title} className="min-w-0">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">{group.title}</h3>
          <Link href={group.moreHref} className="archive-link shrink-0 text-xs">查看全部 →</Link>
        </div>
        <ul className="space-y-3">{group.entries.map(entry => <li key={entry.id} className="min-w-0 rounded-lg border border-line bg-white/70 px-4 py-3">
          <Link className="archive-link font-medium [overflow-wrap:anywhere]" href={`/midis/${entry.slug}`}>{entry.title}</Link>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted"><Status status={entry.archive_status} />
            <span>{entry.estimated_date ? `约 ${entry.estimated_date}` : entry.estimated_year ? `约 ${entry.estimated_year} 年` : "时间不详"}</span></p>
        </li>)}</ul>
      </div>)}
    </div>
  </section>;
}
