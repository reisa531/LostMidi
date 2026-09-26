"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <section className="mx-auto flex min-h-[55vh] max-w-2xl flex-col justify-center px-5 py-12"><h1 className="mb-5 font-serif text-3xl">页面暂时无法显示</h1><p className="mb-6 text-muted">请稍后重试；如果问题持续，可以返回档案目录继续浏览。</p>
    <div className="flex flex-wrap gap-4"><button className="rounded-lg border border-accent px-5 py-3 text-sm" onClick={reset}>重试</button><Link className="archive-link self-center text-sm" href="/midis">浏览 MIDI 档案 →</Link></div></section>;
}
