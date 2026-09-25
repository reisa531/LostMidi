import React, { type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

function normalizeHeadings(source: string) {
  return source.replace(/^【([^】\n]+)】\s*$/gm, "## $1");
}
export function markdownSummary(source: string, max = 180) {
  return source.replace(/^\s{0,3}#{1,6}\s+/gm, "").replace(/【([^】]+)】/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "").replace(/[`*_~>#|]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, "-").replace(/^-|-$/g, "") || "section";
export function Markdown({ source, className = "" }: { source: string; className?: string }) {
  const headings = new Map<string, number>();
  return <div className={`markdown-body min-w-0 space-y-4 leading-8 ${className}`}>
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={{
      h1: ({ children }) => heading(1, children, headings), h2: ({ children }) => heading(2, children, headings),
      h3: ({ children }) => heading(3, children, headings), h4: ({ children }) => heading(4, children, headings),
      h5: ({ children }) => heading(5, children, headings), h6: ({ children }) => heading(6, children, headings),
      a: ({ href, children }) => <a href={href} rel="noopener noreferrer" target="_blank" className="archive-link">{children}</a>,
      img: () => null,
      table: ({ children }) => <div className="max-w-full overflow-x-auto"><table className="w-full border-collapse text-left text-sm">{children}</table></div>,
      th: ({ children }) => <th className="border border-line bg-white/70 px-3 py-2">{children}</th>,
      td: ({ children }) => <td className="border border-line px-3 py-2">{children}</td>,
      code: ({ children, className: codeClass }) => codeClass
        ? <code className="block max-w-full overflow-x-auto rounded bg-[#ecece6] p-4 font-mono text-sm">{children}</code>
        : <code className="rounded bg-[#ecece6] px-1">{children}</code>,
    }}>{normalizeHeadings(source)}</ReactMarkdown>
  </div>;
}
function heading(level: 1 | 2 | 3 | 4 | 5 | 6, children: ReactNode, headings: Map<string, number>) {
  const label = React.Children.toArray(children).map(child => typeof child === "string" ? child : "").join("");
  const base = slug(label), index = headings.get(base) ?? 0;
  headings.set(base, index + 1);
  const id = index ? `${base}-${index + 1}` : base;
  const Tag = `h${level}` as const;
  return <Tag id={id} className={`scroll-mt-8 font-serif text-foreground ${level < 3 ? "text-2xl" : "text-lg font-semibold"}`}>{children}</Tag>;
}
