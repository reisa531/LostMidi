"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <section><h1 className="mb-6 font-serif text-3xl">页面暂时无法显示</h1><p className="mb-6 text-muted">请稍后重试。</p>
    <button className="border border-accent px-5 py-3 text-sm" onClick={reset}>重新加载</button></section>;
}
