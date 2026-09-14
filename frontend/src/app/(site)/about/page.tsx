import { Section } from "@/components/archive";
export const metadata = { title: "关于项目" };
export default function AboutPage() {
  return <article className="mx-auto max-w-3xl"><p className="eyebrow">About the archive</p><h1 className="my-6 font-serif text-4xl">为声音留下来处</h1>
    <p className="mb-10 leading-8 text-muted">Lost MIDI Archive 是一个持续建设的数字档案项目，记录早期网络 MIDI 的作品、人物与历史。一个文件曾经在哪里出现、由谁制作、又如何被找到，与文件本身同样值得保存。</p>
    <Section title="保存事实，也保留未知"><p>我们将作品、文件版本、历史来源和寻回事件分别记录。推测的年代不是确定的年代，缺失的署名也不应被随意填补。</p></Section>
    <Section title="当前档案"><p>本站目前展示虚构的开发示例，不包含真实失传音乐或可下载的 MIDI 文件。示例网址和寻回故事不代表真实历史。</p></Section>
    <Section title="关于权利"><p>历史网站或网络档案中出现过某个文件，并不代表它属于公有领域。来源、版权状态与分发许可需要分别记录。</p></Section>
  </article>;
}
