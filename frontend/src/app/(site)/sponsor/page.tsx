import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "赞助与支持",
  description: "了解如何支持 Lost MIDI Archive 的档案保存、考证和维护。",
  alternates: { canonical: "/sponsor" },
};

export default function SponsorPage() {
  return <article className="mx-auto max-w-4xl">
    <p className="eyebrow">支持档案持续保存</p><h1 className="mb-5 mt-3 font-serif text-4xl leading-tight sm:text-5xl">赞助与支持</h1>
    <p className="max-w-2xl text-base leading-8 text-muted">Lost MIDI Archive 持续整理散落的 MIDI 作品、人物资料与历史来源。你的支持能帮助我们保留可核查的线索，让这些声音和它们的来处更容易被找到。</p>
    <div className="mt-10 grid gap-4 sm:grid-cols-3">{[
      { number: "01", title: "保存资料", body: "维护档案数据、文件记录与备份，减少线索再次散失的风险。" },
      { number: "02", title: "核查来源", body: "比对历史页面、署名和版本信息，清楚区分事实与推测。" },
      { number: "03", title: "保持开放", body: "改善检索、阅读体验与可访问性，让更多人能使用档案。" },
    ].map(item => <section key={item.number} className="rounded-xl border border-line bg-white/70 p-5"><span className="font-serif text-2xl text-accent/50">{item.number}</span><h2 className="mt-4 font-serif text-xl">{item.title}</h2><p className="mt-3 text-sm leading-7 text-muted">{item.body}</p></section>)}</div>
    <section className="mt-10 rounded-xl border border-accent/25 bg-[#edf0e5] p-6 sm:p-8"><p className="eyebrow">如何支持</p><h2 className="mt-2 font-serif text-2xl">与我们联系</h2><p className="mt-4 max-w-2xl text-sm leading-7">目前尚未设置公开收款渠道。如果你希望赞助、提供资料或参与考证，请先联系站点管理者，说明你的意向；我们会告知可行方式与相关安排。</p><Link href="/about#contact" className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-accent px-5 text-sm font-medium text-white">查看联系方式 →</Link></section>
    <section className="mt-10 border-t border-line pt-7"><h2 className="font-serif text-2xl">赞助说明</h2><ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-muted"><li>赞助不会影响档案的事实判断、署名或文件分发权限。</li><li>历史来源与版权状态分别核查；赞助不构成取得作品使用许可。</li><li>除非双方明确同意，站点不会公开赞助者姓名或联络信息。</li></ul></section>
  </article>;
}
