import Link from "next/link";
import { Section } from "@/components/archive";
import { catalogHref, getCatalogEntries } from "@/lib/api/catalog";
import { ApiError } from "@/lib/api/client";

export async function PersonWorks({ personId, publicId, page }: {
  personId: string;
  publicId: string;
  page: number;
}) {
  const catalogUrl = catalogHref("/midis", { person: personId });
  let works;
  try {
    works = await getCatalogEntries({ person: personId, page, pageSize: 20, sort: "updated" }, { cache: "bypass" });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return <Section id="related-works" title="相关作品">
      <p className="text-muted">暂时无法读取相关作品。</p>
      <Link href={catalogUrl} className="archive-link">按此人物筛选 MIDI 目录</Link>
    </Section>;
  }

  const pages = Math.max(1, Math.ceil(works.pagination.total / works.pagination.pageSize));
  const href = (value: number) => `/people/${publicId}${value === 1 ? "" : `?worksPage=${value}`}#related-works`;

  return <Section id="related-works" title="相关作品">
    {works.data.length ? <ul className="space-y-3">{works.data.map(work => {
      const year = work.estimated_year ?? work.estimated_date?.slice(0, 4);
      return <li key={work.id} className="break-words">
        <Link href={`/midis/${work.slug}`} className="archive-link">{work.title}</Link>
        <span className="text-muted"> · {year ? `约 ${year} 年` : "年代未详"} · {work.sources.join("、") || "来源待补"}</span>
      </li>;
    })}</ul> : <p className="text-muted">{works.pagination.total ? "此页暂无作品。" : "尚无作品署名记录。"}</p>}
    {(pages > 1 || page > 1) && <nav aria-label="相关作品分页" className="flex flex-wrap items-center gap-4 text-xs">
      {page <= pages && <span className="text-muted">第 {page} 页 / 共 {pages} 页</span>}
      {page > 1 && <Link href={href(1)} className="archive-link">第一页</Link>}
      {page > 2 && page <= pages && <Link href={href(page - 1)} className="archive-link" rel="prev">上一页</Link>}
      {page < pages && <Link href={href(page + 1)} className="archive-link" rel="next">下一页</Link>}
    </nav>}
  </Section>;
}
