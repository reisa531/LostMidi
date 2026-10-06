import Link from "next/link";
import { Section } from "@/components/archive";
import { getUsefulLinks } from "@/lib/api/useful-links";
import { siteOgImage, siteOrigin } from "@/lib/seo";

const aboutDescription = "Lost MIDI Archive 收录早期网络 MIDI 的作品、人物、历史来源与寻回过程。这里是档案范围、证据与核对标准、下载与权利规则，以及参与考证和引用条目的说明。";

export const metadata = {
  title: "关于我们",
  description: aboutDescription,
  alternates: { canonical: "/about" },
  openGraph: { type: "website", title: "关于我们", description: aboutDescription, images: siteOgImage("关于 Lost MIDI Archive") },
};

export default async function AboutPage() {
  const usefulLinks = await getUsefulLinks().catch(() => []);
  const origin = siteOrigin();
  return <article className="mx-auto max-w-3xl"><p className="eyebrow">关于我们</p><h1 className="my-6 font-serif text-4xl">为声音留下来处</h1>
    <section aria-labelledby="about-intro" className="mb-10 rounded-xl border border-dashed border-line bg-white/50 p-6"><h2 id="about-intro" className="font-semibold">项目介绍</h2>
      <div className="mt-3 space-y-4 leading-8 text-muted">
        <p>这是一个关于早期网络 MIDI 的数字档案与网络考古项目。它收录作品本身，也收录作品出现过的过程：谁在什么时间把文件发到哪里，后来在哪些页面被再次引用，今天还能找到哪些快照和附件。</p>
        <p>每条档案把资料分成四部分：作品资料（标题、推测时间、归档状态与权利信息）、历史来源（旧网站与快照，注明类型、可信度与核对时间）、寻回记录（谁在何时找到文件、依据什么证据）、文件信息（原始文件名、大小、SHA-256 校验值与是否允许访客下载）。四部分彼此独立：有记录不代表文件已经寻回，能读到描述也不等于可以下载。</p>
        <p>归档状态只有三种：<strong className="font-medium text-foreground">待寻回</strong>表示目前只有线索，<strong className="font-medium text-foreground">验证中</strong>表示资料正在核对，<strong className="font-medium text-foreground">已归档</strong>表示资料已经过核对。推测的年代写成“约”，缺失的署名保留“尚待考证”，不用看起来更完整的说法替代未知。</p>
      </div></section>
    <Section title="保存事实，也保留未知"><p>我们将作品、文件版本、历史来源和寻回事件分别记录。推测的年代不是确定的年代，缺失的署名也不应被随意填补。</p></Section>
    <Section title="如何阅读档案"><p>每条档案分别列出作品资料、历史来源、寻回记录和权利信息。尚未确认的内容会保留未知状态；记录存在不代表文件已经寻回。文件是否可下载请以档案详情和对应许可为准；不可下载文件可通过下方联系方式提出申请。</p></Section>
    <Section title="关于权利"><p>历史网站或网络档案中出现过某个文件，并不代表它属于公有领域。来源、版权状态与分发许可需要分别记录。</p></Section>
    <Section title="更正与审核">
      <p>档案由站点维护者与已注册的后台用户共同维护。普通管理员提交的新增、修改与删除会先进入审核队列，由超级管理员确认后才公开；同一份资料被两个页面同时修改时，保存会被拒绝并要求人工合并，而不是互相覆盖。站点层面的公开变更记录在<Link href="/changelog" className="archive-link">更新日志</Link>。</p>
      <p>如果条目的事实有误、署名缺失或来源判断过宽，请通过下方联系方式提出更正，并尽量附上可核对的材料（原始网址、网页快照、文件校验值）。核对后我们会修正记录；无法确认的部分保持未知，而不是为了完整而补一个说法。</p>
    </Section>
    <Section title="如何引用">
      <p className="text-muted">每条档案都有稳定的公开编号，每个文件都登记 SHA-256 校验值，引用时可以给出访问地址与访问日期：</p>
      <p className="rounded-lg border border-line bg-white/70 px-4 py-3 font-mono text-xs [overflow-wrap:anywhere]">{`${origin ?? "https://站点域名"}/midis/作品-slug`}<span className="text-muted">{`（档案编号 #123 · 访问日期 YYYY-MM-DD）`}</span></p>
      <p>引用档案记录不代表取得作品本身的使用许可；文件是否可下载、能否再分发，以该档案的权利信息与对应许可为准。引用时也建议一并给出所使用的历史来源条目，方便他人复核判断依据。</p>
    </Section>
    <section id="join" aria-labelledby="join-title" className="scroll-mt-8 border-t border-line py-10"><p className="eyebrow">加入我们</p><h2 id="join-title" className="mt-2 font-serif text-3xl">从一条线索开始探索</h2><p className="mt-4 leading-8 text-muted">旧网页上的一段旋律、已经失效的下载地址，可能是某个人青春时听过的声音。寻找失落媒体，是把零散记忆与可核实的证据重新连起来，让后来的人知道作品从何而来。</p>
      <ol className="mt-7 grid gap-3 sm:grid-cols-3">{[
        ["01", "选一条线索", "从旧收藏夹、网页快照、文件名或熟悉的旋律入手，记下原始网址与发现时间。"],
        ["02", "交叉核对", "搜索不同年代的页面和存档，比较标题、署名、文件大小与音频内容；无法确认的地方明确标注。"],
        ["03", "保存与分享", "保留原始文件、网址和截图，记录查找过程。上传前确认版权与公开分发许可。"],
      ].map(([number, title, description]) => <li key={number} className="rounded-xl border border-line bg-white/75 p-5"><span className="font-serif text-2xl text-accent">{number}</span><h3 className="mt-3 font-semibold">{title}</h3><p className="mt-2 text-sm leading-7 text-muted">{description}</p></li>)}</ol>
      <details className="group mt-7 rounded-xl border border-line bg-white/70"><summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-medium marker:hidden">常用网址 <span aria-hidden="true" className="text-accent group-open:rotate-180">⌄</span></summary><div className="border-t border-line px-5 py-4">{usefulLinks.length ? <ul className="space-y-4">{usefulLinks.map(link => <li key={link.id}><a href={link.url} target="_blank" rel="noopener noreferrer" className="archive-link font-medium">{link.title} ↗</a>{link.description && <p className="mt-1 text-sm leading-6 text-muted">{link.description}</p>}</li>)}</ul> : <p className="text-sm text-muted">常用网址正在整理中。你也可以先从自己的历史收藏和可信的网页存档开始。</p>}</div></details>
    </section>
    <section id="contact" aria-labelledby="contact-title" className="mt-10 scroll-mt-8 rounded-xl border border-line bg-white p-6"><p className="eyebrow">联系我们</p><h2 id="contact-title" className="mt-2 font-serif text-2xl">联系站点管理者</h2><ul className="mt-5 space-y-4">{[{ name: "dzhes", email: "reisa531@outlook.com" }, { name: "chengzhi111", email: "b132477293@qq.com" }].map(contact => <li key={contact.name} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-4"><span className="font-medium">{contact.name}</span><a className="archive-link" href={`mailto:${contact.email}`}>{contact.email}</a></li>)}</ul></section>
  </article>;
}
