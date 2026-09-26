import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { toString } from "mdast-util-to-string";
import type { ReactNode } from "react";

function normalizeHeadings(source: string) {
  return source.replace(/^【([^】\n]+)】\s*$/gm, "## $1");
}
export function markdownSummary(source: string, max = 180) {
  return source.replace(/^\s{0,3}#{1,6}\s+/gm, "").replace(/【([^】]+)】/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "").replace(/[`*_~>#|]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, "-").replace(/^-|-$/g, "") || "section";
export function markdownHeadings(source: string) {
  const counts = new Map<string, number>();
  const tree = unified().use(remarkParse).use(remarkGfm).parse(normalizeHeadings(source));
  return tree.children.flatMap(node => {
    if (node.type !== "heading") return [];
    const title = toString(node).trim();
    const base = slug(title), count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    return [{ title, id: count ? `${base}-${count + 1}` : base }];
  });
}
export function Markdown({ source, className = "" }: { source: string; className?: string }) {
  const headings = markdownHeadings(source);
  let headingIndex = 0;
  const renderHeading = (level: 1 | 2 | 3 | 4 | 5 | 6, children: ReactNode) => {
    const Tag = `h${level}` as const;
    const id = headings[headingIndex++]?.id;
    return <Tag id={id} className={`scroll-mt-8 font-serif text-foreground ${level < 3 ? "text-2xl" : "text-lg font-semibold"}`}>{children}</Tag>;
  };
  return <div className={`markdown-body min-w-0 space-y-4 leading-8 ${className}`}>
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={{
      h1: ({ children }) => renderHeading(1, children), h2: ({ children }) => renderHeading(2, children),
      h3: ({ children }) => renderHeading(3, children), h4: ({ children }) => renderHeading(4, children),
      h5: ({ children }) => renderHeading(5, children), h6: ({ children }) => renderHeading(6, children),
      a: ({ href, children }) => <a href={href} {...(href?.startsWith("/") || href?.startsWith("#") ? {} : { rel: "noopener noreferrer", target: "_blank" })} className="archive-link">{children}</a>,
      img: () => null,
      table: ({ children }) => <div className="max-w-full overflow-x-auto"><table className="w-full border-collapse text-left text-sm">{children}</table></div>,
      th: ({ children }) => <th className="border border-line bg-white/70 px-3 py-2">{children}</th>,
      td: ({ children }) => <td className="border border-line px-3 py-2">{children}</td>,
      ul: ({ children }) => <ul className="list-disc space-y-1 pl-6">{children}</ul>,
      ol: ({ children }) => <ol className="list-decimal space-y-1 pl-6">{children}</ol>,
      blockquote: ({ children }) => <blockquote className="border-l-4 border-line pl-4 text-muted">{children}</blockquote>,
      pre: ({ children }) => <pre className="max-w-full overflow-x-auto rounded bg-[#ecece6] p-4 font-mono text-sm">{children}</pre>,
      code: ({ children, className: codeClass }) => codeClass
        ? <code className="font-mono text-sm">{children}</code>
        : <code className="rounded bg-[#ecece6] px-1">{children}</code>,
    }}>{normalizeHeadings(source)}</ReactMarkdown>
  </div>;
}
