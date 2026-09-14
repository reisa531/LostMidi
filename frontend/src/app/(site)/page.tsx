import Link from "next/link";

export default function Home() {
  return (
    <section className="py-10 sm:py-16">
      <p className="eyebrow">An archive of traces</p>
      <h1 className="mt-7 max-w-3xl font-serif text-4xl leading-[1.4] tracking-tight sm:text-6xl">有些旋律，<br />值得再被记起。</h1>
      <p className="mt-8 max-w-xl text-base leading-8 text-muted">一个关于早期网络 MIDI 的数字档案。记录作品与创作者，追溯已经消失的网站，也保存每一次重新发现的故事。</p>
      <Link href="/midis" className="mt-9 inline-flex items-center gap-8 bg-accent px-6 py-3.5 text-sm text-white hover:bg-foreground">浏览 MIDI 档案 <span aria-hidden="true">↗</span></Link>
    </section>
  );
}
