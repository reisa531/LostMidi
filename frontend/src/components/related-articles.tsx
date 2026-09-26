import Link from "next/link";
import type { ArticlePage } from "@/lib/api/articles";
import { getMidiArticles, getPersonArticles } from "@/lib/api/articles";
import { ApiError } from "@/lib/api/client";

export async function RelatedArticlesFor({ kind, id }: { kind: "midi" | "person"; id: string }) {
  let articles: ArticlePage;
  try {
    articles = await (kind === "midi" ? getMidiArticles(id) : getPersonArticles(id));
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return <p className="border-t border-line pt-5 text-sm text-muted">相关文章暂时无法加载。<Link href="/articles" className="archive-link ml-2">浏览文章目录</Link></p>;
  }
  return <RelatedArticles articles={articles} moreHref={`/articles/related?kind=${kind}&id=${encodeURIComponent(id)}`} />;
}

export function RelatedArticles({ articles, moreHref }: { articles: ArticlePage; moreHref?: string }) {
  if (!articles.total) return null;
  return <section className="border-t border-line pt-7"><h2 className="mb-4 font-serif text-2xl">相关文章 <span className="text-sm text-muted">{articles.total}</span></h2>
    <ul className="space-y-3">{articles.data.map(article => <li key={article.id} className="rounded-lg border border-line bg-white/70 p-4">
      <Link href={`/articles/${article.id}`} className="archive-link font-medium">{article.title}</Link>
      <p className="mt-1 text-xs text-muted">{article.updated_at.slice(0, 10)} · {article.author_username}</p>
    </li>)}</ul>{moreHref && articles.total > articles.pageSize && <Link href={moreHref} className="mt-4 inline-block archive-link">查看全部相关文章 →</Link>}
  </section>;
}
