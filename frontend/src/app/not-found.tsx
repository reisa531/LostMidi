import Link from "next/link";
export default function NotFound() {
  return <section className="mx-auto flex min-h-[65vh] max-w-3xl flex-col justify-center py-12">
    <p className="eyebrow">404 / 页面未找到</p><p aria-hidden="true" className="mt-4 font-serif text-7xl tracking-tight text-accent/25 sm:text-8xl">404</p>
    <h1 className="mt-3 font-serif text-3xl leading-tight sm:text-4xl">这条线索暂时没有对应的页面</h1>
    <p className="mt-5 max-w-xl text-sm leading-7 text-muted">地址可能输入有误、档案已移走，或者内容尚未收录。你可以从目录重新寻找，也可以按标题或人物搜索。</p>
    <div className="mt-8 flex flex-wrap gap-3"><Link href="/" className="inline-flex min-h-11 items-center rounded-lg bg-accent px-5 text-sm font-medium text-white">返回首页</Link><Link href="/search" className="inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-5 text-sm font-medium text-accent">搜索档案</Link><Link href="/midis" className="inline-flex min-h-11 items-center px-3 text-sm text-accent underline underline-offset-4">浏览 MIDI 目录 →</Link></div>
  </section>;
}
