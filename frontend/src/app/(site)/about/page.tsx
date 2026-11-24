import Link from "next/link";
import { Section } from "@/components/archive";
import { getUsefulLinks } from "@/lib/api/useful-links";
import { siteOgImage, siteOrigin } from "@/lib/seo";

const aboutDescription = "收录早期网络 MIDI 作品、人物、来源与寻回记录，以档案卡片追溯旧网站、论坛、游戏包与私人收藏。";

export const metadata = {
  title: "关于我们",
  description: aboutDescription,
  alternates: { canonical: "/about" },
  openGraph: { type: "website", title: "关于我们", description: aboutDescription, images: siteOgImage("关于 Lost MIDI Archive") },
};

export default async function AboutPage() {
  const usefulLinks = await getUsefulLinks().catch(() => []);
  const origin = siteOrigin();
  return <article className="mx-auto max-w-3xl"><p className="eyebrow">关于我们</p><h1 className="my-6 font-serif text-4xl">关于本档案</h1>
    <nav aria-label="关于档案馆" className="about-links"><a href="#about-intro">项目介绍</a><a href="#archive-rights">权利说明</a><a href="#archive-cite">引用方式</a><a href="#contact">联系我们</a></nav>
    <section aria-labelledby="about-intro" className="mb-10 rounded-xl border border-dashed border-line bg-white/50 p-6"><h2 id="about-intro" className="font-semibold">项目介绍</h2>
      <div className="mt-3 space-y-4 leading-8 text-muted">
        <p>Lost MIDI Archive 收录早期网络 MIDI。我们从旧网站、论坛、游戏包与私人收藏查找作品，并记录署名、流传来源与寻回经过。</p>
        <p>作品资料列出署名、推测年代和归档状态。历史来源附原页、快照及核验情况。寻回记录写明发现者、时间和凭证。文件信息保留原文件名、SHA-256 校验值与下载状态。</p>
        <p>归档状态只有三种：<strong className="font-medium text-foreground">待寻回</strong>表示目前只有线索，<strong className="font-medium text-foreground">验证中</strong>表示资料正在核对，<strong className="font-medium text-foreground">已归档</strong>表示资料已经过核对。推测年代记作“约”，缺失署名保留“尚待考证”，不以看似完整的说法替代未知。</p>
      </div></section>
    <Section title="关于权利" id="archive-rights"><p>档案分别记录历史来源、版权状态和分发许可。文件能否下载或再分发，以对应许可和条目详情为准。如需暂不开放下载的文件，请联系管理员。</p></Section>
    <Section title="更正与审核">
      <p>维护者提交新增、修改和删除后，由管理员审核。遇到同一条目的编辑冲突，请重新打开条目并合并改动。界面文案由 Gemini 协助整理。站点功能变更见<Link href="/changelog" className="archive-link">更新日志</Link>。</p>
      <p>发现署名、年代、来源或授权记录有误，欢迎联系管理员。请附上可核对的材料，例如原始网址、网页快照、文件校验值或游戏包凭证。</p>
    </Section>
    <Section title="如何引用" id="archive-cite">
      <p className="text-muted">每个条目均有稳定公开编号，每个文件均登记 SHA-256 校验值，引用时请附上访问地址与访问日期：</p>
      <p className="rounded-lg border border-line bg-white/70 px-4 py-3 font-mono text-xs [overflow-wrap:anywhere]">{`${origin ?? "https://站点域名"}/midis/作品-slug`}<span className="text-muted">{`（档案编号 #123 · 访问日期 YYYY-MM-DD）`}</span></p>
      <p>引用条目不代表取得作品本身的使用许可；文件能否下载或再分发，以该条目的权利信息与对应许可为准。引用时建议一并注明所用来源条目，便于他人复核依据。</p>
    </Section>
    <section id="join" aria-labelledby="join-title" className="scroll-mt-8 border-t border-line py-10"><p className="eyebrow">加入我们</p><h2 id="join-title" className="mt-2 font-serif text-3xl">从一条线索开始探索</h2><p className="mt-4 leading-8 text-muted">旧收藏夹中的链接、论坛里的附件、游戏包中的曲目都可以成为线索。整理好手上的材料，再联系管理员。</p>
      <ol className="mt-7 grid gap-3 sm:grid-cols-3">{[
        ["选一条线索", "从旧收藏夹、网页快照、文件名或熟悉旋律入手，记下原始网址与发现时间。"],
        ["交叉核对", "检索不同年代的页面与存档，比对标题、署名、文件大小与音频内容；无法确认之处明确标注。"],
        ["保存与分享", "保留原始文件、网址和截图，记录查找过程。上传前确认版权与公开分发许可。"],
      ].map(([title, description]) => <li key={title} className="rounded-xl border border-line bg-white/75 p-5"><h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm leading-7 text-muted">{description}</p></li>)}</ol>
      <details className="group mt-7 rounded-xl border border-line bg-white/70"><summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-medium marker:hidden">常用网址 <span aria-hidden="true" className="text-accent group-open:rotate-180">⌄</span></summary><div className="border-t border-line px-5 py-4">{usefulLinks.length ? <ul className="space-y-4">{usefulLinks.map(link => <li key={link.id}><a href={link.url} target="_blank" rel="noopener noreferrer" className="archive-link font-medium">{link.title} ↗</a>{link.description && <p className="mt-1 text-sm leading-6 text-muted">{link.description}</p>}</li>)}</ul> : <p className="text-sm text-muted">常用网址整理中。可先从个人历史收藏与可信网页存档查起。</p>}</div></details>
    </section>
    <section id="contact" aria-labelledby="contact-title" className="mt-10 scroll-mt-8 rounded-xl border border-line bg-white p-6"><p className="eyebrow">联系我们</p><h2 id="contact-title" className="mt-2 font-serif text-2xl">联系站点管理者</h2><ul className="mt-5 space-y-4">{[{ name: "dzhes", email: "reisa531@outlook.com" }, { name: "chengzhi111", email: "b132477293@qq.com" }].map(contact => <li key={contact.name} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-4"><span className="font-medium">{contact.name} · {contact.name === "dzhes" ? "站长" : "管理员"}</span><a className="archive-link" href={`mailto:${contact.email}`}>{contact.email}</a></li>)}</ul></section>
  </article>;
}
