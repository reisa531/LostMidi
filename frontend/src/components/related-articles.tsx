import Link from "next/link";
import type { ArticleSummary } from "@/lib/api/articles";

export function RelatedArticles({ articles }: { articles: ArticleSummary[] }) {
  if (!articles.length) return null;
  return <section className="border-t border-line pt-7"><h2 className="mb-4 font-serif text-2xl">相关文章</h2>
    <ul className="space-y-3">{articles.map(article => <li key={article.id} className="rounded-lg border border-line bg-white/70 p-4">
      <Link href={`/articles/${article.id}`} className="archive-link font-medium">{article.title}</Link>
      <p className="mt-1 text-xs text-muted">{article.updated_at.slice(0, 10)} · {article.author_username}</p>
    </li>)}</ul>
  </section>;
}
