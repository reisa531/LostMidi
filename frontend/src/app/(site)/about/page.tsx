import { Section } from "@/components/archive";
export const metadata = { title: "关于我们", alternates: { canonical: "/about" } };
export default function AboutPage() {
  return <article className="mx-auto max-w-3xl"><p className="eyebrow">关于我们</p><h1 className="my-6 font-serif text-4xl">为声音留下来处</h1>
    <section aria-labelledby="about-intro" className="mb-10 rounded-xl border border-dashed border-line bg-white/50 p-6"><h2 id="about-intro" className="font-semibold">项目介绍</h2><p className="mt-3 leading-8 text-muted">介绍待补充。</p></section>
    <Section title="保存事实，也保留未知"><p>我们将作品、文件版本、历史来源和寻回事件分别记录。推测的年代不是确定的年代，缺失的署名也不应被随意填补。</p></Section>
    <Section title="如何阅读档案"><p>每条档案分别列出作品资料、历史来源、寻回记录和权利信息。尚未确认的内容会保留未知状态；记录存在不代表文件已经寻回。文件是否可下载请以档案详情和对应许可为准；不可下载文件可通过下方联系方式提出申请。</p></Section>
    <Section title="关于权利"><p>历史网站或网络档案中出现过某个文件，并不代表它属于公有领域。来源、版权状态与分发许可需要分别记录。</p></Section>
    <section id="contact" aria-labelledby="contact-title" className="mt-10 scroll-mt-8 rounded-xl border border-line bg-white p-6"><p className="eyebrow">联系我们</p><h2 id="contact-title" className="mt-2 font-serif text-2xl">联系站点管理者</h2><ul className="mt-5 space-y-4">{[{ name: "dzhes", email: "reisa531@outlook.com" }, { name: "chengzhi111", email: "b132477293@qq.com" }].map(contact => <li key={contact.name} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-4"><span className="font-medium">{contact.name}</span><a className="archive-link" href={`mailto:${contact.email}`}>{contact.email}</a></li>)}</ul></section>
  </article>;
}
