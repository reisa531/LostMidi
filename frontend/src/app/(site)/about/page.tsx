import { Section } from "@/components/archive";
import { getUsefulLinks } from "@/lib/api/useful-links";
export const metadata = { title: "关于我们", alternates: { canonical: "/about" } };
export default async function AboutPage() {
  const usefulLinks = await getUsefulLinks().catch(() => []);
  return <article className="mx-auto max-w-3xl"><p className="eyebrow">关于我们</p><h1 className="my-6 font-serif text-4xl">为声音留下来处</h1>
    <section aria-labelledby="about-intro" className="mb-10 rounded-xl border border-dashed border-line bg-white/50 p-6"><h2 id="about-intro" className="font-semibold">项目介绍</h2><p className="mt-3 leading-8 text-muted">介绍待补充。</p></section>
    <Section title="保存事实，也保留未知"><p>我们将作品、文件版本、历史来源和寻回事件分别记录。推测的年代不是确定的年代，缺失的署名也不应被随意填补。</p></Section>
    <Section title="如何阅读档案"><p>每条档案分别列出作品资料、历史来源、寻回记录和权利信息。尚未确认的内容会保留未知状态；记录存在不代表文件已经寻回。文件是否可下载请以档案详情和对应许可为准；不可下载文件可通过下方联系方式提出申请。</p></Section>
    <Section title="关于权利"><p>历史网站或网络档案中出现过某个文件，并不代表它属于公有领域。来源、版权状态与分发许可需要分别记录。</p></Section>
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
