import Link from "next/link";
import { jsonLd } from "@/lib/seo";
import { breadcrumbList, type Crumb } from "@/lib/schema";

/**
 * 可见面包屑与其 BreadcrumbList 结构化数据。
 * 传入的每一步都必须能在页面上点到，避免出现只给爬虫看的路径。
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (!items.length) return null;
  return <>
    <nav aria-label="面包屑" className="mb-6 min-w-0 text-xs">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return <li key={item.path} className="flex min-w-0 items-center gap-x-2">
            {index > 0 && <span aria-hidden="true" className="text-muted">/</span>}
            {last
              ? <span aria-current="page" className="min-w-0 text-muted [overflow-wrap:anywhere]">{item.name}</span>
              : <Link className="archive-link shrink-0" href={item.path}>{item.name}</Link>}
          </li>;
        })}
      </ol>
    </nav>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbList(items)) }} />
  </>;
}
